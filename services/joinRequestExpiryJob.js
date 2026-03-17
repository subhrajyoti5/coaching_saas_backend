const onboardingService = require('./onboardingService');

const DEFAULT_INTERVAL_MS = 3 * 60 * 1000;
let intervalRef = null;

const runExpiryCycle = async () => {
  try {
    const expiredCount = await onboardingService.expirePendingJoinRequests();
    if (expiredCount > 0) {
      console.log(`[JoinRequestExpiryJob] Expired ${expiredCount} pending join request(s).`);
    }
  } catch (error) {
    console.error('[JoinRequestExpiryJob] Failed:', error.message);
  }
};

const startJoinRequestExpiryJob = () => {
  const configured = Number(process.env.JOIN_REQUEST_EXPIRY_JOB_INTERVAL_MS);
  const intervalMs = Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_INTERVAL_MS;

  if (intervalRef) {
    return intervalRef;
  }

  runExpiryCycle();
  intervalRef = setInterval(runExpiryCycle, intervalMs);
  console.log(`[JoinRequestExpiryJob] Started (interval: ${intervalMs} ms)`);

  return intervalRef;
};

const stopJoinRequestExpiryJob = () => {
  if (intervalRef) {
    clearInterval(intervalRef);
    intervalRef = null;
  }
};

module.exports = {
  startJoinRequestExpiryJob,
  stopJoinRequestExpiryJob
};
