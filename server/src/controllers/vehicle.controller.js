const Vehicle = require('../models/Vehicle');
const Booking = require('../models/Booking');
const { runAllocationCycle } = require('../services/allocation.service');
const { removeVehicleTrack } = require('../services/simulation.service');
const socketHandler = require('../sockets/socket.handler');

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

    // If vehicle is taken offline or returned to available, clear currentBookingId and track safely
    if (status === 'available' || status === 'offline') {
      removeVehicleTrack(id);
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

    let allocationResult = null;
    if (status === 'available') {
      allocationResult = await runAllocationCycle();
    }

    const refreshedVehicle = (await Vehicle.findOne({ vehicleId: id }).lean()) || vehicle.toObject();
    socketHandler.emitCabStatus(refreshedVehicle);
    if (allocationResult) {
      socketHandler.emitAllocationCompleted(allocationResult);
      await socketHandler.broadcastQueueSnapshot();
    }

    return res.status(200).json({
      vehicle: refreshedVehicle,
      allocation: allocationResult
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getVehicles, updateVehicleStatus };

