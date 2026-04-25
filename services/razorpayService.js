const Razorpay = require('razorpay');
const crypto = require('crypto');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * Create a new Razorpay order
 */
const createOrder = async (amount, currency = 'INR') => {
  const options = {
    amount: Math.round(amount * 100), // amount in paise
    currency,
    receipt: `receipt_${Date.now()}`,
  };

  try {
    const order = await razorpay.orders.create(options);
    return order;
  } catch (error) {
    console.error('Razorpay order creation failed:', error);
    throw error;
  }
};

/**
 * Create a Razorpay Subscription (Auto-Pay)
 * Note: Requires a pre-created plan_id from Razorpay Dashboard
 */
const createSubscription = async (planId, totalCount = 12) => {
  const options = {
    plan_id: planId,
    customer_notify: 1,
    total_count: totalCount, // Number of billing cycles
  };

  try {
    const subscription = await razorpay.subscriptions.create(options);
    return subscription;
  } catch (error) {
    console.error('Razorpay subscription creation failed:', error);
    throw error;
  }
};

/**
 * Verify Razorpay payment signature
 */
const verifyPayment = (orderId, paymentId, signature) => {
  const generatedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  return generatedSignature === signature;
};

module.exports = {
  createOrder,
  createSubscription,
  verifyPayment,
};
