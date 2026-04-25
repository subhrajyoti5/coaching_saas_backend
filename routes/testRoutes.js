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
  getAttemptQuestions,
  startAttempt,
  submitTest,
  getMyResults,
  getStudentResults,
  getTestResults,
  getTeacherLeaderboard,
  getStudentLeaderboard,
  deleteTest,
  publishTest,
  getCoachingStudentPerformance,
  uploadQuestionPaper,
  submitAnswerSheet,
  getTestSubmissions,
  reviewTestAttempt
} = require('../controllers/testController');
const { authenticateToken } = require('../middleware/auth');
const { ownerOnly, teacherOnly, teacherOrOwner, studentOrOwner, studentOnly } = require('../middleware/roles');
const { validateCoachingAccess, validateStudentAccess } = require('../middleware/coachingIsolation');
const { validateCreateTest, validateCreateQuestion } = require('../middleware/validation');
const { uploadTeacherDocument } = require('../middleware/upload');
const { validateBillingAccess } = require('../middleware/billingAccess');

// Protected routes
// Create a new test (Owner and Teacher can access)
router.post('/', authenticateToken, teacherOrOwner, validateCreateTest, createTest);

// Get all tests for a coaching center (Owner and Teacher can access)
router.get('/coaching/:coachingId', authenticateToken, teacherOrOwner, validateCoachingAccess, getTestsByCoaching);

// Get student performance for a coaching center (Owner and Teacher can access)
router.get('/coaching/:coachingId/performance', authenticateToken, teacherOrOwner, validateCoachingAccess, getCoachingStudentPerformance);

// Get all tests for a batch (Owner, Teacher, and Student can access)
router.get('/batch/:batchId', authenticateToken, studentOrOwner, validateBillingAccess, getTestsByBatch);

// Get upcoming tests for the authenticated student
router.get('/my-upcoming', authenticateToken, studentOnly, validateBillingAccess, getMyUpcomingTests);

// Add a question to a test (Owner and Teacher can access)
router.post('/question', authenticateToken, teacherOrOwner, validateCreateQuestion, addQuestionToTest);

// Get all questions for a test (Owner and Teacher can access)
router.get('/:testId/questions', authenticateToken, teacherOrOwner, getQuestionsByTest);

// Get student-safe attempt questions for a test (student-only)
router.get('/:testId/attempt-questions', authenticateToken, studentOnly, validateBillingAccess, getAttemptQuestions);

// Start a test attempt (student-only)
router.post('/start-attempt', authenticateToken, studentOnly, validateBillingAccess, startAttempt);

// Submit test answers and calculate result (student-only)
router.post('/submit', authenticateToken, studentOnly, validateBillingAccess, submitTest);

// Get my results (extracted from JWT)
router.get('/my-results', authenticateToken, studentOrOwner, getMyResults);

// Get test by ID (Owner and Teacher can access)
router.get('/:testId', authenticateToken, teacherOrOwner, getTest);

// Get test results for a specific student (Owner, Teacher can access)
router.get('/results/student/:studentId', authenticateToken, teacherOrOwner, validateStudentAccess, getStudentResults);

// Get test results for a specific test (Owner and Teacher can access)
router.get('/:testId/results', authenticateToken, teacherOrOwner, getTestResults);

// Teacher/Owner leaderboard view: full ranking list
router.get('/:testId/leaderboard', authenticateToken, teacherOrOwner, getTeacherLeaderboard);

// Student leaderboard view: top 5 scores + own rank
router.get('/:testId/my-leaderboard', authenticateToken, studentOnly, validateBillingAccess, getStudentLeaderboard);

// Publish a test (Owner and Teacher can access)
router.patch('/:testId/publish', authenticateToken, teacherOrOwner, publishTest);

// Soft delete a test
router.delete('/:testId', authenticateToken, teacherOrOwner, deleteTest);

// ============ PAPER-BASED TEST ROUTES ============

// Upload question paper for a test (Teacher/Owner only)
router.post('/upload-question-paper', authenticateToken, teacherOrOwner, uploadTeacherDocument.single('file'), uploadQuestionPaper);

// Submit answer sheet for a test (Student only)
router.post('/submit-answer-sheet', authenticateToken, studentOnly, validateBillingAccess, uploadTeacherDocument.single('file'), submitAnswerSheet);

// Get all submissions for a test (Teacher/Owner only)
router.get('/:testId/submissions', authenticateToken, teacherOrOwner, getTestSubmissions);

// Review a test attempt (Teacher/Owner only)
router.patch('/attempts/:attemptId/review', authenticateToken, teacherOrOwner, reviewTestAttempt);

module.exports = router;