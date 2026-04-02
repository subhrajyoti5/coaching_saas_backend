const express = require('express');
const router = express.Router();
const {
  createCoaching,
  getCoachingById,
  getUserCoachingCenters,
  addTeacherToCoaching,
  addStudentToCoaching,
  updateStudent,
  deleteStudent,
  getCoachingStats,
  getCoachingAuditLogs,
  getTeachersByCoaching,
  getStudentsByCoaching,
  deactivateCoaching,
  updateCoachingPhone,
  updateCoachingDetails
} = require('../controllers/coachingController');
const { authenticateToken } = require('../middleware/auth');
const { ownerOnly } = require('../middleware/roles');
const { validateCoachingAccess } = require('../middleware/coachingIsolation');
const { validateCreateCoaching, validateAddTeacher, validateAddStudent, validateUpdateCoachingPhone, validateUpdateCoachingDetails } = require('../middleware/validation');

// Protected routes
// Create a new coaching center (Any authenticated user can create one and become an owner)
router.post('/', authenticateToken, validateCreateCoaching, createCoaching);

// Get all coaching centers for the authenticated user
router.get('/', authenticateToken, getUserCoachingCenters);

// Add a teacher to a coaching center (Owner only)
router.post('/add-teacher', authenticateToken, ownerOnly, validateAddTeacher, addTeacherToCoaching);

// Add a student to a coaching center (Owner only)
router.post('/add-student', authenticateToken, ownerOnly, validateAddStudent, addStudentToCoaching);

// SPECIFIC ROUTES BEFORE GENERIC /:coachingId ROUTE
// Get all teachers for a coaching center
router.get('/:coachingId/teachers', authenticateToken, validateCoachingAccess, getTeachersByCoaching);

// Get all students for a coaching center
router.get('/:coachingId/students', authenticateToken, validateCoachingAccess, getStudentsByCoaching);

// Get coaching statistics (student, teacher, batch counts)
router.get('/:coachingId/stats', authenticateToken, validateCoachingAccess, getCoachingStats);

// Get coaching audit logs (activity history)
router.get('/:coachingId/audit-logs', authenticateToken, validateCoachingAccess, getCoachingAuditLogs);

// Update a student (Owner only)
router.put('/:coachingId/students/:studentId', authenticateToken, ownerOnly, validateCoachingAccess, updateStudent);

// Delete a student from coaching (Owner only)
router.delete('/:coachingId/students/:studentId', authenticateToken, ownerOnly, validateCoachingAccess, deleteStudent);

// Update coaching center phone (Owner only) - DEPRECATED, use PUT for full details
router.patch('/:coachingId', authenticateToken, ownerOnly, validateCoachingAccess, validateUpdateCoachingPhone, updateCoachingPhone);

// Update coaching center details (phone, name, address, description) - Owner only
router.put('/:coachingId', authenticateToken, ownerOnly, validateCoachingAccess, validateUpdateCoachingDetails, updateCoachingDetails);

// Generic route - MUST BE LAST
// Get coaching center by ID
router.get('/:coachingId', authenticateToken, getCoachingById);

// Deactivate a coaching center (Owner only)
router.delete('/:coachingId', authenticateToken, ownerOnly, deactivateCoaching);

module.exports = router;