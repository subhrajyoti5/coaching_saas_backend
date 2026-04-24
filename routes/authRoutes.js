const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
    login, googleLogin, selectCoaching, refresh, logout, getProfile, getCoachingCenters, getGoogleConfig, sendOtp, verifyOtp
} = require('../controllers/authController');
const { validateUserLogin } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: { error: 'Too many login attempts', message: 'Please try again after 15 minutes' },
    standardHeaders: true,
    legacyHeaders: false
});

// NO PUBLIC REGISTER ROUTE
// Public routes
router.get('/config/google', getGoogleConfig);
router.post('/google-login', loginLimiter, googleLogin);
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/refresh', refresh);
router.post('/logout', logout);

// Protected routes (bare token - no coachingId yet)
router.get('/profile', authenticateToken, getProfile);
router.get('/coaching-centers', authenticateToken, getCoachingCenters);
router.post('/select-coaching', authenticateToken, selectCoaching);

module.exports = router;