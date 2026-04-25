const express = require('express');
const router = express.Router();
const {
  getUsersByCoaching,
  assignUserToCoaching,
  removeUserFromCoaching,
  getUserById,
  updateUserProfile,
  deactivateUser,
  revokeAccess,
  restoreAccess,
  markAsPaid
} = require('../controllers/userController');
const { authenticateToken } = require('../middleware/auth');
const { ownerOnly, studentOrOwner, teacherOrOwner } = require('../middleware/roles');
const { validateCoachingAccess, validateStudentAccess } = require('../middleware/coachingIsolation');

// Protected routes
// Get all users for a coaching center (Owner only)
router.get('/coaching/:coachingId', authenticateToken, ownerOnly, validateCoachingAccess, getUsersByCoaching);

// Assign a user to a coaching center (Owner only)
router.post('/assign-to-coaching', authenticateToken, ownerOnly, assignUserToCoaching);

// Remove a user from a coaching center (Owner only)
router.post('/remove-from-coaching', authenticateToken, ownerOnly, removeUserFromCoaching);

// Get user by ID (Student/Owner can access)
router.get('/:userId', authenticateToken, studentOrOwner, getUserById);

// Update user profile (Only the user themselves or an Owner can update)
router.put('/:userId', authenticateToken, studentOrOwner, updateUserProfile);

// Soft-deactivate a user
router.delete('/:userId', authenticateToken, ownerOnly, deactivateUser);

// Billing & Access Overrides
// Revoke student access (Teacher/Owner)
router.post('/:userId/revoke', authenticateToken, teacherOrOwner, validateStudentAccess, revokeAccess);

// Restore student access (Teacher/Owner)
router.post('/:userId/restore', authenticateToken, teacherOrOwner, validateStudentAccess, restoreAccess);

// Mark student as paid for current month (Owner only)
router.post('/:userId/mark-paid', authenticateToken, ownerOnly, validateStudentAccess, markAsPaid);

module.exports = router;