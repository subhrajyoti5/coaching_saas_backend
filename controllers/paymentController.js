const razorpayService = require('../services/razorpayService');
const prisma = require('../config/database');
const { HTTP_STATUS, ROLES, SUBSCRIPTION_STATUS } = require('../config/constants');

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
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      email,
      coachingName,
      mobileNumber,
      planName
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Missing payment details' });
    }

    const isValid = razorpayService.verifyPayment(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    if (isValid) {
      // Lowercase email to ensure it matches exactly with Google Login
      const normalizedEmail = email.toLowerCase().trim();

      // Check if user already exists to avoid duplicates
      const existingUser = await prisma.user.findFirst({
        where: { email: normalizedEmail }
      });

      if (existingUser) {
        const updatedUser = await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            subscription_status: SUBSCRIPTION_STATUS.ACTIVE,
            plan_type: planName?.toLowerCase() || 'basic',
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          }
        });
        return res.status(HTTP_STATUS.SUCCESS).json({ 
          message: 'Payment verified and subscription updated',
          data: { user: updatedUser }
        });
      }

      // Create user and coaching center in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // 1. Create Coaching Center
        const coachingCenter = await tx.coachingCenter.create({
          data: {
            name: coachingName,
            phone: mobileNumber,
          }
        });

        console.log('Creating owner user for email:', normalizedEmail);
        // 2. Create User as OWNER
        const user = await tx.user.create({
          data: {
            name: coachingName, // Using coaching name as user name for now
            email: normalizedEmail,
            phone: mobileNumber,
            role: ROLES.OWNER,
            coaching_center_id: coachingCenter.id,
            subscription_status: SUBSCRIPTION_STATUS.ACTIVE,
            plan_type: planName?.toLowerCase() || 'basic',
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          }
        });
        console.log('User created successfully:', user.id);

        // 3. Update Coaching Center with owner_user_id
        await tx.coachingCenter.update({
          where: { id: coachingCenter.id },
          data: { owner_user_id: user.id }
        });

        return { user, coachingCenter };
      });

      return res.status(HTTP_STATUS.SUCCESS).json({
        message: 'Payment verified and account created successfully',
        data: result
      });
    } else {
      console.error('Signature mismatch! Check RAZORPAY_KEY_SECRET');
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Invalid payment signature' });
    }
  } catch (error) {
    console.error('Payment verification error details:', error);
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
