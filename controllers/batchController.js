const batchService = require('../services/batchService');
const { HTTP_STATUS, SUCCESS_MESSAGES } = require('../config/constants');

const createBatch = async (req, res) => {
  try {
    const batch = await batchService.createBatch(req.body, req.user.userId);
    return res.status(HTTP_STATUS.CREATED).json({
      message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
      batch
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to create batch',
      message: error.message
    });
  }
};

const getBatch = async (req, res) => {
  try {
    const { batchId } = req.params;
    const batch = await batchService.getBatchById(batchId);
    return res.status(HTTP_STATUS.SUCCESS).json({ batch });
  } catch (error) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      error: 'Batch not found',
      message: error.message
    });
  }
};

const getBatchesByCoaching = async (req, res) => {
  try {
    const coachingId = req.coachingId || req.params.coachingId;
    const batches = await batchService.getBatchesByCoaching(coachingId);
    return res.status(HTTP_STATUS.SUCCESS).json({ batches });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch batches',
      message: error.message
    });
  }
};

const assignTeacherToBatch = async (req, res) => {
  try {
    const { teacherId, batchId } = req.body;
    const requesterId = req.user.userId;
    const assignment = await batchService.assignTeacherToBatch(teacherId, batchId, requesterId);
    return res.status(HTTP_STATUS.SUCCESS).json({
      message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
      assignment
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to assign teacher to batch',
      message: error.message
    });
  }
};

const removeTeacherFromBatch = async (req, res) => {
  try {
    const { teacherId, batchId } = req.body;
    const result = await batchService.removeTeacherFromBatch(teacherId, batchId, req.user.userId);
    return res.status(HTTP_STATUS.SUCCESS).json(result);
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to remove teacher from batch',
      message: error.message
    });
  }
};

const assignStudentToBatch = async (req, res) => {
  try {
    const { studentId, batchId } = req.body;
    const student = await batchService.assignStudentToBatch(studentId, batchId, req.user.userId);
    return res.status(HTTP_STATUS.SUCCESS).json({
      message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
      student
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to assign student to batch',
      message: error.message
    });
  }
};

const removeStudentFromBatch = async (req, res) => {
  try {
    const { studentId } = req.body;
    const student = await batchService.removeStudentFromBatch(studentId, req.user.userId);
    return res.status(HTTP_STATUS.SUCCESS).json({
      message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
      student
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to remove student from batch',
      message: error.message
    });
  }
};

const getTeachersByBatch = async (req, res) => {
  try {
    const { batchId } = req.params;
    const teachers = await batchService.getTeachersByBatch(batchId);
    return res.status(HTTP_STATUS.SUCCESS).json({ teachers });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch teachers',
      message: error.message
    });
  }
};

const getStudentsByBatch = async (req, res) => {
  try {
    const { batchId } = req.params;
    const students = await batchService.getStudentsByBatch(batchId);
    return res.status(HTTP_STATUS.SUCCESS).json({ students });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch students',
      message: error.message
    });
  }
};

const deleteBatch = async (req, res) => {
  try {
    const { batchId } = req.params;
    await batchService.deactivateBatch(batchId, req.user.userId);
    return res.status(HTTP_STATUS.SUCCESS).json({
      message: 'Batch deactivated successfully'
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to delete batch',
      message: error.message
    });
  }
};

module.exports = {
  createBatch,
  getBatch,
  getBatchesByCoaching,
  assignTeacherToBatch,
  removeTeacherFromBatch,
  assignStudentToBatch,
  removeStudentFromBatch,
  getTeachersByBatch,
  getStudentsByBatch,
  deleteBatch
};