const express = require('express');
const router = express.Router();
const {
  createTest,
  getTest,
  getTestsByCoaching,
  getTestsByBatch,
  getMyUpcomingTests,
  addQuestionToTest,
  getQuestionsByTest,
  startAttempt,
  submitTest,
  getMyResults,
  getStudentResults,
  getTestResults,
  deleteTest,
  publishTest
} = require('../controllers/testController');
const { authenticateToken } = require('../middleware/auth');
const { ownerOnly, teacherOnly, teacherOrOwner, studentOrOwner, studentOnly } = require('../middleware/roles');
const { validateCoachingAccess, validateStudentAccess } = require('../middleware/coachingIsolation');
const { validateCreateTest, validateCreateQuestion } = require('../middleware/validation');

// Protected routes
// Create a new test (Owner and Teacher can access)
router.post('/', authenticateToken, teacherOrOwner, validateCreateTest, createTest);

// Get all tests for a coaching center (Owner and Teacher can access)
router.get('/coaching/:coachingId', authenticateToken, teacherOrOwner, validateCoachingAccess, getTestsByCoaching);

// Get all tests for a batch (Owner, Teacher, and Student can access)
router.get('/batch/:batchId', authenticateToken, studentOrOwner, getTestsByBatch);

// Get upcoming tests for the authenticated student
router.get('/my-upcoming', authenticateToken, studentOnly, getMyUpcomingTests);

// Add a question to a test (Owner and Teacher can access)
router.post('/question', authenticateToken, teacherOrOwner, validateCreateQuestion, addQuestionToTest);

// Get all questions for a test (Owner, Teacher, and Student can access)
router.get('/:testId/questions', authenticateToken, studentOrOwner, getQuestionsByTest);

// Start a test attempt (Locked against multiple active attempts)
router.post('/start-attempt', authenticateToken, studentOrOwner, startAttempt);

// Submit test answers and calculate result (Locked against resubmission)
router.post('/submit', authenticateToken, studentOrOwner, submitTest);

// Get my results (extracted from JWT)
router.get('/my-results', authenticateToken, studentOrOwner, getMyResults);

// Get test by ID (Owner, Teacher, and Student can access)
router.get('/:testId', authenticateToken, studentOrOwner, getTest);

// Get test results for a specific student (Owner, Teacher can access)
router.get('/results/student/:studentId', authenticateToken, teacherOrOwner, validateStudentAccess, getStudentResults);

// Get test results for a specific test (Owner and Teacher can access)
router.get('/:testId/results', authenticateToken, teacherOrOwner, getTestResults);

// Publish a test (Owner and Teacher can access)
router.patch('/:testId/publish', authenticateToken, teacherOrOwner, publishTest);

// Soft delete a test
router.delete('/:testId', authenticateToken, teacherOrOwner, deleteTest);

module.exports = router;