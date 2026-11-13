const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');
const { calculatePriority, sortWaitingBookings, sortRequestsByPriority, updateQueuePositions } = require('./priority.service');
const defaultRoutingService = require('./routing.service');

// In-process mutex to serialize allocation cycles and guarantee strict sequential reservation
let allocationMutex = Promise.resolve();

function withAllocationLock(task) {
  const run = allocationMutex.then(task, task);
  allocationMutex = run.catch(() => {});
  return run;
}

/**
 * Retrieve all currently waiting or unassigned bookings.
 */
async function getWaitingBookings(BookingModel = Booking) {
  return BookingModel.find({
    status: { $in: ['requested', 'queued'] }
  });
}

/**
 * Query eligible available vehicles strictly filtered by vehicleType and seating capacity.
 */
async function getEligibleVehicles(booking, VehicleModel = Vehicle) {
  return VehicleModel.find({
    status: 'available',
    vehicleType: booking.vehicleType,
    capacity: { $gte: booking.passengerCount },
    currentBookingId: null
  });
}

/**
 * Calculate road ETA from a vehicle to a booking's pickup coordinates via OSRM.
 */
async function calculateVehicleETA(vehicle, pickup, routingService = defaultRoutingService) {
  return routingService.getRouteEstimate(
    { lat: vehicle.latitude, lng: vehicle.longitude },
    pickup
  );
}

/**
 * Attempt to atomically reserve one of the ranked candidate vehicles.
 * Releases reservation if updating the booking fails.
 */
async function reserveBestCandidate(booking, rankedCandidates, BookingModel, VehicleModel) {
  for (const candidate of rankedCandidates) {
    const reservedVehicle = await VehicleModel.findOneAndUpdate(
      {
        vehicleId: candidate.vehicle.vehicleId,
        status: 'available',
        currentBookingId: null
      },
      {
        $set: {
          status: 'to_pickup',
          currentBookingId: booking.bookingId
        }
      },
      { new: true }
    );

    if (!reservedVehicle) {
      // Another concurrent operation claimed this vehicle; try next candidate
      continue;
    }

    try {
      const updatedBooking = await BookingModel.findOneAndUpdate(
        {
          bookingId: booking.bookingId,
          status: { $in: ['requested', 'queued'] }
        },
        {
          $set: {
            status: 'assigned',
            vehicleId: reservedVehicle.vehicleId,
            priorityTier: booking.priorityTier,
            priorityTierLabel: booking.priorityTierLabel,
            priorityScore: booking.priorityScore,
            priorityBreakdown: booking.priorityBreakdown,
            waitingDurationSeconds: booking.waitingDurationSeconds,
            waitingMinutes: booking.waitingMinutes,
            queuePosition: null,
            estimatedPickupMinutes: candidate.route.durationMinutes,
            routeDistanceMeters: candidate.route.distanceMeters,
            routeDurationSeconds: candidate.route.durationSeconds,
            isEstimatedRoute: Boolean(candidate.route.isEstimated),
            routeGeometry: candidate.route.geometry
          }
        },
        { new: true }
      );

      if (!updatedBooking) {
        // Booking was cancelled or modified concurrently; release vehicle
        await VehicleModel.updateOne(
          { vehicleId: reservedVehicle.vehicleId, currentBookingId: booking.bookingId },
          { $set: { status: 'available', currentBookingId: null } }
        );
        return null;
      }

      return {
        booking: updatedBooking,
        vehicle: reservedVehicle,
        route: candidate.route
      };
    } catch (err) {
      // Rollback vehicle reservation if booking persistence fails
      await VehicleModel.updateOne(
        { vehicleId: reservedVehicle.vehicleId, currentBookingId: booking.bookingId },
        { $set: { status: 'available', currentBookingId: null } }
      );
      throw err;
    }
  }

  return null;
}

/**
 * Run a full priority-based sequential allocation cycle.
 *
 * Algorithm Execution:
 * 1. Retrieve all waiting/unassigned bookings.
 * 2. Determine simulation time context & priority rules.
 * 3. Sort waiting bookings by: Priority Tier -> Waiting Duration -> Sequence Number.
 * 4. Iterate sequentially: Highest priority passenger gets nearest suitable vehicle.
 * 5. Reserved vehicle is immediately taken off the available pool for subsequent bookings.
 * 6. Repeat until no more eligible booking/vehicle combinations are available.
 */
async function executeAllocationCycle(options = {}) {
  const BookingModel = options.BookingModel || Booking;
  const VehicleModel = options.VehicleModel || Vehicle;
  const routingService = options.routingService || defaultRoutingService;
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const priorityConfig = options.priorityConfig;

  const pendingBookings = await getWaitingBookings(BookingModel);

  if (!pendingBookings || pendingBookings.length === 0) {
    return { allocated: [], queued: [], timestamp: now.toISOString() };
  }

  // Sort bookings strictly by Priority Tier -> Batch Window -> Waiting Duration -> Sequence Number
  const sortedBookings = sortWaitingBookings(pendingBookings, {
    now,
    config: priorityConfig,
    recalculate: true
  });

  const allocated = [];
  const queued = [];

  for (const booking of sortedBookings) {
    // 1. Query currently available vehicles matching type and capacity
    const eligibleVehicles = await getEligibleVehicles(booking, VehicleModel);

    if (!eligibleVehicles || eligibleVehicles.length === 0) {
      // No vehicle available; place/keep in queued state
      await BookingModel.updateOne(
        { bookingId: booking.bookingId, status: { $in: ['requested', 'queued'] } },
        {
          $set: {
            status: 'queued',
            vehicleId: null,
            priorityTier: booking.priorityTier,
            priorityTierLabel: booking.priorityTierLabel,
            priorityScore: booking.priorityScore,
            priorityBreakdown: booking.priorityBreakdown,
            waitingDurationSeconds: booking.waitingDurationSeconds,
            waitingMinutes: booking.waitingMinutes,
            estimatedPickupMinutes: null
          }
        }
      );

      queued.push({
        bookingId: booking.bookingId,
        passengerName: booking.passengerName,
        category: booking.category,
        priorityTier: booking.priorityTier,
        priorityTierLabel: booking.priorityTierLabel,
        priorityScore: booking.priorityScore,
        priorityBreakdown: booking.priorityBreakdown,
        waitingDurationSeconds: booking.waitingDurationSeconds,
        reason: `No available ${booking.vehicleType} with capacity >= ${booking.passengerCount}`
      });
      continue;
    }

    // 2. Calculate road ETA for each eligible vehicle and sort by lowest ETA
    const candidatesWithEta = await Promise.all(
      eligibleVehicles.map(async (vehicle) => {
        const route = await calculateVehicleETA(vehicle, booking.pickup, routingService);
        return { vehicle, route };
      })
    );

    candidatesWithEta.sort((a, b) => {
      if (a.route.durationMinutes !== b.route.durationMinutes) {
        return a.route.durationMinutes - b.route.durationMinutes;
      }
      if (a.route.distanceMeters !== b.route.distanceMeters) {
        return a.route.distanceMeters - b.route.distanceMeters;
      }
      return String(a.vehicle.vehicleId).localeCompare(String(b.vehicle.vehicleId));
    });

    // 3. Sequentially reserve the best candidate
    const reservation = await reserveBestCandidate(
      booking,
      candidatesWithEta,
      BookingModel,
      VehicleModel
    );

    if (reservation) {
      allocated.push({
        bookingId: booking.bookingId,
        passengerName: booking.passengerName,
        category: booking.category,
        vehicleId: reservation.vehicle.vehicleId,
        vehicleType: reservation.vehicle.vehicleType,
        capacity: reservation.vehicle.capacity,
        priorityTier: booking.priorityTier,
        priorityTierLabel: booking.priorityTierLabel,
        priorityScore: booking.priorityScore,
        priorityBreakdown: booking.priorityBreakdown,
        estimatedPickupMinutes: reservation.route.durationMinutes,
        routeDistanceMeters: reservation.route.distanceMeters,
        isEstimatedRoute: Boolean(reservation.route.isEstimated),
        reason: `Selected ${reservation.vehicle.vehicleId} (${reservation.vehicle.vehicleType}, ${reservation.vehicle.capacity} seats) with lowest ${reservation.route.isEstimated ? 'estimated ' : ''}ETA of ${reservation.route.durationMinutes} min`
      });
    } else {
      await BookingModel.updateOne(
        { bookingId: booking.bookingId, status: { $in: ['requested', 'queued'] } },
        {
          $set: {
            status: 'queued',
            vehicleId: null,
            priorityTier: booking.priorityTier,
            priorityTierLabel: booking.priorityTierLabel,
            priorityScore: booking.priorityScore,
            priorityBreakdown: booking.priorityBreakdown,
            waitingDurationSeconds: booking.waitingDurationSeconds,
            waitingMinutes: booking.waitingMinutes,
            estimatedPickupMinutes: null
          }
        }
      );

      queued.push({
        bookingId: booking.bookingId,
        passengerName: booking.passengerName,
        category: booking.category,
        priorityTier: booking.priorityTier,
        priorityTierLabel: booking.priorityTierLabel,
        priorityScore: booking.priorityScore,
        priorityBreakdown: booking.priorityBreakdown,
        waitingDurationSeconds: booking.waitingDurationSeconds,
        reason: 'Eligible vehicles were claimed sequentially; placed in waiting queue'
      });
    }
  }

  // Update sequential unique queue positions (Priority #1, Priority #2, etc.) separately for Cabs and Autos
  const queueSnapshot = await updateQueuePositions({
    BookingModel,
    now,
    config: priorityConfig
  });

  return {
    allocated,
    queued: queueSnapshot.allQueued,
    queuedCabs: queueSnapshot.cabs,
    queuedAutos: queueSnapshot.autos,
    timestamp: now.toISOString()
  };
}

function runAllocationCycle(options = {}) {
  return withAllocationLock(() => executeAllocationCycle(options));
}

function processWaitingQueue(options = {}) {
  return runAllocationCycle(options);
}

module.exports = {
  runAllocationCycle,
  processWaitingQueue,
  executeAllocationCycle,
  getWaitingBookings,
  getEligibleVehicles,
  calculateVehicleETA,
  reserveBestCandidate,
  calculatePriority,
  sortRequestsByPriority
};
