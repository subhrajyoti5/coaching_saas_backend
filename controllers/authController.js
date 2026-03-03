const authService = require('../services/authService');
const { HTTP_STATUS, SUCCESS_MESSAGES } = require('../config/constants');

/**
 * SIGN IN WITH GOOGLE
 */
const googleLogin = async (req, res) => {
  try {
    const { token } = req.body;
    const result = await authService.loginWithGoogle(token);

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

module.exports = {
  googleLogin,
  selectCoaching,
  refresh,
  logout,
  getProfile,
  getCoachingCenters
};