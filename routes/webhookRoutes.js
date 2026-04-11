const express = require('express');
const { revenuecatWebhook } = require('../controllers/subscriptionController');

const router = express.Router();

router.post('/revenuecat', revenuecatWebhook);

module.exports = router;