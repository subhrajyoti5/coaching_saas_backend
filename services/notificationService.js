const admin = require('firebase-admin');
const prisma = require('../config/database');

let firebaseReady = false;

const initFirebase = () => {
  if (firebaseReady || admin.apps.length > 0) {
    firebaseReady = true;
    return true;
  }

  const projectId = process.env.FCM_PROJECT_ID;
  const clientEmail = process.env.FCM_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FCM_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKeyRaw) {
    return false;
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey
    })
  });

  firebaseReady = true;
  return true;
};

const ensureFirebaseReady = () => {
  try {
    return initFirebase();
  } catch (error) {
    console.error('FCM init failed:', error.message);
    return false;
  }
};

const disableInvalidTokens = async (invalidTokens = []) => {
  if (!invalidTokens.length) return;

  await prisma.deviceToken.updateMany({
    where: { token: { in: invalidTokens } },
    data: { is_active: false, updated_at: new Date() }
  });
};

const getActiveTokensByUserIds = async (userIds = []) => {
  if (!userIds.length) return [];

  const rows = await prisma.deviceToken.findMany({
    where: {
      user_id: { in: userIds.map(Number) },
      is_active: true
    },
    select: { token: true }
  });

  return rows.map((row) => row.token);
};

const sendPushToUsers = async ({ userIds = [], title, body, data = {} }) => {
  const normalizedIds = [...new Set(userIds.map(Number).filter(Boolean))];
  if (!normalizedIds.length) return { sent: false, reason: 'no_users' };

  const tokens = await getActiveTokensByUserIds(normalizedIds);
  if (!tokens.length) return { sent: false, reason: 'no_tokens' };

  if (!ensureFirebaseReady()) {
    return { sent: false, reason: 'fcm_not_configured' };
  }

  const message = {
    tokens,
    notification: { title, body },
    data: Object.entries(data).reduce((acc, [key, value]) => {
      acc[key] = value == null ? '' : String(value);
      return acc;
    }, {}),
    android: {
      priority: 'high',
      notification: {
        channelId: 'shixa_high_priority'
      }
    }
  };

  const response = await admin.messaging().sendEachForMulticast(message);

  const invalidTokens = [];
  response.responses.forEach((result, idx) => {
    if (result.success) return;

    const code = result.error?.code || '';
    if (
      code.includes('registration-token-not-registered') ||
      code.includes('invalid-registration-token')
    ) {
      invalidTokens.push(tokens[idx]);
    }
  });

  await disableInvalidTokens(invalidTokens);

  return {
    sent: true,
    successCount: response.successCount,
    failureCount: response.failureCount
  };
};

const sendNoticeNotification = async ({ recipientUserIds = [], notice }) => {
  return sendPushToUsers({
    userIds: recipientUserIds,
    title: notice?.title || 'New Notice',
    body: notice?.content || 'A new notice has been posted.',
    data: {
      type: 'notice',
      noticeId: notice?.id,
      coachingId: notice?.coaching?.id || notice?.coaching_center_id,
      batchId: notice?.batch?.id || ''
    }
  });
};

const sendPaymentClaimStatusNotification = async ({ studentId, claim, status }) => {
  if (!studentId) return { sent: false, reason: 'no_student' };

  return sendPushToUsers({
    userIds: [studentId],
    title: 'Payment Claim Update',
    body: `Your payment claim is now ${String(status || '').toUpperCase()}.`,
    data: {
      type: 'payment_claim',
      claimId: claim?.id,
      status,
      batchId: claim?.batch_id,
      coachingId: claim?.coaching_center_id
    }
  });
};

const sendSubscriptionStatusNotification = async ({ ownerUserIds = [], status, coachingId }) => {
  return sendPushToUsers({
    userIds: ownerUserIds,
    title: 'Subscription Status Updated',
    body: `Your subscription status is now ${status}.`,
    data: {
      type: 'subscription',
      coachingId,
      status
    }
  });
};

module.exports = {
  sendPushToUsers,
  sendNoticeNotification,
  sendPaymentClaimStatusNotification,
  sendSubscriptionStatusNotification
};
