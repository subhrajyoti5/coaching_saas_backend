const testService = require('../services/testService');
const { HTTP_STATUS, SUCCESS_MESSAGES } = require('../config/constants');
const prisma = require('../config/database');

const createTest = async (req, res) => {
  try {
    const test = await testService.createTest(req.body, req.user.userId);
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
    const test = await testService.getTestById(testId);
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
    const tests = await testService.getTestsByCoaching(coachingId);
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

const addQuestionToTest = async (req, res) => {
  try {
    const question = await testService.addQuestionToTest(req.body);
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
    const questions = await testService.getQuestionsByTest(testId);
    return res.status(HTTP_STATUS.SUCCESS).json({ questions });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch questions',
      message: error.message
    });
  }
};

const startAttempt = async (req, res) => {
  try {
    const { testId } = req.body;
    const { userId, coachingId } = req.user;

    const studentProfile = await prisma.studentProfile.findFirst({
      where: { userId, coachingId }
    });

    if (!studentProfile) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Student profile not found' });
    }

    const attempt = await testService.startAttempt(testId, studentProfile.id);
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
    const results = await testService.getTestResults(testId);
    return res.status(HTTP_STATUS.SUCCESS).json({ results });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch test results',
      message: error.message
    });
  }
};

const deleteTest = async (req, res) => {
  try {
    const { testId } = req.params;
    await testService.deactivateTest(testId, req.user.userId);
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

module.exports = {
  createTest,
  getTest,
  getTestsByCoaching,
  getTestsByBatch,
  addQuestionToTest,
  getQuestionsByTest,
  startAttempt,
  submitTest,
  getMyResults,
  getStudentResults,
  getTestResults,
  deleteTest
};