const prisma = require('../config/database');
const { audit } = require('../utils/auditLogger');

const calculateAndSetStatus = async (tx, feeId) => {
  const fee = await tx.fee.findUnique({ where: { id: feeId } });
  let status = 'PENDING';
  if (fee.paidAmount >= fee.amount) status = 'PAID';
  else if (fee.paidAmount > 0) status = 'PARTIAL';
  return tx.fee.update({ where: { id: feeId }, data: { status } });
};

const createFeeRecord = async (feeData, requesterId) => {
  const { studentId, coachingId, amount, dueDate, notes } = feeData;

  const studentProfile = await prisma.studentProfile.findUnique({ where: { id: studentId } });
  if (!studentProfile || studentProfile.coachingId !== coachingId) {
    throw new Error('Student does not belong to the specified coaching center');
  }

  const fee = await prisma.fee.create({ data: { studentId, coachingId, amount, dueDate, notes } });
  const updatedFee = await prisma.$transaction(async (tx) => calculateAndSetStatus(tx, fee.id));

  await audit({ userId: requesterId, action: 'CREATE_FEE', entityType: 'FEE', entityId: fee.id, metadata: { amount } });
  return updatedFee;
};

// Record a payment — never overwrite paidAmount directly; always log a transaction
const recordPayment = async (feeId, paymentData, requesterId) => {
  const { amount, paymentMethod = 'CASH', referenceId, notes } = paymentData;

  const fee = await prisma.fee.findUnique({ where: { id: feeId } });
  if (!fee) throw new Error('Fee record not found');

  if (amount <= 0) throw new Error('Payment amount must be greater than 0');

  const result = await prisma.$transaction(async (tx) => {
    // Log the transaction first
    await tx.feeTransaction.create({
      data: { feeId, amount, paymentMethod, referenceId, notes, recordedBy: requesterId }
    });

    // Accumulate — capped at total amount
    const newPaidAmount = Math.min(fee.paidAmount + amount, fee.amount);
    await tx.fee.update({ where: { id: feeId }, data: { paidAmount: newPaidAmount } });

    return calculateAndSetStatus(tx, feeId);
  });

  await audit({ userId: requesterId, action: 'RECORD_PAYMENT', entityType: 'FEE', entityId: feeId, metadata: { amount, paymentMethod } });
  return result;
};

const getFeeById = async (feeId) => {
  const fee = await prisma.fee.findUnique({
    where: { id: feeId },
    include: { transactions: { orderBy: { createdAt: 'desc' } } }
  });
  if (!fee) throw new Error('Fee record not found');
  return fee;
};

const getStudentFees = async (studentId) => {
  return prisma.fee.findMany({
    where: { studentId },
    include: {
      student: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
      transactions: { orderBy: { createdAt: 'desc' } }
    },
    orderBy: { createdAt: 'desc' }
  });
};

const getCoachingFees = async (coachingId) => {
  return prisma.fee.findMany({
    where: { coachingId },
    include: {
      student: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
      transactions: { orderBy: { createdAt: 'desc' } }
    },
    orderBy: { createdAt: 'desc' }
  });
};

const getCoachingFeeSummary = async (coachingId) => {
  const summary = await prisma.fee.aggregate({
    where: { coachingId },
    _sum: { amount: true, paidAmount: true },
    _count: { _all: true }
  });
  const pendingAmount = (summary._sum.amount || 0) - (summary._sum.paidAmount || 0);
  return {
    totalRecords: summary._count._all,
    totalAmount: summary._sum.amount || 0,
    totalPaid: summary._sum.paidAmount || 0,
    totalPending: pendingAmount,
    collectionRate: summary._sum.amount ? ((summary._sum.paidAmount || 0) / summary._sum.amount) * 100 : 0
  };
};

const updateFeeRecord = async (feeId, updateData, requesterId) => {
  const fee = await prisma.fee.findUnique({ where: { id: feeId } });
  if (!fee) throw new Error('Fee record not found');

  // Avoid overwriting paidAmount via general update — use recordPayment instead
  const safeData = { ...updateData };
  delete safeData.paidAmount;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.fee.update({ where: { id: feeId }, data: safeData });
    return calculateAndSetStatus(tx, feeId);
  });

  await audit({ userId: requesterId, action: 'UPDATE_FEE', entityType: 'FEE', entityId: feeId });
  return updated;
};

const getFeeTransactions = async (feeId) => {
  return prisma.feeTransaction.findMany({
    where: { feeId },
    orderBy: { createdAt: 'desc' }
  });
};

module.exports = {
  createFeeRecord,
  recordPayment,
  getStudentFees,
  getCoachingFees,
  getCoachingFeeSummary,
  getFeeById,
  updateFeeRecord,
  getFeeTransactions
};