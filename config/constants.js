const ROLES = {
  OWNER: 'OWNER',
  TEACHER: 'TEACHER',
  STUDENT: 'STUDENT'
};

const PAYMENT_METHODS = {
  CASH: 'CASH',
  BANK_TRANSFER: 'BANK_TRANSFER',
  UPI: 'UPI',
  CHEQUE: 'CHEQUE',
  OTHER: 'OTHER'
};

const ATTEMPT_STATUS = {
  STARTED: 'STARTED',
  SUBMITTED: 'SUBMITTED'
};

const HTTP_STATUS = {
  SUCCESS: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500
};

const ERROR_MESSAGES = {
  UNAUTHORIZED_ACCESS: 'Unauthorized access',
  RESOURCE_NOT_FOUND: 'Resource not found',
  INVALID_CREDENTIALS: 'Invalid credentials',
  EMAIL_ALREADY_EXISTS: 'Email already exists',
  INSUFFICIENT_PERMISSIONS: 'Insufficient permissions',
  COACHING_MISMATCH: 'Coaching mismatch',
  USER_NOT_FOUND: 'User not found',
  TOKEN_MISSING: 'Access token is required',
  TOKEN_INVALID: 'Invalid or expired token',
  ALREADY_SUBMITTED: 'Test already submitted',
  ATTEMPT_NOT_FOUND: 'No active attempt found'
};

const SUCCESS_MESSAGES = {
  LOGIN_SUCCESS: 'Login successful',
  REGISTRATION_SUCCESS: 'Registration successful',
  OPERATION_SUCCESS: 'Operation successful',
  LOGOUT_SUCCESS: 'Logged out successfully'
};

module.exports = {
  ROLES,
  PAYMENT_METHODS,
  ATTEMPT_STATUS,
  HTTP_STATUS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES
};