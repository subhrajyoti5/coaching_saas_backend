const express = require('express');
const router = express.Router();

const {
  registerDeviceToken,
  deactivateDeviceToken
} = require('../controllers/deviceTokenController');
const { authenticateToken } = require('../middleware/auth');

router.post('/register', authenticateToken, registerDeviceToken);
router.post('/deactivate', authenticateToken, deactivateDeviceToken);

module.exports = router;
