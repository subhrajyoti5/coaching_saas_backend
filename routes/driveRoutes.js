const express = require('express');
const router = express.Router();
const { deprecatedEndpoint } = require('../controllers/driveController');

/**
 * DEPRECATED: Teacher Drive endpoints removed
 * All documents are now uploaded to centralized Developer Drive
 * See DEVELOPER_DRIVE_SETUP.md for details
 */

router.get('/connect/start', deprecatedEndpoint);
router.get('/connect/status', deprecatedEndpoint);
router.get('/connect/callback', deprecatedEndpoint);

module.exports = router;
