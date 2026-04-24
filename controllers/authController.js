const authService = require('../services/authService');
const { HTTP_STATUS, SUCCESS_MESSAGES } = require('../config/constants');
const { sendOtpEmail } = require('../services/emailService');

// In-memory OTP store (for development/MVP). 
// Key: email, Value: { otp, expiresAt }
const otpStore = new Map();

/**
 * SIGN IN WITH GOOGLE
 */
const googleLogin = async (req, res) => {
  try {
    const { token } = req.body;
    const result = await authService.loginWithGoogle(token);

    if (result.onboardingRequired) {
      return res.status(HTTP_STATUS.SUCCESS).json({
        message: 'Google login successful. Complete onboarding to request access.',
        ...result
      });
    }

    return res.status(HTTP_STATUS.SUCCESS).json({
      message: 'Google login successful',
      ...result
    });
  } catch (error) {
    console.error('Google login error:', error.message);
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Google login failed',
      message: error.message,
      details: 'Ensure your email is registered in the system. Contact your coaching center owner.'
    });
  }
};

/**
 * SELECT COACHING
 */
const selectCoaching = async (req, res) => {
  try {
    const { coachingId } = req.body;
    const result = await authService.selectCoaching(req.user.userId, coachingId);

    return res.status(HTTP_STATUS.SUCCESS).json({
      message: 'Coaching selected successfully',
      ...result
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Coaching selection failed',
      message: error.message
    });
  }
};

/**
 * REFRESH TOKEN
 */
const refresh = async (req, res) => {
  try {
    const { refreshToken, coachingId } = req.body;
    const result = await authService.refreshAccessToken(refreshToken, coachingId);

    return res.status(HTTP_STATUS.SUCCESS).json(result);
  } catch (error) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: 'Token refresh failed',
      message: error.message
    });
  }
};

/**
 * LOGOUT
 */
const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    await authService.logoutUser(refreshToken);

    return res.status(HTTP_STATUS.SUCCESS).json({
      message: SUCCESS_MESSAGES.OPERATION_SUCCESS
    });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Logout failed',
      message: error.message
    });
  }
};

/**
 * GET PROFILE
 */
const getProfile = async (req, res) => {
  try {
    const user = await authService.getUserById(req.user.userId);
    return res.status(HTTP_STATUS.SUCCESS).json({ user });
  } catch (error) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      error: 'User not found',
      message: error.message
    });
  }
};

/**
 * GET COACHING CENTERS
 */
const getCoachingCenters = async (req, res) => {
  try {
    const coachingCenters = await authService.getUserCoachingCentres(req.user.userId);
    return res.status(HTTP_STATUS.SUCCESS).json({ coachingCenters });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch coaching centers',
      message: error.message
    });
  }
};

/**
 * GET GOOGLE CLIENT CONFIG
 * Public endpoint to fetch Google OAuth client ID (no sensitive data exposed)
 */
const getGoogleConfig = async (req, res) => {
  try {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Google OAuth not configured',
        message: 'GOOGLE_OAUTH_CLIENT_ID is not set on the server'
      });
    }
    return res.status(HTTP_STATUS.SUCCESS).json({
      googleClientId: clientId
    });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch Google config',
      message: error.message
    });
  }
};

/**
 * SEND OTP
 */
const sendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Email is required' });
    }

    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store OTP with 10-minute expiry
    const expiresAt = Date.now() + 10 * 60 * 1000;
    otpStore.set(email, { otp, expiresAt });

    // Send email
    await sendOtpEmail(email, otp);

    return res.status(HTTP_STATUS.SUCCESS).json({ message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Send OTP error:', error.message);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to send OTP',
      message: error.message
    });
  }
};

/**
 * VERIFY OTP
 */
const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Email and OTP are required' });
    }

    const record = otpStore.get(email);
    if (!record) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'No OTP found for this email' });
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(email);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'OTP has expired' });
    }

    if (record.otp !== otp) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Invalid OTP' });
    }

    // OTP verified successfully
    otpStore.delete(email);
    
    return res.status(HTTP_STATUS.SUCCESS).json({ message: 'OTP verified successfully' });
  } catch (error) {
    console.error('Verify OTP error:', error.message);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to verify OTP',
      message: error.message
    });
  }
};

module.exports = {
  googleLogin,
  selectCoaching,
  refresh,
  logout,
  getProfile,
  getCoachingCenters,
  getGoogleConfig,
  sendOtp,
  verifyOtp
};