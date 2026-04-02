const admin = require('firebase-admin');
const prisma = require('../config/database');

let firebaseReady = false;

const compactText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const clampText = (value, maxLength) => {
  const text = compactText(value);
  if (!maxLength || text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
};

const toDataStrings = (data = {}) => {
  return Object.entries(data).reduce((acc, [key, value]) => {
    acc[key] = value == null ? '' : String(value);
    return acc;
  }, {});
};

const buildNoticeCopy = (notice = {}) => {
  const title = clampText(notice.title || 'New Notice Posted', 80);
  const body = clampText(
    notice.content || 'A new notice is available. Tap to view details.',
    140
  );
  return { title, body };
};

const buildClaimCopy = ({ status, batchName }) => {
  const normalized = String(status || '').toUpperCase();

  if (normalized === 'VERIFIED') {
    return {
      title: 'Claim Verified',
      body: clampText(
        `Your payment claim${batchName ? ` for ${batchName}` : ''} is verified and pending final approval.`,
        140
      )
    };
  }

  if (normalized === 'APPROVED') {
    return {
      title: 'Claim Approved',
      body: clampText(
        `Great news. Your payment claim${batchName ? ` for ${batchName}` : ''} has been approved.`,
        140
      )
    };
  }

  if (normalized === 'REJECTED') {
    return {
      title: 'Claim Needs Update',
      body: clampText(
        `Your payment claim${batchName ? ` for ${batchName}` : ''} was rejected. Check details and resubmit.`,
        140
      )
    };
  }

  return {
    title: 'Payment Claim Update',
    body: clampText(`Your payment claim status is now ${normalized || 'UPDATED'}.`, 140)
  };
};

const buildSubscriptionCopy = (status) => {
  const normalized = String(status || '').toLowerCase();

  if (normalized === 'active') {
    return {
      title: 'Subscription Active',
      body: 'Your coaching subscription is active. All premium access is available.'
    };
  }

  if (normalized === 'past_due') {
    return {
      title: 'Subscription Payment Due',
      body: 'Payment is overdue. Update billing soon to avoid interruption.'
    };
  }

  if (normalized === 'cancelled') {
    return {
      title: 'Subscription Cancelled',
      body: 'Your subscription has been cancelled. Renew anytime to restore full access.'
    };
  }

  return {
    title: 'Subscription Status Updated',
    body: clampText(`Your subscription status changed to ${normalized || 'updated'}.`, 140)
  };
};

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

const sendPushToUsers = async ({ userIds = [], title, body, data = {}, androidTag = '' }) => {
  const normalizedIds = [...new Set(userIds.map(Number).filter(Boolean))];
  if (!normalizedIds.length) return { sent: false, reason: 'no_users' };

  const tokens = await getActiveTokensByUserIds(normalizedIds);
  if (!tokens.length) return { sent: false, reason: 'no_tokens' };

  if (!ensureFirebaseReady()) {
    return { sent: false, reason: 'fcm_not_configured' };
  }

  const message = {
    tokens,
    notification: {
      title: clampText(title || 'New Update', 80),
      body: clampText(body || 'Tap to open.', 140)
    },
    data: toDataStrings(data),
    android: {
      priority: 'high',
      notification: {
        channelId: 'shixa_high_priority',
        clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        sound: 'default',
        ...(androidTag ? { tag: clampText(androidTag, 60) } : {})
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
  const copy = buildNoticeCopy(notice);

  return sendPushToUsers({
    userIds: recipientUserIds,
    title: copy.title,
    body: copy.body,
    data: {
      type: 'notice',
      noticeId: notice?.id,
      coachingId: notice?.coaching?.id || notice?.coaching_center_id,
      batchId: notice?.batch?.id || ''
    },
    androidTag: `notice_${notice?.id || 'new'}`
  });
};

const sendPaymentClaimStatusNotification = async ({ studentId, claim, status }) => {
  if (!studentId) return { sent: false, reason: 'no_student' };

  const copy = buildClaimCopy({
    status,
    batchName: claim?.batch?.name || ''
  });

  return sendPushToUsers({
    userIds: [studentId],
    title: copy.title,
    body: copy.body,
    data: {
      type: 'payment_claim',
      claimId: claim?.id,
      status,
      batchId: claim?.batch_id,
      coachingId: claim?.coaching_center_id
    },
    androidTag: `payment_claim_${claim?.id || 'update'}`
  });
};

const sendSubscriptionStatusNotification = async ({ ownerUserIds = [], status, coachingId }) => {
  const copy = buildSubscriptionCopy(status);

  return sendPushToUsers({
    userIds: ownerUserIds,
    title: copy.title,
    body: copy.body,
    data: {
      type: 'subscription',
      coachingId,
      status
    },
    androidTag: `subscription_${coachingId || 'status'}`
  });
};

const sendMaterialUpdateNotification = async ({ recipientUserIds = [], material }) => {
  const title = clampText(material?.title || 'New Material Available', 80);
  const batchName = compactText(material?.batchName || 'your batch');
  const body = clampText(
    `New study material is available for ${batchName}. Tap to open and review.`,
    140
  );

  return sendPushToUsers({
    userIds: recipientUserIds,
    title,
    body,
    data: {
      type: 'material_update',
      documentId: material?.id,
      title,
      batchId: material?.batchId,
      coachingId: material?.coachingId,
      driveFileId: material?.driveFileId
    },
    androidTag: `material_${material?.id || 'update'}`
  });
};

module.exports = {
  sendPushToUsers,
  sendNoticeNotification,
  sendPaymentClaimStatusNotification,
  sendSubscriptionStatusNotification,
  sendMaterialUpdateNotification
};
