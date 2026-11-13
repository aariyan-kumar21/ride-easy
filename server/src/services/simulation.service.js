const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const { resetAll } = require('../store/memoryStore');
const defaultRoutingService = require('./routing.service');
const defaultAllocationService = require('./allocation.service');
const { SEED_USERS, SEED_VEHICLES, SEED_BOOKINGS } = require('../seed/seedData');

const TICK_INTERVAL_MS = 500;
const BASE_METERS_PER_TICK = 15; // 30 m/s at 1x speed for clear demo pacing
const ALLOWED_SPEEDS = new Set([1, 2, 4, 8, 5, 10]);

let simStatus = 'Paused'; // 'Running' | 'Paused' | 'Idle'
let simSpeed = 1;
let tickTimer = null;
let isStepping = false;
const activeTracks = new Map(); // vehicleId -> track state
let notifications = [];
let activeScenario = null;
let simulatedTimeISO = null;
let simulatedTimeLabel = 'Daytime (Live Demo)';

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

/**
 * Precompute cumulative segment distances (in meters) along an OSRM route.
 */
function buildRouteProfile(route) {
  if (!Array.isArray(route) || route.length < 2) {
    return { points: route || [], cumulative: [0], totalDistance: 0 };
  }

  const cumulative = [0];
  let total = 0;

  for (let i = 1; i < route.length; i += 1) {
    const prev = { lat: route[i - 1][0], lng: route[i - 1][1] };
    const curr = { lat: route[i][0], lng: route[i][1] };
    const segDist = defaultRoutingService.haversineMeters(prev, curr);
    total += segDist;
    cumulative.push(total);
  }

  return { points: route, cumulative, totalDistance: total };
}

/**
 * Interpolate [lat, lng] along the exact road segments at distanceTraveled meters.
 */
function interpolateAlongRoute(profile, distanceTraveled) {
  const { points, cumulative, totalDistance } = profile;
  if (!points || points.length === 0) return null;
  if (points.length === 1 || totalDistance <= 0 || distanceTraveled <= 0) {
    return { lat: points[0][0], lng: points[0][1] };
  }
  if (distanceTraveled >= totalDistance) {
    const last = points[points.length - 1];
    return { lat: last[0], lng: last[1] };
  }

  for (let i = 1; i < cumulative.length; i += 1) {
    if (distanceTraveled <= cumulative[i]) {
      const segStart = cumulative[i - 1];
      const segEnd = cumulative[i];
      const segLen = segEnd - segStart;
      const ratio = segLen > 0 ? (distanceTraveled - segStart) / segLen : 0;
      const p1 = points[i - 1];
      const p2 = points[i];

      return {
        lat: Number((p1[0] + (p2[0] - p1[0]) * ratio).toFixed(6)),
        lng: Number((p1[1] + (p2[1] - p1[1]) * ratio).toFixed(6))
      };
    }
  }

  const last = points[points.length - 1];
  return { lat: last[0], lng: last[1] };
}

function removeVehicleTrack(vehicleId) {
  return activeTracks.delete(vehicleId);
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
      distanceTraveled: 0
    });
  }
}

/**
 * Advance all tracked vehicles by one simulation tick.
 */
async function stepSimulation(options = {}) {
  if (simStatus !== 'Running' && !options.forceStep) {
    return { stepped: false };
  }

  const BookingModel = options.BookingModel || Booking;
  const VehicleModel = options.VehicleModel || Vehicle;
  const routingService = options.routingService || defaultRoutingService;
  const allocationService = options.allocationService || defaultAllocationService;

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

  if (completedAnyTrip) {
    const allocResult = await allocationService.runAllocationCycle({
      BookingModel,
      VehicleModel,
      routingService,
      now: simulatedTimeISO ? new Date(simulatedTimeISO) : new Date()
    });
    const emitter = getSocketEmitter();
    if (emitter) {
      emitter.emitAllocationCompleted(allocResult);
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
    const err = new Error('Speed must be one of 1, 2, 4, 8, 5, or 10');
    err.statusCode = 400;
    throw err;
  }
  simSpeed = num;
  return getSimulationState();
}

async function completeSimulation(options = {}) {
  const BookingModel = options.BookingModel || Booking;
  const VehicleModel = options.VehicleModel || Vehicle;
  const allocationService = options.allocationService || defaultAllocationService;

  stopTickLoop();
  simStatus = 'Paused';

  let hasProgress = true;
  let iterations = 0;
  const maxIterations = 20;

  while (hasProgress && iterations < maxIterations) {
    iterations++;
    hasProgress = false;

    const activeBookings = await BookingModel.find({
      status: { $in: ['assigned', 'to_pickup', 'on_trip'] }
    });

    for (const booking of activeBookings) {
      hasProgress = true;
      const vehicleId = booking.vehicleId;

      if (booking.status === 'assigned' || booking.status === 'to_pickup') {
        pushNotification('pickup_arrived', `Passenger picked up successfully! Booking: ${booking.bookingId}, Cab: ${vehicleId || 'Assigned'}`);
      }

      await BookingModel.updateOne(
        { bookingId: booking.bookingId },
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
              currentBookingId: null,
              latitude: booking.destination.lat,
              longitude: booking.destination.lng
            }
          }
        );
        activeTracks.delete(vehicleId);
      }

      pushNotification('trip_completed', `Passenger dropped off successfully! Ride completed.`);
    }

    const allocResult = await allocationService.runAllocationCycle({
      BookingModel,
      VehicleModel,
      now: simulatedTimeISO ? new Date(simulatedTimeISO) : new Date()
    });

    if (allocResult && allocResult.allocated && allocResult.allocated.length > 0) {
      hasProgress = true;
    }
  }

  activeTracks.clear();

  const emitter = getSocketEmitter();
  if (emitter) {
    const io = emitter.getIO ? emitter.getIO() : null;
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
  simulatedTimeISO = null;
  simulatedTimeLabel = 'Daytime (Live Demo)';

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
  simulatedTimeISO = simulatedTime;
  simulatedTimeLabel = timeLabel;
  if (notice) {
    pushNotification('scenario', notice);
  }
  return getSimulationState();
}

function getSimulationState() {
  return {
    status: simStatus,
    speed: simSpeed,
    activeScenario,
    simulatedTime: simulatedTimeISO,
    simulatedTimeLabel,
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
  getSimulationState
};

