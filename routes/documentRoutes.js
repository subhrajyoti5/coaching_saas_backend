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
const { teacherOnly, studentOnly } = require('../middleware/roles');
const { uploadTeacherDocument } = require('../middleware/upload');
const {
  validateUploadTeacherDocument,
  validateUpdateTeacherDocument
} = require('../middleware/validation');

router.post('/upload', authenticateToken, teacherOnly, uploadTeacherDocument.single('file'), validateUploadTeacherDocument, uploadDocument);
router.get('/my-documents', authenticateToken, teacherOnly, getMyDocuments);
router.get('/student-feed', authenticateToken, studentOnly, getStudentFeed);
router.get('/preview/:token', previewDocument);
router.get('/:documentId/preview-url', authenticateToken, getPreviewUrl);
router.put('/:documentId', authenticateToken, teacherOnly, validateUpdateTeacherDocument, updateDocument);
router.delete('/:documentId', authenticateToken, teacherOnly, deleteDocument);

module.exports = router;
