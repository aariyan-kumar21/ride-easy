const { DEFAULT_PRIORITY_CONFIG } = require('../config/priority.config');

/**
 * Determine whether a given timestamp falls within configured night hours.
 * Handles ranges that wrap across midnight (e.g. 22:00 to 06:00).
 */
function isNightHour(dateInput = new Date(), config = DEFAULT_PRIORITY_CONFIG) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const hour = date.getHours();
  const { startHour, endHour } = config.nightHours;

  if (startHour === endHour) {
    return false;
  }

  if (startHour > endHour) {
    // Wraps across midnight, e.g. 22:00 -> 06:00
    return hour >= startHour || hour < endHour;
  }

  return hour >= startHour && hour < endHour;
}

/**
 * Calculate priority score and human-readable breakdown on the backend.
 * Any client-supplied priorityScore is ignored.
 */
function calculatePriority(booking, options = {}) {
  const config = options.config || DEFAULT_PRIORITY_CONFIG;
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const createdAt = booking.createdAt ? new Date(booking.createdAt) : now;
  const category = String(booking.category || 'regular').toLowerCase();

  const nightHoursActive = isNightHour(createdAt, config);

  let categoryBonus = config.bonuses.regular;
  let categoryReason = 'Regular passenger (+0)';

  if (category === 'senior') {
    categoryBonus = config.bonuses.senior;
    categoryReason = `Senior citizen (+${categoryBonus})`;
  } else if (category === 'woman') {
    if (nightHoursActive) {
      categoryBonus = config.bonuses.womanNight;
      categoryReason = `Woman booking during night hours (+${categoryBonus})`;
    } else {
      categoryBonus = config.bonuses.regular;
      categoryReason = 'Woman booking during daytime (+0)';
    }
  }

  const elapsedMs = Math.max(0, now.getTime() - createdAt.getTime());
  const fullMinutesWaited = Math.floor(elapsedMs / 60000);
  const rawWaitBonus = fullMinutesWaited * config.waitingTime.pointsPerFullMinute;
  const waitingTimeBonus = Math.min(rawWaitBonus, config.waitingTime.maxBonus);

  const priorityScore = categoryBonus + waitingTimeBonus;

  const waitReason =
    waitingTimeBonus > 0
      ? ` + ${fullMinutesWaited}m wait (+${waitingTimeBonus}${rawWaitBonus > config.waitingTime.maxBonus ? ', capped' : ''})`
      : '';

  return {
    priorityScore,
    priorityBreakdown: {
      categoryBonus,
      waitingTimeBonus,
      isNightHours: nightHoursActive,
      reason: `${categoryReason}${waitReason}`
    }
  };
}

/**
 * Sort bookings deterministically by:
 * 1. Highest priorityScore first
 * 2. Earliest createdAt first
 * 3. bookingId ascending as final tie-breaker
 */
function sortRequestsByPriority(bookings, options = {}) {
  const recalculate = options.recalculate !== false;

  const enriched = bookings.map((item) => {
    const plain = typeof item.toObject === 'function' ? item.toObject() : { ...item };
    if (recalculate) {
      const { priorityScore, priorityBreakdown } = calculatePriority(plain, options);
      plain.priorityScore = priorityScore;
      plain.priorityBreakdown = priorityBreakdown;
    }
    return plain;
  });

  return enriched.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) {
      return b.priorityScore - a.priorityScore;
    }

    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    if (timeA !== timeB) {
      return timeA - timeB;
    }

    return String(a.bookingId || '').localeCompare(String(b.bookingId || ''));
  });
}

/**
 * Recalculate and persist priority scores for all queued bookings in MongoDB.
 */
async function recalculateQueuedBookings(BookingModel, options = {}) {
  const queued = await BookingModel.find({ status: 'queued' });
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());

  const updates = [];
  for (const doc of queued) {
    const { priorityScore, priorityBreakdown } = calculatePriority(doc, { ...options, now });
    doc.priorityScore = priorityScore;
    doc.priorityBreakdown = priorityBreakdown;
    updates.push(
      BookingModel.updateOne(
        { _id: doc._id },
        { $set: { priorityScore, priorityBreakdown } }
      )
    );
  }

  if (updates.length > 0) {
    await Promise.all(updates);
  }

  return sortRequestsByPriority(queued, { ...options, now, recalculate: false });
}

module.exports = {
  isNightHour,
  calculatePriority,
  sortRequestsByPriority,
  recalculateQueuedBookings
};

