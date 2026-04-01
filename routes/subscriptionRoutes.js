const express = require('express');

const {
  createSubscription,
  getMySubscription,
  cancelSubscription
} = require('../controllers/subscriptionController');
const { authenticateToken } = require('../middleware/auth');
const { ownerOnly } = require('../middleware/roles');

const router = express.Router();

router.post('/create', authenticateToken, ownerOnly, createSubscription);
router.get('/me', authenticateToken, ownerOnly, getMySubscription);
router.post('/cancel', authenticateToken, ownerOnly, cancelSubscription);

module.exports = router;