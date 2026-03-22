const prisma = require('../config/database');
const { audit } = require('../utils/auditLogger');

const CLAIM_STATUS = {
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
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

  const claim = await prisma.paymentClaim.create({
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

const getCoachingClaims = async (coachingId, status) => {
  const claims = await prisma.paymentClaim.findMany({
    where: {
      coaching_center_id: Number(coachingId),
      ...(status ? { status: String(status).toUpperCase() } : {})
    },
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
