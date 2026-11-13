const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const { resetAll } = require('../store/memoryStore');
const defaultRoutingService = require('./routing.service');
const defaultAllocationService = require('./allocation.service');
const defaultPriorityService = require('./priority.service');
const { getTimeCategory, TIME_CATEGORIES, TIME_PRESETS } = require('../config/priority.config');

const TICK_INTERVAL_MS = 500;
const BASE_METERS_PER_TICK = 15; // 30 m/s at 1x speed for clear demo pacing
const ALLOWED_SPEEDS = new Set([1, 2, 4, 8, 5, 10]);

// Base simulation date: Nov 12, 2026
const BASE_SIM_DATE = new Date(2026, 10, 12, 14, 0, 0);

let simStatus = 'Paused'; // 'Running' | 'Paused' | 'Idle'
let simSpeed = 1;
let tickTimer = null;
let isStepping = false;
const activeTracks = new Map(); // vehicleId -> track state
let notifications = [];
let activeScenario = null;

// Dynamic simulation clock state
let simClockSeconds = 14 * 3600; // Default 14:00 (Normal Daytime)
let simulatedTimeDate = new Date(BASE_SIM_DATE);
let simulatedTimeISO = simulatedTimeDate.toISOString();
let currentTimeCategory = getTimeCategory(14, 0);
let simulatedTimeLabel = currentTimeCategory.label;

function getSocketEmitter() {
  try {
    return require('../sockets/socket.handler');
  } catch {
    return null;
  }
}

function pushNotification(type, message) {
  const entry = {
    id: `N-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    type,
    message,
    timestamp: new Date().toISOString()
  };
  notifications = [entry, ...notifications].slice(0, 20);
  return entry;
}

function formatClock(totalSeconds) {
  const hrs = Math.floor(totalSeconds / 3600) % 24;
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return [hrs, mins, secs].map((v) => String(v).padStart(2, '0')).join(':');
}

/**
 * Update internal simulation clock by total seconds of day (0-86399).
 */
function setClockBySeconds(totalSeconds) {
  simClockSeconds = ((Math.floor(totalSeconds) % 86400) + 86400) % 86400;
  const hours = Math.floor(simClockSeconds / 3600);
  const minutes = Math.floor((simClockSeconds % 3600) / 60);
  const seconds = simClockSeconds % 60;

  simulatedTimeDate = new Date(BASE_SIM_DATE);
  simulatedTimeDate.setHours(hours, minutes, seconds, 0);
  simulatedTimeISO = simulatedTimeDate.toISOString();

  const prevCategory = currentTimeCategory;
  currentTimeCategory = getTimeCategory(hours, minutes);
  simulatedTimeLabel = currentTimeCategory.label;

  return {
    hours,
    minutes,
    seconds,
    changedCategory: !prevCategory || prevCategory.id !== currentTimeCategory.id
  };
}

function getSimulationTime() {
  return new Date(simulatedTimeDate);
}

function getSimulationClockSeconds() {
  return simClockSeconds;
}

function getCurrentTimeCategory() {
  return currentTimeCategory;
}

function calculatePointDistance(p1, p2) {
  const R = 6371000;
  const dLat = ((p2[0] - p1[0]) * Math.PI) / 180;
  const dLng = ((p2[1] - p1[1]) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1[0] * Math.PI) / 180) *
      Math.cos((p2[0] * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Precompute cumulative segment distances (in meters) along an OSRM route.
 */
function buildRouteProfile(route) {
  if (!Array.isArray(route) || route.length < 2) {
    return { points: route || [], cumulative: [0], totalDistance: 0 };
  }

  const cumulative = [0];
  let total = 0;

  for (let i = 0; i < route.length - 1; i++) {
    const p1 = route[i];
    const p2 = route[i + 1];
    const d = calculatePointDistance(p1, p2);
    total += d;
    cumulative.push(total);
  }

  return { points: route, cumulative, totalDistance: Math.max(total, 1) };
}

/**
 * Interpolate latitude and longitude along a multi-segment route profile
 * given a distance traveled in meters.
 */
function interpolateAlongRoute(profile, distance) {
  const { points, cumulative, totalDistance } = profile;
  if (!points || points.length === 0) return null;
  if (points.length === 1 || distance <= 0) {
    return { lat: points[0][0], lng: points[0][1] };
  }
  if (distance >= totalDistance) {
    const last = points[points.length - 1];
    return { lat: last[0], lng: last[1] };
  }

  let seg = 0;
  while (seg < cumulative.length - 1 && cumulative[seg + 1] < distance) {
    seg++;
  }

  const segStartDist = cumulative[seg];
  const segEndDist = cumulative[seg + 1];
  const segLength = segEndDist - segStartDist;
  const fraction = segLength > 0 ? (distance - segStartDist) / segLength : 0;

  const p1 = points[seg];
  const p2 = points[seg + 1];

  return {
    lat: p1[0] + (p2[0] - p1[0]) * fraction,
    lng: p1[1] + (p2[1] - p1[1]) * fraction
  };
}

function removeVehicleTrack(vehicleId) {
  activeTracks.delete(vehicleId);
}

/**
 * Register any active assigned/on_trip bookings that do not yet have a movement track.
 */
async function syncActiveTracks(options = {}) {
  const BookingModel = options.BookingModel || Booking;
  const routingService = options.routingService || defaultRoutingService;

  const activeBookings = await BookingModel.find({
    status: { $in: ['assigned', 'to_pickup', 'on_trip'] },
    vehicleId: { $ne: null }
  });

  for (const booking of activeBookings) {
    if (!booking.vehicleId || activeTracks.has(booking.vehicleId)) {
      continue;
    }

    let route = Array.isArray(booking.routeGeometry) ? booking.routeGeometry : [];
    if (route.length < 2 && booking.status === 'on_trip') {
      const generated = await routingService.getRouteEstimate(booking.pickup, booking.destination);
      route = generated.geometry;
      await BookingModel.updateOne(
        { bookingId: booking.bookingId },
        {
          $set: {
            routeGeometry: route,
            routeDistanceMeters: generated.distanceMeters,
            routeDurationSeconds: generated.durationSeconds,
            estimatedPickupMinutes: generated.durationMinutes,
            isEstimatedRoute: Boolean(generated.isEstimated)
          }
        }
      );
    }

    if (route.length < 2) {
      continue;
    }

    activeTracks.set(booking.vehicleId, {
      vehicleId: booking.vehicleId,
      bookingId: booking.bookingId,
      phase: booking.status === 'on_trip' ? 'on_trip' : 'to_pickup',
      profile: buildRouteProfile(route),
      distanceTraveled: 0,
      initialDurationMinutes: booking.estimatedPickupMinutes || 5
    });
  }
}

/**
 * Re-evaluate waiting bookings when simulation time changes or boundary is crossed.
 * Never cancels or steals vehicles already assigned to passengers!
 */
async function updatePriorityAfterTimeChange(options = {}) {
  const BookingModel = options.BookingModel || Booking;
  const VehicleModel = options.VehicleModel || Vehicle;
  const routingService = options.routingService || defaultRoutingService;
  const now = getSimulationTime();

  // 1. Recalculate priority tiers & scores for all waiting bookings
  await defaultPriorityService.recalculateQueuedBookings(BookingModel, { now });

  // 2. Sequentially allocate eligible waiting bookings if vehicles are available
  const allocResult = await defaultAllocationService.runAllocationCycle({
    BookingModel,
    VehicleModel,
    routingService,
    now
  });

  const emitter = getSocketEmitter();
  if (emitter) {
    if (allocResult.allocated && allocResult.allocated.length > 0) {
      emitter.emitAllocationCompleted(allocResult);
    }
    await emitter.broadcastQueueSnapshot();
    emitter.emitSimulationState(getSimulationState());
  }

  return allocResult;
}

/**
 * Apply a user-selected simulation time.
 * Supports preset values ("06:00", "08:00", "22:00", etc.) and custom hour/minute.
 */
async function applySimulationTime(options = {}) {
  let targetSeconds = simClockSeconds;

  if (typeof options.seconds === 'number') {
    targetSeconds = options.seconds;
  } else if (typeof options.hour === 'number') {
    const h = options.hour;
    const m = typeof options.minute === 'number' ? options.minute : 0;
    targetSeconds = h * 3600 + m * 60;
  } else if (typeof options.time === 'string') {
    const raw = options.time.trim();
    // Parse "HH:MM", "HH:MM:SS", "06:00 AM", "10:00 PM"
    const match12 = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
    const match24 = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (match12) {
      let h = parseInt(match12[1], 10);
      const m = parseInt(match12[2], 10);
      const s = match12[3] ? parseInt(match12[3], 10) : 0;
      const isPM = match12[4].toUpperCase() === 'PM';
      if (isPM && h < 12) h += 12;
      if (!isPM && h === 12) h = 0;
      targetSeconds = h * 3600 + m * 60 + s;
    } else if (match24) {
      const h = parseInt(match24[1], 10);
      const m = parseInt(match24[2], 10);
      const s = match24[3] ? parseInt(match24[3], 10) : 0;
      targetSeconds = h * 3600 + m * 60 + s;
    }
  }

  setClockBySeconds(targetSeconds);

  pushNotification(
    'time_change',
    `Simulation time set to ${formatClock(simClockSeconds)} (${currentTimeCategory.label})`
  );

  const updateResult = await updatePriorityAfterTimeChange(options);

  return {
    simulation: getSimulationState(),
    timeCategory: currentTimeCategory,
    allocated: updateResult.allocated || [],
    queued: updateResult.queued || []
  };
}

/**
 * Advance all tracked vehicles and simulation clock by one tick.
 */
async function stepSimulation(options = {}) {
  if (simStatus !== 'Running' && !options.forceStep) {
    return { stepped: false };
  }

  const BookingModel = options.BookingModel || Booking;
  const VehicleModel = options.VehicleModel || Vehicle;
  const routingService = options.routingService || defaultRoutingService;
  const allocationService = options.allocationService || defaultAllocationService;

  // Advance simulation clock with speed multiplier
  const { changedCategory } = setClockBySeconds(simClockSeconds + simSpeed);
  if (changedCategory) {
    pushNotification(
      'time_transition',
      `Clock entered ${currentTimeCategory.label} (${currentTimeCategory.hoursRange})`
    );
    await updatePriorityAfterTimeChange({ BookingModel, VehicleModel, routingService });
  }

  await syncActiveTracks({ BookingModel, routingService });

  const stepMeters = (options.stepMeters || BASE_METERS_PER_TICK) * simSpeed;
  let completedAnyTrip = false;

  for (const [vehicleId, track] of Array.from(activeTracks.entries())) {
    const booking = await BookingModel.findOne({ bookingId: track.bookingId });
    if (!booking || ['cancelled', 'completed'].includes(booking.status)) {
      activeTracks.delete(vehicleId);
      continue;
    }

    track.distanceTraveled += stepMeters;
    const pos = interpolateAlongRoute(track.profile, track.distanceTraveled);

    if (pos) {
      await VehicleModel.updateOne(
        { vehicleId },
        { $set: { latitude: pos.lat, longitude: pos.lng } }
      );
      getSocketEmitter()?.emitCabLocation({
        vehicleId,
        latitude: pos.lat,
        longitude: pos.lng,
        status: track.phase === 'on_trip' ? 'on_trip' : 'to_pickup',
        currentBookingId: booking.bookingId
      });
    }

    // Update remaining ETA minutes dynamically
    if (track.profile.totalDistance > 0) {
      const fractionRemaining = Math.max(0, 1 - (track.distanceTraveled / track.profile.totalDistance));
      const initialMin = track.initialDurationMinutes || booking.estimatedPickupMinutes || 5;
      const updatedMin = Math.max(1, Math.round(initialMin * fractionRemaining));
      if (booking.estimatedPickupMinutes !== updatedMin) {
        booking.estimatedPickupMinutes = updatedMin;
        await BookingModel.updateOne(
          { bookingId: booking.bookingId },
          { $set: { estimatedPickupMinutes: updatedMin } }
        );
      }
    }

    // Check if vehicle reached end of current route
    if (track.distanceTraveled >= track.profile.totalDistance) {
      if (track.phase === 'to_pickup') {
        // 1. Reached pickup -> arrived
        await BookingModel.updateOne(
          { bookingId: booking.bookingId },
          { $set: { status: 'arrived' } }
        );
        await VehicleModel.updateOne(
          { vehicleId },
          { $set: { status: 'assigned' } }
        );
        pushNotification('pickup_arrived', `Vehicle ${vehicleId} arrived at pickup for ${booking.bookingId}`);

        // 2. Generate destination route & transition to on_trip
        const tripRoute = await routingService.getRouteEstimate(booking.pickup, booking.destination);
        await BookingModel.updateOne(
          { bookingId: booking.bookingId },
          {
            $set: {
              status: 'on_trip',
              routeGeometry: tripRoute.geometry,
              routeDistanceMeters: tripRoute.distanceMeters,
              routeDurationSeconds: tripRoute.durationSeconds,
              estimatedPickupMinutes: tripRoute.durationMinutes,
              isEstimatedRoute: Boolean(tripRoute.isEstimated)
            }
          }
        );
        await VehicleModel.updateOne(
          { vehicleId },
          { $set: { status: 'on_trip' } }
        );

        track.phase = 'on_trip';
        track.profile = buildRouteProfile(tripRoute.geometry);
        track.distanceTraveled = 0;
        track.initialDurationMinutes = tripRoute.durationMinutes;

        const emitter = getSocketEmitter();
        if (emitter) {
          const updatedBooking = await BookingModel.findOne({ bookingId: booking.bookingId });
          const updatedVehicle = await VehicleModel.findOne({ vehicleId });
          if (updatedBooking) emitter.emitBookingUpdated(updatedBooking);
          if (updatedVehicle) emitter.emitCabStatus(updatedVehicle);
          emitter.emitSimulationState(getSimulationState());
        }
      } else if (track.phase === 'on_trip') {
        // Reached destination -> completed & release vehicle
        await BookingModel.updateOne(
          { bookingId: booking.bookingId },
          { $set: { status: 'completed', estimatedPickupMinutes: 0 } }
        );
        await VehicleModel.updateOne(
          { vehicleId },
          { $set: { status: 'available', currentBookingId: null } }
        );
        pushNotification('trip_completed', `Trip ${booking.bookingId} completed by ${vehicleId}`);
        activeTracks.delete(vehicleId);
        completedAnyTrip = true;

        const emitter = getSocketEmitter();
        if (emitter) {
          const updatedBooking = await BookingModel.findOne({ bookingId: booking.bookingId });
          const updatedVehicle = await VehicleModel.findOne({ vehicleId });
          if (updatedBooking) emitter.emitBookingUpdated(updatedBooking);
          if (updatedVehicle) emitter.emitCabStatus(updatedVehicle);
          emitter.emitSimulationState(getSimulationState());
        }
      }
    }
  }

  // If any vehicle became available, sequentially allocate waiting bookings
  if (completedAnyTrip) {
    const allocResult = await allocationService.runAllocationCycle({
      BookingModel,
      VehicleModel,
      routingService,
      now: getSimulationTime()
    });
    const emitter = getSocketEmitter();
    if (emitter) {
      if (allocResult.allocated && allocResult.allocated.length > 0) {
        emitter.emitAllocationCompleted(allocResult);
      }
      await emitter.broadcastQueueSnapshot();
    }
  }

  return { stepped: true, activeTracks: activeTracks.size };
}

function ensureTickLoop() {
  if (tickTimer) return;
  tickTimer = setInterval(async () => {
    if (isStepping || simStatus !== 'Running') return;
    isStepping = true;
    try {
      await stepSimulation();
    } catch (err) {
      console.error('Simulation tick error:', err.message);
    } finally {
      isStepping = false;
    }
  }, TICK_INTERVAL_MS);
}

function stopTickLoop() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

async function startSimulation(options = {}) {
  simStatus = 'Running';
  await syncActiveTracks(options);
  if (!options.skipTimer) {
    ensureTickLoop();
  }
  return getSimulationState();
}

function pauseSimulation() {
  simStatus = 'Paused';
  stopTickLoop();
  return getSimulationState();
}

async function resumeSimulation(options = {}) {
  simStatus = 'Running';
  await syncActiveTracks(options);
  if (!options.skipTimer) {
    ensureTickLoop();
  }
  return getSimulationState();
}

function setSimulationSpeed(speed) {
  const num = Number(speed);
  if (!ALLOWED_SPEEDS.has(num)) {
    const err = new Error(`Speed must be one of: ${Array.from(ALLOWED_SPEEDS).join(', ')}`);
    err.name = 'ValidationError';
    throw err;
  }
  simSpeed = num;
  return getSimulationState();
}

async function completeSimulation(options = {}) {
  const BookingModel = options.BookingModel || Booking;
  const VehicleModel = options.VehicleModel || Vehicle;
  const routingService = options.routingService || defaultRoutingService;
  const allocationService = options.allocationService || defaultAllocationService;

  stopTickLoop();
  simStatus = 'Paused';

  let hasProgress = true;
  let iterations = 0;
  const maxIterations = 20;

  while (hasProgress && iterations < maxIterations) {
    hasProgress = false;
    iterations++;

    const inProgressBookings = await BookingModel.find({
      status: { $in: ['assigned', 'to_pickup', 'on_trip'] }
    });

    for (const b of inProgressBookings) {
      const vehicleId = b.vehicleId;
      await BookingModel.updateOne(
        { bookingId: b.bookingId },
        {
          $set: {
            status: 'completed',
            estimatedPickupMinutes: 0
          }
        }
      );

      if (vehicleId) {
        await VehicleModel.updateOne(
          { vehicleId },
          {
            $set: {
              status: 'available',
              currentBookingId: null
            }
          }
        );
        activeTracks.delete(vehicleId);
      }
      hasProgress = true;
    }

    const allocResult = await allocationService.runAllocationCycle({
      BookingModel,
      VehicleModel,
      routingService,
      now: getSimulationTime()
    });

    if (allocResult && allocResult.allocated && allocResult.allocated.length > 0) {
      hasProgress = true;
    }
  }

  activeTracks.clear();
  pushNotification('simulation_complete', 'All simulation rides completed and vehicles released.');

  const emitter = getSocketEmitter();
  if (emitter) {
    const io = emitter.getIO();
    if (io) {
      const sockets = await io.fetchSockets();
      await Promise.all(sockets.map((s) => emitter.sendFullSync(s)));
    }
    emitter.emitSimulationState(getSimulationState());
  }

  return getSimulationState();
}

async function clearSimulation(options = {}) {
  return resetSimulation(options);
}

async function resetSimulation(options = {}) {
  simStatus = 'Idle';
  simSpeed = 1;
  stopTickLoop();
  activeTracks.clear();
  notifications = [];
  activeScenario = null;

  // Reset clock back to 14:00 (Normal Daytime)
  setClockBySeconds(14 * 3600);

  if (!options.skipDbReset) {
    resetAll();
  }

  return getSimulationState();
}

function setSimulationContext({ scenarioId = null, simulatedTime = null, timeLabel = 'Daytime (Live Demo)', notice = null }) {
  stopTickLoop();
  simStatus = 'Paused';
  activeTracks.clear();
  activeScenario = scenarioId;

  if (simulatedTime) {
    const parsedDate = new Date(simulatedTime);
    if (!isNaN(parsedDate.getTime())) {
      setClockBySeconds(parsedDate.getHours() * 3600 + parsedDate.getMinutes() * 60 + parsedDate.getSeconds());
    }
  } else if (timeLabel) {
    simulatedTimeLabel = timeLabel;
  }

  if (notice) {
    pushNotification('scenario', notice);
  }
  return getSimulationState();
}

function getSimulationState() {
  const hours = Math.floor(simClockSeconds / 3600);
  const minutes = Math.floor((simClockSeconds % 3600) / 60);
  const seconds = simClockSeconds % 60;
  const timeFormatted = [hours, minutes, seconds].map((v) => String(v).padStart(2, '0')).join(':');

  return {
    status: simStatus,
    speed: simSpeed,
    activeScenario,
    clockSeconds: simClockSeconds,
    timeFormatted,
    simulatedTime: simulatedTimeISO,
    simulatedTimeLabel: currentTimeCategory ? currentTimeCategory.label : simulatedTimeLabel,
    timeCategory: currentTimeCategory,
    isNightHours: Boolean(currentTimeCategory && currentTimeCategory.isNight),
    timeCategories: TIME_CATEGORIES,
    timePresets: TIME_PRESETS,
    activeTracksCount: activeTracks.size,
    tracks: Array.from(activeTracks.values()).map((t) => ({
      vehicleId: t.vehicleId,
      bookingId: t.bookingId,
      phase: t.phase,
      distanceTraveled: Math.round(t.distanceTraveled),
      totalDistance: Math.round(t.profile.totalDistance)
    })),
    notifications
  };
}

module.exports = {
  buildRouteProfile,
  interpolateAlongRoute,
  removeVehicleTrack,
  syncActiveTracks,
  stepSimulation,
  startSimulation,
  pauseSimulation,
  resumeSimulation,
  setSimulationSpeed,
  setSimulationContext,
  resetSimulation,
  clearSimulation,
  completeSimulation,
  applySimulationTime,
  updatePriorityAfterTimeChange,
  getSimulationTime,
  getSimulationClockSeconds,
  getCurrentTimeCategory,
  getSimulationState
};
