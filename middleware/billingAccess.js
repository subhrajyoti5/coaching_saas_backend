const { HTTP_STATUS } = require('../config/constants');
const { computeStudentStatus } = require('../utils/billingUtils');
const prisma = require('../config/database');

/**
 * Middleware to gate access based on student billing status.
 * Blocks access for "revoked" and "due" students.
 */
const validateBillingAccess = async (req, res, next) => {
  try {
    const { userId, role } = req.user;

    // Only students are gated by billing status
    if (role !== 'student') {
      return next();
    }

    // Fetch the latest student record to get is_revoked, is_lig and last_fee_paid_at
    const student = await prisma.user.findUnique({
      where: { id: Number(userId) },
      select: { is_revoked: true, is_lig: true, last_fee_paid_at: true }
    });

    if (!student) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: 'Unauthorized',
        message: 'Student record not found'
      });
    }

    const status = computeStudentStatus(student);

    if (status === 'revoked') {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        error: 'Access Restricted',
        message: 'Your access is currently restricted. Please clear your outstanding dues to restore access.',
        status: status,
        code: 'BILLING_RESTRICTED'
      });
    }

    // Attach status to request for later use if needed
    req.billingStatus = status;
    next();
  } catch (error) {
    console.error('Billing access check error:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Internal server error',
      message: 'Failed to verify billing status'
    });
  }
};

module.exports = { validateBillingAccess };
