const { verifyToken } = require('../config/auth');
const { HTTP_STATUS } = require('../config/constants');

const authenticateOnboardingToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: 'Onboarding token missing',
      message: 'Provide an onboarding Bearer token in the Authorization header'
    });
  }

  const decoded = verifyToken(token);
  if (!decoded || decoded.tokenType !== 'onboarding') {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: 'Invalid onboarding token',
      message: 'Onboarding token is invalid or expired'
    });
  }

  req.onboardingUser = decoded;
  next();
};

module.exports = {
  authenticateOnboardingToken
};
