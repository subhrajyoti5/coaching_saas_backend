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

    const featureName = String(
      req.params.featureName || req.query.feature || ''
    ).trim();

    const featureAccess = featureName
      ? status.features?.[featureName] || { enabled: false, reason: 'unknown_feature' }
      : null;

    return res.status(HTTP_STATUS.SUCCESS).json({
      message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
      status,
      ...(featureName ? { feature: featureName, featureAccess } : {})
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to fetch entitlement status',
      message: error.message
    });
  }
};

const getFeatureAccess = async (req, res) => {
  try {
    const featureName = String(req.params.featureName || req.query.feature || '').trim() || 'aiTestStudio';
    const user = req.userDetails;

    if (!user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: 'Unauthorized',
        message: 'Authenticated user context is missing'
      });
    }

    const status = subscriptionService.computeAccessState({
      status: user.subscription_status,
      currentPeriodEnd: user.current_period_end,
      gracePeriodEnd: user.grace_period_end,
      planType: user.plan_type
    });

    const featureAccess = status.features?.[featureName] || {
      enabled: false,
      reason: 'unknown_feature'
    };

    return res.status(HTTP_STATUS.SUCCESS).json({
      message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
      feature: featureName,
      subscription: {
        trialActive: Boolean(user.trial_active),
        trialEnd: user.trial_end,
        subscriptionStatus: user.subscription_status,
        subscriptionId: user.subscription_id,
        currentPeriodEnd: user.current_period_end,
        gracePeriodEnd: user.grace_period_end,
        planType: user.plan_type,
        hasActiveAccess: status.hasActiveAccess,
        inGracePeriod: status.inGracePeriod,
        daysRemaining: status.daysRemaining,
        warnings: status.warnings,
        syncedAt: new Date(),
        syncedFrom: 'database'
      },
      featureAccess
    });
  } catch (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Failed to fetch feature access',
      message: error.message
    });
  }
};

const getRevenueCatConfig = async (_req, res) => {
  const apiKey = process.env.REVENUECAT_API_KEY;

  if (!apiKey) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'RevenueCat configuration missing',
      message: 'REVENUECAT_API_KEY is not configured'
    });
  }

  return res.status(HTTP_STATUS.SUCCESS).json({
    message: SUCCESS_MESSAGES.OPERATION_SUCCESS,
    revenueCatApiKey: apiKey
  });
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
  getFeatureAccess,
  getRevenueCatConfig,
  revenuecatWebhook
};