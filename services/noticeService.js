const prisma = require('../config/database');
const { ROLES } = require('../config/constants');
const { audit } = require('../utils/auditLogger');
const notificationService = require('./notificationService');

// Shared include shape for all notice queries
const noticeInclude = {
  coaching_center: { select: { id: true, name: true } },
  targets: { include: { batch: { select: { id: true, name: true } } } },
  creator: { select: { id: true, name: true, email: true } },
};

const resolveNoticeRecipientIds = async ({ coachingId, batchId, requesterId }) => {
  const recipients = new Set();

  if (batchId) {
    const [batchStudents, batchTeachers] = await Promise.all([
      prisma.batchStudent.findMany({
        where: { batch_id: Number(batchId) },
        select: { student_id: true }
      }),
      prisma.batchSubject.findMany({
        where: { batch_id: Number(batchId) },
        select: { teacher_id: true }
      })
    ]);

    batchStudents.forEach((row) => {
      if (row.student_id) recipients.add(row.student_id);
    });
    batchTeachers.forEach((row) => {
      if (row.teacher_id) recipients.add(row.teacher_id);
    });
  } else {
    const users = await prisma.user.findMany({
      where: {
        coaching_center_id: Number(coachingId),
        is_active: true
      },
      select: { id: true }
    });

    users.forEach((user) => recipients.add(user.id));
  }

  return [...recipients];
};

// Map DB row → shape expected by Flutter clients
function mapNoticeForClient(notice) {
  const target = notice.targets?.[0]?.batch ?? null;
  return {
    id: notice.id,
    title: notice.title,
    content: notice.content,
    createdAt: notice.created_at,
    creator: notice.creator
      ? { id: notice.creator.id, firstName: notice.creator.name ?? '', lastName: '', email: notice.creator.email }
      : null,
    batch: target ? { id: target.id, name: target.name } : null,
    coaching: notice.coaching_center ?? null,
  };
}

const createNotice = async (noticeData, requesterId, requesterRole, requesterCoachingId) => {
  const { coachingId, batchId, title, content } = noticeData;

  if (!requesterCoachingId || Number(requesterCoachingId) !== Number(coachingId)) {
    throw new Error('You can only create notices in your selected coaching center');
  }

  if (batchId) {
    const batch = await prisma.batch.findFirst({
      where: { id: Number(batchId), coaching_center_id: Number(coachingId) },
    });
    if (!batch) throw new Error('Selected batch is invalid for this coaching center');
  }

  if (requesterRole === ROLES.TEACHER) {
    if (!batchId) throw new Error('Teachers must specify a batch when posting a notice');
    const assigned = await prisma.batchSubject.findFirst({
      where: { teacher_id: requesterId, batch_id: Number(batchId) },
    });
    if (!assigned) throw new Error('You are not assigned to this batch');
  }

  const notice = await prisma.notice.create({
    data: {
      coaching_center_id: Number(coachingId),
      title,
      content,
      created_by: requesterId,
      ...(batchId && { targets: { create: { batch_id: Number(batchId) } } }),
    },
    include: noticeInclude,
  });

  await audit({ userId: requesterId, action: 'CREATE_NOTICE', entityType: 'NOTICE', entityId: notice.id });

  try {
    const recipientUserIds = await resolveNoticeRecipientIds({
      coachingId,
      batchId,
      requesterId
    });

    const pushResult = await notificationService.sendNoticeNotification({
      recipientUserIds,
      notice: mapNoticeForClient(notice)
    });

    if (!pushResult?.sent) {
      console.warn(
        '[Notice Push] Not sent',
        {
          noticeId: notice.id,
          recipientCount: recipientUserIds.length,
          reason: pushResult?.reason || 'unknown'
        }
      );
    } else {
      console.log(
        '[Notice Push] Sent',
        {
          noticeId: notice.id,
          recipientCount: recipientUserIds.length,
          successCount: pushResult.successCount,
          failureCount: pushResult.failureCount
        }
      );
    }
  } catch (error) {
    console.error('Notice push notification failed:', error.message);
  }

  return mapNoticeForClient(notice);
};

const getNoticeById = async (noticeId, requester) => {
  const notice = await prisma.notice.findUnique({
    where: { id: Number(noticeId) },
    include: noticeInclude,
  });
  if (!notice) throw new Error('Notice not found');

  if (!requester?.coachingId || Number(notice.coaching_center_id) !== Number(requester.coachingId)) {
    throw new Error('You are not authorised to view this notice');
  }

  if (requester.role === ROLES.STUDENT) {
    const studentBatch = await prisma.batchStudent.findFirst({
      where: { student_id: requester.userId },
    });
    if (!studentBatch) throw new Error('Student not enrolled in any batch');
    const targetBatchIds = notice.targets.map(t => t.batch_id);
    if (targetBatchIds.length > 0 && !targetBatchIds.includes(studentBatch.batch_id)) {
      throw new Error('You are not authorised to view this notice');
    }
  }

  if (requester.role === ROLES.TEACHER) {
    const assignments = await prisma.batchSubject.findMany({
      where: { teacher_id: requester.userId },
      select: { batch_id: true },
    });
    const assignedBatchIds = new Set(assignments.map(a => a.batch_id));
    const targetBatchIds = notice.targets.map(t => t.batch_id);
    if (targetBatchIds.length > 0 && !targetBatchIds.some(id => assignedBatchIds.has(id))) {
      throw new Error('You are not authorised to view this notice');
    }
  }

  return mapNoticeForClient(notice);
};

const getNoticesByCoaching = async (coachingId, batchId = null) => {
  const whereClause = { coaching_center_id: Number(coachingId) };
  if (batchId) whereClause.targets = { some: { batch_id: Number(batchId) } };

  const notices = await prisma.notice.findMany({
    where: whereClause,
    orderBy: { created_at: 'desc' },
    include: noticeInclude,
  });
  return notices.map(mapNoticeForClient);
};

// Notices for a student — broadcast + notices targeting their batch
const getMyNotices = async (userId, coachingId) => {
  const studentBatch = await prisma.batchStudent.findFirst({
    where: { student_id: userId, batch: { coaching_center_id: Number(coachingId) } },
  });
  if (!studentBatch) return [];

  const notices = await prisma.notice.findMany({
    where: {
      coaching_center_id: Number(coachingId),
      OR: [
        { targets: { none: {} } },
        { targets: { some: { batch_id: studentBatch.batch_id } } },
      ],
    },
    orderBy: { created_at: 'desc' },
    include: noticeInclude,
  });
  return notices.map(mapNoticeForClient);
};

// Notices relevant to a teacher — broadcast + notices for their assigned batches
const getTeacherNotices = async (userId, coachingId) => {
  const assignments = await prisma.batchSubject.findMany({
    where: { teacher_id: userId },
    select: { batch_id: true },
  });
  const batchIds = assignments.map(a => a.batch_id).filter(Boolean);

  const notices = await prisma.notice.findMany({
    where: {
      coaching_center_id: Number(coachingId),
      OR: [
        { targets: { none: {} } },
        { targets: { some: { batch_id: { in: batchIds } } } },
      ],
    },
    orderBy: { created_at: 'desc' },
    include: noticeInclude,
  });
  return notices.map(mapNoticeForClient);
};

const updateNotice = async (noticeId, updateData, requesterId, requesterRole) => {
  const notice = await prisma.notice.findUnique({ where: { id: Number(noticeId) } });
  if (!notice) throw new Error('Notice not found');

  if (requesterRole !== ROLES.OWNER && notice.created_by !== requesterId) {
    throw new Error('You are not authorised to update this notice');
  }

  const updated = await prisma.notice.update({
    where: { id: Number(noticeId) },
    data: { title: updateData.title, content: updateData.content },
    include: noticeInclude,
  });

  await audit({ userId: requesterId, action: 'UPDATE_NOTICE', entityType: 'NOTICE', entityId: Number(noticeId) });
  return mapNoticeForClient(updated);
};

const deleteNotice = async (noticeId, requesterId, requesterRole) => {
  const notice = await prisma.notice.findUnique({ where: { id: Number(noticeId) } });
  if (!notice) throw new Error('Notice not found');

  if (requesterRole !== ROLES.OWNER && notice.created_by !== requesterId) {
    throw new Error('You are not authorised to delete this notice');
  }

  await prisma.notice.delete({ where: { id: Number(noticeId) } });
  await audit({ userId: requesterId, action: 'DELETE_NOTICE', entityType: 'NOTICE', entityId: Number(noticeId) });
  return { message: 'Notice removed successfully' };
};

module.exports = {
  createNotice,
  getNoticeById,
  getNoticesByCoaching,
  getMyNotices,
  getTeacherNotices,
  updateNotice,
  deleteNotice,
};