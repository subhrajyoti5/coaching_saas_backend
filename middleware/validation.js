const { body, validationResult } = require('express-validator');
const { HTTP_STATUS } = require('../config/constants');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Validation failed',
      message: 'Invalid input data',
      details: errors.array()
    });
  }
  next();
};

const validateUserRegistration = [
  // NO LONGER USED FOR PUBLIC SIGNUP
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
  body('firstName').trim().isLength({ min: 1 }).withMessage('First name is required'),
  body('lastName').trim().isLength({ min: 1 }).withMessage('Last name is required'),
  handleValidationErrors
];

const validateUserLogin = [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidationErrors
];

const validateCreateCoaching = [
  body('name').trim().isLength({ min: 1 }).withMessage('Coaching name is required'),
  body('description').optional().trim().isLength({ max: 500 }).withMessage('Description must be less than 500 characters'),
  handleValidationErrors
];

const validateAddTeacher = [
  // Changed from userId/UUID to email for the new onboarding flow
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('coachingId').isUUID().withMessage('Valid coaching ID is required'),
  handleValidationErrors
];

const validateAddStudent = [
  // Changed from userId/UUID to email for the new onboarding flow
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('coachingId').isUUID().withMessage('Valid coaching ID is required'),
  body('studentData').optional().isObject().withMessage('Student data must be an object'),
  handleValidationErrors
];

const validateCreateBatch = [
  body('name').trim().isLength({ min: 1 }).withMessage('Batch name is required'),
  body('coachingId').isUUID().withMessage('Valid coaching ID is required'),
  handleValidationErrors
];

const validateAssignTeacher = [
  body('teacherId').isUUID().withMessage('Valid teacher ID is required'),
  body('batchId').isUUID().withMessage('Valid batch ID is required'),
  handleValidationErrors
];

const validateAssignStudent = [
  body('studentId').isUUID().withMessage('Valid student profil ID is required'),
  body('batchId').isUUID().withMessage('Valid batch ID is required'),
  handleValidationErrors
];

const validateCreateTest = [
  body('title').trim().isLength({ min: 1 }).withMessage('Test title is required'),
  body('coachingId').isUUID().withMessage('Valid coaching ID is required'),
  body('batchId').isUUID().withMessage('Valid batch ID is required'),
  body('duration').isInt({ min: 1 }).withMessage('Duration must be a positive integer'),
  body('startDate').isISO8601().withMessage('Start date must be valid'),
  body('endDate').isISO8601().withMessage('End date must be valid'),
  body('maxScore').isFloat({ min: 0 }).withMessage('Max score must be non-negative'),
  handleValidationErrors
];

const validateCreateQuestion = [
  body('testId').isUUID().withMessage('Valid test ID is required'),
  body('questionText').trim().isLength({ min: 1 }).withMessage('Question text is required'),
  body('correctAnswer').isIn(['A', 'B', 'C', 'D']).withMessage('Correct answer must be A, B, C, or D'),
  handleValidationErrors
];

const validateCreateFee = [
  body('studentId').isUUID().withMessage('Valid student profile ID is required'),
  body('coachingId').isUUID().withMessage('Valid coaching ID is required'),
  body('amount').isFloat({ min: 0 }).withMessage('Amount must be non-negative'),
  handleValidationErrors
];

const validateCreateNotice = [
  body('coachingId').isUUID().withMessage('Valid coaching ID is required'),
  body('batchId').optional({ nullable: true }).isUUID().withMessage('batchId must be a valid UUID'),
  body('title').trim().isLength({ min: 1 }).withMessage('Notice title is required'),
  body('content').trim().isLength({ min: 1 }).withMessage('Notice content is required'),
  body('expiresAt').optional({ nullable: true }).isISO8601().withMessage('expiresAt must be a valid ISO date'),
  handleValidationErrors
];

const validateMarkBatchAttendance = [
  body('batchId').isUUID().withMessage('Valid batch ID is required'),
  body('classDate').optional().isISO8601().withMessage('classDate must be a valid ISO date'),
  body('records').isArray({ min: 1 }).withMessage('records must be a non-empty array'),
  body('records.*.studentId').isUUID().withMessage('Valid studentId is required for each record'),
  body('records.*.status').isIn(['PRESENT', 'ABSENT']).withMessage('status must be PRESENT or ABSENT'),
  body('records.*.remarks').optional({ nullable: true }).isString().withMessage('remarks must be a string'),
  handleValidationErrors
];

const validateUpdateAttendance = [
  body('status').isIn(['PRESENT', 'ABSENT']).withMessage('status must be PRESENT or ABSENT'),
  body('remarks').optional({ nullable: true }).isString().withMessage('remarks must be a string'),
  handleValidationErrors
];

module.exports = {
  validateUserRegistration,
  validateUserLogin,
  validateCreateCoaching,
  validateAddTeacher,
  validateAddStudent,
  validateCreateBatch,
  validateAssignTeacher,
  validateAssignStudent,
  validateCreateTest,
  validateCreateQuestion,
  validateCreateFee,
  validateCreateNotice,
  validateMarkBatchAttendance,
  validateUpdateAttendance
};