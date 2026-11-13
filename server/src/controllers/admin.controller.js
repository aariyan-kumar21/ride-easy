const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const { sortRequestsByPriority, updateQueuePositions } = require('../services/priority.service');
const { runAllocationCycle } = require('../services/allocation.service');
const { getSimulationTime } = require('../services/simulation.service');
const socketHandler = require('../sockets/socket.handler');

async function getQueue(req, res, next) {
  try {
    const now = getSimulationTime();
    const queueResult = await updateQueuePositions({ now });
    const vehicleTypeFilter = req.query.vehicleType ? String(req.query.vehicleType).toLowerCase() : null;

    let queueItems = queueResult.allQueued;
    if (vehicleTypeFilter === 'cab') {
      queueItems = queueResult.cabs;
    } else if (vehicleTypeFilter === 'auto') {
      queueItems = queueResult.autos;
    }

    const queue = queueItems.map((item) => ({
      position: item.queuePosition,
      queuePosition: item.queuePosition,
      bookingId: item.bookingId,
      userId: item.userId,
      passengerName: item.passengerName,
      category: item.category,
      vehicleType: item.vehicleType,
      passengerCount: item.passengerCount,
      pickup: item.pickup,
      destination: item.destination,
      priorityTier: item.priorityTier,
      priorityTierLabel: item.priorityTierLabel,
      priorityScore: item.priorityScore,
      priorityBreakdown: item.priorityBreakdown,
      waitingDurationSeconds: item.waitingDurationSeconds || 0,
      waitMinutes: item.waitingMinutes || 0,
      createdAt: item.createdAt,
      sequenceNumber: item.sequenceNumber
    }));

    res.status(200).json({ queue, cabs: queueResult.cabs, autos: queueResult.autos });
  } catch (err) {
    next(err);
  }
}

async function getAdminStats(req, res, next) {
  try {
    const [bookingCounts, vehicleCounts, userCount] = await Promise.all([
      Booking.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Vehicle.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      User.countDocuments()
    ]);

    const bookingsByStatus = {
      requested: 0,
      queued: 0,
      assigned: 0,
      to_pickup: 0,
      arrived: 0,
      on_trip: 0,
      completed: 0,
      cancelled: 0
    };
    let totalBookings = 0;
    bookingCounts.forEach((row) => {
      bookingsByStatus[row._id] = row.count;
      totalBookings += row.count;
    });

    const vehiclesByStatus = {
      available: 0,
      assigned: 0,
      to_pickup: 0,
      on_trip: 0,
      offline: 0
    };
    let totalVehicles = 0;
    vehicleCounts.forEach((row) => {
      vehiclesByStatus[row._id] = row.count;
      totalVehicles += row.count;
    });

    res.status(200).json({
      bookings: {
        total: totalBookings,
        ...bookingsByStatus
      },
      vehicles: {
        total: totalVehicles,
        ...vehiclesByStatus
      },
      users: {
        total: userCount
      }
    });
  } catch (err) {
    next(err);
  }
}

async function triggerAllocation(req, res, next) {
  try {
    const result = await runAllocationCycle();
    socketHandler.emitAllocationCompleted(result);
    await socketHandler.broadcastQueueSnapshot();
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { getQueue, getAdminStats, triggerAllocation };

