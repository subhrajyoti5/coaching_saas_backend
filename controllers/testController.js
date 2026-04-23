const testService = require('../services/testService');
const { HTTP_STATUS, SUCCESS_MESSAGES } = require('../config/constants');

const createTest = async (req, res) => {
  try {
    const test = await testService.createTest(req.body, req.user);
    return res.status(HTTP_STATUS.CREATED).json({
      message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
      test
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to create test',
      message: error.message
    });
  }
};

const getTest = async (req, res) => {
  try {
    const { testId } = req.params;
    const test = await testService.getTestById(testId, req.user);
    return res.status(HTTP_STATUS.SUCCESS).json({ test });
  } catch (error) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      error: 'Test not found',
      message: error.message
    });
  }
};

const getTestsByCoaching = async (req, res) => {
  try {
    const coachingId = req.coachingId || req.params.coachingId;
    const tests = await testService.getTestsByCoaching(coachingId, req.user);
    return res.status(HTTP_STATUS.SUCCESS).json({ tests });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch tests',
      message: error.message
    });
  }
};

const getTestsByBatch = async (req, res) => {
  try {
    const { batchId } = req.params;
    const tests = await testService.getTestsByBatch(batchId);
    return res.status(HTTP_STATUS.SUCCESS).json({ tests });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch tests',
      message: error.message
    });
  }
};

const getMyUpcomingTests = async (req, res) => {
  try {
    const { userId, coachingId } = req.user;
    const tests = await testService.getMyUpcomingTests(userId, coachingId);
    return res.status(HTTP_STATUS.SUCCESS).json({ tests });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch upcoming tests',
      message: error.message
    });
  }
};

const addQuestionToTest = async (req, res) => {
  try {
    const question = await testService.addQuestionToTest(req.body, req.user);
    return res.status(HTTP_STATUS.CREATED).json({
      message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
      question
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to add question to test',
      message: error.message
    });
  }
};

const getQuestionsByTest = async (req, res) => {
  try {
    const { testId } = req.params;
    const questions = await testService.getQuestionsByTest(testId, req.user);
    return res.status(HTTP_STATUS.SUCCESS).json({ questions });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch questions',
      message: error.message
    });
  }
};

const getAttemptQuestions = async (req, res) => {
  try {
    const { testId } = req.params;
    const { userId } = req.user;
    const questions = await testService.getAttemptQuestions(testId, userId);
    return res.status(HTTP_STATUS.SUCCESS).json({ questions });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to fetch attempt questions',
      message: error.message
    });
  }
};

const startAttempt = async (req, res) => {
  try {
    const { testId } = req.body;
    const { userId } = req.user;
    const attempt = await testService.startAttempt(testId, userId);
    return res.status(HTTP_STATUS.SUCCESS).json({ attempt });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to start attempt',
      message: error.message
    });
  }
};

const submitTest = async (req, res) => {
  try {
    // Identity derived from JWT in the service layer
    const result = await testService.submitTest(req.body, req.user.userId);
    return res.status(HTTP_STATUS.SUCCESS).json({
      message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
      result
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to submit test',
      message: error.message
    });
  }
};

// GET /my-results
const getMyResults = async (req, res) => {
  try {
    const { userId, coachingId } = req.user;
    const results = await testService.getMyResults(userId, coachingId);
    return res.status(HTTP_STATUS.SUCCESS).json({ results });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch your results',
      message: error.message
    });
  }
};

const getStudentResults = async (req, res) => {
  try {
    const { studentId } = req.params;
    const results = await testService.getStudentResults(studentId);
    return res.status(HTTP_STATUS.SUCCESS).json({ results });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch student results',
      message: error.message
    });
  }
};

const getTestResults = async (req, res) => {
  try {
    const { testId } = req.params;
    const results = await testService.getTestResults(testId, req.user);
    return res.status(HTTP_STATUS.SUCCESS).json({ results });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch test results',
      message: error.message
    });
  }
};

const getTeacherLeaderboard = async (req, res) => {
  try {
    const { testId } = req.params;
    const coachingId = req.coachingId || req.user.coachingId;
    const leaderboard = await testService.getTeacherLeaderboard(testId, coachingId, req.user);
    return res.status(HTTP_STATUS.SUCCESS).json({ leaderboard });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to fetch leaderboard',
      message: error.message
    });
  }
};

const getStudentLeaderboard = async (req, res) => {
  try {
    const { testId } = req.params;
    const { userId, coachingId } = req.user;
    const leaderboard = await testService.getStudentLeaderboard(testId, userId, coachingId);
    return res.status(HTTP_STATUS.SUCCESS).json({ leaderboard });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to fetch leaderboard',
      message: error.message
    });
  }
};

const deleteTest = async (req, res) => {
  try {
    const { testId } = req.params;
    await testService.deactivateTest(testId, req.user);
    return res.status(HTTP_STATUS.SUCCESS).json({
      message: 'Test deactivated successfully'
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to delete test',
      message: error.message
    });
  }
};

const publishTest = async (req, res) => {
  try {
    const { testId } = req.params;
    const user = req.user;

    const test = await testService.publishTest(testId, user);

    return res.status(HTTP_STATUS.SUCCESS).json({
      message: 'Test published successfully',
      test
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to publish test',
      message: error.message
    });
  }
};

const getCoachingStudentPerformance = async (req, res) => {
  try {
    const coachingId = req.coachingId || req.params.coachingId;
    const performance = await testService.getCoachingStudentPerformance(coachingId);
    return res.status(HTTP_STATUS.SUCCESS).json({ performance });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to fetch student performance',
      message: error.message
    });
  }
};

// ============ PAPER-BASED TEST FUNCTIONS ============

const uploadQuestionPaper = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Question paper file is required'
      });
    }

    const { testId } = req.body;
    if (!testId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Test ID is required'
      });
    }

    const result = await testService.uploadQuestionPaper(
      testId,
      req.file,
      req.user
    );

    return res.status(HTTP_STATUS.SUCCESS).json({
      message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
      test: result
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to upload question paper',
      message: error.message
    });
  }
};

const submitAnswerSheet = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Answer sheet file is required'
      });
    }

    const { testId } = req.body;
    if (!testId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Test ID is required'
      });
    }

    const result = await testService.submitAnswerSheet(
      testId,
      req.file,
      req.user
    );

    return res.status(HTTP_STATUS.SUCCESS).json({
      message: 'Answer sheet submitted successfully',
      attempt: result
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to submit answer sheet',
      message: error.message
    });
  }
};

const getTestSubmissions = async (req, res) => {
  try {
    const { testId } = req.params;
    const submissions = await testService.getTestSubmissions(testId, req.user);
    
    return res.status(HTTP_STATUS.SUCCESS).json({
      submissions
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to fetch test submissions',
      message: error.message
    });
  }
};

const reviewTestAttempt = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const { marksAwarded, feedback } = req.body;

    if (marksAwarded === undefined || marksAwarded === null) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Marks awarded is required'
      });
    }

    const result = await testService.reviewTestAttempt(
      attemptId,
      marksAwarded,
      feedback,
      req.user
    );

    return res.status(HTTP_STATUS.SUCCESS).json({
      message: 'Test attempt reviewed successfully',
      attempt: result
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to review test attempt',
      message: error.message
    });
  }
};

module.exports = {
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
};