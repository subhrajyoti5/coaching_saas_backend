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

module.exports = {
  createFeeRecord,
  recordPayment,
  getStudentFees,
  getCoachingFees,
  getCoachingFeeSummary,
  getFeeById,
  updateFeeRecord,
  getFeeTransactions,
  getCoachingRevenue
};