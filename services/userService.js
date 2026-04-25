const prisma = require('../config/database');
const { audit } = require('../utils/auditLogger');
const { computeStudentStatus } = require('../utils/billingUtils');

const splitName = (name = '') => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || ''
  };
};

const mapUserForClient = (user) => {
  const { firstName, lastName } = splitName(user.name);
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    phone: user.phone || null,
    firstName,
    lastName,
    name: user.name,
    isActive: Boolean(user.is_active),
    isRevoked: Boolean(user.is_revoked),
    isLig: Boolean(user.is_lig),
    lastFeePaidAt: user.last_fee_paid_at,
    status: computeStudentStatus(user),
    createdAt: user.created_at,
    coachingId: user.coaching_center_id
  };
};

const getUsersByCoaching = async (coachingId) => {
  const users = await prisma.user.findMany({
    where: { coaching_center_id: Number(coachingId) },
    orderBy: { created_at: 'desc' }
  });
  return users.map(mapUserForClient);
};

const assignUserToCoaching = async (userId, coachingId, assignedBy) => {
  const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
  if (!user) throw new Error('User not found');
  if (user.coaching_center_id === Number(coachingId)) {
    throw new Error('User is already assigned to this coaching center');
  }

  const updated = await prisma.user.update({
    where: { id: Number(userId) },
    data: { coaching_center_id: Number(coachingId) }
  });

  await audit({
    userId: assignedBy,
    action: 'ASSIGN_USER_TO_COACHING',
    entityType: 'USER',
    entityId: updated.id,
    metadata: { targetUserId: Number(userId), coachingId: Number(coachingId) }
  });

  return mapUserForClient(updated);
};

const removeUserFromCoaching = async (userId, coachingId, requesterId) => {
  const user = await prisma.user.findFirst({
    where: { id: Number(userId), coaching_center_id: Number(coachingId) }
  });
  if (!user) throw new Error('User is not assigned to this coaching center');

  await prisma.user.update({
    where: { id: Number(userId) },
    data: { coaching_center_id: null }
  });

  await audit({
    userId: requesterId,
    action: 'REMOVE_USER_FROM_COACHING',
    entityType: 'COACHING',
    entityId: Number(coachingId),
    metadata: { targetUserId: Number(userId) }
  });

  return { message: 'User successfully removed from coaching center' };
};

const getUserWithCoachingInfo = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: Number(userId) },
    include: { coaching_center: true }
  });
  if (!user || !user.is_active) throw new Error('User not found');

  const mapped = mapUserForClient(user);
  return {
    ...mapped,
    coaching: user.coaching_center
      ? { id: user.coaching_center.id, name: user.coaching_center.name }
      : null
  };
};

const updateUserProfile = async (userId, updateData, requesterId) => {
  const data = { ...updateData };
  if (typeof data.firstName === 'string' || typeof data.lastName === 'string') {
    const existing = await prisma.user.findUnique({ where: { id: Number(userId) } });
    if (!existing) throw new Error('User not found');
    const existingParts = splitName(existing.name);
    const firstName = (data.firstName ?? existingParts.firstName).trim();
    const lastName = (data.lastName ?? existingParts.lastName).trim();
    data.name = `${firstName} ${lastName}`.trim();
    delete data.firstName;
    delete data.lastName;
  }

  const allowed = {};
  if (typeof data.name === 'string' && data.name.trim()) allowed.name = data.name.trim();
  if (typeof data.role === 'string' && data.role.trim()) allowed.role = data.role.trim();
  if (typeof data.phone === 'string') allowed.phone = data.phone.trim() || null;
  if (typeof data.is_active === 'boolean') allowed.is_active = data.is_active;
  if (typeof data.is_revoked === 'boolean') allowed.is_revoked = data.is_revoked;
  if (data.last_fee_paid_at) allowed.last_fee_paid_at = new Date(data.last_fee_paid_at);

  const updatedUser = await prisma.user.update({
    where: { id: Number(userId) },
    data: allowed
  });

  await audit({ userId: requesterId, action: 'UPDATE_PROFILE', entityType: 'USER', entityId: Number(userId) });
  return mapUserForClient(updatedUser);
};

const deactivateUser = async (userId, requesterId) => {
  const user = await prisma.user.update({
    where: { id: Number(userId) },
    data: { is_active: false }
  });
  await audit({ userId: requesterId, action: 'DEACTIVATE_USER', entityType: 'USER', entityId: Number(userId) });
  return mapUserForClient(user);
};

const setUserRevokeStatus = async (userId, isRevoked, requesterId) => {
  const user = await prisma.user.update({
    where: { id: Number(userId) },
    data: { is_revoked: Boolean(isRevoked) }
  });
  await audit({
    userId: requesterId,
    action: isRevoked ? 'REVOKE_USER_ACCESS' : 'RESTORE_USER_ACCESS',
    entityType: 'USER',
    entityId: Number(userId)
  });
  return mapUserForClient(user);
};

const markUserAsPaid = async (userId, requesterId) => {
  const student = await prisma.user.findUnique({
    where: { id: Number(userId) },
    select: { last_fee_paid_at: true, created_at: true }
  });

  let nextPaidAt;
  if (!student.last_fee_paid_at) {
    // Default to end of current month if first payment
    nextPaidAt = new Date();
  } else {
    nextPaidAt = new Date(student.last_fee_paid_at);
    nextPaidAt.setMonth(nextPaidAt.getMonth() + 1);
  }

  const user = await prisma.user.update({
    where: { id: Number(userId) },
    data: { 
      last_fee_paid_at: nextPaidAt, 
      is_revoked: false,
      is_lig: false
    }
  });
  await audit({
    userId: requesterId,
    action: 'MARK_USER_PAID',
    entityType: 'USER',
    entityId: Number(userId)
  });
  return mapUserForClient(user);
};

module.exports = {
  getUsersByCoaching,
  assignUserToCoaching,
  removeUserFromCoaching,
  getUserWithCoachingInfo,
  updateUserProfile,
  deactivateUser,
  setUserRevokeStatus,
  markUserAsPaid
};