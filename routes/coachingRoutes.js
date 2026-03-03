const express = require('express');
const router = express.Router();
const {
  createCoaching,
  getCoachingById,
  getUserCoachingCenters,
  addTeacherToCoaching,
  addStudentToCoaching,
  getTeachersByCoaching,
  getStudentsByCoaching,
  deactivateCoaching
} = require('../controllers/coachingController');
const { authenticateToken } = require('../middleware/auth');
const { ownerOnly } = require('../middleware/roles');
const { validateCoachingAccess } = require('../middleware/coachingIsolation');
const { validateCreateCoaching, validateAddTeacher, validateAddStudent } = require('../middleware/validation');

// Protected routes
// Create a new coaching center (Any authenticated user can create one and become an owner)
router.post('/', authenticateToken, validateCreateCoaching, createCoaching);

// Get coaching center by ID
router.get('/:coachingId', authenticateToken, getCoachingById);

// Get all coaching centers for the authenticated user
router.get('/', authenticateToken, getUserCoachingCenters);

// Add a teacher to a coaching center (Owner only)
router.post('/add-teacher', authenticateToken, ownerOnly, validateAddTeacher, addTeacherToCoaching);

// Add a student to a coaching center (Owner only)
router.post('/add-student', authenticateToken, ownerOnly, validateAddStudent, addStudentToCoaching);

// Get all teachers for a coaching center
router.get('/:coachingId/teachers', authenticateToken, validateCoachingAccess, getTeachersByCoaching);

// Get all students for a coaching center
router.get('/:coachingId/students', authenticateToken, validateCoachingAccess, getStudentsByCoaching);

// Deactivate a coaching center (Owner only)
router.delete('/:coachingId', authenticateToken, ownerOnly, deactivateCoaching);

module.exports = router;