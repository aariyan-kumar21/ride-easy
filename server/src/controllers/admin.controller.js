const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');

async function getQueue(req, res, next) {
  try {
    const queuedBookings = await Booking.find({ status: 'queued' })
      .sort({ priorityScore: -1, createdAt: 1, bookingId: 1 })
      .lean();

    const now = Date.now();
    const queue = queuedBookings.map((item, index) => ({
      position: index + 1,
      bookingId: item.bookingId,
      userId: item.userId,
      category: item.category,
      vehicleType: item.vehicleType,
      passengerCount: item.passengerCount,
      pickup: item.pickup,
      destination: item.destination,
      priorityScore: item.priorityScore,
      priorityBreakdown: item.priorityBreakdown,
      waitMinutes: Math.max(0, Math.floor((now - new Date(item.createdAt).getTime()) / 60000)),
      createdAt: item.createdAt
    }));

    res.status(200).json({ queue });
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

module.exports = { getQueue, getAdminStats };

