const prisma = require('../config/database');
const { ROLES } = require('../config/constants');
const { audit } = require('../utils/auditLogger');

const splitName = (name = '') => {
  const trimmed = String(name || '').trim();
  if (!trimmed) {
    return { firstName: '', lastName: '' };
  }

  const parts = trimmed.split(/\s+/);
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ')
  };
};

const buildName = (firstName = '', lastName = '') => {
  return [firstName, lastName].filter(Boolean).join(' ').trim() || 'User';
};

const mapUserSummary = (user) => {
  const { firstName, lastName } = splitName(user.name);
  return {
    id: user.id,
    userId: user.id,
    email: user.email,
    firstName,
    lastName,
    name: user.name,
    isActive: user.is_active,
    role: user.role,
    coachingId: user.coaching_center_id
  };
};

const createCoaching = async (coachingData, creatorId) => {
  const { name } = coachingData;

  const coaching = await prisma.$transaction(async (tx) => {
    const newCoaching = await tx.coachingCenter.create({
      data: {
        name,
        owner_user_id: creatorId
      }
    });

    await tx.user.update({
      where: { id: creatorId },
      data: {
        role: ROLES.OWNER,
        coaching_center_id: newCoaching.id
      }
    });

    return newCoaching;
  });

  await audit({
    userId: creatorId,
    action: 'CREATE_COACHING',
    entityType: 'COACHING',
    entityId: coaching.id,
    metadata: { coachingId: coaching.id }
  });

  return coaching;
};

const findOrCreateUserByEmail = async (email, coachingId, firstName = 'User', lastName = '') => {
  let user = await prisma.user.findFirst({
    where: {
      email,
      coaching_center_id: Number(coachingId)
    }
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: buildName(firstName, lastName),
        role: ROLES.STUDENT,
        coaching_center_id: Number(coachingId),
        is_active: true
      }
    });
  } else if (!user.is_active) {
    throw new Error('User account is inactive');
  }

  return user;
};

const addTeacherToCoaching = async (email, coachingId, addedBy, teacherData = {}) => {
  const numericCoachingId = Number(coachingId);
  const user = await findOrCreateUserByEmail(
    email,
    numericCoachingId,
    teacherData.firstName || 'Teacher',
    teacherData.lastName || ''
  );

  if (user.coaching_center_id === numericCoachingId) {
    const error = new Error('DUPLICATE_MEMBER:This teacher is already added to your coaching center');
    error.code = 'DUPLICATE_MEMBER';
    throw error;
  }

  if (user.coaching_center_id != null && user.coaching_center_id !== numericCoachingId) {
    throw new Error('This teacher is already assigned to another coaching center');
  }

  const existingName = splitName(user.name);
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      name: buildName(
        teacherData.firstName || existingName.firstName || 'Teacher',
        teacherData.lastName || existingName.lastName
      ),
      role: ROLES.TEACHER,
      coaching_center_id: numericCoachingId,
      is_active: true
    }
  });

  await audit({
    userId: addedBy,
    action: 'ADD_TEACHER',
    entityType: 'USER',
    entityId: updatedUser.id,
    metadata: { coachingId: numericCoachingId, targetEmail: email }
  });

  return {
    id: updatedUser.id,
    userId: updatedUser.id,
    coachingId: numericCoachingId,
    role: updatedUser.role,
    user: mapUserSummary(updatedUser)
  };
};

const addStudentToCoaching = async (email, coachingId, addedBy, studentData = {}) => {
  const numericCoachingId = Number(coachingId);
  const user = await findOrCreateUserByEmail(
    email,
    numericCoachingId,
    studentData.firstName || 'Student',
    studentData.lastName || ''
  );

  if (user.coaching_center_id === numericCoachingId) {
    const error = new Error('DUPLICATE_MEMBER:This student is already added to your coaching center');
    error.code = 'DUPLICATE_MEMBER';
    throw error;
  }

  if (user.coaching_center_id != null && user.coaching_center_id !== numericCoachingId) {
    throw new Error('This student is already assigned to another coaching center');
  }

  const existingName = splitName(user.name);
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      name: buildName(
        studentData.firstName || existingName.firstName || 'Student',
        studentData.lastName || existingName.lastName
      ),
      role: ROLES.STUDENT,
      coaching_center_id: numericCoachingId,
      is_active: true
    }
  });

  const studentProfile = {
    id: updatedUser.id,
    userId: updatedUser.id,
    coachingId: numericCoachingId,
    parentName: studentData.parentName || null,
    parentPhone: studentData.parentPhone || null,
    parentEmail: studentData.parentEmail || null,
    gradeLevel: studentData.gradeLevel || null,
    admissionDate: studentData.admissionDate || null,
    firstName: splitName(updatedUser.name).firstName,
    lastName: splitName(updatedUser.name).lastName,
    email: updatedUser.email
  };

  await audit({
    userId: addedBy,
    action: 'ADD_STUDENT',
    entityType: 'USER',
    entityId: updatedUser.id,
    metadata: { coachingId: numericCoachingId, targetEmail: email }
  });

  return {
    coachingUser: {
      id: updatedUser.id,
      userId: updatedUser.id,
      coachingId: numericCoachingId,
      role: updatedUser.role,
      user: mapUserSummary(updatedUser)
    },
    studentProfile
  };
};

const getCoachingById = async (coachingId) => {
  const coaching = await prisma.coachingCenter.findFirst({
    where: { id: Number(coachingId) }
  });

  if (!coaching) {
    throw new Error('Coaching center not found');
  }

  let owner = null;
  if (coaching.owner_user_id != null) {
    const ownerUser = await prisma.user.findUnique({
      where: { id: coaching.owner_user_id }
    });
    if (ownerUser) {
      owner = mapUserSummary(ownerUser);
    }
  }

  return { ...coaching, owner };
};

const getUserCoachingCenters = async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.coaching_center_id == null) {
    return [];
  }

  const coaching = await prisma.coachingCenter.findUnique({
    where: { id: user.coaching_center_id }
  });

  return coaching ? [{ ...coaching, role: user.role }] : [];
};

const getTeachersByCoaching = async (coachingId) => {
  const teachers = await prisma.user.findMany({
    where: {
      coaching_center_id: Number(coachingId),
      role: { in: [ROLES.TEACHER, ROLES.OWNER] },
      is_active: true
    }
  });

  return teachers.map(mapUserSummary);
};

const getStudentsByCoaching = async (coachingId) => {
  const students = await prisma.user.findMany({
    where: {
      coaching_center_id: Number(coachingId),
      role: ROLES.STUDENT,
      is_active: true
    }
  });

  return students.map((student) => ({
    ...mapUserSummary(student),
    gradeLevel: null,
    batchId: null
  }));
};

const deactivateCoaching = async (coachingId, requesterId) => {
  const coaching = await prisma.coachingCenter.delete({
    where: { id: Number(coachingId) }
  });

  await audit({
    userId: requesterId,
    action: 'DEACTIVATE_COACHING',
    entityType: 'COACHING',
    entityId: Number(coachingId),
    metadata: { coachingId: Number(coachingId) }
  });

  return coaching;
};

const updateStudentProfile = async (userId, coachingId, updateData, requesterId) => {
  const numericUserId = Number(userId);
  const numericCoachingId = Number(coachingId);
  const user = await prisma.user.findUnique({ where: { id: numericUserId } });

  if (!user || user.coaching_center_id !== numericCoachingId || user.role !== ROLES.STUDENT) {
    throw new Error('Student not found in this coaching center');
  }

  const existingName = splitName(user.name);
  const updated = await prisma.user.update({
    where: { id: numericUserId },
    data: {
      name: buildName(
        updateData.firstName || existingName.firstName,
        updateData.lastName || existingName.lastName
      )
    }
  });

  await audit({
    userId: requesterId,
    action: 'UPDATE_STUDENT',
    entityType: 'USER',
    entityId: numericUserId,
    metadata: { coachingId: numericCoachingId }
  });

  return mapUserSummary(updated);
};

const removeStudentFromCoaching = async (userId, coachingId, requesterId) => {
  const numericUserId = Number(userId);
  const numericCoachingId = Number(coachingId);
  const user = await prisma.user.findUnique({ where: { id: numericUserId } });

  if (!user || user.coaching_center_id !== numericCoachingId || user.role !== ROLES.STUDENT) {
    throw new Error('Student not found in this coaching center');
  }

  const cleanupSummary = await prisma.$transaction(async (tx) => {
    const batches = await tx.batch.findMany({
      where: { coaching_center_id: numericCoachingId },
      select: { id: true }
    });
    const batchIds = batches.map((batch) => batch.id);

    const lectures = await tx.lecture.findMany({
      where: { batch_id: { in: batchIds } },
      select: { id: true }
    });
    const lectureIds = lectures.map((lecture) => lecture.id);

    const [batchStudentResult, attendanceResult, testAttemptResult, feeResult] = await Promise.all([
      tx.batchStudent.deleteMany({
        where: {
          student_id: numericUserId,
          batch_id: { in: batchIds }
        }
      }),
      tx.attendance.deleteMany({
        where: {
          student_id: numericUserId,
          lecture_id: { in: lectureIds }
        }
      }),
      tx.testAttempt.deleteMany({
        where: {
          student_id: numericUserId,
          batch_id: { in: batchIds }
        }
      }),
      tx.fee.deleteMany({
        where: {
          student_id: numericUserId,
          batch_id: { in: batchIds }
        }
      })
    ]);

    await tx.user.update({
      where: { id: numericUserId },
      data: { coaching_center_id: null }
    });

    return {
      batchLinksRemoved: batchStudentResult.count,
      attendanceRemoved: attendanceResult.count,
      attemptsRemoved: testAttemptResult.count,
      feesRemoved: feeResult.count
    };
  });

  await audit({
    userId: requesterId,
    action: 'REMOVE_STUDENT',
    entityType: 'USER',
    entityId: numericUserId,
    metadata: {
      coachingId: numericCoachingId,
      targetUserId: numericUserId,
      cleanupSummary
    }
  });

  return { success: true, cleanupSummary };
};

const getCoachingStats = async (coachingId) => {
  const numericCoachingId = Number(coachingId);
  const [studentCount, teacherCount, batchCount] = await Promise.all([
    prisma.user.count({
      where: { coaching_center_id: numericCoachingId, role: ROLES.STUDENT, is_active: true }
    }),
    prisma.user.count({
      where: { coaching_center_id: numericCoachingId, role: ROLES.TEACHER, is_active: true }
    }),
    prisma.batch.count({
      where: { coaching_center_id: numericCoachingId }
    })
  ]);

  return { studentCount, teacherCount, batchCount };
};

const getCoachingAuditLogs = async () => {
  return [];
};

module.exports = {
  createCoaching,
  addTeacherToCoaching,
  addStudentToCoaching,
  updateStudentProfile,
  removeStudentFromCoaching,
  getCoachingStats,
  getCoachingAuditLogs,
  getCoachingById,
  getUserCoachingCenters,
  getTeachersByCoaching,
  getStudentsByCoaching,
  deactivateCoaching
};
