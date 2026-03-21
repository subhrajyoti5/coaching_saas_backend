const prisma = require('../config/database');
const { audit } = require('../utils/auditLogger');

const createBatch = async (batchData, requesterId) => {
  const { name, coachingId, teacherIds = [], price } = batchData;
  const numericCoachingId = Number(coachingId);
  const numericPrice = Number(price);
  const uniqueTeacherIds = [...new Set((Array.isArray(teacherIds) ? teacherIds : []).map((id) => Number(id)).filter(Boolean))];

  if (!Number.isInteger(numericPrice) || numericPrice < 0) {
    throw new Error('Batch price must be a non-negative integer');
  }

  if (uniqueTeacherIds.length > 0) {
    const teachers = await prisma.user.findMany({
      where: {
        id: { in: uniqueTeacherIds },
        coaching_center_id: numericCoachingId,
        role: { in: ['TEACHER', 'OWNER'] },
        is_active: true
      },
      select: { id: true }
    });

    if (teachers.length !== uniqueTeacherIds.length) {
      throw new Error('One or more selected teachers are invalid for this coaching center');
    }
  }

  const [batch] = await prisma.$transaction(async (tx) => {
    const createdBatch = await tx.batch.create({
      data: { name, coaching_center_id: numericCoachingId, created_by: requesterId, price: numericPrice }
    });

    if (uniqueTeacherIds.length > 0) {
      await tx.batchSubject.createMany({
        data: uniqueTeacherIds.map((teacherId) => ({
          teacher_id: teacherId,
          batch_id: createdBatch.id
        }))
      });
    }

    return [createdBatch];
  });

  await audit({
    userId: requesterId,
    action: 'CREATE_BATCH',
    entityType: 'BATCH',
    entityId: batch.id,
    metadata: { coachingId: numericCoachingId, teacherIds: uniqueTeacherIds, price: numericPrice }
  });
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

const updateBatch = async (batchId, updateData, requesterId) => {
  const existing = await prisma.batch.findFirst({ where: { id: Number(batchId) } });
  if (!existing) throw new Error('Batch not found');

  const safeData = {};
  if (Object.prototype.hasOwnProperty.call(updateData, 'name')) {
    const trimmedName = String(updateData.name || '').trim();
    if (!trimmedName) {
      throw new Error('Batch name is required');
    }
    safeData.name = trimmedName;
  }

  if (Object.prototype.hasOwnProperty.call(updateData, 'price')) {
    const numericPrice = Number(updateData.price);
    if (!Number.isInteger(numericPrice) || numericPrice < 0) {
      throw new Error('Batch price must be a non-negative integer');
    }
    safeData.price = numericPrice;
  }

  if (Object.keys(safeData).length === 0) {
    throw new Error('Nothing to update');
  }

  const batch = await prisma.batch.update({
    where: { id: Number(batchId) },
    data: safeData
  });

  await audit({
    userId: requesterId,
    action: 'UPDATE_BATCH',
    entityType: 'BATCH',
    entityId: Number(batchId),
    metadata: { name: batch.name, price: batch.price }
  });

  return batch;
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
  if (student.role !== 'STUDENT') throw new Error('User is not a student');

  const batch = await prisma.batch.findFirst({ where: { id: Number(batchId) } });
  if (!batch) throw new Error('Batch not found');
  if (student.coaching_center_id !== batch.coaching_center_id) {
    throw new Error('Student is not in this coaching center');
  }

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

const getMyStudentBatches = async (studentId, coachingId) => {
  const memberships = await prisma.batchStudent.findMany({
    where: {
      student_id: Number(studentId),
      batch: { coaching_center_id: Number(coachingId) }
    },
    include: {
      batch: { select: { id: true, name: true, coaching_center_id: true } }
    }
  });

  if (memberships.length === 0) return [];

  const batchIds = memberships.map((membership) => membership.batch_id);

  const teacherLinks = await prisma.batchSubject.findMany({
    where: {
      batch_id: { in: batchIds },
      teacher_id: { not: null }
    },
    include: {
      teacher: {
        select: { id: true, name: true, email: true }
      }
    }
  });

  const teachersByBatch = new Map();
  for (const link of teacherLinks) {
    const teacher = link.teacher;
    if (!teacher) continue;

    if (!teachersByBatch.has(link.batch_id)) {
      teachersByBatch.set(link.batch_id, new Map());
    }
    teachersByBatch.get(link.batch_id).set(teacher.id, teacher);
  }

  return memberships
    .map((membership) => {
      const teacherMap = teachersByBatch.get(membership.batch_id) || new Map();
      return {
        ...membership.batch,
        teachers: [...teacherMap.values()]
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

const removeStudentFromBatch = async (studentId, batchId, requesterId) => {
  const result = await prisma.batchStudent.deleteMany({
    where: {
      student_id: Number(studentId),
      batch_id: Number(batchId)
    }
  });
  if (result.count === 0) throw new Error('Student is not assigned to this batch');

  await audit({ userId: requesterId, action: 'REMOVE_STUDENT_BATCH', entityType: 'BATCH_STUDENT', entityId: Number(studentId), metadata: { batchId } });
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
  updateBatch,
  getMyStudentBatches,
  assignTeacherToBatch,
  removeTeacherFromBatch,
  assignStudentToBatch,
  removeStudentFromBatch,
  getTeachersByBatch,
  getStudentsByBatch,
  deactivateBatch
};