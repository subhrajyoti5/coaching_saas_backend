const jwt = require('jsonwebtoken');
const { Readable } = require('stream');
const prisma = require('../config/database');
const { ROLES } = require('../config/constants');
const { audit } = require('../utils/auditLogger');
const { getDriveClientForTeacher, getDeveloperDriveClient, setDriveFilePermissions } = require('./googleDriveService');

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
  // Use developer's centralized Google Drive account
  const drive = await getDeveloperDriveClient();

  // Upload file to Developer's Drive
  const created = await drive.files.create({
    requestBody: {
      name: file.originalname,
      mimeType: file.mimetype,
      // Store metadata to track which teacher/coaching uploaded it
      description: `Uploaded to Coaching SaaS by ${userId}`
    },
    media: {
      mimeType: file.mimetype,
      body: Readable.from(file.buffer)
    },
    fields: 'id,name,mimeType,size,webViewLink,webContentLink,thumbnailLink,owners'
  });

  const fileId = created.data.id;
  console.log(`[Drive Upload] File uploaded to developer drive: fileId=${fileId}, name=${file.originalname}, size=${created.data.size}`);

  // Set file permission to "Anyone with the link" (Viewer only - read-only access)
  await setDriveFilePermissions(drive, fileId);

  return created.data;
};

const uploadTeacherDocument = async ({ userId, role, coachingId, payload, file }) => {
  if (role !== ROLES.TEACHER && role !== ROLES.OWNER) {
    throw new Error('Only teachers can upload documents');
  }

  if (!file) {
    throw new Error('File is required');
  }

  // DEBUG: Log payload and isSharedWithStudents
  console.log('[Service] uploadTeacherDocument PARSING:');
  console.log('  payload:', JSON.stringify(payload, null, 2));
  console.log('  payload.isSharedWithStudents:', payload.isSharedWithStudents, '(type:', typeof payload.isSharedWithStudents, ')');

  const { batchId, title, description } = payload;
  await assertTeacherAssignedToBatch({ userId, batchId, coachingId });

  const driveMeta = await uploadToDrive({ userId, coachingId, file });

  const isSharedValue = parseSharedBoolean(payload.isSharedWithStudents);
  console.log('[Service] uploadTeacherDocument AFTER PARSE:');
  console.log('  isSharedWithStudents:', isSharedValue, '(type:', typeof isSharedValue, ')');

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
      driveWebContentLink: null,  // Always null for view-only access
      thumbnailLink: driveMeta.thumbnailLink || null,
      isSharedWithStudents: isSharedValue
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
  // DEBUG: Log student fetch
  console.log('[Service] getStudentDocumentFeed:');
  console.log('  userId:', userId);
  console.log('  coachingId:', coachingId);

  const studentProfile = await prisma.studentProfile.findFirst({
    where: { userId, coachingId }
  });

  console.log('[Service] Student profile found:', studentProfile ? `YES (batchId: ${studentProfile.batchId})` : 'NO');

  if (!studentProfile || !studentProfile.batchId) {
    console.log('[Service] No student profile or batch - returning empty');
    return [];
  }

  // DEBUG: Log query
  console.log('[Service] Querying documents WHERE:');
  console.log('  coachingId:', coachingId);
  console.log('  batchId:', studentProfile.batchId);
  console.log('  isSharedWithStudents: true');
  console.log('  isActive: true');
  console.log('  deletedAt: null');

  const documents = await prisma.teacherDocument.findMany({
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

  console.log('[Service] Documents found:', documents.length);
  if (documents.length > 0) {
    console.log('[Service] Document titles:', documents.map(d => ({ id: d.id, title: d.title })));
  } else {
    console.log('[Service] No documents found in batch:', studentProfile.batchId);
  }

  return documents;
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
  
  try {
    // Verify teacher's Drive connection is still active
    const driveConnection = await prisma.googleDriveConnection.findFirst({
      where: {
        userId: doc.uploadedBy,
        coachingId,
        revokedAt: null
      }
    });

    if (!driveConnection) {
      throw new Error('Teacher has not connected Google Drive or connection has been revoked');
    }

    const { drive } = await getDriveClientForTeacher({ userId: doc.uploadedBy, coachingId });

    console.log(`[Preview] Loading fileId=${doc.driveFileId} for student`);
    
    const response = await drive.files.get(
      {
        fileId: doc.driveFileId,
        alt: 'media'
      },
      { responseType: 'stream' }
    );

    console.log(`[Preview] Stream opened for fileId=${doc.driveFileId}`);
    return {
      stream: response.data,
      mimeType: doc.mimeType,
      fileName: doc.fileName
    };
  } catch (error) {
    console.error(`[Preview Error] fileId=${doc.driveFileId}, teacher=${doc.uploadedBy}, error:`, error.message);
    
    if (error.message.includes('404') || error.message.includes('not found')) {
      throw new Error(`File not found in Google Drive (FileId: ${doc.driveFileId}). Teacher may have deleted it.`);
    }
    
    if (error.message.includes('permission') || error.message.includes('Forbidden') || error.message.includes('403')) {
      throw new Error('Access denied. Teacher needs to reconnect Google Drive.');
    }
    
    throw error;
  }
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
