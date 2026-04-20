const feeService = require('../services/feeService');
const { HTTP_STATUS, SUCCESS_MESSAGES } = require('../config/constants');

const createFeeRecord = async (req, res) => {
  try {
    const fee = await feeService.createFeeRecord(req.body, req.user.userId);
    return res.status(HTTP_STATUS.CREATED).json({ message: SUCCESS_MESSAGES.OPERATION_SUCCESS, fee });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Failed to create fee record', message: error.message });
  }
};

// POST /:feeId/payment — logs a transaction; never overwrites paidAmount directly
const recordPayment = async (req, res) => {
  try {
    const { feeId } = req.params;
    const fee = await feeService.recordPayment(feeId, req.body, req.user.userId);
    return res.status(HTTP_STATUS.SUCCESS).json({ message: SUCCESS_MESSAGES.OPERATION_SUCCESS, fee });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Failed to record payment', message: error.message });
  }
};

// GET /my-fees — student gets their own fees from JWT
const getMyFees = async (req, res) => {
  try {
    const { userId } = req.user;
    const fees = await feeService.getStudentFees(userId);
    return res.status(HTTP_STATUS.SUCCESS).json({ fees });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch fees', message: error.message });
  }
};

const getStudentFees = async (req, res) => {
  try {
    const { studentId } = req.params;
    const fees = await feeService.getStudentFees(studentId);
    return res.status(HTTP_STATUS.SUCCESS).json({ fees });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch student fees', message: error.message });
  }
};

const getCoachingFees = async (req, res) => {
  try {
    const coachingId = req.coachingId || req.params.coachingId;
    const fees = await feeService.getCoachingFees(coachingId);
    return res.status(HTTP_STATUS.SUCCESS).json({ fees });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch coaching fees', message: error.message });
  }
};

const getCoachingFeeSummary = async (req, res) => {
  try {
    const coachingId = req.coachingId || req.params.coachingId;
    const summary = await feeService.getCoachingFeeSummary(coachingId);
    return res.status(HTTP_STATUS.SUCCESS).json({ summary });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch fee summary', message: error.message });
  }
};

const getFeeById = async (req, res) => {
  try {
    const { feeId } = req.params;
    const fee = await feeService.getFeeById(feeId);
    return res.status(HTTP_STATUS.SUCCESS).json({ fee });
  } catch (error) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Fee record not found', message: error.message });
  }
};

const updateFeeRecord = async (req, res) => {
  try {
    const { feeId } = req.params;
    const fee = await feeService.updateFeeRecord(feeId, req.body, req.user.userId);
    return res.status(HTTP_STATUS.SUCCESS).json({ message: SUCCESS_MESSAGES.OPERATION_SUCCESS, fee });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Failed to update fee record', message: error.message });
  }
};

const getFeeTransactions = async (req, res) => {
  try {
    const { feeId } = req.params;
    const transactions = await feeService.getFeeTransactions(feeId);
    return res.status(HTTP_STATUS.SUCCESS).json({ transactions });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch transactions', message: error.message });
  }
};

const getCoachingRevenue = async (req, res) => {
  try {
    const coachingId = req.coachingId || req.params.coachingId;
    const revenue = await feeService.getCoachingRevenue(coachingId);
    return res.status(HTTP_STATUS.SUCCESS).json({ revenue });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch revenue', message: error.message });
  }
};

const getCoachingStudentWiseRevenueReport = async (req, res) => {
  try {
    const coachingId = req.coachingId || req.params.coachingId;
    const segmentBy = req.query.segmentBy === 'batch' ? 'batch' : 'none';
    const report = await feeService.getCoachingStudentWiseRevenueReport(coachingId, {
      segmentBy,
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
      batchId: req.query.batchId
    });
    return res.status(HTTP_STATUS.SUCCESS).json({ report });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch student-wise revenue report',
      message: error.message
    });
  }
};

module.exports = {
  createFeeRecord,
  recordPayment,
  getMyFees,
  getStudentFees,
  getCoachingFees,
  getCoachingFeeSummary,
  getFeeById,
  updateFeeRecord,
  getFeeTransactions,
  getCoachingRevenue,
  getCoachingStudentWiseRevenueReport
};