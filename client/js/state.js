import { SEED_VEHICLES, SEED_PASSENGERS } from './seedData.js';
import { MOCK_BOOKINGS, MOCK_QUEUE } from './mockData.js';

const listeners = new Set();

function cloneInitialData() {
  return {
    vehicles: SEED_VEHICLES.map((v) => ({ ...v })),
    passengers: SEED_PASSENGERS.map((p) => ({
      ...p,
      pickup: { ...p.pickup },
      destination: { ...p.destination }
    })),
    bookings: MOCK_BOOKINGS.map((b) => ({ ...b })),
    queue: MOCK_QUEUE.map((q) => ({ ...q })),
    vehicleFilter: 'all',
    simulation: {
      status: 'Paused',
      speed: 1,
      clockSeconds: 16 * 3600 + 35 * 60
    }
  };
}

let store = cloneInitialData();

function notify(changeType, payload = null) {
  listeners.forEach((listener) => {
    try {
      listener(store, changeType, payload);
    } catch (err) {
      console.error('State listener error:', err);
    }
  });
}

export function getState() {
  return store;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getFilteredVehicles() {
  const filter = store.vehicleFilter;
  if (filter === 'all') return store.vehicles;
  if (filter === 'cab' || filter === 'auto') {
    return store.vehicles.filter((v) => v.vehicleType.toLowerCase() === filter);
  }
  return store.vehicles.filter((v) => v.status === filter);
}

export function setVehicleFilter(filter) {
  store.vehicleFilter = filter;
  notify('filter:changed', filter);
}

export function updateVehicleStatus(vehicleId, newStatus) {
  const vehicle = store.vehicles.find((v) => v.id === vehicleId);
  if (!vehicle || vehicle.status === newStatus) return null;
  vehicle.status = newStatus;
  notify('vehicle:updated', vehicle);
  return vehicle;
}

export function addBooking(booking) {
  store.bookings = [booking, ...store.bookings];
  if (booking.status === 'queued') {
    store.queue = [
      ...store.queue,
      {
        id: booking.id,
        priorityScore: booking.priorityScore || 0,
        waitMinutes: 0,
        category: booking.category,
        pickup: booking.pickup
      }
    ];
  }
  notify('booking:added', booking);
}

export function setSimulationStatus(status) {
  store.simulation.status = status;
  notify('simulation:updated', store.simulation);
}

export function setSimulationSpeed(speed) {
  store.simulation.speed = Number(speed) || 1;
  notify('simulation:updated', store.simulation);
}

export function tickSimulationClock() {
  if (store.simulation.status !== 'Running') return;
  store.simulation.clockSeconds = (store.simulation.clockSeconds + store.simulation.speed) % 86400;
  notify('clock:tick', store.simulation);
}

export function resetState() {
  store = cloneInitialData();
  notify('state:reset', store);
}

