const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Computes the billing status for a student based on their record.
 * 
 * Logic:
 * 1. Check Payment Coverage (Priority #1): If paid for the target month (Current - 1), status is "paid".
 * 2. Manual Flags (Priority #2): Check if manually revoked or granted grace (LIG).
 * 3. Default Deadline (Priority #3): "due" if before the 15th, "revoked" if after.
 * 
 * @param {Object} user - The user object containing is_revoked, is_lig, and last_fee_paid_at
 * @returns {string} - "paid" | "due" | "revoked" | "lig"
 */
const computeStudentStatus = (user) => {
  const now = new Date();
  
  // Robust IST component extraction using formatToParts
  const istFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  
  const getIstParts = (date) => {
    const parts = istFormatter.formatToParts(date);
    const getPart = (type) => parseInt(parts.find(p => p.type === type).value);
    return { 
      day: getPart('day'), 
      month: getPart('month'), 
      year: getPart('year') 
    };
  };

  const { day: currentDay, month: currentMonth, year: currentYear } = getIstParts(now);

  // 1. Calculate Target Month (Previous Month)
  // e.g., In April, we check if March (month 3) is paid.
  let targetMonth = currentMonth - 1;
  let targetYear = currentYear;
  if (targetMonth === 0) {
    targetMonth = 12;
    targetYear--;
  }

  // 2. Check if paid for the target month or later (Priority #1)
  if (user.last_fee_paid_at) {
    const paidDate = new Date(user.last_fee_paid_at);
    // Ensure we parse the paidDate in IST as well to avoid boundary shifts
    const { month: paidMonth, year: paidYear } = getIstParts(paidDate);

    // If paidYear > targetYear OR (paidYear == targetYear AND paidMonth >= targetMonth)
    if (paidYear > targetYear || (paidYear === targetYear && paidMonth >= targetMonth)) {
      return 'paid';
    }
  }

  // 3. Manual Overrides (Priority #2)
  // These apply only if the student is NOT paid for the target month
  if (user.is_revoked === true) return 'revoked';
  if (user.is_lig === true) return 'lig';

  // 4. Default Deadline Check (Priority #3)
  // Access is allowed ("due") until the 15th of the month.
  if (currentDay <= 15) {
    return 'due';
  } else {
    return 'revoked';
  }
};

module.exports = {
  computeStudentStatus
};
