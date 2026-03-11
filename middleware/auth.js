const { verifyToken } = require('../config/auth');
const { ERROR_MESSAGES, HTTP_STATUS } = require('../config/constants');
const prisma = require('../config/database');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: ERROR_MESSAGES.TOKEN_MISSING,
        message: 'Provide a Bearer token in the Authorization header'
      });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: ERROR_MESSAGES.TOKEN_INVALID,
        message: 'Invalid or expired access token'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });

    if (!user || !user.is_active) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: ERROR_MESSAGES.USER_NOT_FOUND,
        message: 'User no longer exists or has been deactivated'
      });
    }

    // Attach decoded JWT claims to request
    // Token contains: { userId, role, coachingId } after coaching selection
    req.user = decoded;
    req.userDetails = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Authentication error',
      message: 'An error occurred during authentication'
    });
  }
};

module.exports = { authenticateToken };