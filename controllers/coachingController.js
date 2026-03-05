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

// Update student profile (name)
const updateStudent = async (req, res) => {
  try {
    const { coachingId, studentId } = req.params;
    const { firstName, lastName } = req.body;
    const updated = await coachingService.updateStudentProfile(studentId, coachingId, { firstName, lastName }, req.user.userId);
    return res.status(HTTP_STATUS.SUCCESS).json({
      message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
      student: updated
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to update student',
      message: error.message
    });
  }
};

// Delete student from coaching center
const deleteStudent = async (req, res) => {
  try {
    const { coachingId, studentId } = req.params;
    const result = await coachingService.removeStudentFromCoaching(studentId, coachingId, req.user.userId);
    return res.status(HTTP_STATUS.SUCCESS).json({
      message: 'Student removed successfully',
      ...result
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to remove student',
      message: error.message
    });
  }
};

// Get coaching center statistics (counts)
const getCoachingStats = async (req, res) => {
  try {
    const { coachingId } = req.params;
    console.log('📊 Fetching stats for coaching:', coachingId);
    
    const stats = await coachingService.getCoachingStats(coachingId);
    console.log('✅ Stats fetched:', stats);
    
    return res.status(HTTP_STATUS.SUCCESS).json({ stats });
  } catch (error) {
    console.error('❌ Error fetching coaching statistics:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch coaching statistics',
      message: error.message
    });
  }
};

// Get coaching center audit logs (activity history)
const getCoachingAuditLogs = async (req, res) => {
  try {
    const { coachingId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const logs = await coachingService.getCoachingAuditLogs(coachingId, limit);
    return res.status(HTTP_STATUS.SUCCESS).json({ logs });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch audit logs',
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
  updateStudent,
  deleteStudent,
  getCoachingStats,
  getCoachingAuditLogs,
  getTeachersByCoaching,
  getStudentsByCoaching,
  deactivateCoaching
};