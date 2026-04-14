const express = require('express');

const {
  createSubscription,
  getMySubscription,
  cancelSubscription,
  getEntitlementStatus,
  getRevenueCatConfig
} = require('../controllers/subscriptionController');
const { authenticateToken } = require('../middleware/auth');
const { ownerOnly } = require('../middleware/roles');

const router = express.Router();

router.get('/config', getRevenueCatConfig);
router.post('/create', authenticateToken, ownerOnly, createSubscription);
router.get('/me', authenticateToken, ownerOnly, getMySubscription);
router.post('/cancel', authenticateToken, ownerOnly, cancelSubscription);
router.get('/entitlement-status', authenticateToken, ownerOnly, getEntitlementStatus);

module.exports = router;