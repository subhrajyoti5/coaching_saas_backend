const { HTTP_STATUS } = require('../config/constants');
const { computeAccessState } = require('../services/subscriptionService');

/**
 * Middleware to check if coaching center has active "Shixa Pro" subscription
 * Used to gate premium features
 */
const checkPremiumSubscription = async (req, res, next) => {
  try {
    const user = req.userDetails;

    if (!user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: 'Unauthorized',
        message: 'Authenticated user context is missing'
      });
    }

    const access = computeAccessState({
      status: user.subscription_status,
      currentPeriodEnd: user.current_period_end,
      gracePeriodEnd: user.grace_period_end,
      planType: user.plan_type
    });

    if (!access.features.aiTestStudio.enabled) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        error: 'Subscription required',
        message: 'This feature requires an active "Shixa Pro" subscription',
        code: 'SUBSCRIPTION_REQUIRED',
        feature: 'AI Test Studio',
        subscription: {
          status: access.status,
          inGracePeriod: access.inGracePeriod,
          currentPeriodEnd: access.currentPeriodEnd,
          gracePeriodEnd: access.gracePeriodEnd
        }
      });
    }

    req.subscriptionAccess = access;
    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Internal server error',
      message: 'Failed to verify subscription status'
    });
  }
};

module.exports = { checkPremiumSubscription };
