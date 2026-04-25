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
  if (user.is_revoked) {
    return 'revoked';
  }

  const now = new Date();
  
  // Get current date parts in IST
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  const [currentYear, currentMonth, currentDay] = formatter.format(now).split('-').map(Number);

  // Check if paid in current month
  if (user.last_fee_paid_at) {
    const paidDate = new Date(user.last_fee_paid_at);
    const [paidYear, paidMonth] = formatter.format(paidDate).split('-').map(Number);

    if (paidYear === currentYear && paidMonth === currentMonth) {
      return 'paid';
    }
  }

  // If not paid, check if past due date (15th)
  if (currentDay > 15) {
    return 'due';
  }

  return 'lig';
};

module.exports = {
  computeStudentStatus
};
