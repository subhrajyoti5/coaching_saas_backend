const express = require('express');
const rateLimit = require('express-rate-limit');
const {
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
} = require('../controllers/onboardingController');
const { authenticateToken } = require('../middleware/auth');
const { ownerOnly } = require('../middleware/roles');
const { authenticateOnboardingToken } = require('../middleware/onboardingAuth');
const { validateOnboardingJoinRequest, validateRoleOnly, validateDeactivateCode, validateApproveSelectedStudents } = require('../middleware/validation');

const router = express.Router();

const joinRequestLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: {
    error: 'Too many attempts',
    message: 'Please wait before trying another code'
  },
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/join-request', authenticateOnboardingToken, joinRequestLimiter, validateOnboardingJoinRequest, createJoinRequest);
router.get('/join-request/status', authenticateOnboardingToken, getJoinRequestStatus);

router.post('/access-codes/generate', authenticateToken, ownerOnly, validateRoleOnly, generateAccessCode);
router.get('/access-codes/active', authenticateToken, ownerOnly, getActiveAccessCodes);
router.post('/access-codes/deactivate', authenticateToken, ownerOnly, validateDeactivateCode, deactivateAccessCode);

router.get('/pending-requests', authenticateToken, ownerOnly, getPendingRequests);
router.post('/approve/:requestId', authenticateToken, ownerOnly, approveJoinRequest);
router.post('/reject/:requestId', authenticateToken, ownerOnly, rejectJoinRequest);
router.post('/approve-students', authenticateToken, ownerOnly, validateApproveSelectedStudents, approveSelectedStudents);
router.post('/approve-all-students', authenticateToken, ownerOnly, approveAllStudents);

module.exports = router;
