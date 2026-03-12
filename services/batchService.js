const prisma = require('../config/database');
const { audit } = require('../utils/auditLogger');

const createBatch = async (batchData, requesterId) => {
  const { name, coachingId } = batchData;
  const batch = await prisma.batch.create({
    data: { name, coaching_center_id: Number(coachingId), created_by: requesterId }
  });
  await audit({ userId: requesterId, action: 'CREATE_BATCH', entityType: 'BATCH', entityId: batch.id });
  return batch;
};

const getBatchById = async (batchId) => {
  const batch = await prisma.batch.findFirst({
    where: { id: Number(batchId) },
    include: { coaching_center: { select: { id: true, name: true } } }
  });
  if (!batch) throw new Error('Batch not found');
  return batch;
};

const getBatchesByCoaching = async (coachingId) => {
  return prisma.batch.findMany({
    where: { coaching_center_id: Number(coachingId) },
    include: { coaching_center: { select: { id: true, name: true } } }
  });
};

const assignTeacherToBatch = async (teacherId, batchId, requesterId) => {
  const user = await prisma.user.findUnique({ where: { id: Number(teacherId) } });
  if (!user || !user.is_active) throw new Error('User not found');

  const batch = await prisma.batch.findFirst({ where: { id: Number(batchId) } });
  if (!batch) throw new Error('Batch not found');

  if (user.coaching_center_id !== batch.coaching_center_id) {
    throw new Error('User is not in this coaching center');
  }
  if (!['TEACHER', 'OWNER'].includes(user.role)) {
    throw new Error('User is not a teacher or owner');
  }

  const existing = await prisma.batchSubject.findFirst({
    where: { teacher_id: Number(teacherId), batch_id: Number(batchId), subject_id: null }
  });
  if (existing) throw new Error('Teacher is already assigned to this batch');

  const assignment = await prisma.batchSubject.create({
    data: { teacher_id: Number(teacherId), batch_id: Number(batchId) }
  });
  await audit({ userId: requesterId, action: 'ASSIGN_TEACHER_BATCH', entityType: 'BATCH_SUBJECT', entityId: assignment.id, metadata: { teacherId, batchId } });
  return assignment;
};

const removeTeacherFromBatch = async (teacherId, batchId, requesterId) => {
  const result = await prisma.batchSubject.deleteMany({
    where: { teacher_id: Number(teacherId), batch_id: Number(batchId) }
  });
  if (result.count === 0) throw new Error('Teacher is not assigned to this batch');

  await audit({ userId: requesterId, action: 'REMOVE_TEACHER_BATCH', entityType: 'BATCH', entityId: Number(batchId), metadata: { teacherId } });
  return { message: 'Teacher successfully removed from batch' };
};

const assignStudentToBatch = async (studentId, batchId, requesterId) => {
  const student = await prisma.user.findUnique({ where: { id: Number(studentId) } });
  if (!student) throw new Error('Student not found');

  const batch = await prisma.batch.findFirst({ where: { id: Number(batchId) } });
  if (!batch) throw new Error('Batch not found');

  const existing = await prisma.batchStudent.findFirst({
    where: { student_id: Number(studentId), batch_id: Number(batchId) }
  });
  if (existing) throw new Error('Student is already assigned to this batch');

  const assignment = await prisma.batchStudent.create({
    data: { student_id: Number(studentId), batch_id: Number(batchId) }
  });
  await audit({ userId: requesterId, action: 'ASSIGN_STUDENT_BATCH', entityType: 'BATCH_STUDENT', entityId: assignment.id, metadata: { studentId, batchId } });
  return assignment;
};

const removeStudentFromBatch = async (studentId, requesterId) => {
  await prisma.batchStudent.deleteMany({ where: { student_id: Number(studentId) } });
  await audit({ userId: requesterId, action: 'REMOVE_STUDENT_BATCH', entityType: 'BATCH_STUDENT', entityId: Number(studentId) });
  return { message: 'Student removed from batch' };
};

const getTeachersByBatch = async (batchId) => {
  const batchSubjects = await prisma.batchSubject.findMany({
    where: { batch_id: Number(batchId), teacher_id: { not: null } },
    include: { teacher: { select: { id: true, email: true, name: true } } }
  });
  // Deduplicate by teacher_id
  const seen = new Set();
  return batchSubjects
    .map(bs => bs.teacher)
    .filter(t => t && !seen.has(t.id) && seen.add(t.id));
};

const getStudentsByBatch = async (batchId) => {
  const batchStudents = await prisma.batchStudent.findMany({
    where: { batch_id: Number(batchId) },
    include: { student: { select: { id: true, email: true, name: true } } }
  });
  return batchStudents.map(bs => ({ batchStudentId: bs.id, ...bs.student }));
};

const deactivateBatch = async (batchId, requesterId) => {
  const batch = await prisma.batch.delete({ where: { id: Number(batchId) } });
  await audit({ userId: requesterId, action: 'DEACTIVATE_BATCH', entityType: 'BATCH', entityId: Number(batchId) });
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