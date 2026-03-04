const coachingService = require('../services/coachingService');
const { HTTP_STATUS, SUCCESS_MESSAGES } = require('../config/constants');

const createCoaching = async (req, res) => {
  try {
    const coaching = await coachingService.createCoaching(req.body, req.user.userId);
    return res.status(HTTP_STATUS.CREATED).json({
      message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
      coaching
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to create coaching center',
      message: error.message
    });
  }
};

const getCoachingById = async (req, res) => {
  try {
    const { coachingId } = req.params;
    const coaching = await coachingService.getCoachingById(coachingId);
    return res.status(HTTP_STATUS.SUCCESS).json({ coaching });
  } catch (error) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      error: 'Coaching center not found',
      message: error.message
    });
  }
};

const getUserCoachingCenters = async (req, res) => {
  try {
    const coachingCenters = await coachingService.getUserCoachingCenters(req.user.userId);
    return res.status(HTTP_STATUS.SUCCESS).json({ coachingCenters });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch coaching centers',
      message: error.message
    });
  }
};

// ADD TEACHER BY EMAIL (NOW USED FOR ONBOARDING)
const addTeacherToCoaching = async (req, res) => {
  try {
    const { email, coachingId, teacherData } = req.body;
    const addedBy = req.user.userId;
    const assignment = await coachingService.addTeacherToCoaching(email, coachingId, addedBy, teacherData);
    return res.status(HTTP_STATUS.SUCCESS).json({
      message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
      assignment
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to add teacher to coaching',
      message: error.message
    });
  }
};

// ADD STUDENT BY EMAIL (NOW USED FOR ONBOARDING)
const addStudentToCoaching = async (req, res) => {
  try {
    const { email, coachingId, studentData } = req.body;
    const addedBy = req.user.userId;
    const { coachingUser, studentProfile } = await coachingService.addStudentToCoaching(
      email,
      coachingId,
      addedBy,
      studentData
    );
    return res.status(HTTP_STATUS.SUCCESS).json({
      message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
      coachingUser,
      studentProfile
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to add student to coaching',
      message: error.message
    });
  }
};

const getTeachersByCoaching = async (req, res) => {
  try {
    const { coachingId } = req.params;
    const teachers = await coachingService.getTeachersByCoaching(coachingId);
    return res.status(HTTP_STATUS.SUCCESS).json({ teachers });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch teachers',
      message: error.message
    });
  }
};

const getStudentsByCoaching = async (req, res) => {
  try {
    const { coachingId } = req.params;
    const students = await coachingService.getStudentsByCoaching(coachingId);
    return res.status(HTTP_STATUS.SUCCESS).json({ students });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch students',
      message: error.message
    });
  }
};

const deactivateCoaching = async (req, res) => {
  try {
    const { coachingId } = req.params;
    await coachingService.deactivateCoaching(coachingId, req.user.userId);
    return res.status(HTTP_STATUS.SUCCESS).json({
      message: 'Coaching deactivated successfully'
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to deactivate coaching',
      message: error.message
    });
  }
};

module.exports = {
  createCoaching,
  getCoachingById,
  getUserCoachingCenters,
  addTeacherToCoaching,
  addStudentToCoaching,
  getTeachersByCoaching,
  getStudentsByCoaching,
  deactivateCoaching
};