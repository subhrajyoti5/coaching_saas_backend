const prisma = require('../config/database');
const { ROLES } = require('../config/constants');
const { audit } = require('../utils/auditLogger');

const createBatch = async (batchData, requesterId) => {
  const { name, coachingId, description } = batchData;
  const batch = await prisma.batch.create({
    data: { name, coachingId, description }
  });
  await audit({ userId: requesterId, action: 'CREATE_BATCH', entityType: 'BATCH', entityId: batch.id });
  return batch;
};

const getBatchById = async (batchId) => {
  const batch = await prisma.batch.findFirst({
    where: { id: batchId, isActive: true },
    include: { coaching: { select: { id: true, name: true } } }
  });
  if (!batch) throw new Error('Batch not found');
  return batch;
};

const getBatchesByCoaching = async (coachingId) => {
  return prisma.batch.findMany({
    where: { coachingId, isActive: true },
    include: { coaching: { select: { id: true, name: true } } }
  });
};

const assignTeacherToBatch = async (teacherId, batchId, requesterId) => {
  const user = await prisma.user.findUnique({ where: { id: teacherId } });
  if (!user || !user.isActive) throw new Error('User not found');

  const batch = await prisma.batch.findFirst({ where: { id: batchId, isActive: true } });
  if (!batch) throw new Error('Batch not found');

  // Ensure user is associated with this coaching as a teacher or owner
  const membership = await prisma.coachingUser.findFirst({
    where: { userId: teacherId, coachingId: batch.coachingId, role: { in: ['TEACHER', 'OWNER'] } }
  });
  if (!membership) throw new Error('User is not a teacher or owner in this coaching center');

  const existing = await prisma.batchTeacher.findFirst({ where: { teacherId, batchId } });
  if (existing) throw new Error('Teacher is already assigned to this batch');

  const assignment = await prisma.batchTeacher.create({
    data: { teacherId, batchId, assignedBy: requesterId }
  });
  await audit({ userId: requesterId, action: 'ASSIGN_TEACHER_BATCH', entityType: 'BATCH_TEACHER', entityId: assignment.id, metadata: { teacherId, batchId } });
  return assignment;
};

const removeTeacherFromBatch = async (teacherId, batchId, requesterId) => {
  const result = await prisma.batchTeacher.deleteMany({ where: { teacherId, batchId } });
  if (result.count === 0) throw new Error('Teacher is not assigned to this batch');

  await audit({ userId: requesterId, action: 'REMOVE_TEACHER_BATCH', entityType: 'BATCH', entityId: batchId, metadata: { teacherId } });
  return { message: 'Teacher successfully removed from batch' };
};

const assignStudentToBatch = async (studentId, batchId, requesterId) => {
  // First, check if this is a StudentProfile ID or a User ID
  let studentProfile = await prisma.studentProfile.findUnique({ where: { id: studentId } });
  
  // If not found as StudentProfile, try to find it by userId in CoachingUser
  if (!studentProfile) {
    // studentId might actually be a userId for a student without StudentProfile
    const coachingUser = await prisma.coachingUser.findFirst({
      where: { userId: studentId, role: ROLES.STUDENT }
    });
    
    if (!coachingUser) {
      throw new Error('Student not found');
    }
    
    // Auto-create StudentProfile for this student
    const batch = await prisma.batch.findFirst({ where: { id: batchId, isActive: true } });
    if (!batch) throw new Error('Batch not found');
    
    studentProfile = await prisma.studentProfile.create({
      data: {
        userId: studentId,
        coachingId: batch.coachingId,
        batchId: batchId
      }
    });
    
    await audit({ userId: requesterId, action: 'CREATE_STUDENT_PROFILE', entityType: 'STUDENT_PROFILE', entityId: studentProfile.id, metadata: { coachingId: batch.coachingId } });
    await audit({ userId: requesterId, action: 'ASSIGN_STUDENT_BATCH', entityType: 'STUDENT_PROFILE', entityId: studentProfile.id, metadata: { batchId } });
    return studentProfile;
  }

  const batch = await prisma.batch.findFirst({ where: { id: batchId, isActive: true } });
  if (!batch) throw new Error('Batch not found');

  if (studentProfile.coachingId !== batch.coachingId) {
    throw new Error('Student and batch must belong to the same coaching center');
  }

  const updated = await prisma.studentProfile.update({
    where: { id: studentId },
    data: { batchId }
  });
  await audit({ userId: requesterId, action: 'ASSIGN_STUDENT_BATCH', entityType: 'STUDENT_PROFILE', entityId: studentId, metadata: { batchId } });
  return updated;
};

const removeStudentFromBatch = async (studentId, requesterId) => {
  const updated = await prisma.studentProfile.update({
    where: { id: studentId },
    data: { batchId: null }
  });
  await audit({ userId: requesterId, action: 'REMOVE_STUDENT_BATCH', entityType: 'STUDENT_PROFILE', entityId: studentId });
  return updated;
};

const getTeachersByBatch = async (batchId) => {
  const batchTeachers = await prisma.batchTeacher.findMany({
    where: { batchId },
    include: { teacher: { select: { id: true, email: true, firstName: true, lastName: true, phone: true } } }
  });
  return batchTeachers.map(bt => bt.teacher);
};

const getStudentsByBatch = async (batchId) => {
  const students = await prisma.studentProfile.findMany({
    where: { batchId },
    include: { user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true } } }
  });
  return students.map(s => ({
    profileId: s.id, ...s.user, parentName: s.parentName, parentPhone: s.parentPhone, gradeLevel: s.gradeLevel
  }));
};

const deactivateBatch = async (batchId, requesterId) => {
  const batch = await prisma.batch.update({
    where: { id: batchId },
    data: { isActive: false, deletedAt: new Date() }
  });
  await audit({ userId: requesterId, action: 'DEACTIVATE_BATCH', entityType: 'BATCH', entityId: batchId });
  return batch;
};

module.exports = {
  createBatch,
  getBatchById,
  getBatchesByCoaching,
  assignTeacherToBatch,
  removeTeacherFromBatch,
  assignStudentToBatch,
  removeStudentFromBatch,
  getTeachersByBatch,
  getStudentsByBatch,
  deactivateBatch
};