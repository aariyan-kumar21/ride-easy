const {
  DEFAULT_PRIORITY_CONFIG,
  getTimeCategory
} = require('../config/priority.config');

/**
 * Determine whether a given timestamp falls within configured night hours.
 * Handles ranges that wrap across midnight (e.g. 21:00 to 05:00).
 */
function isNightHour(dateInput = new Date(), config = DEFAULT_PRIORITY_CONFIG) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const hour = date.getHours();
  const minute = date.getMinutes();
  const { startHour, endHour } = config.nightHours || { startHour: 21, endHour: 5 };

  if (startHour === endHour) {
    return false;
  }

  if (startHour > endHour) {
    // Wraps across midnight: e.g. 21:00 -> 05:00
    return hour >= startHour || hour < endHour;
  }

  return hour >= startHour && hour < endHour;
}

/**
 * Determine priority tier and human-readable label for a passenger category
 * based on the simulation time.
 *
 * Tier Hierarchy:
 * - Priority Tier 1: Senior Citizens (All day/night)
 * - Priority Tier 2: Women during Night Hours (21:00 - 04:59)
 * - Priority Tier 3: Regular Passengers and Daytime Women (All day)
 */
function getPassengerPriority(category, dateInput = new Date(), config = DEFAULT_PRIORITY_CONFIG) {
  const cat = String(category || 'regular').toLowerCase();
  const nightHoursActive = isNightHour(dateInput, config);
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const timeCat = getTimeCategory(date.getHours(), date.getMinutes());

  if (cat === 'senior') {
    return {
      tier: 1,
      tierLabel: 'Senior Citizen — Highest Priority',
      categoryBonus: config.bonuses.senior,
      categoryReason: `Senior citizen (+${config.bonuses.senior})`,
      isNightHours: nightHoursActive,
      timeCategory: timeCat.label
    };
  }

  if (cat === 'woman') {
    if (nightHoursActive) {
      return {
        tier: 2,
        tierLabel: 'Woman — Night Priority',
        categoryBonus: config.bonuses.womanNight,
        categoryReason: `Woman booking during night hours (+${config.bonuses.womanNight})`,
        isNightHours: true,
        timeCategory: timeCat.label
      };
    }
    return {
      tier: 3,
      tierLabel: 'Woman — Standard Daytime Priority',
      categoryBonus: config.bonuses.regular,
      categoryReason: 'Woman booking during daytime (+0)',
      isNightHours: false,
      timeCategory: timeCat.label
    };
  }

  // Regular passenger
  return {
    tier: 3,
    tierLabel: 'Regular — Standard Priority',
    categoryBonus: config.bonuses.regular,
    categoryReason: 'Regular passenger (+0)',
    isNightHours: nightHoursActive,
    timeCategory: timeCat.label
  };
}

/**
 * Calculate priority score, tier, and breakdown for a booking.
 */
function calculatePriority(booking, options = {}) {
  const config = options.config || DEFAULT_PRIORITY_CONFIG;
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const createdAt = booking.createdAt ? new Date(booking.createdAt) : now;
  const category = String(booking.category || 'regular').toLowerCase();

  const priorityMeta = getPassengerPriority(category, now, config);

  const elapsedMs = Math.max(0, now.getTime() - createdAt.getTime());
  const fullMinutesWaited = Math.floor(elapsedMs / 60000);
  const waitingDurationSeconds = Math.floor(elapsedMs / 1000);
  const rawWaitBonus = fullMinutesWaited * config.waitingTime.pointsPerFullMinute;
  const waitingTimeBonus = Math.min(rawWaitBonus, config.waitingTime.maxBonus);

  const priorityScore = priorityMeta.categoryBonus + waitingTimeBonus;

  const waitReason =
    waitingTimeBonus > 0
      ? ` + ${fullMinutesWaited}m wait (+${waitingTimeBonus}${rawWaitBonus > config.waitingTime.maxBonus ? ', capped' : ''})`
      : '';

  return {
    priorityTier: priorityMeta.tier,
    priorityTierLabel: priorityMeta.tierLabel,
    priorityScore,
    waitingDurationSeconds,
    waitingMinutes: fullMinutesWaited,
    priorityBreakdown: {
      tier: priorityMeta.tier,
      tierLabel: priorityMeta.tierLabel,
      categoryBonus: priorityMeta.categoryBonus,
      waitingTimeBonus,
      waitingDurationSeconds,
      waitingMinutes: fullMinutesWaited,
      isNightHours: priorityMeta.isNightHours,
      timeCategory: priorityMeta.timeCategory,
      reason: `${priorityMeta.categoryReason}${waitReason}`
    }
  };
}

/**
 * Sort waiting/unassigned bookings using the strict priority hierarchy:
 * 1. Highest applicable priority tier (Tier 1 < Tier 2 < Tier 3)
 * 2. Longest waiting duration within that tier (waitingDurationSeconds DESC)
 * 3. Earliest booking sequence number as tie-breaker (sequenceNumber ASC)
 * 4. Earliest createdAt timestamp or bookingId ASC
 */
function sortRequestsByPriority(bookings, options = {}) {
  const recalculate = options.recalculate !== false;

  const enriched = bookings.map((item) => {
    const plain = typeof item.toObject === 'function' ? item.toObject() : { ...item };
    if (recalculate || plain.priorityTier === undefined) {
      const { priorityTier, priorityTierLabel, priorityScore, waitingDurationSeconds, waitingMinutes, priorityBreakdown } =
        calculatePriority(plain, options);
      plain.priorityTier = priorityTier;
      plain.priorityTierLabel = priorityTierLabel;
      plain.priorityScore = priorityScore;
      plain.waitingDurationSeconds = waitingDurationSeconds;
      plain.waitingMinutes = waitingMinutes;
      plain.priorityBreakdown = priorityBreakdown;
    }
    return plain;
  });

  return enriched.sort((a, b) => {
    // 1. Strict Priority Tier (Tier 1: Senior < Tier 2: Night Woman < Tier 3: Regular / Daytime Woman)
    const tierA = a.priorityTier ?? 3;
    const tierB = b.priorityTier ?? 3;
    if (tierA !== tierB) {
      return tierA - tierB;
    }

    // 2. Longest waiting duration within the tier (higher waiting duration first)
    const waitA = a.waitingDurationSeconds ?? 0;
    const waitB = b.waitingDurationSeconds ?? 0;
    if (waitA !== waitB) {
      return waitB - waitA;
    }

    // 3. Earliest booking sequence number as tie-breaker
    const seqA = a.sequenceNumber ?? Number.MAX_SAFE_INTEGER;
    const seqB = b.sequenceNumber ?? Number.MAX_SAFE_INTEGER;
    if (seqA !== seqB) {
      return seqA - seqB;
    }

    // 4. Earliest createdAt timestamp
    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    if (timeA !== timeB) {
      return timeA - timeB;
    }

    return String(a.bookingId || '').localeCompare(String(b.bookingId || ''));
  });
}

/**
 * Recalculate and persist priority tiers and scores for all queued bookings.
 */
async function recalculateQueuedBookings(BookingModel, options = {}) {
  const queued = await BookingModel.find({ status: 'queued' });
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());

  const updates = [];
  for (const doc of queued) {
    const calc = calculatePriority(doc, { ...options, now });
    doc.priorityTier = calc.priorityTier;
    doc.priorityTierLabel = calc.priorityTierLabel;
    doc.priorityScore = calc.priorityScore;
    doc.waitingDurationSeconds = calc.waitingDurationSeconds;
    doc.waitingMinutes = calc.waitingMinutes;
    doc.priorityBreakdown = calc.priorityBreakdown;

    updates.push(
      BookingModel.updateOne(
        { _id: doc._id },
        {
          $set: {
            priorityTier: calc.priorityTier,
            priorityTierLabel: calc.priorityTierLabel,
            priorityScore: calc.priorityScore,
            waitingDurationSeconds: calc.waitingDurationSeconds,
            waitingMinutes: calc.waitingMinutes,
            priorityBreakdown: calc.priorityBreakdown
          }
        }
      )
    );
  }

  if (updates.length > 0) {
    await Promise.all(updates);
  }

  const sorted = sortRequestsByPriority(queued, { ...options, now, recalculate: false });

  // Update queue positions (Priority #1, Priority #2, etc.)
  for (let i = 0; i < sorted.length; i++) {
    sorted[i].queuePosition = i + 1;
    await BookingModel.updateOne(
      { _id: sorted[i]._id },
      { $set: { queuePosition: i + 1 } }
    );
  }

  return sorted;
}

module.exports = {
  isNightHour,
  getPassengerPriority,
  calculatePriority,
  sortRequestsByPriority,
  recalculateQueuedBookings
};
