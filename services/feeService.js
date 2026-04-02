const prisma = require('../config/database');
const { audit } = require('../utils/auditLogger');

const calculateFeeState = (totalFee, totalPaid) => {
  if (totalPaid >= totalFee) return 'PAID';
  if (totalPaid > 0) return 'PARTIAL';
  return 'PENDING';
};

const enrichFee = async (fee) => {
  const paid = await prisma.payment.aggregate({
    where: { fee_id: fee.id },
    _sum: { amount: true }
  });
  const paidAmount = paid._sum.amount || 0;
  const totalFee = fee.total_fee || 0;

  return {
    ...fee,
    studentId: fee.student_id,
    batchId: fee.batch_id,
    amount: totalFee,
    dueDate: fee.due_date,
    createdAt: fee.created_at,
    paidAmount,
    status: calculateFeeState(totalFee, paidAmount)
  };
};

const createFeeRecord = async (feeData, requesterId) => {
  const { studentId, coachingId, amount, dueDate } = feeData;

  const student = await prisma.user.findUnique({ where: { id: Number(studentId) } });
  if (!student || student.coaching_center_id !== Number(coachingId)) {
    throw new Error('Student does not belong to the specified coaching center');
  }

  const latestBatch = await prisma.batchStudent.findFirst({
    where: {
      student_id: Number(studentId),
      batch: { coaching_center_id: Number(coachingId) }
    },
    orderBy: { joined_at: 'desc' }
  });

  const fee = await prisma.fee.create({
    data: {
      student_id: Number(studentId),
      batch_id: latestBatch?.batch_id || null,
      total_fee: Number(amount),
      due_date: dueDate ? new Date(dueDate) : null
    }
  });

  await audit({
    userId: requesterId,
    action: 'CREATE_FEE',
    entityType: 'FEE',
    entityId: fee.id,
    metadata: { amount: Number(amount), studentId: Number(studentId) }
  });
  return enrichFee(fee);
};

// Record a payment — never overwrite paidAmount directly; always log a transaction
const recordPayment = async (feeId, paymentData, requesterId) => {
  const { amount } = paymentData;

  const fee = await prisma.fee.findUnique({ where: { id: Number(feeId) } });
  if (!fee) throw new Error('Fee record not found');

  const numericAmount = Number(amount);
  if (!numericAmount || numericAmount <= 0) throw new Error('Payment amount must be greater than 0');

  await prisma.payment.create({
    data: {
      fee_id: Number(feeId),
      amount: numericAmount,
      recorded_by: requesterId
    }
  });

  await audit({
    userId: requesterId,
    action: 'RECORD_PAYMENT',
    entityType: 'FEE',
    entityId: Number(feeId),
    metadata: { amount: numericAmount }
  });
  const refreshed = await prisma.fee.findUnique({ where: { id: Number(feeId) } });
  return enrichFee(refreshed);
};

const getFeeById = async (feeId) => {
  const fee = await prisma.fee.findUnique({
    where: { id: Number(feeId) },
    include: { payments: { orderBy: { paid_at: 'desc' } }, student: true, batch: true }
  });
  if (!fee) throw new Error('Fee record not found');
  return enrichFee(fee);
};

const getStudentFees = async (studentId) => {
  const fees = await prisma.fee.findMany({
    where: { student_id: Number(studentId) },
    include: {
      student: { select: { id: true, name: true, email: true } },
      batch: { select: { id: true, name: true, coaching_center_id: true } },
      payments: { orderBy: { paid_at: 'desc' } }
    },
    orderBy: { created_at: 'desc' }
  });
  return Promise.all(fees.map(enrichFee));
};

const getCoachingFees = async (coachingId) => {
  const fees = await prisma.fee.findMany({
    where: { batch: { coaching_center_id: Number(coachingId) } },
    include: {
      student: { select: { id: true, name: true, email: true } },
      batch: { select: { id: true, name: true, coaching_center_id: true } },
      payments: { orderBy: { paid_at: 'desc' } }
    },
    orderBy: { created_at: 'desc' }
  });
  return Promise.all(fees.map(enrichFee));
};

const getCoachingFeeSummary = async (coachingId) => {
  const numericCoachingId = Number(coachingId);

  const [feeSummary, paymentSummary] = await Promise.all([
    prisma.fee.aggregate({
      where: { batch: { coaching_center_id: numericCoachingId } },
      _sum: { total_fee: true },
      _count: { _all: true }
    }),
    prisma.payment.aggregate({
      where: { fee: { batch: { coaching_center_id: numericCoachingId } } },
      _sum: { amount: true }
    })
  ]);

  const totalAmount = feeSummary._sum.total_fee || 0;
  const totalPaid = paymentSummary._sum.amount || 0;
  const pendingAmount = totalAmount - totalPaid;

  return {
    totalRecords: feeSummary._count._all,
    totalAmount,
    totalPaid,
    totalPending: pendingAmount,
    collectionRate: totalAmount ? (totalPaid / totalAmount) * 100 : 0
  };
};

const updateFeeRecord = async (feeId, updateData, requesterId) => {
  const fee = await prisma.fee.findUnique({ where: { id: Number(feeId) } });
  if (!fee) throw new Error('Fee record not found');

  const safeData = {};
  if (Object.prototype.hasOwnProperty.call(updateData, 'amount')) safeData.total_fee = Number(updateData.amount);
  if (Object.prototype.hasOwnProperty.call(updateData, 'dueDate')) {
    safeData.due_date = updateData.dueDate ? new Date(updateData.dueDate) : null;
  }

  const updated = await prisma.fee.update({
    where: { id: Number(feeId) },
    data: safeData
  });

  await audit({ userId: requesterId, action: 'UPDATE_FEE', entityType: 'FEE', entityId: Number(feeId) });
  return enrichFee(updated);
};

const getFeeTransactions = async (feeId) => {
  const payments = await prisma.payment.findMany({
    where: { fee_id: Number(feeId) },
    orderBy: { paid_at: 'desc' }
  });
  return payments.map((payment) => ({
    ...payment,
    feeId: payment.fee_id,
    recordedBy: payment.recorded_by,
    createdAt: payment.paid_at
  }));
};

// Get all revenue (payments) for a coaching center with student details
const getCoachingRevenue = async (coachingId) => {
  const payments = await prisma.payment.findMany({
    where: {
      fee: {
        student: {
          coaching_center_id: Number(coachingId)
        }
      }
    },
    include: {
      fee: {
        include: {
          student: {
            select: { id: true, name: true, email: true }
          },
          batch: {
            select: { id: true, name: true }
          }
        }
      },
      recorder: {
        select: { id: true, name: true }
      }
    },
    orderBy: { paid_at: 'desc' }
  });

  return payments.map((payment) => ({
    id: payment.id,
    amount: payment.amount,
    paidAt: payment.paid_at,
    studentId: payment.fee?.student?.id,
    studentName: payment.fee?.student?.name,
    studentEmail: payment.fee?.student?.email,
    batchId: payment.fee?.batch?.id,
    batchName: payment.fee?.batch?.name,
    feeId: payment.fee_id,
    recordedBy: payment.recorder?.name || 'System'
  }));
};

const getCoachingStudentWiseRevenueReport = async (coachingId, segmentBy = 'none') => {
  const numericCoachingId = Number(coachingId);

  const [fees, approvedClaims] = await Promise.all([
    prisma.fee.findMany({
      where: {
        student: {
          coaching_center_id: numericCoachingId
        }
      },
      include: {
        student: {
          select: { id: true, name: true }
        },
        batch: {
          select: { id: true, name: true }
        },
        payments: {
          select: { amount: true }
        }
      }
    }),
    prisma.paymentClaim.findMany({
      where: {
        coaching_center_id: numericCoachingId,
        status: 'APPROVED'
      },
      select: {
        student_id: true,
        batch_id: true,
        amount: true
      }
    })
  ]);

  const approvedByStudent = new Map();
  const approvedByStudentBatch = new Map();

  for (const claim of approvedClaims) {
    const studentId = Number(claim.student_id);
    const batchId = claim.batch_id == null ? null : Number(claim.batch_id);
    const amount = Number(claim.amount) || 0;

    approvedByStudent.set(studentId, (approvedByStudent.get(studentId) || 0) + amount);

    if (batchId != null) {
      const batchKey = `${studentId}:${batchId}`;
      approvedByStudentBatch.set(batchKey, (approvedByStudentBatch.get(batchKey) || 0) + amount);
    }
  }

  const studentMap = new Map();
  const batchMap = new Map();

  for (const fee of fees) {
    const studentId = Number(fee.student_id);
    if (!studentId) continue;

    const studentName = fee.student?.name || 'Unknown';
    const batchId = fee.batch_id == null ? null : Number(fee.batch_id);
    const batchName = fee.batch?.name || 'Unassigned';
    const feeAmount = Number(fee.total_fee) || 0;
    const totalPaid = (fee.payments || []).reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);

    if (!studentMap.has(studentId)) {
      studentMap.set(studentId, {
        studentId,
        studentName,
        totalFee: 0,
        totalPaid: 0,
        approvedPaid: 0,
        dueAmount: 0,
        status: 'due',
        _batchIds: new Set(),
        _batchNames: new Set()
      });
    }

    const existingStudent = studentMap.get(studentId);
    existingStudent.totalFee += feeAmount;
    existingStudent.totalPaid += totalPaid;
    if (batchId != null) existingStudent._batchIds.add(batchId);
    if (batchName) existingStudent._batchNames.add(batchName);

    const normalizedBatchId = batchId == null ? 0 : batchId;
    const batchKey = `${normalizedBatchId}`;
    if (!batchMap.has(batchKey)) {
      batchMap.set(batchKey, {
        batchId,
        batchName,
        students: new Map()
      });
    }

    const batchEntry = batchMap.get(batchKey);
    if (!batchEntry.students.has(studentId)) {
      batchEntry.students.set(studentId, {
        studentId,
        studentName,
        batchId,
        batchName,
        totalFee: 0,
        totalPaid: 0,
        approvedPaid: 0,
        dueAmount: 0,
        status: 'due'
      });
    }

    const batchStudent = batchEntry.students.get(studentId);
    batchStudent.totalFee += feeAmount;
    batchStudent.totalPaid += totalPaid;
  }

  const students = Array.from(studentMap.values())
    .map((student) => {
      const approvedPaid = approvedByStudent.get(student.studentId) || 0;
      const dueAmount = Math.max(student.totalFee - approvedPaid, 0);

      return {
        studentId: student.studentId,
        studentName: student.studentName,
        batchIds: Array.from(student._batchIds),
        batchNames: Array.from(student._batchNames),
        totalFee: student.totalFee,
        totalPaid: student.totalPaid,
        approvedPaid,
        dueAmount,
        status: student.totalFee > 0 && dueAmount <= 0 ? 'paid' : 'due'
      };
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName));

  const byBatch = Array.from(batchMap.values())
    .map((batchEntry) => {
      const batchStudents = Array.from(batchEntry.students.values())
        .map((student) => {
          const claimKey = `${student.studentId}:${student.batchId == null ? 0 : student.batchId}`;
          const approvedPaid = approvedByStudentBatch.get(claimKey) || 0;
          const dueAmount = Math.max(student.totalFee - approvedPaid, 0);

          return {
            ...student,
            approvedPaid,
            dueAmount,
            status: student.totalFee > 0 && dueAmount <= 0 ? 'paid' : 'due'
          };
        })
        .sort((a, b) => a.studentName.localeCompare(b.studentName));

      const totals = batchStudents.reduce(
        (acc, item) => {
          acc.totalFee += item.totalFee;
          acc.totalPaid += item.totalPaid;
          acc.approvedPaid += item.approvedPaid;
          acc.totalDue += item.dueAmount;
          return acc;
        },
        { totalFee: 0, totalPaid: 0, approvedPaid: 0, totalDue: 0 }
      );

      return {
        batchId: batchEntry.batchId,
        batchName: batchEntry.batchName,
        totals,
        students: batchStudents
      };
    })
    .sort((a, b) => a.batchName.localeCompare(b.batchName));

  const summary = students.reduce(
    (acc, item) => {
      acc.totalStudents += 1;
      acc.centerTotalFee += item.totalFee;
      acc.centerTotalPaid += item.totalPaid;
      acc.centerApprovedPaid += item.approvedPaid;
      acc.centerDue += item.dueAmount;
      if (item.status === 'paid') acc.paidStudents += 1;
      else acc.dueStudents += 1;
      return acc;
    },
    {
      totalStudents: 0,
      paidStudents: 0,
      dueStudents: 0,
      centerTotalFee: 0,
      centerTotalPaid: 0,
      centerApprovedPaid: 0,
      centerDue: 0
    }
  );

  return {
    summary,
    students,
    segments: {
      byBatch: segmentBy === 'batch' ? byBatch : []
    }
  };
};

module.exports = {
  createFeeRecord,
  recordPayment,
  getStudentFees,
  getCoachingFees,
  getCoachingFeeSummary,
  getFeeById,
  updateFeeRecord,
  getFeeTransactions,
  getCoachingRevenue,
  getCoachingStudentWiseRevenueReport
};