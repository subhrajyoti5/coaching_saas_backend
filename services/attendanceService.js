const prisma = require('../config/database');
const { ROLES } = require('../config/constants');
const { audit } = require('../utils/auditLogger');

const ALLOWED_STATUS = new Set(['PRESENT', 'ABSENT']);

const normalizeClassDate = (input) => {
  const date = input ? new Date(input) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error('Invalid class date');
  date.setHours(0, 0, 0, 0);
  return date;
};

const ensureBatchInCoaching = async (batchId, coachingId) => {
  const batch = await prisma.batch.findFirst({
    where: { id: Number(batchId), coaching_center_id: Number(coachingId) },
  });
  if (!batch) throw new Error('Batch not found in selected coaching center');
  return batch;
};

const ensureTeacherAssignedToBatch = async (userId, role, batchId) => {
  if (role === ROLES.OWNER) return;
  const assignment = await prisma.batchSubject.findFirst({
    where: { teacher_id: Number(userId), batch_id: Number(batchId) },
  });
  if (!assignment) throw new Error('You are not assigned to this batch');
};

// Find or create a lecture record that serves as the attendance session for a batch+date
const findOrCreateLectureForDate = async (batchId, lectureDate, teacherId) => {
  const existing = await prisma.lecture.findFirst({
    where: { batch_id: Number(batchId), lecture_date: lectureDate },
    orderBy: { id: 'asc' },
  });
  if (existing) return existing;
  return prisma.lecture.create({
    data: {
      batch_id: Number(batchId),
      lecture_date: lectureDate,
      teacher_id: teacherId ?? null,
    },
  });
};

const getMyTeacherBatches = async (userId, coachingId, role) => {
  if (role === ROLES.OWNER) {
    return prisma.batch.findMany({
      where: { coaching_center_id: Number(coachingId) },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, coaching_center_id: true },
    });
  }

  const assignments = await prisma.batchSubject.findMany({
    where: {
      teacher_id: Number(userId),
      batch: { coaching_center_id: Number(coachingId) },
    },
    orderBy: { batch: { name: 'asc' } },
    select: { batch: { select: { id: true, name: true, coaching_center_id: true } } },
  });

  // Deduplicate — teacher may teach multiple subjects in the same batch
  const seen = new Set();
  return assignments.reduce((acc, item) => {
    if (!seen.has(item.batch.id)) {
      seen.add(item.batch.id);
      acc.push(item.batch);
    }
    return acc;
  }, []);
};

const markBatchAttendance = async (
  { batchId, classDate, records },
  { userId, role, coachingId }
) => {
  await ensureBatchInCoaching(batchId, coachingId);
  await ensureTeacherAssignedToBatch(userId, role, batchId);

  const lectureDate = normalizeClassDate(classDate);
  const payloadRecords = Array.isArray(records) ? records : [];

  if (payloadRecords.length === 0) throw new Error('Attendance records are required');

  const batchStudents = await prisma.batchStudent.findMany({
    where: { batch_id: Number(batchId) },
    select: { student_id: true },
  });

  if (batchStudents.length === 0) throw new Error('No students found in this batch');

  const validStudentIds = new Set(batchStudents.map((s) => s.student_id));

  for (const record of payloadRecords) {
    if (!validStudentIds.has(Number(record.studentId))) {
      throw new Error('Invalid student in attendance records');
    }
    if (!ALLOWED_STATUS.has(record.status)) {
      throw new Error('Invalid attendance status');
    }
  }

  const lecture = await findOrCreateLectureForDate(batchId, lectureDate, userId);

  await prisma.$transaction([
    prisma.attendance.deleteMany({ where: { lecture_id: lecture.id } }),
    prisma.attendance.createMany({
      data: payloadRecords.map((record) => ({
        lecture_id: lecture.id,
        student_id: Number(record.studentId),
        status: record.status,
      })),
    }),
  ]);

  await audit({
    userId,
    action: 'ATTENDANCE_MARK_BATCH',
    entityType: 'ATTENDANCE',
    entityId: batchId,
    metadata: { batchId, classDate: lectureDate.toISOString(), count: payloadRecords.length },
  });

  return { message: 'Attendance marked successfully', count: payloadRecords.length };
};

const getBatchAttendanceByDate = async (batchId, classDate, { userId, role, coachingId }) => {
  const batch = await ensureBatchInCoaching(batchId, coachingId);
  await ensureTeacherAssignedToBatch(userId, role, batchId);

  const lectureDate = normalizeClassDate(classDate);

  const [batchStudents, lecture] = await Promise.all([
    prisma.batchStudent.findMany({
      where: { batch_id: Number(batchId) },
      include: { student: { select: { id: true, name: true, email: true } } },
      orderBy: { student: { name: 'asc' } },
    }),
    prisma.lecture.findFirst({
      where: { batch_id: Number(batchId), lecture_date: lectureDate },
      orderBy: { id: 'asc' },
    }),
  ]);

  let attendanceMap = new Map();
  if (lecture) {
    const rows = await prisma.attendance.findMany({
      where: { lecture_id: lecture.id },
      select: { id: true, student_id: true, status: true },
    });
    attendanceMap = new Map(rows.map((row) => [row.student_id, row]));
  }

  const records = batchStudents.map((bs) => {
    const row = attendanceMap.get(bs.student_id);
    const nameParts = (bs.student?.name || '').trim().split(/\s+/);
    return {
      attendanceId: row?.id ?? null,
      studentId: bs.student_id,
      userId: bs.student_id,
      firstName: nameParts[0] ?? '',
      lastName: nameParts.slice(1).join(' ') ?? '',
      email: bs.student?.email ?? '',
      status: row?.status ?? 'ABSENT',
    };
  });

  return {
    batch: { id: batch.id, name: batch.name },
    classDate: lectureDate.toISOString(),
    records,
  };
};

const updateAttendance = async (attendanceId, { status }, { userId, role, coachingId }) => {
  if (!ALLOWED_STATUS.has(status)) throw new Error('Invalid attendance status');

  const existing = await prisma.attendance.findUnique({
    where: { id: Number(attendanceId) },
    include: { lecture: { include: { batch: true } } },
  });

  if (!existing || existing.lecture?.batch?.coaching_center_id !== Number(coachingId)) {
    throw new Error('Attendance record not found');
  }

  await ensureTeacherAssignedToBatch(userId, role, existing.lecture.batch_id);

  const updated = await prisma.attendance.update({
    where: { id: Number(attendanceId) },
    data: { status },
  });

  await audit({
    userId,
    action: 'ATTENDANCE_UPDATE',
    entityType: 'ATTENDANCE',
    entityId: Number(attendanceId),
    metadata: { status },
  });

  return updated;
};

const getMyAttendance = async ({ userId, coachingId }) => {
  const rows = await prisma.attendance.findMany({
    where: {
      student_id: Number(userId),
      lecture: { batch: { coaching_center_id: Number(coachingId) } },
    },
    orderBy: { marked_at: 'desc' },
    include: {
      lecture: {
        select: {
          id: true,
          lecture_date: true,
          topic: true,
          batch: { select: { id: true, name: true } },
        },
      },
    },
  });

  const total = rows.length;
  const present = rows.filter((r) => r.status === 'PRESENT').length;
  const absent = total - present;
  const percentage = total > 0 ? Number(((present / total) * 100).toFixed(2)) : 0;

  return {
    summary: { totalClasses: total, present, absent, percentage },
    records: rows.map((r) => ({
      id: r.id,
      status: r.status,
      markedAt: r.marked_at,
      lectureDate: r.lecture?.lecture_date,
      topic: r.lecture?.topic,
      batch: r.lecture?.batch,
    })),
  };
};

const getCoachingAttendanceSummary = async (coachingId) => {
  const coachingFilter = {
    lecture: { batch: { coaching_center_id: Number(coachingId) } },
  };

  const [total, present] = await Promise.all([
    prisma.attendance.count({ where: coachingFilter }),
    prisma.attendance.count({ where: { ...coachingFilter, status: 'PRESENT' } }),
  ]);
  const absent = total - present;
  const percentage = total > 0 ? Number(((present / total) * 100).toFixed(2)) : 0;

  const batches = await prisma.batch.findMany({
    where: { coaching_center_id: Number(coachingId) },
    select: { id: true, name: true },
  });

  const byBatchSummary = await Promise.all(
    batches.map(async (batch) => {
      const batchFilter = { lecture: { batch_id: batch.id } };
      const [bTotal, bPresent] = await Promise.all([
        prisma.attendance.count({ where: batchFilter }),
        prisma.attendance.count({ where: { ...batchFilter, status: 'PRESENT' } }),
      ]);
      return {
        batchId: batch.id,
        batchName: batch.name,
        total: bTotal,
        present: bPresent,
        absent: bTotal - bPresent,
        percentage: bTotal > 0 ? Number(((bPresent / bTotal) * 100).toFixed(2)) : 0,
      };
    })
  );

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
