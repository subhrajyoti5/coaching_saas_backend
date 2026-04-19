const express = require('express');
const router = express.Router();

const {
  registerDeviceToken,
  deactivateDeviceToken,
  getNotificationDiagnostics
} = require('../controllers/deviceTokenController');
const { authenticateToken } = require('../middleware/auth');
const { ownerOnly } = require('../middleware/roles');

router.post('/register', authenticateToken, registerDeviceToken);
router.post('/deactivate', authenticateToken, deactivateDeviceToken);
router.get('/diagnostics', authenticateToken, ownerOnly, getNotificationDiagnostics);

module.exports = router;
