const { HTTP_STATUS } = require('../config/constants');

/**
 * Validation middleware for AI Test Studio endpoints
 */

const validateTestCreation = (req, res, next) => {
  const { title, totalMarks, durationMinutes, mode, questionIds } = req.body;

  const errors = [];

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    errors.push('Title is required and must be non-empty string');
  }

  if (!totalMarks || totalMarks <= 0 || !Number.isInteger(totalMarks)) {
    errors.push('Total marks must be a positive integer');
  }

  if (!durationMinutes || durationMinutes <= 0 || !Number.isInteger(durationMinutes)) {
    errors.push('Duration must be a positive integer (in minutes)');
  }

  if (!mode || !['PRACTICE', 'TEST'].includes(mode)) {
    errors.push('Mode must be either PRACTICE or TEST');
  }

  if (!questionIds || !Array.isArray(questionIds) || questionIds.length === 0) {
    errors.push('At least one question must be selected');
  }

  if (errors.length > 0) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Validation error',
      messages: errors,
    });
  }

  next();
};

const validateTestUpdate = (req, res, next) => {
  const { title, totalMarks, durationMinutes, mode, passMarks, questionIds } = req.body;

  const errors = [];

  if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0)) {
    errors.push('Title must be non-empty string');
  }

  if (totalMarks !== undefined && (totalMarks <= 0 || !Number.isInteger(totalMarks))) {
    errors.push('Total marks must be a positive integer');
  }

  if (durationMinutes !== undefined && (durationMinutes <= 0 || !Number.isInteger(durationMinutes))) {
    errors.push('Duration must be a positive integer (in minutes)');
  }

  if (mode !== undefined && !['PRACTICE', 'TEST'].includes(mode)) {
    errors.push('Mode must be either PRACTICE or TEST');
  }

  if (passMarks !== undefined && (passMarks < 0 || passMarks > 100)) {
    errors.push('Pass marks must be between 0 and 100');
  }

  if (questionIds !== undefined) {
    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      errors.push('Question IDs must be a non-empty array');
    }
  }

  if (errors.length > 0) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Validation error',
      messages: errors,
    });
  }

  next();
};

const validateQuestionCreation = (req, res, next) => {
  const { questionText, options, correctOptionIds, marks, difficultyLevel } = req.body;

  const errors = [];

  if (!questionText || typeof questionText !== 'string' || questionText.trim().length === 0) {
    errors.push('Question text is required');
  }

  if (!options || !Array.isArray(options) || options.length < 2) {
    errors.push('At least 2 options are required');
  }

  if (options && !options.every((o) => typeof o === 'string' && o.trim().length > 0)) {
    errors.push('All options must be non-empty strings');
  }

  if (!correctOptionIds || !Array.isArray(correctOptionIds) || correctOptionIds.length === 0) {
    errors.push('At least one correct option must be specified');
  }

  if (!marks || marks <= 0 || !Number.isInteger(marks)) {
    errors.push('Marks must be a positive integer');
  }

  if (difficultyLevel && !['EASY', 'MEDIUM', 'HARD'].includes(difficultyLevel)) {
    errors.push('Difficulty level must be EASY, MEDIUM, or HARD');
  }

  if (errors.length > 0) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Validation error',
      messages: errors,
    });
  }

  next();
};

const validateSyllabusUpload = (req, res, next) => {
  const { name, storageUrls } = req.body;

  const errors = [];

  if (!storageUrls || !Array.isArray(storageUrls) || storageUrls.length === 0) {
    errors.push('At least one file URL is required');
  }

  if (storageUrls && !storageUrls.every((url) => typeof url === 'string' && url.trim().length > 0)) {
    errors.push('All file URLs must be valid non-empty strings');
  }

  if (errors.length > 0) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Validation error',
      messages: errors,
    });
  }

  next();
};

const validateTestSubmission = (req, res, next) => {
  const { answers, timeTakenSeconds } = req.body;

  const errors = [];

  if (!answers || !Array.isArray(answers)) {
    errors.push('Answers must be an array');
  }

  if (answers && answers.length === 0) {
    errors.push('At least one answer is required');
  }

  if (answers && !answers.every((a) => a.questionId && Array.isArray(a.selectedOptionIds))) {
    errors.push('Each answer must have questionId and selectedOptionIds array');
  }

  if (timeTakenSeconds !== undefined && (timeTakenSeconds < 0 || !Number.isInteger(timeTakenSeconds))) {
    errors.push('Time taken must be a non-negative integer (seconds)');
  }

  if (errors.length > 0) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Validation error',
      messages: errors,
    });
  }

  next();
};

module.exports = {
  validateTestCreation,
  validateTestUpdate,
  validateQuestionCreation,
  validateSyllabusUpload,
  validateTestSubmission,
};
