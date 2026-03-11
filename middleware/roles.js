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

      const coachingId = req.user.coachingId;
      const currentUser = await prisma.user.findUnique({
        where: { id: req.user.userId }
      });

      if (!currentUser || !currentUser.is_active) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          error: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
          message: 'Your account is no longer active.'
        });
      }

      if (currentUser.role !== role) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          error: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
          message: 'Your role has changed. Please re-login.'
        });
      }

      if (coachingId && currentUser.coaching_center_id !== coachingId) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          error: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
          message: 'Your coaching center access has changed. Please re-login.'
        });
      }

      if (coachingId) {
        req.coachingId = coachingId;
      }

      if (!allowedRoles.includes(currentUser.role)) {
          return res.status(HTTP_STATUS.FORBIDDEN).json({
            error: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
            message: `Access requires one of: ${allowedRoles.join(', ')}`
          });
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