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
  if (user.is_revoked) return 'revoked';
  if (user.is_lig) return 'lig';

  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  const [currentYear, currentMonth, currentDay] = formatter.format(now).split('-').map(Number);

  // Target month is the previous month
  // e.g., In April, we check if March (month 3) is paid.
  let targetMonth = currentMonth - 1;
  let targetYear = currentYear;
  if (targetMonth === 0) {
    targetMonth = 12;
    targetYear--;
  }

  // Check if paid up to or beyond the target month
  if (user.last_fee_paid_at) {
    const paidDate = new Date(user.last_fee_paid_at);
    const [paidYear, paidMonth] = formatter.format(paidDate).split('-').map(Number);

    // If paidYear > targetYear OR (paidYear == targetYear AND paidMonth >= targetMonth)
    // then the student has paid for the previous month.
    if (paidYear > targetYear || (paidYear === targetYear && paidMonth >= targetMonth)) {
      return 'paid';
    }
  }

  // Not paid for the target month.
  // Check if we are within the grace period (1st to 15th of current month)
  if (currentDay <= 15) {
    return 'due';
  } else {
    return 'revoked';
  }
};

module.exports = {
  computeStudentStatus
};
