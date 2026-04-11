const path = require('path');
const { HTTP_STATUS } = require('../config/constants');
const documentService = require('../services/documentService');

const uploadDocument = async (req, res) => {
  try {
    // DEBUG: Log request body
    console.log('[Controller] uploadDocument REQUEST BODY:', JSON.stringify(req.body, null, 2));
    console.log('[Controller] uploadDocument FILE:', req.file ? `${req.file.originalname} (${req.file.size} bytes)` : 'NO FILE');
    console.log('[Controller] uploadDocument USER:', { userId: req.user.userId, role: req.user.role, coachingId: req.user.coachingId });
    
    const uploadResult = await documentService.uploadTeacherDocument({
      userId: req.user.userId,
      role: req.user.role,
      coachingId: req.user.coachingId,
      payload: req.body,
      file: req.file
    });

    return res.status(HTTP_STATUS.CREATED).json({
      message: 'Document uploaded successfully',
      ...uploadResult
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to upload document',
      message: error.message
    });
  }
};

const getMyDocuments = async (req, res) => {
  try {
    const documents = await documentService.getMyTeacherDocuments({
      userId: req.user.userId,
      coachingId: req.user.coachingId
    });

    return res.status(HTTP_STATUS.SUCCESS).json({ documents });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch documents',
      message: error.message
    });
  }
};

const updateDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    const document = await documentService.updateTeacherDocumentMeta({
      userId: req.user.userId,
      coachingId: req.user.coachingId,
      documentId,
      payload: req.body
    });

    return res.status(HTTP_STATUS.SUCCESS).json({
      message: 'Document updated successfully',
      document
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to update document',
      message: error.message
    });
  }
};

const deleteDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    const result = await documentService.deleteTeacherDocument({
      userId: req.user.userId,
      coachingId: req.user.coachingId,
      documentId
    });

    return res.status(HTTP_STATUS.SUCCESS).json(result);
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to delete document',
      message: error.message
    });
  }
};

const getStudentFeed = async (req, res) => {
  try {
    const documents = await documentService.getStudentDocumentFeed({
      userId: req.user.userId,
      coachingId: req.user.coachingId
    });

    return res.status(HTTP_STATUS.SUCCESS).json({ documents });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch student documents',
      message: error.message
    });
  }
};

const getPreviewUrl = async (req, res) => {
  try {
    const { documentId } = req.params;
    const previewUrl = await documentService.getDocumentPreviewUrl({
      userId: req.user.userId,
      coachingId: req.user.coachingId,
      role: req.user.role,
      documentId
    });

    return res.status(HTTP_STATUS.SUCCESS).json({ previewUrl });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to generate preview URL',
      message: error.message
    });
  }
};

const previewDocument = async (req, res) => {
  try {
    const { token } = req.params;
    const { stream, mimeType, fileName } = await documentService.getPreviewDocumentByToken(token);

    res.setHeader('Content-Type', mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(fileName || 'document')}"`);

    return stream.pipe(res);
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to preview document',
      message: error.message
    });
  }
};

module.exports = {
  uploadDocument,
  getMyDocuments,
  updateDocument,
  deleteDocument,
  getStudentFeed,
  getPreviewUrl,
  previewDocument
};
