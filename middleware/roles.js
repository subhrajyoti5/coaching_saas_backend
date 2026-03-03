const { ERROR_MESSAGES, HTTP_STATUS, ROLES } = require('../config/constants');
const prisma = require('../config/database');

// Role is now sourced from the JWT payload (coaching-scoped).
// The JWT is re-issued at coaching selection and contains { userId, role, coachingId }.

const requireRole = (...allowedRoles) => {
  return async (req, res, next) => {
    try {
      const role = req.user && req.user.role;

      if (!role) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          error: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
          message: 'No role found in token. Select a coaching center first.'
        });
      }

      if (!allowedRoles.includes(role)) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          error: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
          message: `Access requires one of: ${allowedRoles.join(', ')}`
        });
      }

      // Verify that the role in the JWT still matches the database
      const coachingId = req.user.coachingId;
      if (coachingId) {
        const coachingUser = await prisma.coachingUser.findFirst({
          where: {
            userId: req.user.userId,
            coachingId,
            role
          }
        });

        if (!coachingUser) {
          return res.status(HTTP_STATUS.FORBIDDEN).json({
            error: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
            message: 'Your role in this coaching center has changed. Please re-login.'
          });
        }
        req.coachingId = coachingId;
      }

      next();
    } catch (error) {
      console.error('Role check error:', error);
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Authorization error',
        message: 'An error occurred during authorization'
      });
    }
  };
};

const ownerOnly = requireRole(ROLES.OWNER);
const teacherOnly = requireRole(ROLES.TEACHER, ROLES.OWNER);
const studentOnly = requireRole(ROLES.STUDENT, ROLES.OWNER);
const teacherOrOwner = requireRole(ROLES.TEACHER, ROLES.OWNER);
const studentOrOwner = requireRole(ROLES.STUDENT, ROLES.OWNER);

module.exports = {
  requireRole,
  ownerOnly,
  teacherOnly,
  studentOnly,
  teacherOrOwner,
  studentOrOwner
};