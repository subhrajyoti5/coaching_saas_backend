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
  body('coachingId').isInt({ min: 1 }).withMessage('Valid coaching ID is required'),
  handleValidationErrors
];

const validateAddStudent = [
  // Changed from userId/UUID to email for the new onboarding flow
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('coachingId').isInt({ min: 1 }).withMessage('Valid coaching ID is required'),
  body('studentData').optional().isObject().withMessage('Student data must be an object'),
  handleValidationErrors
];

const validateOnboardingJoinRequest = [
  body('role').isIn(['STUDENT', 'TEACHER']).withMessage('Role must be STUDENT or TEACHER'),
  body('code').trim().isLength({ min: 4, max: 20 }).withMessage('Valid access code is required'),
  handleValidationErrors
];

const validateRoleOnly = [
  body('role').isIn(['STUDENT', 'TEACHER']).withMessage('Role must be STUDENT or TEACHER'),
  handleValidationErrors
];

const validateDeactivateCode = [
  body('codeId').isInt({ min: 1 }).withMessage('Valid codeId is required'),
  handleValidationErrors
];

const validateApproveSelectedStudents = [
  body('requestIds').isArray({ min: 1 }).withMessage('requestIds must be a non-empty array'),
  body('requestIds.*').isInt({ min: 1 }).withMessage('Each requestId must be a valid integer'),
  handleValidationErrors
];

const validateCreateBatch = [
  body('name').trim().isLength({ min: 1 }).withMessage('Batch name is required'),
  body('coachingId').isInt({ min: 1 }).withMessage('Valid coaching ID is required'),
  body('price').isInt({ min: 0 }).withMessage('Batch price must be a non-negative integer'),
  body('teacherIds').optional().isArray().withMessage('teacherIds must be an array'),
  body('teacherIds.*').optional().isInt({ min: 1 }).withMessage('Each teacherId must be a valid ID'),
  handleValidationErrors
];

const validateUpdateBatch = [
  body('name').optional().trim().isLength({ min: 1 }).withMessage('Batch name cannot be empty'),
  body('price').optional().isInt({ min: 0 }).withMessage('Batch price must be a non-negative integer'),
  handleValidationErrors
];

const validateAssignTeacher = [
  body('teacherId').isInt({ min: 1 }).withMessage('Valid teacher ID is required'),
  body('batchId').isInt({ min: 1 }).withMessage('Valid batch ID is required'),
  handleValidationErrors
];

const validateAssignStudent = [
  body('studentId').isInt({ min: 1 }).withMessage('Valid student ID is required'),
  body('batchId').isInt({ min: 1 }).withMessage('Valid batch ID is required'),
  handleValidationErrors
];

const validateCreateTest = [
  body('title').trim().isLength({ min: 1 }).withMessage('Test title is required'),
  body('coachingId').isInt({ min: 1 }).withMessage('Valid coaching ID is required'),
  body('batchIds').isArray({ min: 1 }).withMessage('At least one batch must be selected'),
  body('batchIds.*').isInt({ min: 1 }).withMessage('Each batchId must be a valid ID'),
  body('duration').isInt({ min: 1 }).withMessage('Duration must be a positive integer'),
  body('startDate').isISO8601().withMessage('Start date must be valid'),
  body('endDate').isISO8601().withMessage('End date must be valid'),
  body('maxScore').isFloat({ min: 0 }).withMessage('Max score must be non-negative'),
  handleValidationErrors
];

const validateCreateQuestion = [
  body('testId').isInt({ min: 1 }).withMessage('Valid test ID is required'),
  body('questionText').trim().isLength({ min: 1 }).withMessage('Question text is required'),
  body('optionA').trim().isLength({ min: 1 }).withMessage('Option A is required'),
  body('optionB').trim().isLength({ min: 1 }).withMessage('Option B is required'),
  body('optionC').trim().isLength({ min: 1 }).withMessage('Option C is required'),
  body('optionD').trim().isLength({ min: 1 }).withMessage('Option D is required'),
  body('correctAnswer').isIn(['A', 'B', 'C', 'D']).withMessage('Correct answer must be A, B, C, or D'),
  body('marks').optional().isFloat({ min: 0 }).withMessage('Marks must be non-negative'),
  body('durationSeconds').optional().isInt({ min: 1 }).withMessage('Duration seconds must be a positive integer'),
  handleValidationErrors
];

const validateCreateFee = [
  body('studentId').isInt({ min: 1 }).withMessage('Valid student ID is required'),
  body('coachingId').isInt({ min: 1 }).withMessage('Valid coaching ID is required'),
  body('amount').isFloat({ min: 0 }).withMessage('Amount must be non-negative'),
  handleValidationErrors
];

const validateCreatePaymentClaim = [
  body('batchId').isInt({ min: 1 }).withMessage('Valid batch ID is required'),
  body('note').optional({ nullable: true }).isString().withMessage('note must be a string'),
  body('proofUrl').optional({ nullable: true }).isString().withMessage('proofUrl must be a string'),
  body('amount').not().exists().withMessage('Amount is system-generated from batch price'),
  handleValidationErrors
];

const validateRejectPaymentClaim = [
  body('reason').optional({ nullable: true }).isString().withMessage('reason must be a string'),
  handleValidationErrors
];

const validateCreateNotice = [
  body('coachingId').isInt({ min: 1 }).withMessage('Valid coaching ID is required'),
  body('batchId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('batchId must be a valid ID'),
  body('title').trim().isLength({ min: 1 }).withMessage('Notice title is required'),
  body('content').trim().isLength({ min: 1 }).withMessage('Notice content is required'),
  body('expiresAt').optional({ nullable: true }).isISO8601().withMessage('expiresAt must be a valid ISO date'),
  handleValidationErrors
];

const validateMarkBatchAttendance = [
  body('batchId').isInt({ min: 1 }).withMessage('Valid batch ID is required'),
  body('classDate').optional().isISO8601().withMessage('classDate must be a valid ISO date'),
  body('records').isArray({ min: 1 }).withMessage('records must be a non-empty array'),
  body('records.*.studentId').isInt({ min: 1 }).withMessage('Valid studentId is required for each record'),
  body('records.*.status').isIn(['PRESENT', 'ABSENT', 'LATE']).withMessage('status must be PRESENT, ABSENT, or LATE'),
  body('records.*.remarks').optional({ nullable: true }).isString().withMessage('remarks must be a string'),
  handleValidationErrors
];

const validateUpdateAttendance = [
  body('status').isIn(['PRESENT', 'ABSENT', 'LATE']).withMessage('status must be PRESENT, ABSENT, or LATE'),
  body('remarks').optional({ nullable: true }).isString().withMessage('remarks must be a string'),
  handleValidationErrors
];

const validateUploadTeacherDocument = [
  body().custom((value) => {
    const hasBatchId = value?.batchId !== undefined && value?.batchId !== null && String(value.batchId).trim() !== '';
    const hasBatchIds = value?.batchIds !== undefined && value?.batchIds !== null && String(value.batchIds).trim() !== '';
    if (!hasBatchId && !hasBatchIds) {
      throw new Error('batchId or batchIds is required');
    }
    return true;
  }),
  body('batchId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Valid batch ID is required'),
  body('batchIds').optional({ nullable: true }).custom((value) => {
    let list = value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return true;
      try {
        list = JSON.parse(trimmed);
      } catch (_) {
        list = trimmed.split(',');
      }
    }

    if (!Array.isArray(list) || list.length === 0) {
      throw new Error('batchIds must be a non-empty array');
    }

    const allValid = list.every((id) => Number.isInteger(Number(id)) && Number(id) > 0);
    if (!allValid) {
      throw new Error('batchIds must contain valid batch IDs');
    }

    return true;
  }),
  body('title').trim().isLength({ min: 1, max: 120 }).withMessage('Title is required and must be under 120 characters'),
  body('description').optional({ nullable: true }).trim().isLength({ max: 1000 }).withMessage('Description must be under 1000 characters'),
  body('isSharedWithStudents').optional().isBoolean().withMessage('isSharedWithStudents must be true or false'),
  handleValidationErrors
];

const validateUpdateTeacherDocument = [
  body('title').optional().trim().isLength({ min: 1, max: 120 }).withMessage('Title must be under 120 characters'),
  body('description').optional({ nullable: true }).trim().isLength({ max: 1000 }).withMessage('Description must be under 1000 characters'),
  body('isSharedWithStudents').optional().isBoolean().withMessage('isSharedWithStudents must be true or false'),
  handleValidationErrors
];

module.exports = {
  validateUserRegistration,
  validateUserLogin,
  validateCreateCoaching,
  validateAddTeacher,
  validateAddStudent,
  validateOnboardingJoinRequest,
  validateRoleOnly,
  validateDeactivateCode,
  validateApproveSelectedStudents,
  validateCreateBatch,
  validateUpdateBatch,
  validateAssignTeacher,
  validateAssignStudent,
  validateCreateTest,
  validateCreateQuestion,
  validateCreateFee,
  validateCreatePaymentClaim,
  validateRejectPaymentClaim,
  validateCreateNotice,
  validateMarkBatchAttendance,
  validateUpdateAttendance,
  validateUploadTeacherDocument,
  validateUpdateTeacherDocument
};