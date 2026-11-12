const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');
const { calculatePriority, sortRequestsByPriority } = require('./priority.service');
const defaultRoutingService = require('./routing.service');

// In-process mutex to serialize allocation cycles and prevent overlapping runs
let allocationMutex = Promise.resolve();

function withAllocationLock(task) {
  const run = allocationMutex.then(task, task);
  allocationMutex = run.catch(() => {});
  return run;
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
          status: 'assigned',
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
            priorityScore: booking.priorityScore,
            priorityBreakdown: booking.priorityBreakdown,
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
 * Run a full priority-based allocation cycle across all requested and queued bookings.
 * Accepts optional dependencies for unit testing.
 */
async function executeAllocationCycle(options = {}) {
  const BookingModel = options.BookingModel || Booking;
  const VehicleModel = options.VehicleModel || Vehicle;
  const routingService = options.routingService || defaultRoutingService;
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const priorityConfig = options.priorityConfig;

  const pendingBookings = await BookingModel.find({
    status: { $in: ['requested', 'queued'] }
  });

  if (!pendingBookings || pendingBookings.length === 0) {
    return { allocated: [], queued: [], timestamp: now.toISOString() };
  }

  // Recalculate priority scores preserving original createdAt
  const sortedBookings = sortRequestsByPriority(pendingBookings, {
    now,
    config: priorityConfig,
    recalculate: true
  });

  const allocated = [];
  const queued = [];

  for (const booking of sortedBookings) {
    // Query currently available vehicles matching type and capacity
    const eligibleVehicles = await VehicleModel.find({
      status: 'available',
      vehicleType: booking.vehicleType,
      capacity: { $gte: booking.passengerCount },
      currentBookingId: null
    });

    if (!eligibleVehicles || eligibleVehicles.length === 0) {
      await BookingModel.updateOne(
        { bookingId: booking.bookingId, status: { $in: ['requested', 'queued'] } },
        {
          $set: {
            status: 'queued',
            vehicleId: null,
            priorityScore: booking.priorityScore,
            priorityBreakdown: booking.priorityBreakdown,
            estimatedPickupMinutes: null
          }
        }
      );

      queued.push({
        bookingId: booking.bookingId,
        priorityScore: booking.priorityScore,
        priorityBreakdown: booking.priorityBreakdown,
        reason: `No available ${booking.vehicleType} with capacity >= ${booking.passengerCount}`
      });
      continue;
    }

    // Calculate road ETA for each eligible vehicle and sort by lowest ETA
    const candidatesWithEta = await Promise.all(
      eligibleVehicles.map(async (vehicle) => {
        const route = await routingService.getRouteEstimate(
          { lat: vehicle.latitude, lng: vehicle.longitude },
          booking.pickup
        );
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

    const reservation = await reserveBestCandidate(
      booking,
      candidatesWithEta,
      BookingModel,
      VehicleModel
    );

    if (reservation) {
      allocated.push({
        bookingId: booking.bookingId,
        vehicleId: reservation.vehicle.vehicleId,
        vehicleType: reservation.vehicle.vehicleType,
        capacity: reservation.vehicle.capacity,
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
            priorityScore: booking.priorityScore,
            priorityBreakdown: booking.priorityBreakdown,
            estimatedPickupMinutes: null
          }
        }
      );

      queued.push({
        bookingId: booking.bookingId,
        priorityScore: booking.priorityScore,
        priorityBreakdown: booking.priorityBreakdown,
        reason: 'Eligible vehicles were claimed concurrently; placed in waiting queue'
      });
    }
  }

  return {
    allocated,
    queued: queued.map((item, idx) => ({ ...item, queuePosition: idx + 1 })),
    timestamp: now.toISOString()
  };
}

function runAllocationCycle(options = {}) {
  return withAllocationLock(() => executeAllocationCycle(options));
}

module.exports = { runAllocationCycle, calculatePriority };

