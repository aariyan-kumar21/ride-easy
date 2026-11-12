import { api } from './api.js';
import { SEED_PASSENGERS } from './seedData.js';

const listeners = new Set();

const CATEGORY_LABELS = {
  senior: 'Senior Citizen',
  woman: 'Woman',
  regular: 'Regular'
};

function mapVehicle(v) {
  return {
    id: v.vehicleId || v.id,
    vehicleType: v.vehicleType === 'auto' ? 'Auto' : 'Cab',
    capacity: v.capacity,
    status: v.status,
    lat: v.latitude ?? v.lat,
    lng: v.longitude ?? v.lng,
    area: v.area || '',
    currentBookingId: v.currentBookingId || null
  };
}

function mapBooking(b) {
  return {
    id: b.bookingId || b.id,
    userId: b.userId,
    category: CATEGORY_LABELS[b.category] || b.category || 'Regular',
    vehicle: b.vehicleId || 'Pending',
    status: b.status,
    estPickup:
      b.estimatedPickupMinutes !== null && b.estimatedPickupMinutes !== undefined
        ? `${b.estimatedPickupMinutes} min`
        : b.status === 'completed'
        ? 'Done'
        : '—',
    pickup: b.pickup ? [b.pickup.lat, b.pickup.lng] : null,
    destination: b.destination ? [b.destination.lat, b.destination.lng] : null,
    passengerCount: b.passengerCount,
    vehicleType: b.vehicleType,
    priorityScore: b.priorityScore || 0
  };
}

function mapQueueItem(q) {
  return {
    id: q.bookingId || q.id,
    userId: q.userId,
    priorityScore: q.priorityScore ?? 0,
    waitMinutes: q.waitMinutes ?? 0,
    category: CATEGORY_LABELS[q.category] || q.category || 'Regular',
    pickup: q.pickup ? [q.pickup.lat, q.pickup.lng] : null
  };
}

let store = {
  vehicles: [],
  passengers: SEED_PASSENGERS.map((p) => ({
    ...p,
    pickup: { ...p.pickup },
    destination: { ...p.destination }
  })),
  bookings: [],
  queue: [],
  stats: null,
  vehicleFilter: 'all',
  loading: false,
  error: null,
  simulation: {
    status: 'Paused',
    speed: 1,
    clockSeconds: 16 * 3600 + 35 * 60
  }
};

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

export async function loadInitialData() {
  store.loading = true;
  store.error = null;
  notify('loading:changed', true);

  try {
    const [vehiclesRes, bookingsRes, queueRes, statsRes] = await Promise.all([
      api.getVehicles(),
      api.getBookings(),
      api.getQueue(),
      api.getAdminStats()
    ]);

    store.vehicles = (vehiclesRes.vehicles || []).map(mapVehicle);
    store.bookings = (bookingsRes.bookings || []).map(mapBooking);
    store.queue = (queueRes.queue || []).map(mapQueueItem);
    store.stats = statsRes;
    store.loading = false;
    store.error = null;
    notify('data:loaded', store);
  } catch (err) {
    store.loading = false;
    store.error = err.message || 'Unable to load simulation data from backend';
    notify('data:error', store.error);
  }
}

export async function changeVehicleStatus(vehicleId, newStatus) {
  const res = await api.updateVehicleStatus(vehicleId, newStatus);
  const updated = mapVehicle(res.vehicle);
  store.vehicles = store.vehicles.map((v) => (v.id === updated.id ? updated : v));
  notify('vehicle:updated', updated);
  return updated;
}

export async function createBooking(payload) {
  const res = await api.createBooking(payload);
  const created = mapBooking(res.booking);
  store.bookings = [created, ...store.bookings];
  notify('booking:added', created);
  return created;
}

export async function cancelBooking(bookingId) {
  const res = await api.cancelBooking(bookingId);
  const updated = mapBooking(res.booking);
  store.bookings = store.bookings.map((b) => (b.id === updated.id ? updated : b));
  store.queue = store.queue.filter((q) => q.id !== updated.id);
  notify('booking:updated', updated);
  return updated;
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

export async function resetState() {
  store.vehicleFilter = 'all';
  store.simulation = {
    status: 'Idle',
    speed: 1,
    clockSeconds: 16 * 3600 + 35 * 60
  };
  await loadInitialData();
  notify('state:reset', store);
}
