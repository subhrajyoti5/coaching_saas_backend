const express = require('express');
const router = express.Router();
const {
  createBatch,
  getBatch,
  getBatchesByCoaching,
  assignTeacherToBatch,
  removeTeacherFromBatch,
  assignStudentToBatch,
  removeStudentFromBatch,
  getTeachersByBatch,
  getStudentsByBatch,
  deleteBatch
} = require('../controllers/batchController');
const { authenticateToken } = require('../middleware/auth');
const { ownerOnly, teacherOrOwner } = require('../middleware/roles');
const { validateCoachingAccess, validateBatchAccess } = require('../middleware/coachingIsolation');
const { validateCreateBatch, validateAssignTeacher, validateAssignStudent } = require('../middleware/validation');

// Protected routes
// Create a new batch (Owner and Teacher can access)
router.post('/', authenticateToken, teacherOrOwner, validateCoachingAccess, validateCreateBatch, createBatch);

// Get batch by ID (Owner and Teacher can access)
router.get('/:batchId', authenticateToken, teacherOrOwner, validateBatchAccess, getBatch);

// Get all batches for a coaching center (Owner and Teacher can access)
router.get('/coaching/:coachingId', authenticateToken, teacherOrOwner, validateCoachingAccess, getBatchesByCoaching);

// Assign a teacher to a batch (Owner and Teacher can access)
router.post('/assign-teacher', authenticateToken, teacherOrOwner, validateAssignTeacher, assignTeacherToBatch);

// Remove a teacher from a batch (Owner and Teacher can access)
router.post('/remove-teacher', authenticateToken, teacherOrOwner, validateAssignTeacher, removeTeacherFromBatch);

// Assign a student to a batch (Owner and Teacher can access)
router.post('/assign-student', authenticateToken, teacherOrOwner, validateAssignStudent, assignStudentToBatch);

// Remove a student from a batch (Owner and Teacher can access)
router.post('/remove-student', authenticateToken, teacherOrOwner, removeStudentFromBatch);

// Get all teachers assigned to a batch (Owner and Teacher can access)
router.get('/:batchId/teachers', authenticateToken, teacherOrOwner, validateBatchAccess, getTeachersByBatch);

// Get all students in a batch (Owner and Teacher can access)
router.get('/:batchId/students', authenticateToken, teacherOrOwner, validateBatchAccess, getStudentsByBatch);

// Deactivate a batch (Owner only)
router.delete('/:batchId', authenticateToken, ownerOnly, validateBatchAccess, deleteBatch);

module.exports = router;