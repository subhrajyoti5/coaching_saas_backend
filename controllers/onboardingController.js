const onboardingService = require('../services/onboardingService');
const { HTTP_STATUS } = require('../config/constants');

const createJoinRequest = async (req, res) => {
  try {
    const { role, code } = req.body;
    const result = await onboardingService.createJoinRequest({
      onboardingUser: req.onboardingUser,
      role,
      code
    });

    return res.status(HTTP_STATUS.CREATED).json({
      message: 'Join request processed',
      ...result
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Join request failed',
      message: error.message
    });
  }
};

const getJoinRequestStatus = async (req, res) => {
  try {
    const requests = await onboardingService.getJoinRequestStatus({
      onboardingUser: req.onboardingUser
    });

    return res.status(HTTP_STATUS.SUCCESS).json({
      requests
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to fetch join request status',
      message: error.message
    });
  }
};

const generateAccessCode = async (req, res) => {
  try {
    const { role } = req.body;
    const result = await onboardingService.generateAccessCode({
      ownerId: req.user.userId,
      coachingId: req.coachingId,
      role
    });

    return res.status(HTTP_STATUS.CREATED).json({
      message: 'Access code generated',
      accessCode: result
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to generate access code',
      message: error.message
    });
  }
};

const getActiveAccessCodes = async (req, res) => {
  try {
    const accessCodes = await onboardingService.getActiveAccessCodes({
      coachingId: req.coachingId
    });

    return res.status(HTTP_STATUS.SUCCESS).json({ accessCodes });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to fetch active access codes',
      message: error.message
    });
  }
};

const deactivateAccessCode = async (req, res) => {
  try {
    const { codeId } = req.body;
    await onboardingService.deactivateAccessCode({
      ownerId: req.user.userId,
      coachingId: req.coachingId,
      codeId
    });

    return res.status(HTTP_STATUS.SUCCESS).json({
      message: 'Access code deactivated'
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to deactivate access code',
      message: error.message
    });
  }
};

const getPendingRequests = async (req, res) => {
  try {
    const requests = await onboardingService.getPendingRequests({
      coachingId: req.coachingId,
      role: req.query.role
    });

    return res.status(HTTP_STATUS.SUCCESS).json({ requests });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to fetch pending requests',
      message: error.message
    });
  }
};

const approveJoinRequest = async (req, res) => {
  try {
    const result = await onboardingService.approveJoinRequest({
      requestId: req.params.requestId,
      ownerId: req.user.userId,
      coachingId: req.coachingId
    });

    return res.status(HTTP_STATUS.SUCCESS).json({
      message: 'Join request approved',
      ...result
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to approve join request',
      message: error.message
    });
  }
};

const rejectJoinRequest = async (req, res) => {
  try {
    const request = await onboardingService.rejectJoinRequest({
      requestId: req.params.requestId,
      ownerId: req.user.userId,
      coachingId: req.coachingId
    });

    return res.status(HTTP_STATUS.SUCCESS).json({
      message: 'Join request rejected',
      request
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to reject join request',
      message: error.message
    });
  }
};

const approveSelectedStudents = async (req, res) => {
  try {
    const { requestIds } = req.body;
    const result = await onboardingService.approveStudentsBulk({
      ownerId: req.user.userId,
      coachingId: req.coachingId,
      requestIds,
      approveAll: false
    });

    return res.status(HTTP_STATUS.SUCCESS).json({
      message: 'Selected students approved',
      ...result
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Bulk approval failed',
      message: error.message
    });
  }
};

const approveAllStudents = async (req, res) => {
  try {
    const result = await onboardingService.approveStudentsBulk({
      ownerId: req.user.userId,
      coachingId: req.coachingId,
      approveAll: true
    });

    return res.status(HTTP_STATUS.SUCCESS).json({
      message: 'All pending students approved',
      ...result
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Approve all failed',
      message: error.message
    });
  }
};

module.exports = {
  createJoinRequest,
  getJoinRequestStatus,
  generateAccessCode,
  getActiveAccessCodes,
  deactivateAccessCode,
  getPendingRequests,
  approveJoinRequest,
  rejectJoinRequest,
  approveSelectedStudents,
  approveAllStudents
};
