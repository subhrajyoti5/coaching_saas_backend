const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const path = require('path');
const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const prisma = require('../config/database');
const { ROLES } = require('../config/constants');
const { audit } = require('../utils/auditLogger');
const notificationService = require('./notificationService');
const { createR2Client, getR2PublicUrl } = require('../utils/r2');

const parseSharedBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
};

const parseBatchIds = (payload = {}) => {
  const rawBatchIds = payload.batchIds;
  const legacyBatchId = payload.batchId;

  let values = [];
  if (Array.isArray(rawBatchIds)) {
    values = rawBatchIds;
  } else if (typeof rawBatchIds === 'string' && rawBatchIds.trim()) {
    try {
      const parsed = JSON.parse(rawBatchIds);
      if (Array.isArray(parsed)) {
        values = parsed;
      } else {
        values = rawBatchIds.split(',');
      }
    } catch (_) {
      values = rawBatchIds.split(',');
    }
  } else if (legacyBatchId !== undefined && legacyBatchId !== null) {
    values = [legacyBatchId];
  }

  const ids = [...new Set(values.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  return ids;
};

const resolveDocumentFileUrl = (doc = {}) => {
  const directUrl = typeof doc.file_url === 'string' ? doc.file_url.trim() : '';
  if (directUrl) return directUrl;

  const objectKey = typeof doc.storage_object_key === 'string' ? doc.storage_object_key.trim() : '';

  if (objectKey) {
    try {
      return getR2PublicUrl(objectKey);
    } catch (_) {
      return null;
    }
  }

  return null;
};

const mapDocumentForClient = (doc, extras = {}) => {
  const resolvedFileUrl = resolveDocumentFileUrl(doc);

  return {
    id: doc.id,
    title: doc.title,
    description: extras.description || null,
    fileName: extras.fileName || doc.title || 'Document',
    fileSize: extras.fileSize || 0,
    mimeType: extras.mimeType || null,
    fileUrl: resolvedFileUrl,
    previewUrl: resolvedFileUrl,
    storageProvider: doc.storage_provider || null,
    storageObjectKey: doc.storage_object_key || null,
    isSharedWithStudents: extras.isSharedWithStudents ?? true,
    createdAt: doc.uploaded_at,
    uploadedBy: doc.uploaded_by,
    batchId: doc.batch_id,
    batch: doc.batch ? { id: doc.batch.id, name: doc.batch.name } : null
  };
};

const assertTeacherAssignedToBatch = async ({ userId, batchId, coachingId }) => {
  const assigned = await prisma.batchSubject.findFirst({
    where: {
      teacher_id: Number(userId),
      batch_id: Number(batchId),
      batch: { coaching_center_id: Number(coachingId) }
    }
  });

  if (!assigned) {
    throw new Error('You are not assigned to this batch');
  }
};

const assertBatchInCoaching = async ({ batchId, coachingId }) => {
  const batch = await prisma.batch.findFirst({
    where: {
      id: Number(batchId),
      coaching_center_id: Number(coachingId)
    },
    select: { id: true, name: true }
  });

  if (!batch) {
    throw new Error('One or more selected batches are invalid for this coaching center');
  }

  return batch;
};

const resolveMaterialRecipientIds = async ({ batchIds = [], uploaderId }) => {
  if (!batchIds.length) return [];

  const rows = await prisma.batchStudent.findMany({
    where: {
      batch_id: { in: batchIds.map(Number) }
    },
    select: { student_id: true }
  });

  return [...new Set(
    rows
      .map((row) => Number(row.student_id))
      .filter((id) => Number.isInteger(id) && id > 0 && id !== Number(uploaderId))
  )];
};

const sanitizeFileName = (fileName) => {
  const parsed = path.parse(fileName || 'document');
  const name = (parsed.name || 'document')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80) || 'document';

  const extension = (parsed.ext || '').toLowerCase();
  return `${name}${extension}`;
};

const buildR2ObjectKey = ({ userId, file }) => {
  const safeName = sanitizeFileName(file?.originalname || 'document');
  return `documents/${Number(userId)}/${Date.now()}-${safeName}`;
};

const extractObjectKeyFromUrl = (fileUrl = '') => {
  if (typeof fileUrl !== 'string' || !fileUrl.trim()) return null;

  try {
    const parsed = new URL(fileUrl);
    const key = decodeURIComponent((parsed.pathname || '').replace(/^\/+/, ''));
    return key || null;
  } catch (_) {
    return null;
  }
};

const uploadToR2 = async ({ userId, file }) => {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) {
    throw new Error('R2_BUCKET is not configured in environment variables');
  }

  const key = buildR2ObjectKey({ userId, file });
  const r2 = createR2Client();

  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype || 'application/octet-stream',
      Metadata: {
        originalname: sanitizeFileName(file.originalname || 'document')
      }
    })
  );

  const fileUrl = getR2PublicUrl(key);
  if (!fileUrl) {
    throw new Error('R2 file URL generation failed after upload');
  }

  return {
    objectKey: key,
    fileUrl,
    fileName: file.originalname || 'document'
  };
};

const ensureDocumentHasFileUrl = async (doc) => {
  const resolvedFileUrl = resolveDocumentFileUrl(doc);
  if (!resolvedFileUrl) {
    throw new Error('Document file is not available');
  }

  const existingFileUrl = typeof doc.file_url === 'string' ? doc.file_url.trim() : '';
  const existingProvider = typeof doc.storage_provider === 'string' ? doc.storage_provider.trim() : '';
  if (!existingFileUrl && doc.id) {
    await prisma.document.update({
      where: { id: Number(doc.id) },
      data: {
        file_url: resolvedFileUrl,
        storage_provider: existingProvider || 'r2'
      }
    });
  }

  return resolvedFileUrl;
};

const uploadTeacherDocument = async ({ userId, role, coachingId, payload, file }) => {
  if (role !== ROLES.TEACHER && role !== ROLES.OWNER) {
    throw new Error('Only teachers or owners can upload documents');
  }

  if (!file) {
    throw new Error('File is required');
  }

  const { title } = payload;
  const batchIds = parseBatchIds(payload);
  if (batchIds.length === 0) throw new Error('At least one batch is required');

  const batches = [];
  for (const batchId of batchIds) {
    const batch = await assertBatchInCoaching({ batchId, coachingId });
    if (role === ROLES.TEACHER) {
      await assertTeacherAssignedToBatch({ userId, batchId, coachingId });
    }
    batches.push(batch);
  }

  const uploadedFile = await uploadToR2({ userId, file });

  const createdDocuments = await prisma.$transaction(async (tx) => {
    const docs = [];
    for (const batch of batches) {
      const created = await tx.document.create({
        data: {
          title: title || uploadedFile.fileName,
          storage_provider: 'r2',
          storage_object_key: uploadedFile.objectKey,
          file_url: uploadedFile.fileUrl,
          batch_id: Number(batch.id),
          uploaded_by: Number(userId)
        },
        include: {
          batch: { select: { id: true, name: true } }
        }
      });
      docs.push(created);
    }
    return docs;
  });

  await audit({
    userId,
    action: 'UPLOAD_TEACHER_DOCUMENT',
    entityType: 'DOCUMENT',
    entityId: createdDocuments[0].id,
    metadata: {
      batchIds: batches.map((batch) => batch.id),
      storageObjectKey: uploadedFile.objectKey,
      fileUrl: uploadedFile.fileUrl
    }
  });

  const mappedDocuments = createdDocuments.map((document) => mapDocumentForClient(document, {
    description: payload.description || null,
    fileName: uploadedFile.fileName,
    fileSize: Number(file.size || 0),
    mimeType: file.mimetype,
    isSharedWithStudents: parseSharedBoolean(payload.isSharedWithStudents)
  }));

  try {
    const recipientUserIds = await resolveMaterialRecipientIds({
      batchIds: batches.map((batch) => batch.id),
      uploaderId: userId
    });

    if (recipientUserIds.length > 0) {
      const firstMaterial = mappedDocuments[0];
      const firstBatch = mappedDocuments[0]?.batch?.name || 'your batch';

      await notificationService.sendMaterialUpdateNotification({
        recipientUserIds,
        material: {
          id: firstMaterial?.id,
          title: firstMaterial?.title,
          batchId: firstMaterial?.batchId,
          batchName: firstBatch,
          coachingId,
          fileUrl: firstMaterial?.fileUrl
        }
      });
    }
  } catch (error) {
    console.error('Material upload push notification failed:', error.message);
  }

  return {
    documents: mappedDocuments,
    document: mappedDocuments[0],
    batchCount: mappedDocuments.length
  };
};

const getMyTeacherDocuments = async ({ userId, coachingId }) => {
  const documents = await prisma.document.findMany({
    where: {
      uploaded_by: Number(userId),
      batch: { coaching_center_id: Number(coachingId) }
    },
    orderBy: { uploaded_at: 'desc' },
    include: {
      batch: { select: { id: true, name: true } }
    }
  });

  return documents.map((doc) => mapDocumentForClient(doc));
};

const updateTeacherDocumentMeta = async ({ userId, coachingId, documentId, payload }) => {
  const existing = await prisma.document.findFirst({
    where: {
      id: Number(documentId),
      uploaded_by: Number(userId),
      batch: { coaching_center_id: Number(coachingId) }
    },
    include: { batch: { select: { id: true, name: true } } }
  });

  if (!existing) {
    throw new Error('Document not found');
  }

  const data = {};
  if (typeof payload.title === 'string' && payload.title.trim()) {
    data.title = payload.title.trim();
  }

  const updated = await prisma.document.update({
    where: { id: Number(documentId) },
    data,
    include: { batch: { select: { id: true, name: true } } }
  });

  await audit({ userId, action: 'UPDATE_TEACHER_DOCUMENT', entityType: 'DOCUMENT', entityId: updated.id });
  return mapDocumentForClient(updated, {
    description: payload.description || null,
    isSharedWithStudents: parseSharedBoolean(payload.isSharedWithStudents)
  });
};

const deleteTeacherDocument = async ({ userId, coachingId, documentId }) => {
  const existing = await prisma.document.findFirst({
    where: {
      id: Number(documentId),
      uploaded_by: Number(userId),
      batch: { coaching_center_id: Number(coachingId) }
    }
  });

  if (!existing) {
    throw new Error('Document not found');
  }

  await prisma.document.delete({ where: { id: Number(documentId) } });
  await audit({ userId, action: 'DELETE_TEACHER_DOCUMENT', entityType: 'DOCUMENT', entityId: Number(documentId) });
  return { message: 'Document deleted successfully' };
};

const getStudentDocumentFeed = async ({ userId, coachingId }) => {
  const studentBatchRows = await prisma.batchStudent.findMany({
    where: {
      student_id: Number(userId),
      batch: { coaching_center_id: Number(coachingId) }
    },
    select: { batch_id: true }
  });

  const batchIds = studentBatchRows.map((row) => row.batch_id).filter(Boolean);
  if (batchIds.length === 0) return [];

  const documents = await prisma.document.findMany({
    where: {
      batch_id: { in: batchIds }
    },
    orderBy: { uploaded_at: 'desc' },
    include: {
      batch: { select: { id: true, name: true } }
    }
  });

  return documents.map((doc) => mapDocumentForClient(doc, { isSharedWithStudents: true }));
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
  const doc = await prisma.document.findFirst({
    where: {
      id: Number(documentId),
      batch: { coaching_center_id: Number(coachingId) }
    }
  });

  if (!doc) throw new Error('Document not found');

  if (role === ROLES.OWNER) return doc;

  if (role === ROLES.TEACHER) {
    if (doc.uploaded_by !== Number(userId)) {
      throw new Error('You are not authorised to preview this document');
    }
    return doc;
  }

  if (role === ROLES.STUDENT) {
    const membership = await prisma.batchStudent.findFirst({
      where: { student_id: Number(userId), batch_id: doc.batch_id }
    });

    if (!membership) {
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
  const previewPath = `/api/documents/preview/${token}`;
  return baseUrl ? `${baseUrl}${previewPath}` : previewPath;
};

const getPreviewDocumentByToken = async (token) => {
  const secret = process.env.DOCUMENT_PREVIEW_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('DOCUMENT_PREVIEW_SECRET or JWT_SECRET must be configured');
  }

  const decoded = jwt.verify(token, secret);
  const { userId, coachingId, role, documentId } = decoded;

  const doc = await validatePreviewAccess({ userId, coachingId, role, documentId });

  const objectKey =
    (typeof doc.storage_object_key === 'string' && doc.storage_object_key.trim())
      ? doc.storage_object_key.trim()
      : extractObjectKeyFromUrl(doc.file_url);

  if (!objectKey) {
    throw new Error('Document file is not available');
  }

  const bucket = process.env.R2_BUCKET;
  if (!bucket) {
    throw new Error('R2_BUCKET is not configured in environment variables');
  }

  const r2 = createR2Client();
  const objectResp = await r2.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey
    })
  );

  const resolvedFileUrl = resolveDocumentFileUrl({
    ...doc,
    storage_object_key: objectKey
  });

  if (doc.id && objectKey && doc.storage_object_key !== objectKey) {
    await prisma.document.update({
      where: { id: Number(doc.id) },
      data: {
        storage_object_key: objectKey,
        storage_provider: 'r2',
        ...(resolvedFileUrl ? { file_url: resolvedFileUrl } : {})
      }
    });
  } else if (doc.id && !doc.file_url && resolvedFileUrl) {
    await prisma.document.update({
      where: { id: Number(doc.id) },
      data: {
        file_url: resolvedFileUrl,
        storage_provider: 'r2'
      }
    });
  }

  return {
    stream: objectResp.Body,
    mimeType: objectResp.ContentType || 'application/octet-stream',
    fileName: doc.title || 'document'
  };
};

module.exports = {
  uploadTeacherDocument,
  getMyTeacherDocuments,
  updateTeacherDocumentMeta,
  deleteTeacherDocument,
  getStudentDocumentFeed,
  getDocumentPreviewUrl,
  getPreviewDocumentByToken
};
