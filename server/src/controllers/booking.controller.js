const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');

const VALID_VEHICLE_TYPES = ['cab', 'auto'];
const VALID_CATEGORIES = ['senior', 'woman', 'regular'];
const CANCELLABLE_STATUSES = ['requested', 'queued', 'assigned'];

function isValidCoordinate(point) {
  if (!point || typeof point !== 'object') return false;
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    typeof point.label === 'string' &&
    point.label.trim().length > 0
  );
}

async function listBookings(req, res, next) {
  try {
    const filter = {};
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const bookings = await Booking.find(filter).sort({ createdAt: -1 }).lean();
    res.status(200).json({ bookings });
  } catch (err) {
    next(err);
  }
}

async function getBookingById(req, res, next) {
  try {
    const { id } = req.params;
    const booking = await Booking.findOne({ bookingId: id }).lean();

    if (!booking) {
      return res.status(404).json({
        error: 'NotFound',
        message: `Booking ${id} not found`
      });
    }

    return res.status(200).json({ booking });
  } catch (err) {
    return next(err);
  }
}

async function createBooking(req, res, next) {
  try {
    const {
      userId,
      category = 'regular',
      pickup,
      destination,
      passengerCount,
      vehicleType
    } = req.body || {};

    const normalizedType = String(vehicleType || '').toLowerCase();
    const normalizedCategory = String(category || 'regular').toLowerCase();
    const count = Number(passengerCount);

    if (!isValidCoordinate(pickup) || !isValidCoordinate(destination)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Valid pickup and destination objects with lat, lng, and label are required'
      });
    }

    if (!VALID_VEHICLE_TYPES.includes(normalizedType)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'vehicleType must be either "cab" or "auto"'
      });
    }

    if (!VALID_CATEGORIES.includes(normalizedCategory)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'category must be one of: senior, woman, regular'
      });
    }

    if (!Number.isInteger(count) || count < 1 || count > 6) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'passengerCount must be an integer between 1 and 6'
      });
    }

    if (normalizedType === 'auto' && count > 3) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Auto vehicles support a maximum of 3 passengers'
      });
    }

    const resolvedUserId = userId ? String(userId).trim() : `U-${Date.now().toString().slice(-4)}`;
    if (userId) {
      await User.findOne({ userId: resolvedUserId }).lean();
    }

    const bookingId = `BK-${Date.now().toString().slice(-5)}${Math.floor(Math.random() * 90 + 10)}`;

    const booking = await Booking.create({
      bookingId,
      userId: resolvedUserId,
      category: normalizedCategory,
      vehicleId: null,
      pickup: {
        lat: Number(pickup.lat),
        lng: Number(pickup.lng),
        label: pickup.label.trim()
      },
      destination: {
        lat: Number(destination.lat),
        lng: Number(destination.lng),
        label: destination.label.trim()
      },
      passengerCount: count,
      vehicleType: normalizedType,
      status: 'requested',
      priorityScore: 0,
      priorityBreakdown: {
        categoryBonus: 0,
        waitingTimeBonus: 0,
        isNightHours: false,
        reason: 'Pending priority allocation'
      }
    });

    return res.status(201).json({ booking: booking.toObject() });
  } catch (err) {
    return next(err);
  }
}

async function cancelBooking(req, res, next) {
  try {
    const { id } = req.params;
    const booking = await Booking.findOne({ bookingId: id });

    if (!booking) {
      return res.status(404).json({
        error: 'NotFound',
        message: `Booking ${id} not found`
      });
    }

    if (!CANCELLABLE_STATUSES.includes(booking.status)) {
      return res.status(400).json({
        error: 'InvalidStateTransition',
        message: `Cannot cancel a booking with status "${booking.status}"`
      });
    }

    const assignedVehicleId = booking.vehicleId;
    booking.status = 'cancelled';
    booking.vehicleId = null;
    await booking.save();

    if (assignedVehicleId) {
      await Vehicle.updateOne(
        { vehicleId: assignedVehicleId, currentBookingId: booking.bookingId },
        { $set: { status: 'available', currentBookingId: null } }
      );
    }

    return res.status(200).json({ booking: booking.toObject() });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listBookings,
  getBookingById,
  createBooking,
  cancelBooking
};

