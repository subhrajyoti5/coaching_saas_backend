const prisma = require('../config/database');
const { audit } = require('../utils/auditLogger');
const notificationService = require('./notificationService');

const CLAIM_STATUS = {
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
};

const IST_OFFSET_MINUTES = 330;
const IST_TIMEZONE = 'Asia/Kolkata';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const createBusinessRuleError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const getIstDateParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);

  const [year, month, day] = parts.split('-').map(Number);
  return { year, month, day };
};

const getIstDayRange = () => {
  const { year, month, day } = getIstDateParts();
  const offsetMs = IST_OFFSET_MINUTES * 60 * 1000;
  const start = new Date(Date.UTC(year, month - 1, day) - offsetMs);
  const end = new Date(start.getTime() + ONE_DAY_MS);
  return { start, end };
};

const getIstMonthRange = () => {
  const { year, month } = getIstDateParts();
  const offsetMs = IST_OFFSET_MINUTES * 60 * 1000;
  const start = new Date(Date.UTC(year, month - 1, 1) - offsetMs);
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = new Date(Date.UTC(nextMonthYear, nextMonth - 1, 1) - offsetMs);
  return { start, end };
};

const formatClaim = (claim) => ({
  ...claim,
  studentId: claim.student_id,
  batchId: claim.batch_id,
  coachingId: claim.coaching_center_id,
  expectedAmount: claim.expected_amount,
  proofUrl: claim.proof_url,
  verifiedBy: claim.verified_by,
  verifiedAt: claim.verified_at,
  approvedBy: claim.approved_by,
  approvedAt: claim.approved_at,
  rejectedReason: claim.rejected_reason,
  createdAt: claim.created_at,
  updatedAt: claim.updated_at
});

const createClaim = async ({ studentId, batchId, note, proofUrl }, requesterId) => {
  if (Number(studentId) !== Number(requesterId)) {
    throw new Error('Students can only create claims for themselves');
  }

  const batch = await prisma.batch.findFirst({
    where: { id: Number(batchId) }
  });

  if (!batch) {
    throw new Error('Batch not found');
  }

  const membership = await prisma.batchStudent.findFirst({
    where: {
      student_id: Number(studentId),
      batch_id: Number(batchId)
    }
  });

  if (!membership) {
    throw new Error('Student is not assigned to this batch');
  }

  if (!batch.price || batch.price <= 0) {
    throw new Error('Batch price is not configured yet. Contact owner to set batch price.');
  }

  const amount = Number(batch.price);

  const claim = await prisma.$transaction(async (tx) => {
    // Serialize claim creation per student to avoid daily-limit bypass by parallel requests.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${Number(studentId)})`;

    const { start: monthStart, end: monthEnd } = getIstMonthRange();
    const hasVerifiedOrApprovedThisMonth = await tx.paymentClaim.count({
      where: {
        student_id: Number(studentId),
        status: { in: [CLAIM_STATUS.VERIFIED, CLAIM_STATUS.APPROVED] },
        created_at: {
          gte: monthStart,
          lt: monthEnd
        }
      }
    });

    if (hasVerifiedOrApprovedThisMonth > 0) {
      throw createBusinessRuleError(
        'CLAIM_MONTH_LOCKED',
        'You already have a verified fee request in this month, so new requests are blocked until next month.'
      );
    }

    const { start: dayStart, end: dayEnd } = getIstDayRange();
    const claimsToday = await tx.paymentClaim.count({
      where: {
        student_id: Number(studentId),
        created_at: {
          gte: dayStart,
          lt: dayEnd
        }
      }
    });

    if (claimsToday >= 2) {
      throw createBusinessRuleError(
        'CLAIM_DAILY_LIMIT_REACHED',
        'You can raise a maximum of 2 fee requests per day.'
      );
    }

    return tx.paymentClaim.create({
      data: {
        student_id: Number(studentId),
        batch_id: Number(batchId),
        coaching_center_id: batch.coaching_center_id,
        amount,
        expected_amount: amount,
        note: note || null,
        proof_url: proofUrl || null,
        status: CLAIM_STATUS.PENDING
      },
      include: {
        batch: { select: { id: true, name: true, price: true } },
        student: { select: { id: true, name: true, email: true } }
      }
    });
  });

  await audit({
    userId: requesterId,
    action: 'CREATE_PAYMENT_CLAIM',
    entityType: 'PAYMENT_CLAIM',
    entityId: claim.id,
    metadata: {
      batchId: Number(batchId),
      amount,
      expectedAmount: amount
    }
  });

  return formatClaim(claim);
};

const verifyClaim = async (claimId, requesterId) => {
  const existing = await prisma.paymentClaim.findFirst({
    where: { id: Number(claimId) }
  });

  if (!existing) throw new Error('Payment claim not found');
  if (existing.status !== CLAIM_STATUS.PENDING) {
    throw new Error('Only pending claims can be verified');
  }

  if (Number(existing.amount) !== Number(existing.expected_amount)) {
    throw new Error('Claim amount mismatch detected');
  }

  const claim = await prisma.paymentClaim.update({
    where: { id: Number(claimId) },
    data: {
      status: CLAIM_STATUS.VERIFIED,
      verified_by: Number(requesterId),
      verified_at: new Date()
    },
    include: {
      batch: { select: { id: true, name: true, price: true } },
      student: { select: { id: true, name: true, email: true } }
    }
  });

  await audit({
    userId: requesterId,
    action: 'VERIFY_PAYMENT_CLAIM',
    entityType: 'PAYMENT_CLAIM',
    entityId: claim.id,
    metadata: { amount: claim.amount, expectedAmount: claim.expected_amount }
  });

  try {
    const pushResult = await notificationService.sendPaymentClaimStatusNotification({
      studentId: claim.student_id,
      claim,
      status: CLAIM_STATUS.VERIFIED
    });

    if (!pushResult?.sent) {
      console.warn('[Payment Claim Push] Not sent', {
        claimId: claim.id,
        studentId: claim.student_id,
        reason: pushResult?.reason || 'unknown'
      });
    }
  } catch (error) {
    console.error('Claim verify push notification failed:', error.message);
  }

  return formatClaim(claim);
};

const approveClaim = async (claimId, requesterId) => {
  const existing = await prisma.paymentClaim.findFirst({
    where: { id: Number(claimId) }
  });

  if (!existing) throw new Error('Payment claim not found');
  if (![CLAIM_STATUS.PENDING, CLAIM_STATUS.VERIFIED].includes(existing.status)) {
    throw new Error('Only pending or verified claims can be approved');
  }

  if (Number(existing.amount) !== Number(existing.expected_amount)) {
    throw new Error('Claim amount mismatch detected');
  }

  const claim = await prisma.paymentClaim.update({
    where: { id: Number(claimId) },
    data: {
      status: CLAIM_STATUS.APPROVED,
      approved_by: Number(requesterId),
      approved_at: new Date()
    },
    include: {
      batch: { select: { id: true, name: true, price: true } },
      student: { select: { id: true, name: true, email: true } }
    }
  });

  await audit({
    userId: requesterId,
    action: 'APPROVE_PAYMENT_CLAIM',
    entityType: 'PAYMENT_CLAIM',
    entityId: claim.id,
    metadata: { amount: claim.amount }
  });

  try {
    const pushResult = await notificationService.sendPaymentClaimStatusNotification({
      studentId: claim.student_id,
      claim,
      status: CLAIM_STATUS.APPROVED
    });

    if (!pushResult?.sent) {
      console.warn('[Payment Claim Push] Not sent', {
        claimId: claim.id,
        studentId: claim.student_id,
        reason: pushResult?.reason || 'unknown'
      });
    }
  } catch (error) {
    console.error('Claim approve push notification failed:', error.message);
  }

  return formatClaim(claim);
};

const rejectClaim = async (claimId, requesterId, reason) => {
  const existing = await prisma.paymentClaim.findFirst({
    where: { id: Number(claimId) }
  });

  if (!existing) throw new Error('Payment claim not found');
  if (![CLAIM_STATUS.PENDING, CLAIM_STATUS.VERIFIED].includes(existing.status)) {
    throw new Error('Only pending or verified claims can be rejected');
  }

  const claim = await prisma.paymentClaim.update({
    where: { id: Number(claimId) },
    data: {
      status: CLAIM_STATUS.REJECTED,
      rejected_reason: reason || null
    },
    include: {
      batch: { select: { id: true, name: true, price: true } },
      student: { select: { id: true, name: true, email: true } }
    }
  });

  await audit({
    userId: requesterId,
    action: 'REJECT_PAYMENT_CLAIM',
    entityType: 'PAYMENT_CLAIM',
    entityId: claim.id,
    metadata: { reason: reason || null }
  });

  try {
    const pushResult = await notificationService.sendPaymentClaimStatusNotification({
      studentId: claim.student_id,
      claim,
      status: CLAIM_STATUS.REJECTED
    });

    if (!pushResult?.sent) {
      console.warn('[Payment Claim Push] Not sent', {
        claimId: claim.id,
        studentId: claim.student_id,
        reason: pushResult?.reason || 'unknown'
      });
    }
  } catch (error) {
    console.error('Claim reject push notification failed:', error.message);
  }

  return formatClaim(claim);
};

const getMyClaims = async (studentId) => {
  const claims = await prisma.paymentClaim.findMany({
    where: { student_id: Number(studentId) },
    include: {
      batch: { select: { id: true, name: true, price: true } },
      student: { select: { id: true, name: true, email: true } }
    },
    orderBy: { created_at: 'desc' }
  });

  return claims.map(formatClaim);
};

const getCoachingClaims = async (coachingId, status, teacherId = null, isTeacher = false) => {
  let whereClause = {
    coaching_center_id: Number(coachingId),
    ...(status ? { status: String(status).toUpperCase() } : {})
  };

  // If user is a teacher (not owner), filter claims by teacher's assigned batches
  if (isTeacher && teacherId) {
    // Get all batches where this teacher has assignments (via batch_subject, batch_schedule, or lecture)
    const assignedBatches = await prisma.batch.findMany({
      where: {
        coaching_center_id: Number(coachingId),
        OR: [
          { batch_subjects: { some: { teacher_id: Number(teacherId) } } },
          { schedules: { some: { teacher_id: Number(teacherId) } } },
          { lectures: { some: { teacher_id: Number(teacherId) } } }
        ]
      },
      select: { id: true }
    });

    const batchIds = assignedBatches.map(b => b.id);
    
    // If teacher has no assigned batches, return empty
    if (batchIds.length === 0) {
      return [];
    }

    whereClause = {
      ...whereClause,
      batch_id: { in: batchIds }
    };
  }

  const claims = await prisma.paymentClaim.findMany({
    where: whereClause,
    include: {
      batch: { select: { id: true, name: true, price: true } },
      student: { select: { id: true, name: true, email: true } }
    },
    orderBy: { created_at: 'desc' }
  });

  return claims.map(formatClaim);
};

module.exports = {
  CLAIM_STATUS,
  createClaim,
  verifyClaim,
  approveClaim,
  rejectClaim,
  getMyClaims,
  getCoachingClaims
};
