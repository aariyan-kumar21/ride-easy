const {
  DEFAULT_PRIORITY_CONFIG,
  getTimeCategory
} = require('../config/priority.config');

/**
 * Retrieve the current simulation clock time from simulation service,
 * falling back safely to system time if not yet initialized.
 */
function getCurrentSimulationTime() {
  try {
    const simService = require('./simulation.service');
    if (typeof simService.getSimulationTime === 'function') {
      return simService.getSimulationTime();
    }
  } catch (_) {}
  return new Date();
}

/**
 * Determine whether a given timestamp falls within configured night hours.
 * Handles ranges that wrap across midnight (e.g. 21:00 to 05:00).
 * Configurable boundaries: DAYTIME: 05:00 AM to 08:59 PM; NIGHTTIME: 09:00 PM to 04:59 AM.
 */
function isNightHour(dateInput = getCurrentSimulationTime(), config = DEFAULT_PRIORITY_CONFIG) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const hour = date.getHours();
  const startHour = config.nightHours?.startHour ?? 21; // 21:00 (09:00 PM)
  const endHour = config.nightHours?.endHour ?? 5;       // 05:00 (05:00 AM)

  if (startHour === endHour) {
    return false;
  }

  if (startHour > endHour) {
    // Wraps across midnight: hour >= 21 || hour < 5
    return hour >= startHour || hour < endHour;
  }

  return hour >= startHour && hour < endHour;
}

/**
 * Determine the applicable time category details given a simulation timestamp.
 */
function getApplicableTimeCategory(dateInput = getCurrentSimulationTime(), config = DEFAULT_PRIORITY_CONFIG) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const isNight = isNightHour(date, config);
  const timeCat = getTimeCategory(date.getHours(), date.getMinutes());
  return {
    ...timeCat,
    isNight,
    periodLabel: isNight ? 'Nighttime (09:00 PM – 04:59 AM)' : 'Daytime (05:00 AM – 08:59 PM)'
  };
}

/**
 * Determine the exact passenger priority tier and metadata based on simulation time.
 *
 * Strict Hierarchy:
 * - DAYTIME (05:00 AM to 08:59 PM):
 *   1. Senior Citizens — Highest Priority (Tier 1)
 *   2. Women — Second Priority (Tier 2)
 *   3. Regular Passengers (Men) — Third Priority (Tier 3)
 *
 * - NIGHTTIME (09:00 PM to 04:59 AM):
 *   1. Women — Highest Priority (Tier 1)
 *   2. Senior Citizens — Second Priority (Tier 2)
 *   3. Regular Passengers (Men) — Third Priority (Tier 3)
 */
function getPassengerPriorityTier(category, dateInput = getCurrentSimulationTime(), config = DEFAULT_PRIORITY_CONFIG) {
  const cat = String(category || 'regular').toLowerCase();
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const nightHoursActive = isNightHour(date, config);
  const timeCat = getTimeCategory(date.getHours(), date.getMinutes());

  if (nightHoursActive) {
    // NIGHTTIME
    if (cat === 'woman') {
      return {
        tier: 1,
        tierLabel: 'Woman — Highest Priority',
        categoryBonus: config.nighttimeTiers?.woman?.bonus ?? 40,
        categoryReason: 'Woman booking during nighttime (Highest Priority, Tier 1)',
        isNightHours: true,
        timeCategory: timeCat.label
      };
    }
    if (cat === 'senior') {
      return {
        tier: 2,
        tierLabel: 'Senior Citizen — Second Priority',
        categoryBonus: config.nighttimeTiers?.senior?.bonus ?? 20,
        categoryReason: 'Senior citizen during nighttime (Second Priority, Tier 2)',
        isNightHours: true,
        timeCategory: timeCat.label
      };
    }
    return {
      tier: 3,
      tierLabel: 'Regular — Third Priority',
      categoryBonus: config.nighttimeTiers?.regular?.bonus ?? 0,
      categoryReason: 'Regular passenger (Third Priority, Tier 3)',
      isNightHours: true,
      timeCategory: timeCat.label
    };
  } else {
    // DAYTIME
    if (cat === 'senior') {
      return {
        tier: 1,
        tierLabel: 'Senior Citizen — Highest Priority',
        categoryBonus: config.daytimeTiers?.senior?.bonus ?? 40,
        categoryReason: 'Senior citizen during daytime (Highest Priority, Tier 1)',
        isNightHours: false,
        timeCategory: timeCat.label
      };
    }
    if (cat === 'woman') {
      return {
        tier: 2,
        tierLabel: 'Woman — Second Priority',
        categoryBonus: config.daytimeTiers?.woman?.bonus ?? 20,
        categoryReason: 'Woman booking during daytime (Second Priority, Tier 2)',
        isNightHours: false,
        timeCategory: timeCat.label
      };
    }
    return {
      tier: 3,
      tierLabel: 'Regular — Third Priority',
      categoryBonus: config.daytimeTiers?.regular?.bonus ?? 0,
      categoryReason: 'Regular passenger (Third Priority, Tier 3)',
      isNightHours: false,
      timeCategory: timeCat.label
    };
  }
}

/**
 * Backward compatible alias for getPassengerPriorityTier.
 */
function getPassengerPriority(category, dateInput = getCurrentSimulationTime(), config = DEFAULT_PRIORITY_CONFIG) {
  return getPassengerPriorityTier(category, dateInput, config);
}

/**
 * Extract integer simulation timestamp in seconds for a booking doc.
 */
function getBookingTimestampSeconds(booking) {
  if (booking.createdAtSimSeconds != null && Number.isFinite(Number(booking.createdAtSimSeconds))) {
    return Number(booking.createdAtSimSeconds);
  }
  if (booking.createdAt) {
    const ms = new Date(booking.createdAt).getTime();
    if (Number.isFinite(ms)) {
      return Math.floor(ms / 1000);
    }
  }
  return 0;
}

/**
 * Calculate the batch index for a booking based on the 3-second booking batch window.
 */
function getBookingBatch(booking, minTimeSec = 0, batchWindowSec = 3) {
  const sec = getBookingTimestampSeconds(booking);
  return Math.floor(Math.max(0, sec - minTimeSec) / batchWindowSec);
}

/**
 * Calculate priority score, tier, and breakdown for a booking.
 */
function calculatePriority(booking, options = {}) {
  const config = options.config || DEFAULT_PRIORITY_CONFIG;
  const now = options.now instanceof Date
    ? options.now
    : (options.now ? new Date(options.now) : getCurrentSimulationTime());
  const createdAt = booking.createdAt ? new Date(booking.createdAt) : now;
  const category = String(booking.category || 'regular').toLowerCase();

  const priorityMeta = getPassengerPriorityTier(category, now, config);

  const elapsedMs = Math.max(0, now.getTime() - createdAt.getTime());
  const fullMinutesWaited = Math.floor(elapsedMs / 60000);
  const waitingDurationSeconds = Math.floor(elapsedMs / 1000);
  const rawWaitBonus = fullMinutesWaited * (config.waitingTime?.pointsPerFullMinute ?? 1);
  const waitingTimeBonus = Math.min(rawWaitBonus, config.waitingTime?.maxBonus ?? 30);

  const priorityScore = priorityMeta.categoryBonus + waitingTimeBonus;

  const waitReason =
    waitingTimeBonus > 0
      ? ` + ${fullMinutesWaited}m wait (+${waitingTimeBonus}${rawWaitBonus > (config.waitingTime?.maxBonus ?? 30) ? ', capped' : ''})`
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
 * Centralized backend function responsible for sorting waiting bookings:
 * 1. Determines simulation time context.
 * 2. Re-evaluates priority tiers based on Daytime vs Nighttime.
 * 3. Groups near-simultaneous bookings into 3-second batches.
 * 4. Priority tier strictly dictates order: Tier 1 < Tier 2 < Tier 3.
 * 5. Within the same category & batch: earliest booking creation time.
 * 6. Across batches within the same category: preserves fairness (earlier batch / longer wait first).
 * 7. Sequence number as deterministic tie-breaker.
 */
function sortWaitingBookings(bookings, options = {}) {
  const now = options.now instanceof Date
    ? options.now
    : (options.now ? new Date(options.now) : getCurrentSimulationTime());
  const config = options.config || DEFAULT_PRIORITY_CONFIG;
  const batchWindowSec = config.batchWindowSeconds || 3;
  const recalculate = options.recalculate !== false;

  if (!Array.isArray(bookings) || bookings.length === 0) {
    return [];
  }

  // 1. Find min booking timestamp in seconds for relative batch grouping
  let minTimeSec = Number.MAX_SAFE_INTEGER;
  for (const b of bookings) {
    const sec = getBookingTimestampSeconds(b);
    if (sec < minTimeSec) minTimeSec = sec;
  }
  if (minTimeSec === Number.MAX_SAFE_INTEGER) minTimeSec = 0;

  // 2. Enrich bookings with recalculated priority and batch index
  const enriched = bookings.map((item) => {
    const plain = typeof item.toObject === 'function' ? item.toObject() : { ...item };
    if (recalculate || plain.priorityTier === undefined) {
      const calc = calculatePriority(plain, { now, config });
      plain.priorityTier = calc.priorityTier;
      plain.priorityTierLabel = calc.priorityTierLabel;
      plain.priorityScore = calc.priorityScore;
      plain.waitingDurationSeconds = calc.waitingDurationSeconds;
      plain.waitingMinutes = calc.waitingMinutes;
      plain.priorityBreakdown = calc.priorityBreakdown;
    }
    const sec = getBookingTimestampSeconds(plain);
    plain.batchIndex = Math.floor(Math.max(0, sec - minTimeSec) / batchWindowSec);
    plain._bookingTimestampSec = sec;
    return plain;
  });

  // 3. Sort strictly by hierarchy
  return enriched.sort((a, b) => {
    // a) Strict Priority Tier (Tier 1 < Tier 2 < Tier 3)
    const tierA = a.priorityTier ?? 3;
    const tierB = b.priorityTier ?? 3;
    if (tierA !== tierB) {
      return tierA - tierB;
    }

    // b) For bookings in different batches: earlier batch first (preserves fairness for waiting passengers)
    const batchA = a.batchIndex ?? 0;
    const batchB = b.batchIndex ?? 0;
    if (batchA !== batchB) {
      return batchA - batchB;
    }

    // c) For bookings within the same batch: earliest creation time
    const timeA = a._bookingTimestampSec ?? 0;
    const timeB = b._bookingTimestampSec ?? 0;
    if (timeA !== timeB) {
      return timeA - timeB;
    }

    // d) Earliest sequence number as tie-breaker
    const seqA = a.sequenceNumber ?? Number.MAX_SAFE_INTEGER;
    const seqB = b.sequenceNumber ?? Number.MAX_SAFE_INTEGER;
    if (seqA !== seqB) {
      return seqA - seqB;
    }

    return String(a.bookingId || '').localeCompare(String(b.bookingId || ''));
  });
}

/**
 * Backward compatible alias for sortWaitingBookings.
 */
function sortRequestsByPriority(bookings, options = {}) {
  return sortWaitingBookings(bookings, options);
}

/**
 * Assign unique, sequential 1-based queue positions (1, 2, 3...) for a sorted vehicle queue.
 * Guarantees no two passengers receive the same queue position within the vehicle queue.
 */
function assignUniqueQueuePositions(sortedBookings) {
  if (!Array.isArray(sortedBookings)) return [];
  return sortedBookings.map((booking, idx) => ({
    ...booking,
    queuePosition: idx + 1
  }));
}

/**
 * Centralized queue management & recalculation function.
 * Recalculates and persists unique queue positions for all waiting bookings:
 * - Separates Cabs and Autos into their respective vehicle-type queues.
 * - Sorts each queue with sortWaitingBookings.
 * - Assigns globally unique sequential positions (1, 2, 3...) within each vehicle queue.
 * - Persists queuePosition, priorityTier, waiting duration in storage.
 * - Clears queuePosition to null for non-waiting bookings.
 */
async function updateQueuePositions(options = {}) {
  const BookingModel = options.BookingModel || require('../models/Booking');
  const now = options.now instanceof Date
    ? options.now
    : (options.now ? new Date(options.now) : getCurrentSimulationTime());
  const config = options.config || DEFAULT_PRIORITY_CONFIG;

  // 1. Fetch all waiting bookings
  const waitingBookings = await BookingModel.find({
    status: { $in: ['requested', 'queued'] }
  });

  // 2. Separate into Cab bookings and Auto bookings
  const cabBookings = waitingBookings.filter(
    (b) => String(b.vehicleType || 'cab').toLowerCase() === 'cab'
  );
  const autoBookings = waitingBookings.filter(
    (b) => String(b.vehicleType || '').toLowerCase() === 'auto'
  );

  // 3. Sort each queue with centralized priority sorting
  const sortedCabs = sortWaitingBookings(cabBookings, { now, config, recalculate: true });
  const sortedAutos = sortWaitingBookings(autoBookings, { now, config, recalculate: true });

  // 4. Assign globally unique sequential positions (1, 2, 3...) within each vehicle queue
  const updatedCabs = assignUniqueQueuePositions(sortedCabs);
  const updatedAutos = assignUniqueQueuePositions(sortedAutos);

  // 5. Persist updated positions & priority metadata into the database
  const allUpdated = [...updatedCabs, ...updatedAutos];
  const updatePromises = allUpdated.map((b) =>
    BookingModel.updateOne(
      { bookingId: b.bookingId },
      {
        $set: {
          status: 'queued',
          priorityTier: b.priorityTier,
          priorityTierLabel: b.priorityTierLabel,
          priorityScore: b.priorityScore,
          priorityBreakdown: b.priorityBreakdown,
          waitingDurationSeconds: b.waitingDurationSeconds,
          waitingMinutes: b.waitingMinutes,
          queuePosition: b.queuePosition,
          batchIndex: b.batchIndex
        }
      }
    )
  );

  // 6. Ensure non-waiting bookings have queuePosition = null
  if (typeof BookingModel.updateMany === 'function') {
    updatePromises.push(
      BookingModel.updateMany(
        { status: { $nin: ['requested', 'queued'] } },
        { $set: { queuePosition: null } }
      )
    );
  }

  await Promise.all(updatePromises);

  return {
    cabs: updatedCabs,
    autos: updatedAutos,
    allQueued: allUpdated
  };
}

/**
 * Backward compatible alias for updateQueuePositions.
 */
async function recalculateQueuedBookings(BookingModel, options = {}) {
  const result = await updateQueuePositions({ BookingModel, ...options });
  return result.allQueued;
}

module.exports = {
  getCurrentSimulationTime,
  getApplicableTimeCategory,
  isNightHour,
  getPassengerPriorityTier,
  getPassengerPriority,
  getBookingTimestampSeconds,
  getBookingBatch,
  calculatePriority,
  sortWaitingBookings,
  sortRequestsByPriority,
  assignUniqueQueuePositions,
  updateQueuePositions,
  recalculateQueuedBookings
};
