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
      coachingId: req.user.coachingId
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

const getEntitlementStatus = async (req, res) => {
  try {
    const status = await subscriptionService.getEntitlementStatus({
      userId: req.user.userId,
      coachingId: req.user.coachingId
    });

    return res.status(HTTP_STATUS.SUCCESS).json({
      message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
      status
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to fetch entitlement status',
      message: error.message
    });
  }
};

const revenuecatWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-revenuecat-signature'];
    const authorization = req.headers.authorization;

    const result = await subscriptionService.processRevenueCatWebhook({
      rawBody: req.body,
      authorization,
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
  getEntitlementStatus,
  revenuecatWebhook
};