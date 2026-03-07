const jwt = require('jsonwebtoken');
const { Readable } = require('stream');
const prisma = require('../config/database');
const { ROLES } = require('../config/constants');
const { audit } = require('../utils/auditLogger');
const { getDriveClientForTeacher } = require('./googleDriveService');

const parseSharedBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
};

const assertTeacherAssignedToBatch = async ({ userId, batchId, coachingId }) => {
  const assigned = await prisma.batchTeacher.findFirst({
    where: {
      teacherId: userId,
      batchId,
      batch: {
        coachingId,
        isActive: true
      }
    }
  });

  if (!assigned) {
    throw new Error('You are not assigned to this batch');
  }
};

const uploadToDrive = async ({ userId, coachingId, file }) => {
  const { drive } = await getDriveClientForTeacher({ userId, coachingId });

  const created = await drive.files.create({
    requestBody: {
      name: file.originalname,
      mimeType: file.mimetype
    },
    media: {
      mimeType: file.mimetype,
      body: Readable.from(file.buffer)
    },
    fields: 'id,name,mimeType,size,webViewLink,webContentLink,thumbnailLink'
  });

  return created.data;
};

const uploadTeacherDocument = async ({ userId, role, coachingId, payload, file }) => {
  if (role !== ROLES.TEACHER && role !== ROLES.OWNER) {
    throw new Error('Only teachers can upload documents');
  }

  if (!file) {
    throw new Error('File is required');
  }

  const { batchId, title, description } = payload;
  await assertTeacherAssignedToBatch({ userId, batchId, coachingId });

  const driveMeta = await uploadToDrive({ userId, coachingId, file });

  const document = await prisma.teacherDocument.create({
    data: {
      coachingId,
      batchId,
      uploadedBy: userId,
      title,
      description: description || null,
      fileName: driveMeta.name || file.originalname,
      fileSize: Number(driveMeta.size || file.size || 0),
      mimeType: driveMeta.mimeType || file.mimetype,
      driveFileId: driveMeta.id,
      driveWebViewLink: driveMeta.webViewLink || null,
      driveWebContentLink: driveMeta.webContentLink || null,
      thumbnailLink: driveMeta.thumbnailLink || null,
      isSharedWithStudents: parseSharedBoolean(payload.isSharedWithStudents)
    },
    include: {
      batch: { select: { id: true, name: true } }
    }
  });

  await audit({
    userId,
    action: 'UPLOAD_TEACHER_DOCUMENT',
    entityType: 'TEACHER_DOCUMENT',
    entityId: document.id,
    metadata: { batchId, driveFileId: driveMeta.id }
  });

  return document;
};

const getMyTeacherDocuments = async ({ userId, coachingId }) => {
  return prisma.teacherDocument.findMany({
    where: {
      coachingId,
      uploadedBy: userId,
      isActive: true,
      deletedAt: null
    },
    orderBy: { createdAt: 'desc' },
    include: {
      batch: { select: { id: true, name: true } }
    }
  });
};

const updateTeacherDocumentMeta = async ({ userId, coachingId, documentId, payload }) => {
  const existing = await prisma.teacherDocument.findFirst({
    where: {
      id: documentId,
      coachingId,
      isActive: true,
      deletedAt: null
    }
  });

  if (!existing) {
    throw new Error('Document not found');
  }

  if (existing.uploadedBy !== userId) {
    throw new Error('You are not authorised to update this document');
  }

  const data = {};
  if (typeof payload.title === 'string' && payload.title.trim()) data.title = payload.title.trim();
  if (Object.prototype.hasOwnProperty.call(payload, 'description')) {
    data.description = payload.description ? String(payload.description).trim() : null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'isSharedWithStudents')) {
    data.isSharedWithStudents = parseSharedBoolean(payload.isSharedWithStudents);
  }

  const updated = await prisma.teacherDocument.update({
    where: { id: documentId },
    data,
    include: {
      batch: { select: { id: true, name: true } }
    }
  });

  await audit({ userId, action: 'UPDATE_TEACHER_DOCUMENT', entityType: 'TEACHER_DOCUMENT', entityId: updated.id });
  return updated;
};

const deleteTeacherDocument = async ({ userId, coachingId, documentId }) => {
  const existing = await prisma.teacherDocument.findFirst({
    where: {
      id: documentId,
      coachingId,
      isActive: true,
      deletedAt: null
    }
  });

  if (!existing) {
    throw new Error('Document not found');
  }

  if (existing.uploadedBy !== userId) {
    throw new Error('You are not authorised to delete this document');
  }

  await prisma.teacherDocument.update({
    where: { id: documentId },
    data: {
      isActive: false,
      deletedAt: new Date()
    }
  });

  await audit({ userId, action: 'DELETE_TEACHER_DOCUMENT', entityType: 'TEACHER_DOCUMENT', entityId: documentId });
  return { message: 'Document deleted successfully' };
};

const getStudentDocumentFeed = async ({ userId, coachingId }) => {
  const studentProfile = await prisma.studentProfile.findFirst({
    where: { userId, coachingId }
  });

  if (!studentProfile || !studentProfile.batchId) {
    return [];
  }

  return prisma.teacherDocument.findMany({
    where: {
      coachingId,
      batchId: studentProfile.batchId,
      isSharedWithStudents: true,
      isActive: true,
      deletedAt: null
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      description: true,
      fileName: true,
      fileSize: true,
      mimeType: true,
      createdAt: true,
      batch: { select: { id: true, name: true } }
    }
  });
};

const createPreviewUrlToken = ({ userId, coachingId, role, documentId }) => {
  const secret = process.env.DOCUMENT_PREVIEW_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('DOCUMENT_PREVIEW_SECRET or JWT_SECRET must be configured');
  }

  return jwt.sign({ userId, coachingId, role, documentId }, secret, {
    expiresIn: process.env.DOCUMENT_PREVIEW_TOKEN_TTL || '2m'
  });
};

const validatePreviewAccess = async ({ userId, coachingId, role, documentId }) => {
  const doc = await prisma.teacherDocument.findFirst({
    where: {
      id: documentId,
      coachingId,
      isActive: true,
      deletedAt: null
    }
  });

  if (!doc) {
    throw new Error('Document not found');
  }

  if (role === ROLES.OWNER) {
    return doc;
  }

  if (role === ROLES.TEACHER) {
    if (doc.uploadedBy !== userId) {
      throw new Error('You are not authorised to preview this document');
    }
    return doc;
  }

  if (role === ROLES.STUDENT) {
    const studentProfile = await prisma.studentProfile.findFirst({
      where: { userId, coachingId }
    });

    const canAccess =
      studentProfile &&
      studentProfile.batchId === doc.batchId &&
      doc.isSharedWithStudents;

    if (!canAccess) {
      throw new Error('You are not authorised to preview this document');
    }

    return doc;
  }

  throw new Error('Invalid role for preview');
};

const getDocumentPreviewUrl = async ({ userId, coachingId, role, documentId }) => {
  await validatePreviewAccess({ userId, coachingId, role, documentId });
  const token = createPreviewUrlToken({ userId, coachingId, role, documentId });
  const baseUrl = process.env.API_BASE_URL || '';
  const path = `/api/documents/preview/${token}`;
  return baseUrl ? `${baseUrl}${path}` : path;
};

const getPreviewStreamByToken = async (token) => {
  const secret = process.env.DOCUMENT_PREVIEW_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('DOCUMENT_PREVIEW_SECRET or JWT_SECRET must be configured');
  }

  const decoded = jwt.verify(token, secret);
  const { userId, coachingId, role, documentId } = decoded;

  const doc = await validatePreviewAccess({ userId, coachingId, role, documentId });
  const { drive } = await getDriveClientForTeacher({ userId: doc.uploadedBy, coachingId });

  const response = await drive.files.get(
    {
      fileId: doc.driveFileId,
      alt: 'media'
    },
    { responseType: 'stream' }
  );

  return {
    stream: response.data,
    mimeType: doc.mimeType,
    fileName: doc.fileName
  };
};

module.exports = {
  uploadTeacherDocument,
  getMyTeacherDocuments,
  updateTeacherDocumentMeta,
  deleteTeacherDocument,
  getStudentDocumentFeed,
  getDocumentPreviewUrl,
  getPreviewStreamByToken
};
