const express = require('express');
const router = express.Router();
const {
  createNotice,
  getNotice,
  getNoticesByCoaching,
  getMyNotices,
  getMyTeacherNotices,
  updateNotice,
  deleteNotice
} = require('../controllers/noticeController');
const { authenticateToken } = require('../middleware/auth');
const { ownerOnly, teacherOrOwner, studentOrOwner, studentOnly, teacherOnly } = require('../middleware/roles');
const { validateCoachingAccess } = require('../middleware/coachingIsolation');
const { validateCreateNotice } = require('../middleware/validation');

// Protected routes
// Create a new notice (Owner and Teacher can access)
router.post('/', authenticateToken, teacherOrOwner, validateCreateNotice, createNotice);

// Get notice by ID (Owner, Teacher, and Student can access)
router.get('/:noticeId', authenticateToken, studentOrOwner, getNotice);

// Get all notices for a coaching center (Owner and Teacher can access)
router.get('/coaching/:coachingId', authenticateToken, teacherOrOwner, validateCoachingAccess, getNoticesByCoaching);

// Get all notices for a student (extracted from JWT)
router.get('/my-notices', authenticateToken, studentOnly, getMyNotices);

// Get all notices for a teacher (extracted from JWT)
router.get('/my-batch-notices', authenticateToken, teacherOnly, getMyTeacherNotices);

// Update a notice (Only the creator or Owner can update)
router.put('/:noticeId', authenticateToken, teacherOrOwner, updateNotice);

// Delete a notice (Only the creator or Owner can delete)
router.delete('/:noticeId', authenticateToken, teacherOrOwner, deleteNotice);

module.exports = router;