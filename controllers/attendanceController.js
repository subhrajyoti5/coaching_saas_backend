const attendanceService = require('../services/attendanceService');
const { HTTP_STATUS } = require('../config/constants');

const getMyTeacherBatches = async (req, res) => {
  try {
    const batches = await attendanceService.getMyTeacherBatches(
      req.user.userId,
      req.user.coachingId,
      req.user.role
    );
    return res.status(HTTP_STATUS.SUCCESS).json({ batches });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to fetch batches',
      message: error.message,
    });
  }
};

const markBatchAttendance = async (req, res) => {
  try {
    const result = await attendanceService.markBatchAttendance(req.body, req.user);
    return res.status(HTTP_STATUS.SUCCESS).json(result);
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to mark attendance',
      message: error.message,
    });
  }
};

const getBatchAttendanceByDate = async (req, res) => {
  try {
    const { batchId } = req.params;
    const { classDate } = req.query;
    const result = await attendanceService.getBatchAttendanceByDate(
      batchId,
      classDate,
      req.user
    );
    return res.status(HTTP_STATUS.SUCCESS).json(result);
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to fetch attendance',
      message: error.message,
    });
  }
};

const updateAttendance = async (req, res) => {
  try {
    const { attendanceId } = req.params;
    const result = await attendanceService.updateAttendance(
      attendanceId,
      req.body,
      req.user
    );
    return res.status(HTTP_STATUS.SUCCESS).json({ attendance: result });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to update attendance',
      message: error.message,
    });
  }
};

const getMyAttendance = async (req, res) => {
  try {
    const result = await attendanceService.getMyAttendance(req.user);
    return res.status(HTTP_STATUS.SUCCESS).json(result);
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to fetch attendance',
      message: error.message,
    });
  }
};

const getCoachingAttendanceSummary = async (req, res) => {
  try {
    const coachingId = req.user.coachingId;
    const summary = await attendanceService.getCoachingAttendanceSummary(coachingId);
    return res.status(HTTP_STATUS.SUCCESS).json({ summary });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to fetch attendance summary',
      message: error.message,
    });
  }
};

const getCoachingAttendanceDetails = async (req, res) => {
  try {
    const coachingId = req.coachingId || req.user.coachingId;
    const details = await attendanceService.getCoachingAttendanceDetails(coachingId);
    return res.status(HTTP_STATUS.SUCCESS).json({ details });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to fetch attendance details',
      message: error.message,
    });
  }
};

module.exports = {
  getMyTeacherBatches,
  markBatchAttendance,
  getBatchAttendanceByDate,
  updateAttendance,
  getMyAttendance,
  getCoachingAttendanceSummary,
  getCoachingAttendanceDetails,
};
