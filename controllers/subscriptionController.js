const subscriptionService = require('../services/subscriptionService');
const { HTTP_STATUS, SUCCESS_MESSAGES } = require('../config/constants');

const createSubscription = async (req, res) => {
  try {
    const payload = await subscriptionService.createSubscription({
      userId: req.user.userId,
      coachingId: req.user.coachingId
    });

    return res.status(HTTP_STATUS.CREATED).json({
      message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
      ...payload
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to create subscription',
      message: error.message
    });
  }
};

const getMySubscription = async (req, res) => {
  try {
    const subscription = await subscriptionService.getMySubscription({
      userId: req.user.userId,
      coachingId: req.user.coachingId
    });

    return res.status(HTTP_STATUS.SUCCESS).json({
      message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
      subscription
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to fetch subscription',
      message: error.message
    });
  }
};

const cancelSubscription = async (req, res) => {
  try {
    const result = await subscriptionService.cancelSubscription({
      userId: req.user.userId,
      coachingId: req.user.coachingId,
      cancelAtCycleEnd: req.body?.cancelAtCycleEnd !== false
    });

    return res.status(HTTP_STATUS.SUCCESS).json({
      message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
      ...result
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to cancel subscription',
      message: error.message
    });
  }
};

const razorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const result = await subscriptionService.processWebhook({
      rawBody: req.body,
      signature
    });

    return res.status(HTTP_STATUS.SUCCESS).json({
      status: 'ok',
      ...result
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Webhook processing failed',
      message: error.message
    });
  }
};

module.exports = {
  createSubscription,
  getMySubscription,
  cancelSubscription,
  razorpayWebhook
};