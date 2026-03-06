const prisma = require('../config/database');
const { ROLES } = require('../config/constants');
const { audit } = require('../utils/auditLogger');

const createNotice = async (
  noticeData,
  requesterId,
  requesterRole,
  requesterCoachingId
) => {
  const { coachingId, batchId, title, content, expiresAt } = noticeData;

  if (!requesterCoachingId || requesterCoachingId !== coachingId) {
    throw new Error('You can only create notices in your selected coaching center');
  }

  if (batchId) {
    const batch = await prisma.batch.findFirst({
      where: { id: batchId, coachingId, isActive: true }
    });
    if (!batch) {
      throw new Error('Selected batch is invalid for this coaching center');
    }
  }

  // Teachers can only post to their assigned batches; Owners can post to any/all
  if (requesterRole === ROLES.TEACHER) {
    if (!batchId) throw new Error('Teachers must specify a batch when posting a notice');

    const assigned = await prisma.batchTeacher.findFirst({
      where: { teacherId: requesterId, batchId }
    });
    if (!assigned) throw new Error('You are not assigned to this batch');
  }

  const notice = await prisma.notice.create({
    data: {
      coachingId,
      batchId: batchId || null,
      title,
      content,
      createdBy: requesterId,
      createdByRole: requesterRole,
      expiresAt: expiresAt ? new Date(expiresAt) : null
    }
  });

  await audit({ userId: requesterId, action: 'CREATE_NOTICE', entityType: 'NOTICE', entityId: notice.id });
  return notice;
};

const getNoticeById = async (noticeId, requester) => {
  const notice = await prisma.notice.findUnique({
    where: { id: noticeId },
    include: {
      coaching: { select: { id: true, name: true } },
      batch: { select: { id: true, name: true } },
      creator: { select: { id: true, firstName: true, lastName: true, email: true } }
    }
  });
  if (!notice) throw new Error('Notice not found');

  if (!requester?.coachingId || notice.coachingId !== requester.coachingId) {
    throw new Error('You are not authorised to view this notice');
  }

  if (requester.role === ROLES.STUDENT) {
    const studentProfile = await prisma.studentProfile.findFirst({
      where: { userId: requester.userId, coachingId: requester.coachingId }
    });

    if (!studentProfile) {
      throw new Error('Student profile not found');
    }

    const canView = notice.batchId === null || notice.batchId === studentProfile.batchId;
    if (!canView) {
      throw new Error('You are not authorised to view this notice');
    }
  }

  if (requester.role === ROLES.TEACHER) {
    const assignedBatches = await prisma.batchTeacher.findMany({
      where: { teacherId: requester.userId },
      select: { batchId: true }
    });
    const assignedBatchIds = new Set(assignedBatches.map((item) => item.batchId));
    const canView = notice.batchId === null || assignedBatchIds.has(notice.batchId);
    if (!canView) {
      throw new Error('You are not authorised to view this notice');
    }
  }

  return notice;
};

// Active notices only (not expired)
const activeFilter = () => ({
  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
});

const getNoticesByCoaching = async (coachingId, batchId = null) => {
  const whereClause = { coachingId, ...activeFilter() };
  if (batchId) whereClause.batchId = batchId;

  return prisma.notice.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    include: {
      coaching: { select: { id: true, name: true } },
      batch: { select: { id: true, name: true } },
      creator: { select: { id: true, firstName: true, lastName: true } }
    }
  });
};

// Notices for a student — derive profile from JWT userId + coachingId
const getMyNotices = async (userId, coachingId) => {
  const studentProfile = await prisma.studentProfile.findFirst({
    where: { userId, coachingId }
  });
  if (!studentProfile) throw new Error('Student profile not found');

  return prisma.notice.findMany({
    where: {
      coachingId,
      OR: [{ batchId: studentProfile.batchId }, { batchId: null }],
      ...activeFilter()
    },
    orderBy: { createdAt: 'desc' },
    include: {
      coaching: { select: { id: true, name: true } },
      batch: { select: { id: true, name: true } },
      creator: { select: { id: true, firstName: true, lastName: true } }
    }
  });
};

// Notices relevant to a teacher — batches they are assigned to
const getTeacherNotices = async (userId, coachingId) => {
  const batchTeachers = await prisma.batchTeacher.findMany({
    where: { teacherId: userId },
    select: { batchId: true }
  });
  const batchIds = batchTeachers.map(bt => bt.batchId);

  return prisma.notice.findMany({
    where: {
      coachingId,
      OR: [{ batchId: { in: batchIds } }, { batchId: null }],
      ...activeFilter()
    },
    orderBy: { createdAt: 'desc' },
    include: {
      coaching: { select: { id: true, name: true } },
      batch: { select: { id: true, name: true } },
      creator: { select: { id: true, firstName: true, lastName: true } }
    }
  });
};

const updateNotice = async (noticeId, updateData, requesterId, requesterRole) => {
  const notice = await prisma.notice.findUnique({ where: { id: noticeId } });
  if (!notice) throw new Error('Notice not found');

  // Only the creator or an Owner can update
  if (requesterRole !== ROLES.OWNER && notice.createdBy !== requesterId) {
    throw new Error('You are not authorised to update this notice');
  }

  const updated = await prisma.notice.update({
    where: { id: noticeId },
    data: {
      title: updateData.title,
      content: updateData.content,
      expiresAt: updateData.expiresAt ? new Date(updateData.expiresAt) : undefined
    }
  });

  await audit({ userId: requesterId, action: 'UPDATE_NOTICE', entityType: 'NOTICE', entityId: noticeId });
  return updated;
};

// Soft-delete via expiresAt = now (immediately marks as inactive)
const deleteNotice = async (noticeId, requesterId, requesterRole) => {
  const notice = await prisma.notice.findUnique({ where: { id: noticeId } });
  if (!notice) throw new Error('Notice not found');

  if (requesterRole !== ROLES.OWNER && notice.createdBy !== requesterId) {
    throw new Error('You are not authorised to delete this notice');
  }

  // Expire it immediately rather than hard-deleting
  await prisma.notice.update({
    where: { id: noticeId },
    data: { expiresAt: new Date() }
  });

  await audit({ userId: requesterId, action: 'DELETE_NOTICE', entityType: 'NOTICE', entityId: noticeId });
  return { message: 'Notice removed successfully' };
};

module.exports = {
  createNotice,
  getNoticeById,
  getNoticesByCoaching,
  getMyNotices,
  getTeacherNotices,
  updateNotice,
  deleteNotice
};