const prisma = require('../config/database');
const { ROLES } = require('../config/constants');
const { audit } = require('../utils/auditLogger');

const ALLOWED_STATUS = new Set(['PRESENT', 'ABSENT']);

const normalizeClassDate = (input) => {
  const date = input ? new Date(input) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid class date');
  }
  date.setHours(0, 0, 0, 0);
  return date;
};

const ensureBatchInCoaching = async (batchId, coachingId) => {
  const batch = await prisma.batch.findFirst({
    where: { id: batchId, coachingId, isActive: true },
  });
  if (!batch) {
    throw new Error('Batch not found in selected coaching center');
  }
  return batch;
};

const ensureTeacherAssignedToBatch = async (userId, role, batchId) => {
  if (role === ROLES.OWNER) {
    return;
  }

  const assignment = await prisma.batchTeacher.findFirst({
    where: { teacherId: userId, batchId },
  });

  if (!assignment) {
    throw new Error('You are not assigned to this batch');
  }
};

const getMyTeacherBatches = async (userId, coachingId, role) => {
  if (role === ROLES.OWNER) {
    return prisma.batch.findMany({
      where: { coachingId, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, coachingId: true },
    });
  }

  const assignments = await prisma.batchTeacher.findMany({
    where: {
      teacherId: userId,
      batch: { coachingId, isActive: true },
    },
    orderBy: { batch: { name: 'asc' } },
    select: {
      batch: {
        select: { id: true, name: true, coachingId: true },
      },
    },
  });

  return assignments.map((item) => item.batch);
};

const markBatchAttendance = async (
  { batchId, classDate, records },
  { userId, role, coachingId }
) => {
  await ensureBatchInCoaching(batchId, coachingId);
  await ensureTeacherAssignedToBatch(userId, role, batchId);

  const classDateValue = normalizeClassDate(classDate);

  const students = await prisma.studentProfile.findMany({
    where: { batchId, coachingId },
    select: { id: true },
  });

  if (students.length === 0) {
    throw new Error('No students found in this batch');
  }

  const validStudentIds = new Set(students.map((student) => student.id));
  const payloadRecords = Array.isArray(records) ? records : [];

  if (payloadRecords.length === 0) {
    throw new Error('Attendance records are required');
  }

  for (const record of payloadRecords) {
    if (!validStudentIds.has(record.studentId)) {
      throw new Error('Invalid student in attendance records');
    }
    if (!ALLOWED_STATUS.has(record.status)) {
      throw new Error('Invalid attendance status');
    }
  }

  await prisma.$transaction(
    payloadRecords.map((record) =>
      prisma.attendance.upsert({
        where: {
          studentId_batchId_classDate: {
            studentId: record.studentId,
            batchId,
            classDate: classDateValue,
          },
        },
        create: {
          coachingId,
          batchId,
          studentId: record.studentId,
          classDate: classDateValue,
          status: record.status,
          remarks: record.remarks ?? null,
          markedBy: userId,
        },
        update: {
          status: record.status,
          remarks: record.remarks ?? null,
          markedBy: userId,
        },
      })
    )
  );

  await audit({
    userId,
    action: 'ATTENDANCE_MARK_BATCH',
    entityType: 'ATTENDANCE',
    entityId: batchId,
    metadata: { batchId, classDate: classDateValue.toISOString(), count: payloadRecords.length },
  });

  return { message: 'Attendance marked successfully', count: payloadRecords.length };
};

const getBatchAttendanceByDate = async (
  batchId,
  classDate,
  { userId, role, coachingId }
) => {
  const batch = await ensureBatchInCoaching(batchId, coachingId);
  await ensureTeacherAssignedToBatch(userId, role, batchId);

  const classDateValue = normalizeClassDate(classDate);

  const [students, attendanceRows] = await Promise.all([
    prisma.studentProfile.findMany({
      where: { batchId, coachingId },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { user: { firstName: 'asc' } },
    }),
    prisma.attendance.findMany({
      where: { batchId, classDate: classDateValue },
      select: { id: true, studentId: true, status: true, remarks: true },
    }),
  ]);

  const attendanceMap = new Map(attendanceRows.map((row) => [row.studentId, row]));

  const records = students.map((student) => {
    const row = attendanceMap.get(student.id);
    return {
      attendanceId: row?.id ?? null,
      studentId: student.id,
      userId: student.userId,
      firstName: student.user.firstName,
      lastName: student.user.lastName,
      email: student.user.email,
      status: row?.status ?? 'ABSENT',
      remarks: row?.remarks ?? null,
    };
  });

  return {
    batch: { id: batch.id, name: batch.name },
    classDate: classDateValue.toISOString(),
    records,
  };
};

const updateAttendance = async (
  attendanceId,
  { status, remarks },
  { userId, role, coachingId }
) => {
  if (!ALLOWED_STATUS.has(status)) {
    throw new Error('Invalid attendance status');
  }

  const existing = await prisma.attendance.findUnique({
    where: { id: attendanceId },
  });

  if (!existing || existing.coachingId !== coachingId) {
    throw new Error('Attendance record not found');
  }

  await ensureTeacherAssignedToBatch(userId, role, existing.batchId);

  const today = normalizeClassDate(new Date());
  const recordDate = normalizeClassDate(existing.classDate);
  if (recordDate.getTime() !== today.getTime()) {
    throw new Error('Only same-day attendance can be edited');
  }

  const updated = await prisma.attendance.update({
    where: { id: attendanceId },
    data: {
      status,
      remarks: remarks ?? null,
      markedBy: userId,
    },
  });

  await audit({
    userId,
    action: 'ATTENDANCE_UPDATE',
    entityType: 'ATTENDANCE',
    entityId: attendanceId,
    metadata: { status },
  });

  return updated;
};

const getMyAttendance = async ({ userId, coachingId }) => {
  const profile = await prisma.studentProfile.findFirst({
    where: { userId, coachingId },
    select: { id: true },
  });

  if (!profile) {
    throw new Error('Student profile not found');
  }

  const rows = await prisma.attendance.findMany({
    where: { studentId: profile.id, coachingId },
    orderBy: [{ classDate: 'desc' }, { createdAt: 'desc' }],
    include: { batch: { select: { id: true, name: true } } },
  });

  const total = rows.length;
  const present = rows.filter((row) => row.status === 'PRESENT').length;
  const absent = rows.filter((row) => row.status === 'ABSENT').length;
  const percentage = total > 0 ? Number(((present / total) * 100).toFixed(2)) : 0;

  return {
    summary: {
      totalClasses: total,
      present,
      absent,
      percentage,
    },
    records: rows,
  };
};

const getCoachingAttendanceSummary = async (coachingId) => {
  const [total, present, absent, byBatch] = await Promise.all([
    prisma.attendance.count({ where: { coachingId } }),
    prisma.attendance.count({ where: { coachingId, status: 'PRESENT' } }),
    prisma.attendance.count({ where: { coachingId, status: 'ABSENT' } }),
    prisma.attendance.groupBy({
      by: ['batchId', 'status'],
      where: { coachingId },
      _count: { _all: true },
    }),
  ]);

  const percentage = total > 0 ? Number(((present / total) * 100).toFixed(2)) : 0;

  const batchTotals = new Map();
  for (const item of byBatch) {
    const existing = batchTotals.get(item.batchId) || {
      batchId: item.batchId,
      present: 0,
      absent: 0,
      total: 0,
    };

    if (item.status === 'PRESENT') {
      existing.present += item._count._all;
    } else {
      existing.absent += item._count._all;
    }

    existing.total += item._count._all;
    batchTotals.set(item.batchId, existing);
  }

  const batchIds = Array.from(batchTotals.keys());
  const batches = batchIds.length
    ? await prisma.batch.findMany({
        where: { id: { in: batchIds } },
        select: { id: true, name: true },
      })
    : [];

  const batchNameMap = new Map(batches.map((batch) => [batch.id, batch.name]));

  const byBatchSummary = Array.from(batchTotals.values()).map((item) => ({
    batchId: item.batchId,
    batchName: batchNameMap.get(item.batchId) || 'Unknown Batch',
    present: item.present,
    absent: item.absent,
    total: item.total,
    percentage: item.total > 0 ? Number(((item.present / item.total) * 100).toFixed(2)) : 0,
  }));

  return {
    totalClassesMarked: total,
    present,
    absent,
    percentage,
    byBatch: byBatchSummary,
  };
};

module.exports = {
  getMyTeacherBatches,
  markBatchAttendance,
  getBatchAttendanceByDate,
  updateAttendance,
  getMyAttendance,
  getCoachingAttendanceSummary,
};
