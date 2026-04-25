const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Computes the billing status for a student based on their record.
 * 
 * Logic:
 * 1. IF is_revoked = true -> "revoked"
 * 2. ELSE IF last_fee_paid_at is in current month (IST) -> "paid"
 * 3. ELSE:
 *    IF today > 15th of current month -> "due"
 *    ELSE -> "lig" (grace period)
 * 
 * @param {Object} user - The user object containing is_revoked and last_fee_paid_at
 * @returns {string} - "paid" | "due" | "revoked" | "lig"
 */
const computeStudentStatus = (user) => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  const [currentYear, currentMonth, currentDay] = formatter.format(now).split('-').map(Number);

  // 1. Calculate Target Month (Previous Month)
  let targetMonth = currentMonth - 1;
  let targetYear = currentYear;
  if (targetMonth === 0) {
    targetMonth = 12;
    targetYear--;
  }

  // 2. Check if paid for the target month (Priority #1: Payment status)
  if (user.last_fee_paid_at) {
    const paidDate = new Date(user.last_fee_paid_at);
    const [paidYear, paidMonth] = formatter.format(paidDate).split('-').map(Number);

    if (paidYear > targetYear || (paidYear === targetYear && paidMonth >= targetMonth)) {
      return 'paid';
    }
  }

  // 3. Manual Override (Priority #2: Manual Revoke/LIG)
  if (user.is_revoked) return 'revoked';
  if (user.is_lig) return 'lig';

  // 4. Default Deadline Check (Priority #3: Automatic Revoke after 15th)
  if (currentDay <= 15) {
    return 'due';
  } else {
    return 'revoked';
  }
};

module.exports = {
  computeStudentStatus
};
