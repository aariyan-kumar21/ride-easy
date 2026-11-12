const Vehicle = require('../models/Vehicle');
const Booking = require('../models/Booking');

const ALLOWED_STATUSES = ['available', 'assigned', 'to_pickup', 'on_trip', 'offline'];

async function getVehicles(req, res, next) {
  try {
    const filter = {};
    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.vehicleType) {
      filter.vehicleType = String(req.query.vehicleType).toLowerCase();
    }

    const vehicles = await Vehicle.find(filter).sort({ vehicleId: 1 }).lean();
    res.status(200).json({ vehicles });
  } catch (err) {
    next(err);
  }
}

async function updateVehicleStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    if (!ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: `Invalid vehicle status. Allowed values: ${ALLOWED_STATUSES.join(', ')}`
      });
    }

    const vehicle = await Vehicle.findOne({ vehicleId: id });
    if (!vehicle) {
      return res.status(404).json({
        error: 'NotFound',
        message: `Vehicle ${id} not found`
      });
    }

    // If vehicle is taken offline or returned to available, clear currentBookingId safely
    if (status === 'available' || status === 'offline') {
      if (vehicle.currentBookingId) {
        await Booking.updateOne(
          { bookingId: vehicle.currentBookingId, status: { $in: ['assigned', 'to_pickup'] } },
          { $set: { status: 'queued', vehicleId: null } }
        );
      }
      vehicle.currentBookingId = null;
    }

    vehicle.status = status;
    await vehicle.save();

    return res.status(200).json({ vehicle: vehicle.toObject() });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getVehicles, updateVehicleStatus };

