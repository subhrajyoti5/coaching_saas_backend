const express = require('express');
const router = express.Router();

const {
  createPaymentClaim,
  verifyPaymentClaim,
  approvePaymentClaim,
  rejectPaymentClaim,
  getMyPaymentClaims,
  getCoachingPaymentClaims
} = require('../controllers/paymentClaimController');

const { authenticateToken } = require('../middleware/auth');
const { ownerOnly, teacherOrOwner, studentOnly } = require('../middleware/roles');
const { validateCoachingAccess, validateClaimAccess, validateBatchAccess } = require('../middleware/coachingIsolation');
const { validateCreatePaymentClaim, validateRejectPaymentClaim } = require('../middleware/validation');

router.post(
  '/',
  authenticateToken,
  studentOnly,
  validateBatchAccess,
  validateCreatePaymentClaim,
  createPaymentClaim
);

router.get('/my', authenticateToken, studentOnly, getMyPaymentClaims);

router.get(
  '/coaching/:coachingId',
  authenticateToken,
  teacherOrOwner,
  validateCoachingAccess,
  getCoachingPaymentClaims
);

router.put('/:claimId/verify', authenticateToken, teacherOrOwner, validateClaimAccess, verifyPaymentClaim);

router.put('/:claimId/approve', authenticateToken, ownerOnly, validateClaimAccess, approvePaymentClaim);

router.put(
  '/:claimId/reject',
  authenticateToken,
  teacherOrOwner,
  validateClaimAccess,
  validateRejectPaymentClaim,
  rejectPaymentClaim
);

module.exports = router;
