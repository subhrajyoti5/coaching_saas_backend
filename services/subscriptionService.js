const crypto = require('crypto');
const Razorpay = require('razorpay');

const prisma = require('../config/database');
const { SUBSCRIPTION_STATUS, WEBHOOK_EVENTS, ROLES } = require('../config/constants');
const { audit } = require('../utils/auditLogger');

const DEFAULT_GRACE_DAYS = Number(process.env.SUBSCRIPTION_GRACE_DAYS || 3);

const getRequiredEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
};

const getRazorpayClient = () => {
  return new Razorpay({
    key_id: getRequiredEnv('RAZORPAY_KEY_ID'),
    key_secret: getRequiredEnv('RAZORPAY_KEY_SECRET')
  });
};

const fromUnixTs = (value) => {
  if (!value) return null;
  return new Date(Number(value) * 1000);
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
  subscriptionId: subRecord?.razorpay_subscription_id || ownerUser.subscription_id,
  status: ownerUser.subscription_status || SUBSCRIPTION_STATUS.INACTIVE,
  currentPeriodEnd: ownerUser.current_period_end,
  gracePeriodEnd: ownerUser.grace_period_end,
  planType: ownerUser.plan_type || 'basic',
  trialActive: Boolean(ownerUser.trial_active),
  trialEnd: ownerUser.trial_end,
  coachingId: ownerUser.coaching_center_id,
  coachingName: ownerUser.coaching_center?.name || null
});

const createSubscription = async ({ userId, coachingId }) => {
  const owner = await ensureOwnerContext({ userId, coachingId });

  if (
    owner.subscription_status === SUBSCRIPTION_STATUS.ACTIVE &&
    owner.subscription_id
  ) {
    throw new Error('Subscription is already active for this coaching center');
  }

  const planId = getRequiredEnv('RAZORPAY_PLAN_ID_MONTHLY');
  const razorpay = getRazorpayClient();

  const subscription = await razorpay.subscriptions.create({
    plan_id: planId,
    customer_notify: 1,
    total_count: 120,
    notes: {
      coachingId: String(coachingId),
      ownerId: String(userId),
      ownerEmail: owner.email
    }
  });

  const now = new Date();

  const subRecord = await prisma.$transaction(async (tx) => {
    const created = await tx.coachingSubscription.create({
      data: {
        coaching_center_id: Number(coachingId),
        status: subscription.status,
        razorpay_subscription_id: subscription.id,
        razorpay_plan_id: subscription.plan_id || planId,
        current_start: fromUnixTs(subscription.current_start),
        current_end: fromUnixTs(subscription.current_end),
        metadata: subscription
      }
    });

    await setCenterSubscriptionState(tx, coachingId, {
      subscription_status: SUBSCRIPTION_STATUS.INACTIVE,
      subscription_id: subscription.id,
      current_period_end: null,
      grace_period_end: null,
      plan_type: 'basic',
      trial_active: false,
      trial_end: now
    });

    return created;
  });

  await audit({
    userId: Number(userId),
    action: 'CREATE_SUBSCRIPTION_CHECKOUT',
    entityType: 'COACHING_SUBSCRIPTION',
    entityId: subRecord.id,
    metadata: { coachingId: Number(coachingId), subscriptionId: subscription.id }
  });

  return {
    keyId: process.env.RAZORPAY_KEY_ID,
    subscriptionId: subscription.id,
    checkout: {
      name: owner.coaching_center?.name || 'Shixa',
      description: 'Shixa Monthly Subscription',
      prefill: {
        name: owner.name,
        email: owner.email
      },
      notes: {
        coachingId: String(coachingId),
        ownerId: String(userId)
      },
      theme: {
        color: '#0D1B6E'
      }
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

const cancelSubscription = async ({ userId, coachingId, cancelAtCycleEnd = true }) => {
  const owner = await ensureOwnerContext({ userId, coachingId });

  const subscriptionId = owner.subscription_id;
  if (!subscriptionId) {
    throw new Error('No active subscription found to cancel');
  }

  const razorpay = getRazorpayClient();
  const cancelled = await razorpay.subscriptions.cancel(subscriptionId, {
    cancel_at_cycle_end: Boolean(cancelAtCycleEnd)
  });

  await prisma.coachingSubscription.updateMany({
    where: { razorpay_subscription_id: subscriptionId },
    data: {
      status: cancelled.status,
      cancel_at: fromUnixTs(cancelled.charge_at),
      cancelled_at: cancelled.status === 'cancelled' ? new Date() : null,
      metadata: cancelled
    }
  });

  await prisma.user.updateMany({
    where: { coaching_center_id: Number(coachingId) },
    data: {
      subscription_status:
        cancelled.status === 'cancelled'
          ? SUBSCRIPTION_STATUS.CANCELLED
          : SUBSCRIPTION_STATUS.ACTIVE
    }
  });

  await audit({
    userId: Number(userId),
    action: 'CANCEL_SUBSCRIPTION',
    entityType: 'COACHING_SUBSCRIPTION',
    entityId: Number(coachingId),
    metadata: { subscriptionId, cancelAtCycleEnd: Boolean(cancelAtCycleEnd) }
  });

  return {
    subscriptionId,
    status: cancelled.status
  };
};

const computeGraceEnd = () => {
  const date = new Date();
  date.setDate(date.getDate() + DEFAULT_GRACE_DAYS);
  return date;
};

const resolveSubscriptionEntity = (eventBody) => {
  const payload = eventBody?.payload || {};
  return (
    payload.subscription?.entity ||
    payload.payment?.entity?.subscription ||
    payload.invoice?.entity?.subscription ||
    null
  );
};

const extractSubscriptionId = (eventBody) => {
  const fromEntity = resolveSubscriptionEntity(eventBody);
  if (fromEntity?.id) return fromEntity.id;

  const paymentEntity = eventBody?.payload?.payment?.entity;
  if (paymentEntity?.subscription_id) return paymentEntity.subscription_id;

  return null;
};

const verifyWebhookSignature = (rawBody, signature) => {
  const secret = getRequiredEnv('RAZORPAY_WEBHOOK_SECRET');

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  return expected === signature;
};

const updateCenterStateByEvent = async ({ event, subRecord, subscriptionEntity }) => {
  const coachingId = subRecord.coaching_center_id;
  const currentEnd = fromUnixTs(subscriptionEntity?.current_end || subscriptionEntity?.end_at);
  const currentStart = fromUnixTs(subscriptionEntity?.current_start || subscriptionEntity?.start_at);

  const baseSubUpdate = {
    status: subscriptionEntity?.status || subRecord.status,
    razorpay_plan_id: subscriptionEntity?.plan_id || subRecord.razorpay_plan_id,
    current_start: currentStart,
    current_end: currentEnd,
    metadata: subscriptionEntity || subRecord.metadata
  };

  await prisma.$transaction(async (tx) => {
    if (event === WEBHOOK_EVENTS.PAYMENT_FAILED) {
      await tx.coachingSubscription.update({
        where: { id: subRecord.id },
        data: {
          ...baseSubUpdate,
          payment_fail_count: { increment: 1 },
          grace_end: computeGraceEnd()
        }
      });

      await setCenterSubscriptionState(tx, coachingId, {
        subscription_status: SUBSCRIPTION_STATUS.PAST_DUE,
        current_period_end: currentEnd,
        grace_period_end: computeGraceEnd()
      });

      return;
    }

    if (
      event === WEBHOOK_EVENTS.SUBSCRIPTION_CANCELLED ||
      event === WEBHOOK_EVENTS.SUBSCRIPTION_COMPLETED ||
      event === WEBHOOK_EVENTS.SUBSCRIPTION_PAUSED
    ) {
      await tx.coachingSubscription.update({
        where: { id: subRecord.id },
        data: {
          ...baseSubUpdate,
          cancelled_at: new Date()
        }
      });

      await setCenterSubscriptionState(tx, coachingId, {
        subscription_status: SUBSCRIPTION_STATUS.CANCELLED,
        current_period_end: currentEnd,
        grace_period_end: null
      });

      return;
    }

    await tx.coachingSubscription.update({
      where: { id: subRecord.id },
      data: {
        ...baseSubUpdate,
        payment_fail_count: 0,
        grace_end: null,
        cancelled_at: null
      }
    });

    await setCenterSubscriptionState(tx, coachingId, {
      subscription_status: SUBSCRIPTION_STATUS.ACTIVE,
      current_period_end: currentEnd,
      grace_period_end: null
    });
  });
};

const processWebhook = async ({ rawBody, signature }) => {
  if (!verifyWebhookSignature(rawBody, signature)) {
    throw new Error('Invalid webhook signature');
  }

  const eventBody = JSON.parse(rawBody.toString('utf8'));
  const event = eventBody?.event;

  if (!event) {
    throw new Error('Webhook event is missing');
  }

  const validEvents = Object.values(WEBHOOK_EVENTS);
  if (!validEvents.includes(event)) {
    return { processed: false, reason: 'unsupported_event', event };
  }

  const subscriptionId = extractSubscriptionId(eventBody);
  if (!subscriptionId) {
    return { processed: false, reason: 'subscription_id_missing', event };
  }

  const subscriptionEntity = resolveSubscriptionEntity(eventBody);

  let subRecord = await prisma.coachingSubscription.findFirst({
    where: { razorpay_subscription_id: subscriptionId },
    orderBy: { id: 'desc' }
  });

  if (!subRecord && subscriptionEntity?.notes?.coachingId) {
    subRecord = await prisma.coachingSubscription.create({
      data: {
        coaching_center_id: Number(subscriptionEntity.notes.coachingId),
        status: subscriptionEntity.status,
        razorpay_subscription_id: subscriptionId,
        razorpay_plan_id: subscriptionEntity.plan_id || null,
        current_start: fromUnixTs(subscriptionEntity.current_start),
        current_end: fromUnixTs(subscriptionEntity.current_end),
        metadata: subscriptionEntity
      }
    });
  }

  if (!subRecord) {
    return { processed: false, reason: 'subscription_not_mapped', event, subscriptionId };
  }

  await updateCenterStateByEvent({ event, subRecord, subscriptionEntity });

  return { processed: true, event, subscriptionId };
};

module.exports = {
  createSubscription,
  getMySubscription,
  cancelSubscription,
  processWebhook
};