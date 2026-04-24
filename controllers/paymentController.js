const razorpayService = require('../services/razorpayService');
const { HTTP_STATUS } = require('../config/constants');

/**
 * Create Order
 */
const createOrder = async (req, res) => {
  try {
    const { amount, currency } = req.body;
    if (!amount) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Amount is required' });
    }

    const order = await razorpayService.createOrder(amount, currency);
    return res.status(HTTP_STATUS.SUCCESS).json(order);
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to create payment order',
      message: error.message,
    });
  }
};

/**
 * Verify Payment
 */
const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Missing payment details' });
    }

    const isValid = razorpayService.verifyPayment(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    if (isValid) {
      // Here you would typically update the user's subscription in the database
      return res.status(HTTP_STATUS.SUCCESS).json({ message: 'Payment verified successfully' });
    } else {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Invalid payment signature' });
    }
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Payment verification failed',
      message: error.message,
    });
  }
};

module.exports = {
  createOrder,
  verifyPayment,
};
