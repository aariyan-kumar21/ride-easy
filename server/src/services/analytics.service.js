const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'analytics.json');

/**
 * Standard Bengaluru Neighborhoods / Supported Pickup Areas
 * Each area contains coordinates, display label, and clearly marked simulated baseline estimates.
 */
const SUPPORTED_AREAS = {
  Indiranagar: {
    area: 'Indiranagar',
    name: 'Indiranagar',
    canonicalPickupLabel: 'Indiranagar 100ft Rd',
    lat: 12.9784,
    lng: 77.6408,
    baseline: {
      averageArrivalMinutes: 8,
      assignmentDelayMinutes: 1.2,
      morningPeakAverage: 11,
      eveningPeakAverage: 13,
      normalHoursAverage: 7
    }
  },
  Koramangala: {
    area: 'Koramangala',
    name: 'Koramangala',
    canonicalPickupLabel: 'Koramangala 4th Block',
    lat: 12.9389,
    lng: 77.6211,
    baseline: {
      averageArrivalMinutes: 10,
      assignmentDelayMinutes: 1.5,
      morningPeakAverage: 13,
      eveningPeakAverage: 15,
      normalHoursAverage: 8
    }
  },
  Whitefield: {
    area: 'Whitefield',
    name: 'Whitefield',
    canonicalPickupLabel: 'Whitefield ITPL',
    lat: 12.9855,
    lng: 77.7362,
    baseline: {
      averageArrivalMinutes: 12,
      assignmentDelayMinutes: 2.1,
      morningPeakAverage: 16,
      eveningPeakAverage: 18,
      normalHoursAverage: 10
    }
  },
  'Electronic City': {
    area: 'Electronic City',
    name: 'Electronic City',
    canonicalPickupLabel: 'Electronic City Phase 1',
    lat: 12.8452,
    lng: 77.6602,
    baseline: {
      averageArrivalMinutes: 11,
      assignmentDelayMinutes: 1.8,
      morningPeakAverage: 15,
      eveningPeakAverage: 17,
      normalHoursAverage: 10
    }
  },
  Marathahalli: {
    area: 'Marathahalli',
    name: 'Marathahalli',
    canonicalPickupLabel: 'Marathahalli Bridge',
    lat: 12.9591,
    lng: 77.6974,
    baseline: {
      averageArrivalMinutes: 10,
      assignmentDelayMinutes: 1.6,
      morningPeakAverage: 14,
      eveningPeakAverage: 16,
      normalHoursAverage: 9
    }
  },
  'BTM Layout': {
    area: 'BTM Layout',
    name: 'BTM Layout',
    canonicalPickupLabel: 'BTM Layout 2nd Stage',
    lat: 12.9166,
    lng: 77.6101,
    baseline: {
      averageArrivalMinutes: 8,
      assignmentDelayMinutes: 1.3,
      morningPeakAverage: 11,
      eveningPeakAverage: 13,
      normalHoursAverage: 7
    }
  },
  Hebbal: {
    area: 'Hebbal',
    name: 'Hebbal',
    canonicalPickupLabel: 'Hebbal Flyover',
    lat: 13.0358,
    lng: 77.5970,
    baseline: {
      averageArrivalMinutes: 9,
      assignmentDelayMinutes: 1.4,
      morningPeakAverage: 13,
      eveningPeakAverage: 15,
      normalHoursAverage: 8
    }
  },
  'MG Road': {
    area: 'MG Road',
    name: 'MG Road',
    canonicalPickupLabel: 'MG Road Boulevard',
    lat: 12.9752,
    lng: 77.6045,
    baseline: {
      averageArrivalMinutes: 5,
      assignmentDelayMinutes: 0.9,
      morningPeakAverage: 7,
      eveningPeakAverage: 8,
      normalHoursAverage: 5
    }
  },
  'Cubbon Park': {
    area: 'Cubbon Park',
    name: 'Cubbon Park',
    canonicalPickupLabel: 'Cubbon Park Metro',
    lat: 12.9742,
    lng: 77.6012,
    baseline: {
      averageArrivalMinutes: 6,
      assignmentDelayMinutes: 1.0,
      morningPeakAverage: 8,
      eveningPeakAverage: 9,
      normalHoursAverage: 5
    }
  },
  Majestic: {
    area: 'Majestic',
    name: 'Majestic',
    canonicalPickupLabel: 'Majestic Bus Station',
    lat: 12.9767,
    lng: 77.5713,
    baseline: {
      averageArrivalMinutes: 8,
      assignmentDelayMinutes: 1.4,
      morningPeakAverage: 11,
      eveningPeakAverage: 13,
      normalHoursAverage: 7
    }
  },
  Jayanagar: {
    area: 'Jayanagar',
    name: 'Jayanagar',
    canonicalPickupLabel: 'Jayanagar 4th Block',
    lat: 12.9304,
    lng: 77.5830,
    baseline: {
      averageArrivalMinutes: 7,
      assignmentDelayMinutes: 1.1,
      morningPeakAverage: 9,
      eveningPeakAverage: 10,
      normalHoursAverage: 6
    }
  },
  Malleshwaram: {
    area: 'Malleshwaram',
    name: 'Malleshwaram',
    canonicalPickupLabel: 'Malleshwaram 8th Cross',
    lat: 12.9982,
    lng: 77.5685,
    baseline: {
      averageArrivalMinutes: 6,
      assignmentDelayMinutes: 1.0,
      morningPeakAverage: 8,
      eveningPeakAverage: 9,
      normalHoursAverage: 6
    }
  },
  'Vidhana Soudha': {
    area: 'Vidhana Soudha',
    name: 'Vidhana Soudha',
    canonicalPickupLabel: 'Vidhana Soudha',
    lat: 12.9796,
    lng: 77.5907,
    baseline: {
      averageArrivalMinutes: 5,
      assignmentDelayMinutes: 0.8,
      morningPeakAverage: 7,
      eveningPeakAverage: 8,
      normalHoursAverage: 5
    }
  },
  'Richmond Circle': {
    area: 'Richmond Circle',
    name: 'Richmond Circle',
    canonicalPickupLabel: 'Richmond Circle',
    lat: 12.9660,
    lng: 77.5998,
    baseline: {
      averageArrivalMinutes: 6,
      assignmentDelayMinutes: 1.0,
      morningPeakAverage: 8,
      eveningPeakAverage: 9,
      normalHoursAverage: 5
    }
  },
  HAL: {
    area: 'HAL',
    name: 'HAL / Manipal',
    canonicalPickupLabel: 'Manipal Hospital, HAL',
    lat: 12.9585,
    lng: 77.6488,
    baseline: {
      averageArrivalMinutes: 7,
      assignmentDelayMinutes: 1.1,
      morningPeakAverage: 10,
      eveningPeakAverage: 11,
      normalHoursAverage: 6
    }
  }
};

/**
 * Match a raw pickup location label or string to one of our canonical area keys.
 */
function extractAreaName(label) {
  if (!label || typeof label !== 'string') return 'Cubbon Park';
  const clean = label.trim().toLowerCase();

  if (clean.includes('indiranagar')) return 'Indiranagar';
  if (clean.includes('koramangala')) return 'Koramangala';
  if (clean.includes('whitefield') || clean.includes('itpl')) return 'Whitefield';
  if (clean.includes('electronic city') || clean.includes('ecity')) return 'Electronic City';
  if (clean.includes('marathahalli')) return 'Marathahalli';
  if (clean.includes('btm')) return 'BTM Layout';
  if (clean.includes('hebbal')) return 'Hebbal';
  if (clean.includes('mg road')) return 'MG Road';
  if (clean.includes('cubbon')) return 'Cubbon Park';
  if (clean.includes('majestic') || clean.includes('kempegowda')) return 'Majestic';
  if (clean.includes('jayanagar')) return 'Jayanagar';
  if (clean.includes('malleshwaram')) return 'Malleshwaram';
  if (clean.includes('vidhana')) return 'Vidhana Soudha';
  if (clean.includes('richmond')) return 'Richmond Circle';
  if (clean.includes('manipal') || clean.includes('hal')) return 'HAL';

  // Fallback: check exact area keys
  for (const key of Object.keys(SUPPORTED_AREAS)) {
    if (clean.includes(key.toLowerCase())) return key;
  }
  return 'Cubbon Park';
}

/**
 * Time-of-day classification based on prompt requirements:
 * - Morning Peak: 7:30 AM – 11:00 AM (450 to 660 total minutes)
 * - Evening Peak: 4:30 PM – 8:30 PM (990 to 1230 total minutes)
 * - Normal Hours: All other hours
 */
function getTimePeriod(dateOrSimSeconds) {
  let totalMins = 0;
  if (typeof dateOrSimSeconds === 'number') {
    totalMins = Math.floor((dateOrSimSeconds % 86400) / 60);
  } else if (dateOrSimSeconds instanceof Date && !isNaN(dateOrSimSeconds.getTime())) {
    totalMins = dateOrSimSeconds.getHours() * 60 + dateOrSimSeconds.getMinutes();
  } else if (typeof dateOrSimSeconds === 'string') {
    const d = new Date(dateOrSimSeconds);
    if (!isNaN(d.getTime())) {
      totalMins = d.getHours() * 60 + d.getMinutes();
    } else {
      const parts = dateOrSimSeconds.split(':');
      if (parts.length >= 2) {
        totalMins = Number(parts[0]) * 60 + Number(parts[1]);
      }
    }
  }

  const isMorningPeak = totalMins >= (7 * 60 + 30) && totalMins < (11 * 60);
  const isEveningPeak = totalMins >= (16 * 60 + 30) && totalMins <= (20 * 60 + 30);

  let period = 'normal';
  if (isMorningPeak) period = 'morning_peak';
  else if (isEveningPeak) period = 'evening_peak';

  return {
    period,
    isMorningPeak,
    isEveningPeak,
    isPeakHour: isMorningPeak || isEveningPeak,
    totalMins
  };
}

// In-memory analytics state
let recordedArrivals = [];
let pendingTimestamps = new Map(); // bookingId -> { bookingCreatedAt, vehicleAssignedAt, pickupLabel, area, vehicleType }
const completedBookingIds = new Set();
const cancelledBookingIds = new Set();
let persistTimer = null;

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn('[Analytics] Failed to create data dir:', err.message);
  }
}

function loadPersistedData() {
  try {
    ensureDataDir();
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.recordedArrivals)) {
        recordedArrivals = parsed.recordedArrivals;
        recordedArrivals.forEach((r) => {
          if (r.bookingId) completedBookingIds.add(r.bookingId);
        });
        console.log(`[Analytics] Loaded ${recordedArrivals.length} persisted arrival records.`);
      }
    }
  } catch (err) {
    console.warn('[Analytics] Could not load persisted analytics (starting fresh):', err.message);
    recordedArrivals = [];
  }
}

function schedulePersistence() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      ensureDataDir();
      const payload = {
        version: 1,
        savedAt: new Date().toISOString(),
        count: recordedArrivals.length,
        recordedArrivals
      };
      fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
    } catch (err) {
      console.warn('[Analytics] Failed to persist analytics to file:', err.message);
    }
  }, 2000);
}

// Initial load
loadPersistedData();

/**
 * Record booking creation timestamp
 */
function recordBookingCreated(booking) {
  if (!booking || !booking.bookingId) return;
  const bookingId = booking.bookingId;
  if (cancelledBookingIds.has(bookingId)) return;

  const rawLabel = booking.pickup?.label || (typeof booking.pickup === 'string' ? booking.pickup : '');
  const area = extractAreaName(rawLabel);
  const createdAt = booking.createdAt instanceof Date
    ? booking.createdAt
    : (booking.createdAt ? new Date(booking.createdAt) : new Date());

  const existing = pendingTimestamps.get(bookingId) || {};
  pendingTimestamps.set(bookingId, {
    ...existing,
    bookingId,
    bookingCreatedAt: existing.bookingCreatedAt || createdAt,
    pickupLabel: rawLabel,
    area,
    vehicleType: String(booking.vehicleType || 'cab').toLowerCase()
  });
}

/**
 * Record vehicle assignment timestamp
 */
function recordVehicleAssigned(bookingId, assignedTime = new Date()) {
  if (!bookingId) return;
  if (cancelledBookingIds.has(bookingId)) return;

  const assignedAt = assignedTime instanceof Date ? assignedTime : new Date(assignedTime);
  const existing = pendingTimestamps.get(bookingId) || { bookingId };
  existing.vehicleAssignedAt = assignedAt;
  pendingTimestamps.set(bookingId, existing);
}

/**
 * Record vehicle arrival timestamp at pickup and save metrics.
 * Cab Arrival Time = vehicleArrivedAt - bookingCreatedAt
 * Assignment Delay = vehicleAssignedAt - bookingCreatedAt
 */
function recordVehicleArrived(booking, arrivedTime = new Date()) {
  if (!booking || !booking.bookingId) return null;
  const bookingId = booking.bookingId;

  // De-duplication: do not count twice
  if (completedBookingIds.has(bookingId)) {
    return null;
  }

  // Cancelled bookings do not count as completed arrivals
  if (cancelledBookingIds.has(bookingId) || booking.status === 'cancelled') {
    return null;
  }

  const arrivedAt = arrivedTime instanceof Date ? arrivedTime : new Date(arrivedTime);
  const pending = pendingTimestamps.get(bookingId) || {};

  const rawLabel = booking.pickup?.label || pending.pickupLabel || '';
  const area = pending.area || extractAreaName(rawLabel);
  const vehicleType = String(booking.vehicleType || pending.vehicleType || 'cab').toLowerCase();

  const createdAt = pending.bookingCreatedAt
    ? new Date(pending.bookingCreatedAt)
    : (booking.createdAt ? new Date(booking.createdAt) : new Date(arrivedAt.getTime() - 8 * 60000));

  const assignedAt = pending.vehicleAssignedAt
    ? new Date(pending.vehicleAssignedAt)
    : new Date(createdAt.getTime() + 60000);

  // Calculate durations in milliseconds and minutes
  const arrivalDurationMs = Math.max(30000, arrivedAt.getTime() - createdAt.getTime());
  const arrivalDurationMinutes = Math.max(1, Math.round(arrivalDurationMs / 60000));

  const delayMs = Math.max(0, assignedAt.getTime() - createdAt.getTime());
  const assignmentDelayMinutes = Math.max(0, Math.round(delayMs / 60000));

  const timePeriod = getTimePeriod(createdAt);

  const metric = {
    bookingId,
    area,
    pickupLabel: rawLabel || SUPPORTED_AREAS[area]?.canonicalPickupLabel || area,
    vehicleType,
    bookingCreatedAt: createdAt.toISOString(),
    vehicleAssignedAt: assignedAt.toISOString(),
    vehicleArrivedAt: arrivedAt.toISOString(),
    arrivalDurationSeconds: Math.round(arrivalDurationMs / 1000),
    arrivalDurationMinutes,
    assignmentDelaySeconds: Math.round(delayMs / 1000),
    assignmentDelayMinutes,
    timePeriod: timePeriod.period,
    isMorningPeak: timePeriod.isMorningPeak,
    isEveningPeak: timePeriod.isEveningPeak,
    recordedAt: new Date().toISOString()
  };

  recordedArrivals.push(metric);
  completedBookingIds.add(bookingId);
  pendingTimestamps.delete(bookingId);

  schedulePersistence();

  return metric;
}

/**
 * Handle cancellations separately (must not count as completed arrivals)
 */
function recordCancellation(bookingId) {
  if (!bookingId) return;
  cancelledBookingIds.add(bookingId);
  pendingTimestamps.delete(bookingId);
}

/**
 * Calculate area analytics for a specific pickup area
 */
function getAreaAnalytics(rawAreaName, vehicleType = 'cab') {
  const areaKey = extractAreaName(rawAreaName);
  const areaMeta = SUPPORTED_AREAS[areaKey] || {
    area: areaKey,
    name: areaKey,
    canonicalPickupLabel: rawAreaName,
    lat: 12.9716,
    lng: 77.5946,
    baseline: {
      averageArrivalMinutes: 8,
      assignmentDelayMinutes: 1.2,
      morningPeakAverage: 11,
      eveningPeakAverage: 13,
      normalHoursAverage: 7
    }
  };

  const vType = String(vehicleType).toLowerCase();

  // Filter actual completed arrivals for this area and vehicle type (within rolling 30 days)
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 3600 * 1000;

  const areaArrivals = recordedArrivals.filter((r) => {
    if (r.area !== areaKey) return false;
    if (vType && r.vehicleType !== vType) return false;
    const recTime = new Date(r.vehicleArrivedAt || r.recordedAt).getTime();
    return now - recTime <= thirtyDaysMs;
  });

  const sampleCount = areaArrivals.length;
  const hasMinimumSamples = sampleCount >= 5;

  if (hasMinimumSamples) {
    // Calculate actual observed averages
    const totalArrivalMins = areaArrivals.reduce((sum, r) => sum + r.arrivalDurationMinutes, 0);
    const totalDelayMins = areaArrivals.reduce((sum, r) => sum + r.assignmentDelayMinutes, 0);

    const morningArrivals = areaArrivals.filter((r) => r.isMorningPeak);
    const eveningArrivals = areaArrivals.filter((r) => r.isEveningPeak);
    const normalArrivals = areaArrivals.filter((r) => !r.isMorningPeak && !r.isEveningPeak);

    const avgArrival = Math.round((totalArrivalMins / sampleCount) * 10) / 10;
    const avgDelay = Math.round((totalDelayMins / sampleCount) * 10) / 10;

    const morningPeakAvg = morningArrivals.length > 0
      ? Math.round((morningArrivals.reduce((s, r) => s + r.arrivalDurationMinutes, 0) / morningArrivals.length) * 10) / 10
      : Math.round(avgArrival * 1.3);

    const eveningPeakAvg = eveningArrivals.length > 0
      ? Math.round((eveningArrivals.reduce((s, r) => s + r.arrivalDurationMinutes, 0) / eveningArrivals.length) * 10) / 10
      : Math.round(avgArrival * 1.4);

    const normalHoursAvg = normalArrivals.length > 0
      ? Math.round((normalArrivals.reduce((s, r) => s + r.arrivalDurationMinutes, 0) / normalArrivals.length) * 10) / 10
      : Math.round(avgArrival * 0.9);

    return {
      area: areaKey,
      displayName: areaMeta.name,
      canonicalPickupLabel: areaMeta.canonicalPickupLabel,
      lat: areaMeta.lat,
      lng: areaMeta.lng,
      vehicleType: vType,
      sampleCount,
      hasMinimumSamples: true,
      isBaseline: false,
      source: 'actual_simulation',
      sourceLabel: `Based on ${sampleCount} completed simulated rides`,
      averageArrivalMinutes: Math.round(avgArrival),
      exactAverageMinutes: avgArrival,
      averageAssignmentDelayMinutes: avgDelay,
      morningPeakAverage: Math.round(morningPeakAvg),
      eveningPeakAverage: Math.round(eveningPeakAvg),
      normalHoursAverage: Math.round(normalHoursAvg),
      disclaimer: 'Average arrival time is calculated from previous simulated rides originating from this pickup area. It is not a guaranteed arrival time for your current booking.'
    };
  }

  // Baseline data when fewer than 5 actual records exist
  const base = areaMeta.baseline;
  return {
    area: areaKey,
    displayName: areaMeta.name,
    canonicalPickupLabel: areaMeta.canonicalPickupLabel,
    lat: areaMeta.lat,
    lng: areaMeta.lng,
    vehicleType: vType,
    sampleCount,
    hasMinimumSamples: false,
    isBaseline: true,
    source: 'simulated_baseline',
    sourceLabel: sampleCount === 0
      ? 'Simulated baseline'
      : `Simulated baseline (Collecting data: ${sampleCount}/5 rides)`,
    averageArrivalMinutes: base.averageArrivalMinutes,
    exactAverageMinutes: base.averageArrivalMinutes,
    averageAssignmentDelayMinutes: base.assignmentDelayMinutes,
    morningPeakAverage: base.morningPeakAverage,
    eveningPeakAverage: base.eveningPeakAverage,
    normalHoursAverage: base.normalHoursAverage,
    disclaimer: 'Average arrival time is calculated from previous simulated rides originating from this pickup area. It is not a guaranteed arrival time for your current booking.'
  };
}

/**
 * Return analytics for all supported Bengaluru areas
 */
function getAllAreasAnalytics(vehicleType = 'cab') {
  const result = {};
  for (const areaKey of Object.keys(SUPPORTED_AREAS)) {
    result[areaKey] = getAreaAnalytics(areaKey, vehicleType);
  }
  return {
    areas: result,
    totalCompletedRides: recordedArrivals.filter((r) => r.vehicleType === vehicleType).length,
    timestamp: new Date().toISOString()
  };
}

/**
 * Reset analytics data
 */
function resetAnalytics() {
  recordedArrivals = [];
  pendingTimestamps.clear();
  completedBookingIds.clear();
  cancelledBookingIds.clear();
  try {
    ensureDataDir();
    if (fs.existsSync(DATA_FILE)) {
      fs.unlinkSync(DATA_FILE);
    }
  } catch (err) {
    console.warn('[Analytics] Failed to remove analytics file:', err.message);
  }
}

module.exports = {
  SUPPORTED_AREAS,
  extractAreaName,
  getTimePeriod,
  recordBookingCreated,
  recordVehicleAssigned,
  recordVehicleArrived,
  recordCancellation,
  getAreaAnalytics,
  getAllAreasAnalytics,
  resetAnalytics
};
