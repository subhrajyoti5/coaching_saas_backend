const express = require('express');
const router = express.Router();
const {
  createFeeRecord,
  recordPayment,
  getMyFees,
  getStudentFees,
  getCoachingFees,
  getCoachingFeeSummary,
  getFeeById,
  updateFeeRecord,
  getFeeTransactions,
  getCoachingRevenue,
  getCoachingStudentWiseRevenueReport
} = require('../controllers/feeController');
const { authenticateToken } = require('../middleware/auth');
const { ownerOnly, teacherOrOwner, studentOrOwner, studentOnly } = require('../middleware/roles');
const { validateCoachingAccess, validateStudentAccess } = require('../middleware/coachingIsolation');
const { validateCreateFee } = require('../middleware/validation');

// Protected routes
// Create a new fee record (Owner and Teacher can access)
router.post('/', authenticateToken, teacherOrOwner, validateCreateFee, createFeeRecord);

// Record a payment (Owner and Teacher can access)
router.post('/:feeId/payment', authenticateToken, teacherOrOwner, recordPayment);

// Get student's own fee records (extracted from JWT)
router.get('/my-fees', authenticateToken, studentOnly, getMyFees);

// Get fee records for a student (Owner/Teacher can access for any student in their center)
router.get('/student/:studentId', authenticateToken, teacherOrOwner, validateStudentAccess, getStudentFees);

// Get revenue (all payments) for a coaching center (Owner and Teacher can access)
router.get('/coaching/:coachingId/revenue', authenticateToken, teacherOrOwner, validateCoachingAccess, getCoachingRevenue);

// Get student-wise revenue status for a coaching center (Owner and Teacher can access)
router.get('/coaching/:coachingId/revenue-student-wise', authenticateToken, teacherOrOwner, validateCoachingAccess, getCoachingStudentWiseRevenueReport);

// Get fee records for a coaching center (Owner and Teacher can access)
router.get('/coaching/:coachingId', authenticateToken, teacherOrOwner, validateCoachingAccess, getCoachingFees);

// Get fee summary for a coaching center (Owner and Teacher can access)
router.get('/coaching/:coachingId/summary', authenticateToken, teacherOrOwner, validateCoachingAccess, getCoachingFeeSummary);

// Get fee record by ID (Owner, Teacher, and Student can access)
router.get('/:feeId', authenticateToken, studentOrOwner, getFeeById);

// Get all transactions for a fee record
router.get('/:feeId/transactions', authenticateToken, studentOrOwner, getFeeTransactions);

// Update fee record (Owner and Teacher can access)
router.put('/:feeId', authenticateToken, teacherOrOwner, updateFeeRecord);

module.exports = router;