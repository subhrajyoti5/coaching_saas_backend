const express = require('express');
const router = express.Router();
const {
  uploadDocument,
  getMyDocuments,
  updateDocument,
  deleteDocument,
  getStudentFeed,
  getPreviewUrl,
  previewDocument
} = require('../controllers/documentController');
const { authenticateToken } = require('../middleware/auth');
const { teacherOrOwner, studentOnly } = require('../middleware/roles');
const { uploadTeacherDocument } = require('../middleware/upload');
const {
  validateUploadTeacherDocument,
  validateUpdateTeacherDocument
} = require('../middleware/validation');

router.post('/upload', authenticateToken, teacherOrOwner, uploadTeacherDocument.single('file'), validateUploadTeacherDocument, uploadDocument);
router.get('/my-documents', authenticateToken, teacherOrOwner, getMyDocuments);
router.get('/student-feed', authenticateToken, studentOnly, getStudentFeed);
router.get('/preview/:token', previewDocument);
router.get('/:documentId/preview-url', authenticateToken, getPreviewUrl);
router.put('/:documentId', authenticateToken, teacherOrOwner, validateUpdateTeacherDocument, updateDocument);
router.delete('/:documentId', authenticateToken, teacherOrOwner, deleteDocument);

module.exports = router;
