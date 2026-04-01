const express = require('express');
const { razorpayWebhook } = require('../controllers/subscriptionController');

const router = express.Router();

router.post('/razorpay', razorpayWebhook);

module.exports = router;