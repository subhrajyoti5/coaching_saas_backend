const prisma = require('../config/database');
const { ROLES } = require('../config/constants');
const { audit } = require('../utils/auditLogger');

// Create coaching center and insert the creator as OWNER in coaching_users
const createCoaching = async (coachingData, creatorId) => {
  const { name, description } = coachingData;

  const coaching = await prisma.$transaction(async (tx) => {
    const newCoaching = await tx.coachingCentre.create({
      data: { name, description, ownerId: creatorId }
    });

    // Ownership is scoped to this coaching via coaching_users
    await tx.coachingUser.create({
      data: {
        userId: creatorId,
        coachingId: newCoaching.id,
        role: ROLES.OWNER,
        assignedBy: creatorId
      }
    });

    return newCoaching;
  });

  await audit({ userId: creatorId, action: 'CREATE_COACHING', entityType: 'COACHING', entityId: coaching.id });
  return coaching;
};

// Helper to find or create a user by email (for onboarding by owner)
const findOrCreateUserByEmail = async (email, firstName = 'User', lastName = '') => {
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        password: '', // Password-less for Google Login
        isActive: true
      }
    });
  } else if (!user.isActive) {
    throw new Error('User account is inactive');
  }
  return user;
};

// Add teacher by email: creates placeholder user if not existing
const addTeacherToCoaching = async (email, coachingId, addedBy, teacherData = {}) => {
  const user = await findOrCreateUserByEmail(email, teacherData.firstName || 'Teacher', teacherData.lastName || '');
  const userId = user.id;

  const existing = await prisma.coachingUser.findFirst({ where: { userId, coachingId } });
  if (existing) throw new Error('User is already a member of this coaching center');

  const coachingUser = await prisma.coachingUser.create({
    data: { userId, coachingId, role: ROLES.TEACHER, assignedBy: addedBy }
  });

  await audit({ userId: addedBy, action: 'ADD_TEACHER', entityType: 'COACHING_USER', entityId: coachingUser.id, metadata: { targetEmail: email } });
  return coachingUser;
};

// Add student by email: creates placeholder user + profile
const addStudentToCoaching = async (email, coachingId, addedBy, studentData = {}) => {
  const user = await findOrCreateUserByEmail(email, studentData.firstName || 'Student', studentData.lastName || '');
  const userId = user.id;

  const existing = await prisma.coachingUser.findFirst({ where: { userId, coachingId } });
  if (existing) throw new Error('User is already a member of this coaching center');

  const result = await prisma.$transaction(async (tx) => {
    const coachingUser = await tx.coachingUser.create({
      data: { userId, coachingId, role: ROLES.STUDENT, assignedBy: addedBy }
    });

    const studentProfile = await tx.studentProfile.create({
      data: {
        userId,
        coachingId,
        parentName: studentData.parentName,
        parentPhone: studentData.parentPhone,
        parentEmail: studentData.parentEmail,
        gradeLevel: studentData.gradeLevel,
        admissionDate: studentData.admissionDate ? new Date(studentData.admissionDate) : undefined
      }
    });

    return { coachingUser, studentProfile };
  });

  await audit({ userId: addedBy, action: 'ADD_STUDENT', entityType: 'STUDENT_PROFILE', entityId: result.studentProfile.id, metadata: { targetEmail: email } });
  return result;
};

const getCoachingById = async (coachingId) => {
  const coaching = await prisma.coachingCentre.findFirst({
    where: { id: coachingId, isActive: true },
    include: {
      owner: { select: { id: true, email: true, firstName: true, lastName: true } }
    }
  });

  if (!coaching) throw new Error('Coaching center not found');
  return coaching;
};

const getUserCoachingCenters = async (userId) => {
  const coachingUsers = await prisma.coachingUser.findMany({
    where: { userId },
    include: {
      coaching: {
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } }
        }
      }
    }
  });

  return coachingUsers.map(cu => ({ ...cu.coaching, role: cu.role }));
};

const getTeachersByCoaching = async (coachingId) => {
  const coachingUsers = await prisma.coachingUser.findMany({
    where: { coachingId, role: ROLES.TEACHER },
    include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, isActive: true } }
    }
  });

  return coachingUsers.map(cu => cu.user);
};

const getStudentsByCoaching = async (coachingId) => {
  const coachingUsers = await prisma.coachingUser.findMany({
    where: { coachingId, role: ROLES.STUDENT },
    include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, isActive: true } }
    }
  });

  return coachingUsers.map(cu => cu.user);
};

const deactivateCoaching = async (coachingId, requesterId) => {
  const coaching = await prisma.coachingCentre.update({
    where: { id: coachingId },
    data: { isActive: false, deletedAt: new Date() }
  });
  await audit({ userId: requesterId, action: 'DEACTIVATE_COACHING', entityType: 'COACHING', entityId: coachingId });
  return coaching;
};

module.exports = {
  createCoaching,
  addTeacherToCoaching,
  addStudentToCoaching,
  getCoachingById,
  getUserCoachingCenters,
  getTeachersByCoaching,
  getStudentsByCoaching,
  deactivateCoaching
};