import {
  applyStateSync,
  applyBookingUpsert,
  applyCabLocation,
  applyCabStatus,
  applyQueueUpdated,
  applySimulationState,
  loadInitialData
} from './state.js';

let socket = null;

export function getSocket() {
  return socket;
}

export function initSocket() {
  if (typeof io === 'undefined') {
    console.warn('Socket.IO client library not loaded; falling back to REST only.');
    return null;
  }

  const socketOrigin = window.location.port === '5500' ? 'http://localhost:5000' : undefined;
  socket = io(socketOrigin, {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000
  });

  socket.on('connect', () => {
    console.log('Socket.IO connected:', socket.id);
  });

  socket.on('reconnect', () => {
    console.log('Socket.IO reconnected; refreshing state...');
    loadInitialData();
  });

  socket.on('state:sync', (payload) => applyStateSync(payload));
  socket.on('booking:created', (booking) => applyBookingUpsert(booking, true));
  socket.on('booking:updated', (booking) => applyBookingUpsert(booking, false));
  socket.on('cab:location', (payload) => applyCabLocation(payload));
  socket.on('cab:status', (vehicle) => applyCabStatus(vehicle));
  socket.on('queue:updated', (payload) => applyQueueUpdated(payload?.queue || []));
  socket.on('simulation:state', (simState) => applySimulationState(simState));
  socket.on('allocation:completed', (result) => {
    if (result?.allocated?.length > 0) {
      loadInitialData();
    }
  });

  socket.on('disconnect', (reason) => {
    console.warn('Socket.IO disconnected:', reason);
  });

  return socket;
}
