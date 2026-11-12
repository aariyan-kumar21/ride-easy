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
    destinationLabel: b.destination?.label || '',
    passengerCount: b.passengerCount,
    vehicleType: b.vehicleType,
    priorityScore: b.priorityScore || 0,
    priorityBreakdown: b.priorityBreakdown || null,
    estimatedPickupMinutes: b.estimatedPickupMinutes ?? null,
    routeDistanceMeters: b.routeDistanceMeters ?? null,
    routeDurationSeconds: b.routeDurationSeconds ?? null,
    isEstimatedRoute: Boolean(b.isEstimatedRoute),
    routeGeometry: Array.isArray(b.routeGeometry) ? b.routeGeometry : []
  };
}

function mapQueueItem(q) {
  return {
    id: q.bookingId || q.id,
    userId: q.userId,
    priorityScore: q.priorityScore ?? 0,
    waitMinutes: q.waitMinutes ?? 0,
    category: CATEGORY_LABELS[q.category] || q.category || 'Regular',
    priorityReason: q.priorityBreakdown?.reason || '',
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
    clockSeconds: 16 * 3600 + 35 * 60,
    notifications: []
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

export async function startTrip(bookingId) {
  const res = await api.startTrip(bookingId);
  const updated = mapBooking(res.booking);
  store.bookings = store.bookings.map((b) => (b.id === updated.id ? updated : b));
  if (updated.vehicle && updated.vehicle !== 'Pending') {
    store.vehicles = store.vehicles.map((v) =>
      v.id === updated.vehicle ? { ...v, status: 'on_trip' } : v
    );
  }
  notify('booking:updated', updated);
  return updated;
}

export function applyStateSync(payload) {
  if (!payload) return;
  if (Array.isArray(payload.vehicles)) {
    store.vehicles = payload.vehicles.map(mapVehicle);
  }
  if (Array.isArray(payload.bookings)) {
    store.bookings = payload.bookings.map(mapBooking);
  }
  if (Array.isArray(payload.queue)) {
    store.queue = payload.queue.map(mapQueueItem);
  }
  if (payload.simulation) {
    store.simulation.status = payload.simulation.status || store.simulation.status;
    store.simulation.speed = payload.simulation.speed || store.simulation.speed;
    store.simulation.notifications = payload.simulation.notifications || [];
  }
  store.loading = false;
  store.error = null;
  notify('data:loaded', store);
}

export function applyBookingUpsert(rawBooking, isNew = false) {
  if (!rawBooking) return;
  const mapped = mapBooking(rawBooking);
  const exists = store.bookings.some((b) => b.id === mapped.id);
  if (exists) {
    store.bookings = store.bookings.map((b) => (b.id === mapped.id ? mapped : b));
    notify('booking:updated', mapped);
  } else {
    store.bookings = [mapped, ...store.bookings];
    notify(isNew ? 'booking:added' : 'booking:updated', mapped);
  }
}

export function applyCabLocation(payload) {
  if (!payload?.vehicleId) return;
  let updatedVehicle = null;
  store.vehicles = store.vehicles.map((v) => {
    if (v.id !== payload.vehicleId) return v;
    updatedVehicle = {
      ...v,
      lat: payload.latitude,
      lng: payload.longitude,
      status: payload.status || v.status,
      currentBookingId: payload.currentBookingId ?? v.currentBookingId
    };
    return updatedVehicle;
  });
  if (updatedVehicle) {
    notify('cab:location', updatedVehicle);
  }
}

export function applyCabStatus(rawVehicle) {
  if (!rawVehicle) return;
  const mapped = mapVehicle(rawVehicle);
  const exists = store.vehicles.some((v) => v.id === mapped.id);
  store.vehicles = exists
    ? store.vehicles.map((v) => (v.id === mapped.id ? mapped : v))
    : [...store.vehicles, mapped];
  notify('vehicle:updated', mapped);
}

export function applyQueueUpdated(queueList) {
  if (!Array.isArray(queueList)) return;
  store.queue = queueList.map(mapQueueItem);
  notify('queue:updated', store.queue);
}

export function applySimulationState(sim) {
  if (sim) {
    store.simulation.status = sim.status || store.simulation.status;
    store.simulation.speed = sim.speed || store.simulation.speed;
    store.simulation.simulatedTimeLabel = sim.simulatedTimeLabel || 'Daytime (Live Demo)';
    store.simulation.simulatedTime = sim.simulatedTime || null;
    if (sim.simulatedTime) {
      const dt = new Date(sim.simulatedTime);
      store.simulation.clockSeconds = dt.getHours() * 3600 + dt.getMinutes() * 60 + dt.getSeconds();
    }
    store.simulation.notifications = sim.notifications || store.simulation.notifications;
    notify('simulation:updated', store.simulation);
  }
}

export async function runScenario(scenarioId) {
  store.loading = true;
  notify('loading:changed', true);
  try {
    const res = await api.generateScenario(scenarioId);
    if (res.simulation) {
      applySimulationState(res.simulation);
    }
    await loadInitialData();
    return res;
  } catch (err) {
    store.loading = false;
    store.error = err.message || 'Failed to generate scenario';
    notify('data:error', store.error);
    throw err;
  }
}

export async function refreshSimulationSnapshot() {
  try {
    const [vehiclesRes, bookingsRes, queueRes, simRes] = await Promise.all([
      api.getVehicles(),
      api.getBookings(),
      api.getQueue(),
      api.getSimulationState()
    ]);

    store.vehicles = (vehiclesRes.vehicles || []).map(mapVehicle);
    store.bookings = (bookingsRes.bookings || []).map(mapBooking);
    store.queue = (queueRes.queue || []).map(mapQueueItem);
    store.simulation.status = simRes.status || store.simulation.status;
    store.simulation.speed = simRes.speed || store.simulation.speed;
    store.simulation.notifications = simRes.notifications || [];
    notify('data:loaded', store);
  } catch (err) {
    console.error('Snapshot refresh failed:', err);
  }
}

export async function setSimulationStatus(action) {
  let simRes;
  if (action === 'Running') {
    simRes = await api.startSimulation();
  } else if (action === 'Paused') {
    simRes = await api.pauseSimulation();
  } else if (action === 'Resume') {
    simRes = await api.resumeSimulation();
  }
  if (simRes) {
    store.simulation.status = simRes.status;
    store.simulation.speed = simRes.speed;
    store.simulation.notifications = simRes.notifications || [];
    notify('simulation:updated', store.simulation);
  }
}

export async function setSimulationSpeed(speed) {
  const simRes = await api.setSimulationSpeed(Number(speed) || 1);
  store.simulation.speed = simRes.speed;
  notify('simulation:updated', store.simulation);
}

export function tickSimulationClock() {
  if (store.simulation.status !== 'Running') return;
  store.simulation.clockSeconds = (store.simulation.clockSeconds + store.simulation.speed) % 86400;
  notify('clock:tick', store.simulation);
}

export async function resetState() {
  store.vehicleFilter = 'all';
  const simRes = await api.resetSimulation();
  store.simulation = {
    status: simRes.status || 'Idle',
    speed: simRes.speed || 1,
    clockSeconds: 16 * 3600 + 35 * 60,
    notifications: simRes.notifications || []
  };
  await loadInitialData();
  notify('state:reset', store);
}
