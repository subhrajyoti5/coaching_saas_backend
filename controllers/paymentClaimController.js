const paymentClaimService = require('../services/paymentClaimService');
const { HTTP_STATUS, SUCCESS_MESSAGES } = require('../config/constants');

const createPaymentClaim = async (req, res) => {
  try {
    const claim = await paymentClaimService.createClaim(
      {
        studentId: req.user.userId,
        batchId: req.body.batchId,
        note: req.body.note,
        proofUrl: req.body.proofUrl
      },
      req.user.userId
    );

    return res.status(HTTP_STATUS.CREATED).json({
      message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
      claim
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to create payment claim',
      code: error.code || 'PAYMENT_CLAIM_CREATE_FAILED',
      message: error.message
    });
  }
};

const verifyPaymentClaim = async (req, res) => {
  try {
    const claim = await paymentClaimService.verifyClaim(req.claimId || req.params.claimId, req.user.userId);
    return res.status(HTTP_STATUS.SUCCESS).json({
      message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
      claim
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to verify payment claim',
      message: error.message
    });
  }
};

const approvePaymentClaim = async (req, res) => {
  try {
    const claim = await paymentClaimService.approveClaim(req.claimId || req.params.claimId, req.user.userId);
    return res.status(HTTP_STATUS.SUCCESS).json({
      message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
      claim
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to approve payment claim',
      message: error.message
    });
  }
};

const rejectPaymentClaim = async (req, res) => {
  try {
    const claim = await paymentClaimService.rejectClaim(
      req.claimId || req.params.claimId,
      req.user.userId,
      req.body.reason
    );

    return res.status(HTTP_STATUS.SUCCESS).json({
      message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
      claim
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to reject payment claim',
      message: error.message
    });
  }
};

const getMyPaymentClaims = async (req, res) => {
  try {
    const claims = await paymentClaimService.getMyClaims(req.user.userId);
    return res.status(HTTP_STATUS.SUCCESS).json({ claims });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch payment claims',
      message: error.message
    });
  }
};

const getCoachingPaymentClaims = async (req, res) => {
  try {
    const coachingId = req.coachingId || req.params.coachingId;
    const isTeacher = req.user.role === 'TEACHER';
    const teacherId = isTeacher ? req.user.userId : null;
    
    const claims = await paymentClaimService.getCoachingClaims(
      coachingId,
      req.query.status,
      teacherId,
      isTeacher
    );
    return res.status(HTTP_STATUS.SUCCESS).json({ claims });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch payment claims',
      message: error.message
    });
  }
};

module.exports = {
  createPaymentClaim,
  verifyPaymentClaim,
  approvePaymentClaim,
  rejectPaymentClaim,
  getMyPaymentClaims,
  getCoachingPaymentClaims
};
