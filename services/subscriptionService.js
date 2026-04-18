const crypto = require('crypto');

const prisma = require('../config/database');
const { SUBSCRIPTION_STATUS, REVENUECAT_WEBHOOK_EVENTS, ROLES } = require('../config/constants');
const { audit } = require('../utils/auditLogger');
const notificationService = require('./notificationService');

const DEFAULT_GRACE_DAYS = Number(process.env.SUBSCRIPTION_GRACE_DAYS || 3);

const getRequiredEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
};

const fromMsTs = (value) => {
  if (!value && value !== 0) return null;
  return new Date(Number(value));
};

const mapUserSubscription = (user) => ({
  trialActive: Boolean(user.trial_active),
  trialEnd: user.trial_end,
  subscriptionStatus: user.subscription_status || SUBSCRIPTION_STATUS.INACTIVE,
  subscriptionId: user.subscription_id,
  currentPeriodEnd: user.current_period_end,
  gracePeriodEnd: user.grace_period_end,
  planType: user.plan_type || 'basic'
});

const normalizeStatus = (status) => String(status || SUBSCRIPTION_STATUS.INACTIVE).toLowerCase();

const safeDate = (value) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const computeAccessState = ({
  status,
  currentPeriodEnd,
  gracePeriodEnd,
  planType,
  now = new Date()
}) => {
  const normalizedStatus = normalizeStatus(status);
  const periodEnd = safeDate(currentPeriodEnd);
  const graceEnd = safeDate(gracePeriodEnd);

  const isWithinCurrentPeriod = Boolean(periodEnd && now <= periodEnd);
  const isWithinGracePeriod =
    normalizedStatus === SUBSCRIPTION_STATUS.PAST_DUE &&
    Boolean(graceEnd && now <= graceEnd);

  const hasActiveAccess =
    normalizedStatus === SUBSCRIPTION_STATUS.ACTIVE ||
    isWithinGracePeriod ||
    (normalizedStatus === SUBSCRIPTION_STATUS.CANCELLED && isWithinCurrentPeriod);

  const daysRemaining = periodEnd
    ? Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
    : null;

  const featureEnabled = hasActiveAccess;

  const warnings = [];
  if (isWithinGracePeriod) {
    warnings.push('Subscription is in grace period. Renew to avoid feature interruption.');
  }

  return {
    status: normalizedStatus,
    hasActiveAccess,
    inGracePeriod: isWithinGracePeriod,
    daysRemaining,
    currentPeriodEnd: periodEnd,
    gracePeriodEnd: graceEnd,
    features: {
      aiTestStudio: {
        enabled: featureEnabled,
        reason: featureEnabled
          ? 'active_subscription'
          : 'inactive_subscription'
      }
    },
    warnings
  };
};

const ensureOwnerContext = async ({ userId, coachingId }) => {
  if (!coachingId) throw new Error('Coaching context is missing from token');

  const user = await prisma.user.findUnique({
    where: { id: Number(userId) },
    include: {
      coaching_center: {
        select: { id: true, name: true }
      }
    }
  });

  if (!user || !user.is_active) {
    throw new Error('Owner account not found or inactive');
  }

  if (user.role !== ROLES.OWNER) {
    throw new Error('Only owner can manage subscriptions');
  }

  if (Number(user.coaching_center_id) !== Number(coachingId)) {
    throw new Error('Owner does not belong to selected coaching center');
  }

  return user;
};

const setCenterSubscriptionState = async (tx, coachingId, payload) => {
  await tx.user.updateMany({
    where: { coaching_center_id: Number(coachingId) },
    data: payload
  });
};

const normalizeSubscription = (subRecord, ownerUser) => ({
  provider: subRecord?.provider || 'revenuecat',
  appUserId: subRecord?.revenuecat_app_user_id || null,
  entitlementId: subRecord?.entitlement_id || null,
  productId: subRecord?.product_id || null,
  subscriptionId:
    subRecord?.original_transaction_id ||
    subRecord?.revenuecat_app_user_id ||
    ownerUser.subscription_id,
  status: ownerUser.subscription_status || SUBSCRIPTION_STATUS.INACTIVE,
  currentPeriodEnd: ownerUser.current_period_end,
  gracePeriodEnd: ownerUser.grace_period_end,
  planType: ownerUser.plan_type || 'basic',
  trialActive: Boolean(ownerUser.trial_active),
  trialEnd: ownerUser.trial_end,
  coachingId: ownerUser.coaching_center_id,
  coachingName: ownerUser.coaching_center?.name || null
});

const buildAppUserId = ({ userId, coachingId }) => {
  return `owner:${Number(userId)}:coaching:${Number(coachingId)}`;
};

const parseAppUserId = (appUserId) => {
  const match = /^owner:(\d+):coaching:(\d+)$/.exec((appUserId || '').trim());
  if (!match) return null;

  return {
    userId: Number(match[1]),
    coachingId: Number(match[2])
  };
};

const createSubscription = async ({ userId, coachingId }) => {
  const owner = await ensureOwnerContext({ userId, coachingId });
  const appUserId = buildAppUserId({ userId, coachingId });

  const existingSubscription = await prisma.coachingSubscription.findFirst({
    where: { coaching_center_id: Number(coachingId) },
    orderBy: { id: 'desc' }
  });

  const subRecord = existingSubscription
    ? await prisma.coachingSubscription.update({
        where: { id: existingSubscription.id },
        data: {
          provider: 'revenuecat',
          revenuecat_app_user_id: appUserId,
          entitlement_id: 'Shixa Pro'
        }
      })
    : await prisma.coachingSubscription.create({
        data: {
          coaching_center_id: Number(coachingId),
          status: SUBSCRIPTION_STATUS.INACTIVE,
          provider: 'revenuecat',
          revenuecat_app_user_id: appUserId,
          entitlement_id: 'Shixa Pro'
        }
      });

  await audit({
    userId: Number(userId),
    action: 'CREATE_SUBSCRIPTION_SESSION',
    entityType: 'COACHING_SUBSCRIPTION',
    entityId: subRecord.id,
    metadata: {
      coachingId: Number(coachingId),
      provider: 'revenuecat',
      appUserId
    }
  });

  return {
    provider: 'revenuecat',
    appUserId,
    entitlementId: 'Shixa Pro',
    products: ['yearly', 'six_month', 'monthly'],
    instructions: {
      message: 'Complete purchase in app using RevenueCat paywall.',
      ownerEmail: owner.email,
      coachingName: owner.coaching_center?.name || 'Shixa'
    },
    subscription: normalizeSubscription(subRecord, owner)
  };
};

const getMySubscription = async ({ userId, coachingId }) => {
  const owner = await ensureOwnerContext({ userId, coachingId });

  const subRecord = await prisma.coachingSubscription.findFirst({
    where: { coaching_center_id: Number(coachingId) },
    orderBy: { id: 'desc' }
  });

  return normalizeSubscription(subRecord, owner);
};

const cancelSubscription = async ({ userId, coachingId }) => {
  await ensureOwnerContext({ userId, coachingId });

  await audit({
    userId: Number(userId),
    action: 'CANCEL_SUBSCRIPTION_REQUEST',
    entityType: 'COACHING_SUBSCRIPTION',
    entityId: Number(coachingId),
    metadata: {
      provider: 'revenuecat',
      mode: 'managed_by_store'
    }
  });

  return {
    provider: 'revenuecat',
    status: 'managed_by_store',
    message: 'Cancel or manage subscription from RevenueCat Customer Center / app store subscription settings.'
  };
};

const computeGraceEnd = () => {
  const date = new Date();
  date.setDate(date.getDate() + DEFAULT_GRACE_DAYS);
  return date;
};

const verifyRevenueCatWebhookAuth = ({ rawBody, authorizationHeader, signatureHeader }) => {
  const secret = getRequiredEnv('REVENUECAT_WEBHOOK_SECRET');
  const authValue = (authorizationHeader || '').trim();

  const authAccepted =
    authValue === secret ||
    authValue === `Bearer ${secret}` ||
    authValue === `bearer ${secret}`;

  let signatureAccepted = false;
  if (signatureHeader) {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    signatureAccepted = expected === signatureHeader;
  }

  return authAccepted || signatureAccepted;
};

const sendSubscriptionStatusNotification = async (coachingId, newStatus) => {
  try {
    // Get coaching owner(s) - usually just one owner per coaching
    const owners = await prisma.user.findMany({
      where: {
        coaching_center_id: Number(coachingId),
        role: ROLES.OWNER,
        is_active: true
      },
      select: { id: true }
    });

    if (owners.length === 0) return;

    const ownerIds = owners.map(o => o.id);
    const statusLabel =
      newStatus === SUBSCRIPTION_STATUS.ACTIVE ? 'Active' :
      newStatus === SUBSCRIPTION_STATUS.PAST_DUE ? 'Past Due' :
      newStatus === SUBSCRIPTION_STATUS.CANCELLED ? 'Cancelled' : newStatus;

    await notificationService.sendSubscriptionStatusNotification({
      ownerUserIds: ownerIds,
      status: newStatus,
      coachingId: String(coachingId)
    });

    console.log('[Notification] Subscription push sent', {
      coachingId,
      status: statusLabel,
      ownerCount: ownerIds.length
    });
  } catch (error) {
    // Log but don't block subscription status update
    console.log('[Notification] Failed to send subscription status push:', error.message);
  }
};


const mapRevenueCatEventToStatus = (eventType) => {
  if (REVENUECAT_WEBHOOK_EVENTS.ACTIVE.includes(eventType)) {
    return SUBSCRIPTION_STATUS.ACTIVE;
  }

  if (REVENUECAT_WEBHOOK_EVENTS.PAST_DUE.includes(eventType)) {
    return SUBSCRIPTION_STATUS.PAST_DUE;
  }

  if (REVENUECAT_WEBHOOK_EVENTS.CANCELLED.includes(eventType)) {
    return SUBSCRIPTION_STATUS.CANCELLED;
  }

  return null;
};

const normalizeRevenueCatEvent = (rawBody) => {
  const parsed = JSON.parse(rawBody.toString('utf8'));
  const event = parsed?.event || parsed;
  const entitlementIds =
    event?.entitlement_ids ||
    (event?.entitlement_id ? [event.entitlement_id] : []);

  const expiresAt =
    fromMsTs(event?.expiration_at_ms) ||
    (event?.expiration_at ? new Date(event.expiration_at) : null);

  const eventAt =
    fromMsTs(event?.event_timestamp_ms) ||
    new Date();

  const eventId =
    event?.id ||
    event?.event_id ||
    `${event?.type || 'unknown'}:${event?.original_transaction_id || event?.transaction_id || 'na'}:${eventAt.getTime()}`;

  return {
    eventId,
    eventType: (event?.type || '').toString(),
    appUserId: (event?.app_user_id || '').toString(),
    entitlementIds,
    productId: event?.product_id || null,
    originalTransactionId:
      event?.original_transaction_id || event?.transaction_id || null,
    expiresAt,
    eventAt,
    rawPayload: parsed
  };
};

const getEntitlementStatus = async ({ userId, coachingId }) => {
  const owner = await ensureOwnerContext({ userId, coachingId });

  const subRecord = await prisma.coachingSubscription.findFirst({
    where: { coaching_center_id: Number(coachingId) },
    orderBy: [{ last_event_at: 'desc' }, { id: 'desc' }]
  });

  const normalized = normalizeSubscription(subRecord, owner);
  const computed = computeAccessState({
    status: normalized.status,
    currentPeriodEnd: normalized.currentPeriodEnd,
    gracePeriodEnd: normalized.gracePeriodEnd,
    planType: normalized.planType
  });

  return {
    ...normalizeSubscription(subRecord, owner),
    lastEventType: subRecord?.last_event_type || null,
    lastEventAt: subRecord?.last_event_at || null,
    expiresAt: subRecord?.expires_at || owner.current_period_end,
    hasActiveAccess: computed.hasActiveAccess,
    inGracePeriod: computed.inGracePeriod,
    daysRemaining: computed.daysRemaining,
    features: computed.features,
    warnings: computed.warnings,
    syncedAt: new Date(),
    syncedFrom: 'database'
  };
};

const updateCenterStateByRevenueCatEvent = async ({ eventType, subRecord, eventPayload }) => {
  const coachingId = subRecord.coaching_center_id;
  const mappedStatus = mapRevenueCatEventToStatus(eventType);

  if (!mappedStatus) {
    return;
  }

  const isPastDue = mappedStatus === SUBSCRIPTION_STATUS.PAST_DUE;
  const isCancelled = mappedStatus === SUBSCRIPTION_STATUS.CANCELLED;
  const graceEnd = isPastDue ? computeGraceEnd() : null;

  await prisma.$transaction(async (tx) => {
    await tx.coachingSubscription.update({
      where: { id: subRecord.id },
      data: {
        status: mappedStatus,
        provider: 'revenuecat',
        entitlement_id: eventPayload.entitlementIds[0] || subRecord.entitlement_id,
        product_id: eventPayload.productId || subRecord.product_id,
        original_transaction_id:
          eventPayload.originalTransactionId || subRecord.original_transaction_id,
        revenuecat_app_user_id: eventPayload.appUserId || subRecord.revenuecat_app_user_id,
        expires_at: eventPayload.expiresAt,
        current_end: eventPayload.expiresAt,
        payment_fail_count: isPastDue ? { increment: 1 } : 0,
        grace_end: graceEnd,
        cancelled_at: isCancelled ? new Date() : null,
        last_event_type: eventPayload.eventType,
        last_event_at: eventPayload.eventAt,
        metadata: eventPayload.rawPayload
      }
    });

    await setCenterSubscriptionState(tx, coachingId, {
      subscription_status: mappedStatus,
      subscription_id:
        eventPayload.originalTransactionId ||
        eventPayload.appUserId ||
        null,
      current_period_end: eventPayload.expiresAt,
      grace_period_end: graceEnd,
      trial_active: false,
      trial_end: null,
      plan_type: eventPayload.entitlementIds.includes('Shixa Pro') ? 'pro' : 'basic'
    });

    await tx.subscriptionEvent.create({
      data: {
        coaching_center_id: Number(coachingId),
        provider: 'revenuecat',
        provider_event_id: eventPayload.eventId,
        event_type: eventPayload.eventType,
        payload: eventPayload.rawPayload,
        processed_at: eventPayload.eventAt
      }
    });
  });

  sendSubscriptionStatusNotification(coachingId, mappedStatus).catch(() => {});
};

const processRevenueCatWebhook = async ({ rawBody, authorization, signature }) => {
  if (
    !verifyRevenueCatWebhookAuth({
      rawBody,
      authorizationHeader: authorization,
      signatureHeader: signature
    })
  ) {
    throw new Error('Invalid RevenueCat webhook authorization/signature');
  }

  const eventPayload = normalizeRevenueCatEvent(rawBody);

  if (!eventPayload.eventType) {
    throw new Error('RevenueCat event type missing');
  }

  if (!eventPayload.appUserId) {
    return { processed: false, reason: 'app_user_id_missing' };
  }

  const mapped = parseAppUserId(eventPayload.appUserId);
  if (!mapped) {
    return { processed: false, reason: 'invalid_app_user_id_format', appUserId: eventPayload.appUserId };
  }

  const existingEvent = await prisma.subscriptionEvent.findUnique({
    where: { provider_event_id: eventPayload.eventId }
  });

  if (existingEvent) {
    return {
      processed: true,
      duplicate: true,
      eventType: eventPayload.eventType,
      eventId: eventPayload.eventId
    };
  }

  const subRecord =
    await prisma.coachingSubscription.findFirst({
      where: { coaching_center_id: Number(mapped.coachingId) },
      orderBy: { id: 'desc' }
    }) ||
    await prisma.coachingSubscription.create({
      data: {
        coaching_center_id: Number(mapped.coachingId),
        status: SUBSCRIPTION_STATUS.INACTIVE,
        provider: 'revenuecat',
        revenuecat_app_user_id: eventPayload.appUserId,
        entitlement_id: 'Shixa Pro'
      }
    });

  const mappedStatus = mapRevenueCatEventToStatus(eventPayload.eventType);
  if (!mappedStatus) {
    await prisma.subscriptionEvent.create({
      data: {
        coaching_center_id: Number(mapped.coachingId),
        provider: 'revenuecat',
        provider_event_id: eventPayload.eventId,
        event_type: eventPayload.eventType,
        payload: eventPayload.rawPayload,
        processed_at: eventPayload.eventAt
      }
    });

    return {
      processed: false,
      eventType: eventPayload.eventType,
      eventId: eventPayload.eventId,
      appUserId: eventPayload.appUserId,
      reason: 'unsupported_event'
    };
  }

  await updateCenterStateByRevenueCatEvent({
    eventType: eventPayload.eventType,
    subRecord,
    eventPayload
  });

  await audit({
    userId: Number(mapped.userId),
    action: 'REVENUECAT_WEBHOOK_PROCESSED',
    entityType: 'COACHING_SUBSCRIPTION',
    entityId: Number(mapped.coachingId),
    metadata: {
      eventId: eventPayload.eventId,
      eventType: eventPayload.eventType,
      appUserId: eventPayload.appUserId
    }
  });

  return {
    processed: true,
    eventType: eventPayload.eventType,
    eventId: eventPayload.eventId,
    appUserId: eventPayload.appUserId,
    isSupported: true
  };
};

module.exports = {
  createSubscription,
  getMySubscription,
  cancelSubscription,
  getEntitlementStatus,
  computeAccessState,
  processRevenueCatWebhook
};