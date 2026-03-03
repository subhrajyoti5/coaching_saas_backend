const { ERROR_MESSAGES, HTTP_STATUS } = require('../config/constants');
const prisma = require('../config/database');

// After coaching selection the JWT contains coachingId.
// We use req.user.coachingId as the authoritative source — never trust a route param for identity.

const validateCoachingAccess = async (req, res, next) => {
  try {
    const userId = req.userDetails.id;
    // Prefer the coaching from the JWT; fall back to route/body param for admin overrides
    const coachingId = req.user.coachingId || req.params.coachingId || req.body.coachingId;

    if (!coachingId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Coaching ID required',
        message: 'Select a coaching center to get a scoped token'
      });
    }

    const coachingUser = await prisma.coachingUser.findFirst({
      where: { userId, coachingId }
    });

    if (!coachingUser) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        error: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
        message: 'You do not have access to this coaching center'
      });
    }

    req.coachingId = coachingId;
    req.coachingRole = coachingUser.role;
    next();
  } catch (error) {
    console.error('Coaching access validation error:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Validation error',
      message: 'An error occurred during coaching access validation'
    });
  }
};

const validateBatchAccess = async (req, res, next) => {
  try {
    const userId = req.userDetails.id;
    const coachingId = req.user.coachingId;
    const batchId = req.params.batchId || req.body.batchId;

    if (!batchId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Batch ID required',
        message: 'Batch ID must be provided in the request'
      });
    }

    const batch = await prisma.batch.findFirst({
      where: { id: batchId, isActive: true }
    });

    if (!batch) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        error: ERROR_MESSAGES.RESOURCE_NOT_FOUND,
        message: 'Batch not found'
      });
    }

    // Ensure the batch belongs to the coaching in the JWT
    if (coachingId && batch.coachingId !== coachingId) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        error: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
        message: 'Batch does not belong to your current coaching context'
      });
    }

    const coachingUser = await prisma.coachingUser.findFirst({
      where: { userId, coachingId: batch.coachingId }
    });

    if (!coachingUser) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        error: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
        message: 'You do not have access to this batch'
      });
    }

    req.batchId = batchId;
    req.coachingId = batch.coachingId;
    next();
  } catch (error) {
    console.error('Batch access validation error:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Validation error',
      message: 'An error occurred during batch access validation'
    });
  }
};

// For teacher/owner operations that reference a student
const validateStudentAccess = async (req, res, next) => {
  try {
    const userId = req.userDetails.id;
    const studentId = req.params.studentId || req.body.studentId;

    if (!studentId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Student ID required',
        message: 'Student ID must be provided in the request'
      });
    }

    const studentProfile = await prisma.studentProfile.findUnique({
      where: { id: studentId }
    });

    if (!studentProfile) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        error: ERROR_MESSAGES.RESOURCE_NOT_FOUND,
        message: 'Student not found'
      });
    }

    const coachingUser = await prisma.coachingUser.findFirst({
      where: { userId, coachingId: studentProfile.coachingId }
    });

    if (!coachingUser) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        error: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
        message: 'You do not have access to this student'
      });
    }

    req.studentId = studentId;
    req.coachingId = studentProfile.coachingId;
    next();
  } catch (error) {
    console.error('Student access validation error:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Validation error',
      message: 'An error occurred during student access validation'
    });
  }
};

module.exports = {
  validateCoachingAccess,
  validateBatchAccess,
  validateStudentAccess
};