const { Server } = require('socket.io');
const env = require('../config/env');
const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');
const { calculatePriority, sortRequestsByPriority, updateQueuePositions } = require('../services/priority.service');
const { runAllocationCycle } = require('../services/allocation.service');
const simulationService = require('../services/simulation.service');

let ioInstance = null;

function getIO() {
  return ioInstance;
}

function safeEmit(event, payload) {
  if (ioInstance) {
    ioInstance.emit(event, payload);
  }
}

function emitBookingCreated(booking) {
  safeEmit('booking:created', booking);
}

function emitBookingUpdated(booking) {
  safeEmit('booking:updated', booking);
}

function emitCabLocation(vehicle) {
  safeEmit('cab:location', {
    vehicleId: vehicle.vehicleId,
    latitude: vehicle.latitude,
    longitude: vehicle.longitude,
    status: vehicle.status,
    currentBookingId: vehicle.currentBookingId || null
  });
}

function emitCabStatus(vehicle) {
  safeEmit('cab:status', vehicle);
}

function emitQueueUpdated(queue) {
  safeEmit('queue:updated', { queue });
}

function emitSimulationState(state) {
  safeEmit('simulation:state', state);
}

function emitAllocationCompleted(result) {
  safeEmit('allocation:completed', result);
}

async function buildQueueSnapshot() {
  const now = simulationService.getSimulationTime();
  const queueResult = await updateQueuePositions({ now });

  return queueResult.allQueued.map((item) => ({
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
    createdAt: item.createdAt
  }));
}

async function broadcastQueueSnapshot() {
  if (!ioInstance) return;
  try {
    const queue = await buildQueueSnapshot();
    emitQueueUpdated(queue);
    // Broadcast updated queued bookings so Active Requests immediately sync queue positions
    const updatedBookings = await Booking.find({ status: 'queued' }).lean();
    for (const b of updatedBookings) {
      safeEmit('booking:updated', b);
    }
  } catch (err) {
    console.error('Failed to broadcast queue snapshot:', err.message);
  }
}

async function sendFullSync(socket) {
  try {
    const [vehicles, bookings, queue] = await Promise.all([
      Vehicle.find({}).sort({ vehicleId: 1 }).lean(),
      Booking.find({}).sort({ createdAt: -1 }).lean(),
      buildQueueSnapshot()
    ]);

    socket.emit('state:sync', {
      vehicles,
      bookings,
      queue,
      simulation: simulationService.getSimulationState()
    });
  } catch (err) {
    console.error('Failed to send state:sync:', err.message);
  }
}

function validateBookingPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return 'Booking payload is required';
  }
  const { pickup, destination, passengerCount, vehicleType, category = 'regular' } = payload;
  const type = String(vehicleType || '').toLowerCase();
  const cat = String(category || 'regular').toLowerCase();
  const count = Number(passengerCount);

  if (
    !pickup ||
    !destination ||
    !Number.isFinite(Number(pickup.lat)) ||
    !Number.isFinite(Number(pickup.lng)) ||
    !Number.isFinite(Number(destination.lat)) ||
    !Number.isFinite(Number(destination.lng)) ||
    !String(pickup.label || '').trim() ||
    !String(destination.label || '').trim()
  ) {
    return 'Valid pickup and destination with lat, lng, and label are required';
  }
  if (!['cab', 'auto'].includes(type)) {
    return 'vehicleType must be "cab" or "auto"';
  }
  if (!['senior', 'woman', 'regular'].includes(cat)) {
    return 'category must be senior, woman, or regular';
  }
  if (!Number.isInteger(count) || count < 1 || count > 6) {
    return 'passengerCount must be an integer between 1 and 6';
  }
  if (type === 'auto' && count > 3) {
    return 'Auto supports a maximum of 3 passengers';
  }
  return null;
}

function initSocket(httpServer) {
  ioInstance = new Server(httpServer, {
    cors: {
      origin: [
        env.clientOrigin,
        `http://localhost:${env.port}`,
        `http://127.0.0.1:${env.port}`,
        'http://127.0.0.1:5500'
      ],
      methods: ['GET', 'POST', 'PATCH'],
      credentials: true
    }
  });

  ioInstance.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    sendFullSync(socket);

    socket.on('booking:create', async (payload, ack) => {
      try {
        const validationError = validateBookingPayload(payload);
        if (validationError) {
          if (typeof ack === 'function') ack({ ok: false, error: validationError });
          return;
        }

        const now = new Date();
        const normalizedCategory = String(payload.category || 'regular').toLowerCase();
        const normalizedType = String(payload.vehicleType).toLowerCase();
        const bookingId = `BK-${Date.now().toString().slice(-5)}${Math.floor(Math.random() * 90 + 10)}`;
        const userId = payload.userId ? String(payload.userId).trim() : `U-${Date.now().toString().slice(-4)}`;

        // Always compute priority on the backend; ignore any client-supplied priority
        const { priorityScore, priorityBreakdown } = calculatePriority(
          { category: normalizedCategory, createdAt: now },
          { now }
        );

        const created = await Booking.create({
          bookingId,
          userId,
          category: normalizedCategory,
          vehicleId: null,
          pickup: {
            lat: Number(payload.pickup.lat),
            lng: Number(payload.pickup.lng),
            label: String(payload.pickup.label).trim()
          },
          destination: {
            lat: Number(payload.destination.lat),
            lng: Number(payload.destination.lng),
            label: String(payload.destination.label).trim()
          },
          passengerCount: Number(payload.passengerCount),
          vehicleType: normalizedType,
          status: 'requested',
          priorityScore,
          priorityBreakdown
        });

        const allocationResult = await runAllocationCycle();
        const finalBooking = (await Booking.findOne({ bookingId }).lean()) || created.toObject();

        emitBookingCreated(finalBooking);
        emitAllocationCompleted(allocationResult);
        if (finalBooking.vehicleId) {
          const veh = await Vehicle.findOne({ vehicleId: finalBooking.vehicleId }).lean();
          if (veh) emitCabStatus(veh);
        }
        await broadcastQueueSnapshot();

        if (typeof ack === 'function') ack({ ok: true, booking: finalBooking, allocation: allocationResult });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Failed to create booking' });
      }
    });

    socket.on('booking:cancel', async (payload, ack) => {
      try {
        const bookingId = payload?.bookingId ? String(payload.bookingId).trim() : '';
        if (!bookingId) {
          if (typeof ack === 'function') ack({ ok: false, error: 'bookingId is required' });
          return;
        }

        const booking = await Booking.findOne({ bookingId });
        if (!booking) {
          if (typeof ack === 'function') ack({ ok: false, error: `Booking ${bookingId} not found` });
          return;
        }

        if (!['requested', 'queued', 'assigned'].includes(booking.status)) {
          if (typeof ack === 'function') ack({ ok: false, error: `Cannot cancel booking in status "${booking.status}"` });
          return;
        }

        const assignedVehicleId = booking.vehicleId;
        booking.status = 'cancelled';
        booking.vehicleId = null;
        await booking.save();

        emitBookingUpdated(booking.toObject());

        if (assignedVehicleId) {
          simulationService.removeVehicleTrack(assignedVehicleId);
          const released = await Vehicle.findOneAndUpdate(
            { vehicleId: assignedVehicleId, currentBookingId: booking.bookingId },
            { $set: { status: 'available', currentBookingId: null } },
            { new: true }
          ).lean();
          if (released) emitCabStatus(released);

          const allocationResult = await runAllocationCycle();
          emitAllocationCompleted(allocationResult);
        }

        await broadcastQueueSnapshot();
        if (typeof ack === 'function') ack({ ok: true, booking: booking.toObject() });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Failed to cancel booking' });
      }
    });

    socket.on('simulation:start', async (_payload, ack) => {
      try {
        const state = await simulationService.startSimulation();
        emitSimulationState(state);
        if (typeof ack === 'function') ack({ ok: true, state });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Failed to start simulation' });
      }
    });

    socket.on('simulation:pause', (_payload, ack) => {
      const state = simulationService.pauseSimulation();
      emitSimulationState(state);
      if (typeof ack === 'function') ack({ ok: true, state });
    });

    socket.on('simulation:resume', async (_payload, ack) => {
      try {
        const state = await simulationService.resumeSimulation();
        emitSimulationState(state);
        if (typeof ack === 'function') ack({ ok: true, state });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Failed to resume simulation' });
      }
    });

    socket.on('simulation:speed', (payload, ack) => {
      try {
        const state = simulationService.setSimulationSpeed(payload?.speed);
        emitSimulationState(state);
        if (typeof ack === 'function') ack({ ok: true, state });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, error: err.message });
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected: ${socket.id} (${reason})`);
    });
  });

  return ioInstance;
}

module.exports = {
  initSocket,
  getIO,
  emitBookingCreated,
  emitBookingUpdated,
  emitCabLocation,
  emitCabStatus,
  emitQueueUpdated,
  emitSimulationState,
  emitAllocationCompleted,
  broadcastQueueSnapshot,
  sendFullSync
};
