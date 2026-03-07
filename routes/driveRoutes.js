const express = require('express');
const router = express.Router();
const {
  getDriveConnectUrl,
  handleDriveCallback,
  getDriveStatus
} = require('../controllers/driveController');
const { authenticateToken } = require('../middleware/auth');
const { teacherOnly } = require('../middleware/roles');

router.get('/connect/start', authenticateToken, teacherOnly, getDriveConnectUrl);
router.get('/connect/status', authenticateToken, teacherOnly, getDriveStatus);
router.get('/connect/callback', handleDriveCallback);

module.exports = router;
