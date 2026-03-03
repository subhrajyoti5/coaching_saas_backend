const { HTTP_STATUS } = require('../config/constants');

/**
 * Generic error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  
  // Default error
  let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
  let message = 'Internal Server Error';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = HTTP_STATUS.BAD_REQUEST;
    message = 'Validation Error';
  } else if (err.name === 'UnauthorizedError') {
    statusCode = HTTP_STATUS.UNAUTHORIZED;
    message = 'Unauthorized';
  } else if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = HTTP_STATUS.BAD_REQUEST;
    message = 'File too large';
  }

  res.status(statusCode).json({
    error: message,
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

/**
 * Handle Prisma errors
 */
const handlePrismaError = (err) => {
  if (err.code === 'P2002') {
    // Unique constraint violation
    return {
      statusCode: HTTP_STATUS.BAD_REQUEST,
      message: 'A record with this value already exists'
    };
  } else if (err.code === 'P2025') {
    // Record not found
    return {
      statusCode: HTTP_STATUS.NOT_FOUND,
      message: 'Record not found'
    };
  } else {
    // Other Prisma error
    return {
      statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: 'Database error occurred'
    };
  }
};

/**
 * Not found handler
 */
const notFoundHandler = (req, res, next) => {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    error: 'Route Not Found',
    message: `Cannot ${req.method} ${req.path}`
  });
};

module.exports = {
  errorHandler,
  handlePrismaError,
  notFoundHandler
};