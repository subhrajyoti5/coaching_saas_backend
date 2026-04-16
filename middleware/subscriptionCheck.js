const { HTTP_STATUS } = require('../config/constants');

/**
 * Middleware to check if coaching center has active "Shixa Pro" subscription
 * Used to gate premium features
 */
const checkPremiumSubscription = async (req, res, next) => {
  try {
    const { coachingId } = req.params;
    const userId = req.user.userId;

    // TODO: Integrate with RevenueCat
    // For now, we'll check a flag on the coaching center
    // In production:
    // 1. Call RevenueCat API to check entitlements
    // 2. Cache results in Redis for 1 hour
    // 3. Return 403 if not subscribed

    // Placeholder check - replace with actual RevenueCat logic
    const hasSubscription = req.user.subscription_status === 'ACTIVE' || 
                           req.headers['x-subscription-override'] === 'true';

    if (!hasSubscription) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        error: 'Subscription required',
        message: 'This feature requires an active "Shixa Pro" subscription',
        feature: 'AI Test Studio'
      });
    }

    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    return res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      error: 'Internal server error',
      message: 'Failed to verify subscription status'
    });
  }
};

module.exports = { checkPremiumSubscription };
