const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { teacherOrOwner, ownerOnly } = require('../middleware/roles');
const { validateCoachingAccess } = require('../middleware/coachingIsolation');
const { checkPremiumSubscription } = require('../middleware/subscriptionCheck');
const {
  validateTestCreation,
  validateTestUpdate,
  validateQuestionCreation,
  validateSyllabusUpload,
  validateTestSubmission,
} = require('../middleware/aiTestValidation');
const AiTestStudioController = require('../controllers/aiTestStudioController');

const router = express.Router({ mergeParams: true });

/**
 * AI Test Studio Routes
 * Base path: /api/coaching/:coachingId/ai-tests
 */

// ============ SYLLABUS ROUTES ============

/**
 * POST /api/coaching/:coachingId/ai-tests/syllabuses
 * Upload syllabus images for AI test generation
 * Premium feature: Requires active "Shixa Pro" subscription
 */
router.post(
  '/syllabuses',
  authenticateToken,
  teacherOrOwner,
  validateCoachingAccess,
  checkPremiumSubscription,
  validateSyllabusUpload,
  AiTestStudioController.uploadSyllabus
);

/**
 * GET /api/coaching/:coachingId/ai-tests/syllabuses/:syllabusId
 * Get uploaded syllabus details
 */
router.get(
  '/syllabuses/:syllabusId',
  authenticateToken,
  teacherOrOwner,
  validateCoachingAccess,
  AiTestStudioController.getSyllabus
);

// ============ AI GENERATION ROUTES ============

/**
 * POST /api/coaching/:coachingId/ai-tests/generate
 * Trigger AI test generation
 * Premium feature: Requires active "Shixa Pro" subscription
 */
router.post(
  '/generate',
  authenticateToken,
  teacherOrOwner,
  validateCoachingAccess,
  checkPremiumSubscription,
  AiTestStudioController.triggerAiGeneration
);

/**
 * GET /api/coaching/:coachingId/ai-tests/generate/:generationId/status
 * Poll AI generation status
 */
router.get(
  '/generate/:generationId/status',
  authenticateToken,
  teacherOrOwner,
  validateCoachingAccess,
  AiTestStudioController.getAiGenerationStatus
);

// ============ QUESTION MANAGEMENT ROUTES ============

/**
 * POST /api/coaching/:coachingId/ai-tests/questions
 * Create question (from AI or manual)
 * Premium feature: Requires active "Shixa Pro" subscription
 */
router.post(
  '/questions',
  authenticateToken,
  teacherOrOwner,
  validateCoachingAccess,
  checkPremiumSubscription,
  validateQuestionCreation,
  AiTestStudioController.createQuestion
);

/**
 * PUT /api/coaching/:coachingId/ai-tests/questions/:questionId
 * Edit question
 */
router.put(
  '/questions/:questionId',
  authenticateToken,
  teacherOrOwner,
  validateCoachingAccess,
  AiTestStudioController.updateQuestion
);

/**
 * GET /api/coaching/:coachingId/ai-tests/questions/bank
 * Get question bank (all questions created by teacher)
 * Query params: ?subjectId=x&difficultyLevel=MEDIUM&skip=0&limit=20
 */
router.get(
  '/questions/bank',
  authenticateToken,
  teacherOrOwner,
  validateCoachingAccess,
  AiTestStudioController.getQuestionBank
);

/**
 * DELETE /api/coaching/:coachingId/ai-tests/questions/:questionId
 * Delete question from bank
 */
router.delete(
  '/questions/:questionId',
  authenticateToken,
  teacherOrOwner,
  validateCoachingAccess,
  AiTestStudioController.deleteQuestion
);

// ============ TEST MANAGEMENT ROUTES ============

/**
 * POST /api/coaching/:coachingId/ai-tests/tests
 * Create test
 * Premium feature: Requires active "Shixa Pro" subscription
 */
router.post(
  '/tests',
  authenticateToken,
  teacherOrOwner,
  validateCoachingAccess,
  checkPremiumSubscription,
  validateTestCreation,
  AiTestStudioController.createTest
);

/**
 * POST /api/coaching/:coachingId/ai-tests/tests/:testId/publish
 * Publish test to students
 * Premium feature: Requires active "Shixa Pro" subscription
 */
router.post(
  '/tests/:testId/publish',
  authenticateToken,
  teacherOrOwner,
  validateCoachingAccess,
  checkPremiumSubscription,
  AiTestStudioController.publishTest
);

/**
 * GET /api/coaching/:coachingId/ai-tests/tests
 * List tests created by teacher
 * Query params: ?batchId=x&skip=0&limit=20
 */
router.get(
  '/tests',
  authenticateToken,
  teacherOrOwner,
  validateCoachingAccess,
  AiTestStudioController.listTests
);

/**
 * PUT /api/coaching/:coachingId/ai-tests/tests/:testId
 * Edit test details
 * Note: Cannot edit if students have already attempted
 */
router.put(
  '/tests/:testId',
  authenticateToken,
  teacherOrOwner,
  validateCoachingAccess,
  checkPremiumSubscription,
  validateTestUpdate,
  AiTestStudioController.editTest
);

/**
 * POST /api/coaching/:coachingId/ai-tests/tests/:testId/duplicate
 * Duplicate test (creates a copy with "(Copy)" suffix)
 */
router.post(
  '/tests/:testId/duplicate',
  authenticateToken,
  teacherOrOwner,
  validateCoachingAccess,
  checkPremiumSubscription,
  AiTestStudioController.duplicateTest
);

/**
 * DELETE /api/coaching/:coachingId/ai-tests/tests/:testId
 * Delete test
 * Note: Cannot delete if students have already attempted
 */
router.delete(
  '/tests/:testId',
  authenticateToken,
  teacherOrOwner,
  validateCoachingAccess,
  checkPremiumSubscription,
  AiTestStudioController.deleteTest
);

// ============ TEST ATTEMPT ROUTES (STUDENT) ============

/**
 * POST /api/coaching/:coachingId/ai-tests/tests/:testId/attempts
 * Start test attempt (student)
 */
router.post(
  '/tests/:testId/attempts',
  authenticateToken,
  AiTestStudioController.startTestAttempt
);

/**
 * POST /api/coaching/:coachingId/ai-tests/tests/:testId/attempts/:attemptId/submit
 * Submit test attempt (student)
 * Body: { answers: [{ questionId, selectedOptionIds, correctOptionIds }] }
 */
router.post(
  '/tests/:testId/attempts/:attemptId/submit',
  authenticateToken,
  AiTestStudioController.submitTestAttempt
);

/**
 * GET /api/coaching/:coachingId/ai-tests/attempts/:attemptId/result
 * Get test result (student or teacher view)
 * Rules:
 * - PRACTICE mode: Always show answers + explanation
 * - TEST mode: Show answers only after teacher publishes results
 */
router.get(
  '/attempts/:attemptId/result',
  authenticateToken,
  AiTestStudioController.getAttemptResult
);

// ============ PHASE 3: STUDENT TEST-TAKING ROUTES ============

/**
 * GET /api/coaching/:coachingId/ai-tests/tests/:testId/attempt
 * Get test details for student attempt
 * Query params: ?batchId=x
 */
router.get(
  '/tests/:testId/attempt',
  authenticateToken,
  AiTestStudioController.getTestForAttempt
);

/**
 * POST /api/coaching/:coachingId/ai-tests/tests/:testId/attempts/:attemptId/submit-enhanced
 * Enhanced test submission with answer tracking and grading
 * Body: { answers: [{ questionId, selectedOptionIds }], timeTakenSeconds }
 */
router.post(
  '/tests/:testId/attempts/:attemptId/submit-enhanced',
  authenticateToken,
  validateTestSubmission,
  AiTestStudioController.submitTestAttemptEnhanced
);

/**
 * GET /api/coaching/:coachingId/ai-tests/tests/:testId/attempts
 * Get all attempts by student for a test
 */
router.get(
  '/tests/:testId/attempts',
  authenticateToken,
  AiTestStudioController.getStudentAttempts
);

// ============ PHASE 4: ANALYTICS ROUTES ============

/**
 * GET /api/coaching/:coachingId/ai-tests/analytics/tests/:testId
 * Get test-level analytics
 */
router.get(
  '/analytics/tests/:testId',
  authenticateToken,
  teacherOrOwner,
  validateCoachingAccess,
  AiTestStudioController.getTestAnalytics
);

/**
 * GET /api/coaching/:coachingId/ai-tests/analytics/questions/:questionId
 * Get question-level analytics
 */
router.get(
  '/analytics/questions/:questionId',
  authenticateToken,
  teacherOrOwner,
  validateCoachingAccess,
  AiTestStudioController.getQuestionAnalytics
);

/**
 * GET /api/coaching/:coachingId/ai-tests/analytics/teacher/dashboard
 * Get teacher dashboard with all statistics
 */
router.get(
  '/analytics/teacher/dashboard',
  authenticateToken,
  teacherOrOwner,
  validateCoachingAccess,
  AiTestStudioController.getTeacherDashboard
);

/**
 * GET /api/coaching/:coachingId/ai-tests/analytics/student/dashboard
 * Get student dashboard with attempts and scores
 * Query params: ?batchId=x
 */
router.get(
  '/analytics/student/dashboard',
  authenticateToken,
  AiTestStudioController.getStudentDashboard
);

// ============ PHASE 5: FLUTTER-SPECIFIC ENDPOINTS ============

/**
 * GET /api/coaching/:coachingId/ai-tests/flutter/result/:attemptId
 * Get test result formatted for Flutter app
 * Includes visibility rules for PRACTICE vs TEST mode
 */
router.get(
  '/flutter/result/:attemptId',
  authenticateToken,
  AiTestStudioController.getTestResultForFlutter
);

/**
 * GET /api/coaching/:coachingId/ai-tests/flutter/tests
 * Get all available tests for student in Flutter
 * Query params: ?batchId=x
 */
router.get(
  '/flutter/tests',
  authenticateToken,
  AiTestStudioController.getTestsForStudentFlutter
);

module.exports = router;
