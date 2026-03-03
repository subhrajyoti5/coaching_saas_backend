const prisma = require('../config/database');
const { audit } = require('../utils/auditLogger');

const getUsersByCoaching = async (coachingId) => {
  const coachingUsers = await prisma.coachingUser.findMany({
    where: { coachingId },
    include: {
      user: {
        select: {
          id: true, email: true, firstName: true, lastName: true, phone: true, isActive: true, createdAt: true
        }
      }
    }
  });
  return coachingUsers.map(cu => cu.user);
};

// Any general assignment (rarely used now that we have addTeacher/addStudent in coachingService)
const assignUserToCoaching = async (userId, coachingId, assignedBy) => {
  const existing = await prisma.coachingUser.findFirst({ where: { userId, coachingId } });
  if (existing) throw new Error('User is already assigned to this coaching center');

  const coachingUser = await prisma.coachingUser.create({
    data: { userId, coachingId, role: 'STUDENT', assignedBy } // Default role
  });

  await audit({ userId: assignedBy, action: 'ASSIGN_USER_TO_COACHING', entityType: 'COACHING_USER', entityId: coachingUser.id, metadata: { targetUserId: userId } });
  return coachingUser;
};

const removeUserFromCoaching = async (userId, coachingId, requesterId) => {
  const result = await prisma.coachingUser.deleteMany({ where: { userId, coachingId } });
  if (result.count === 0) throw new Error('User is not assigned to this coaching center');

  await audit({ userId: requesterId, action: 'REMOVE_USER_FROM_COACHING', entityType: 'COACHING', entityId: coachingId, metadata: { targetUserId: userId } });
  return { message: 'User successfully removed from coaching center' };
};

const getUserWithCoachingInfo = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { coachingUsers: { include: { coaching: true } } }
  });
  if (!user || !user.isActive) throw new Error('User not found');
  return user;
};

const updateUserProfile = async (userId, updateData, requesterId) => {
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: updateData
  });
  const { password: _, ...userWithoutPassword } = updatedUser;
  await audit({ userId: requesterId, action: 'UPDATE_PROFILE', entityType: 'USER', entityId: userId });
  return userWithoutPassword;
};

const deactivateUser = async (userId, requesterId) => {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { isActive: false, deletedAt: new Date() }
  });
  await audit({ userId: requesterId, action: 'DEACTIVATE_USER', entityType: 'USER', entityId: userId });
  return user;
};

module.exports = {
  getUsersByCoaching,
  assignUserToCoaching,
  removeUserFromCoaching,
  getUserWithCoachingInfo,
  updateUserProfile,
  deactivateUser
};