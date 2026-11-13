import { api } from './api.js';
import { SEED_PASSENGERS } from './seedData.js';
import { notifyBookingPickup, notifyBookingCompleted, resetToastTracking } from './toast.js';

const listeners = new Set();

const INDIAN_NAME_POOLS = {
  regular: ['Aarav Sharma', 'Arjun Verma', 'Rohan Mehta', 'Aditya Kumar', 'Rahul Singh', 'Karan Malhotra', 'Vihaan Gupta'],
  woman: ['Ananya Sharma', 'Priya Mehta', 'Aditi Verma', 'Kavya Singh', 'Isha Kapoor', 'Riya Malhotra', 'Meera Nair'],
  senior: ['Rajesh Khanna', 'Suresh Menon', 'Meenakshi Iyer', 'Sunita Sharma', 'Prakash Rao', 'Kamala Devi', 'Shanti Verma']
};

export function getRandomIndianName(category) {
  const norm = String(category || 'regular').toLowerCase();
  const pool = INDIAN_NAME_POOLS[norm] || INDIAN_NAME_POOLS.regular;
  return pool[Math.floor(Math.random() * pool.length)];
}

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
  const normCat = String(b.category || 'regular').toLowerCase();
  const rawPickupLabel = b.pickup?.label || (typeof b.pickup === 'string' ? b.pickup : '');
  const rawDestLabel = b.destination?.label || (typeof b.destination === 'string' ? b.destination : '');
  const isNight = Boolean(store?.simulation?.isNightHours);

  const fallbackTier = isNight
    ? (normCat === 'woman' ? 1 : (normCat === 'senior' ? 2 : 3))
    : (normCat === 'senior' ? 1 : (normCat === 'woman' ? 2 : 3));

  const tier = b.priorityTier ?? b.priorityBreakdown?.tier ?? fallbackTier;
  const tierLabel =
    b.priorityTierLabel ??
    b.priorityBreakdown?.tierLabel ??
    (isNight
      ? (tier === 1
          ? 'Woman — Highest Priority'
          : tier === 2
          ? 'Senior Citizen — Second Priority'
          : 'Regular — Third Priority')
      : (tier === 1
          ? 'Senior Citizen — Highest Priority'
          : tier === 2
          ? 'Woman — Second Priority'
          : 'Regular — Third Priority'));

  return {
    id: b.bookingId || b.id,
    userId: b.userId,
    passengerName: b.passengerName || b.name || getRandomIndianName(normCat),
    category: CATEGORY_LABELS[normCat] || b.category || 'Regular',
    rawCategory: normCat,
    vehicle: b.vehicleId || 'Pending',
    status: b.status,
    priorityTier: tier,
    priorityTierLabel: tierLabel,
    queuePosition: b.queuePosition != null ? Number(b.queuePosition) : null,
    sequenceNumber: b.sequenceNumber ?? null,
    waitingDurationSeconds: b.waitingDurationSeconds ?? 0,
    waitingMinutes: b.waitingMinutes ?? Math.floor((b.waitingDurationSeconds || 0) / 60),
    estPickup:
      b.estimatedPickupMinutes !== null && b.estimatedPickupMinutes !== undefined
        ? `${b.estimatedPickupMinutes} min`
        : b.status === 'completed'
        ? 'Done'
        : '—',
    pickup: b.pickup ? [b.pickup.lat ?? b.pickup[0], b.pickup.lng ?? b.pickup[1]] : null,
    pickupLabel: rawPickupLabel || 'Pickup Location',
    destination: b.destination ? [b.destination.lat ?? b.destination[0], b.destination.lng ?? b.destination[1]] : null,
    destinationLabel: rawDestLabel || 'Destination',
    passengerCount: b.passengerCount || 1,
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
  const normCat = String(q.category || 'regular').toLowerCase();
  const isNight = Boolean(store?.simulation?.isNightHours);
  const fallbackTier = isNight
    ? (normCat === 'woman' ? 1 : (normCat === 'senior' ? 2 : 3))
    : (normCat === 'senior' ? 1 : (normCat === 'woman' ? 2 : 3));

  const tier = q.priorityTier ?? q.priorityBreakdown?.tier ?? fallbackTier;
  const tierLabel =
    q.priorityTierLabel ??
    q.priorityBreakdown?.tierLabel ??
    (isNight
      ? (tier === 1
          ? 'Woman — Highest Priority'
          : tier === 2
          ? 'Senior Citizen — Second Priority'
          : 'Regular — Third Priority')
      : (tier === 1
          ? 'Senior Citizen — Highest Priority'
          : tier === 2
          ? 'Woman — Second Priority'
          : 'Regular — Third Priority'));

  return {
    id: q.bookingId || q.id,
    userId: q.userId,
    passengerName: q.passengerName || getRandomIndianName(normCat),
    priorityScore: q.priorityScore ?? 0,
    priorityTier: tier,
    priorityTierLabel: tierLabel,
    queuePosition: q.queuePosition != null ? Number(q.queuePosition) : (q.position != null ? Number(q.position) : null),
    sequenceNumber: q.sequenceNumber ?? null,
    waitingDurationSeconds: q.waitingDurationSeconds ?? 0,
    waitMinutes: q.waitMinutes ?? Math.floor((q.waitingDurationSeconds || 0) / 60),
    category: CATEGORY_LABELS[normCat] || q.category || 'Regular',
    rawCategory: normCat,
    priorityReason: q.priorityBreakdown?.reason || '',
    pickup: q.pickup ? [q.pickup.lat ?? q.pickup[0], q.pickup.lng ?? q.pickup[1]] : null,
    pickupLabel: q.pickup?.label || (typeof q.pickup === 'string' ? q.pickup : 'Pickup Point'),
    destinationLabel: q.destination?.label || (typeof q.destination === 'string' ? q.destination : 'Destination'),
    vehicleType: q.vehicleType || 'cab',
    passengerCount: q.passengerCount || 1
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
    clockSeconds: 14 * 3600,
    timeFormatted: '14:00:00',
    simulatedTime: null,
    simulatedTimeLabel: 'Normal Daytime',
    timeCategory: { id: 'normal_daytime', label: 'Normal Daytime', isNight: false, hoursRange: '11:00–15:59' },
    isNightHours: false,
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

function deduplicateBookings(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  for (const b of list) {
    if (!b || !b.id) continue;
    if (!seen.has(b.id)) {
      seen.add(b.id);
      result.push(b);
    }
  }
  return result;
}

function deduplicateQueue(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  for (const q of list) {
    if (!q || !q.id) continue;
    if (!seen.has(q.id)) {
      seen.add(q.id);
      result.push(q);
    }
  }
  return result;
}

function upsertBookingInList(list, newBooking) {
  if (!newBooking || !newBooking.id) return list;
  const index = list.findIndex((b) => b.id === newBooking.id);
  if (index !== -1) {
    const existing = list[index];
    const merged = { ...existing, ...newBooking };
    const updated = [...list];
    updated[index] = merged;
    return updated.filter((b, idx) => idx === index || b.id !== newBooking.id);
  }
  return [newBooking, ...list.filter((b) => b.id !== newBooking.id)];
}

export async function loadInitialData() {
  store.loading = true;
  store.error = null;
  notify('loading:changed', true);

  try {
    const [healthRes, vehiclesRes, bookingsRes, queueRes, statsRes] = await Promise.all([
      api.getHealth().catch(() => ({ status: 'unknown' })),
      api.getVehicles(),
      api.getBookings(),
      api.getQueue(),
      api.getAdminStats()
    ]);

    store.vehicles = (vehiclesRes.vehicles || []).map(mapVehicle);
    store.bookings = deduplicateBookings((bookingsRes.bookings || []).map(mapBooking));
    store.queue = deduplicateQueue((queueRes.queue || []).map(mapQueueItem));
    store.stats = statsRes;
    store.loading = false;
    if (healthRes.status !== 'ok') {
      store.error = 'Backend server is not responding correctly.';
    } else {
      store.error = null;
    }
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
  applyBookingUpsert(res.booking, true);
  return created;
}

export async function cancelBooking(bookingId) {
  const res = await api.cancelBooking(bookingId);
  const updated = mapBooking(res.booking);
  store.bookings = upsertBookingInList(store.bookings, updated);
  store.queue = store.queue.filter((q) => q.id !== updated.id);
  notify('booking:updated', updated);
  return updated;
}

export async function startTrip(bookingId) {
  const res = await api.startTrip(bookingId);
  const updated = mapBooking(res.booking);
  store.bookings = upsertBookingInList(store.bookings, updated);
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
    store.bookings = deduplicateBookings(payload.bookings.map(mapBooking));
  }
  if (Array.isArray(payload.queue)) {
    store.queue = deduplicateQueue(payload.queue.map(mapQueueItem));
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
  store.bookings = upsertBookingInList(store.bookings, mapped);
  notify(exists ? 'booking:updated' : (isNew ? 'booking:added' : 'booking:updated'), mapped);

  // Lifecycle toast notifications
  if (mapped.status === 'on_trip' || mapped.status === 'arrived') {
    notifyBookingPickup(mapped);
  } else if (mapped.status === 'completed') {
    notifyBookingCompleted(mapped);
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
  store.queue = deduplicateQueue(queueList.map(mapQueueItem));

  // Sync queue positions and priority metadata into active store.bookings
  const queueMap = new Map(store.queue.map((q) => [q.id, q]));
  store.bookings = store.bookings.map((b) => {
    const qItem = queueMap.get(b.id);
    if (qItem) {
      return {
        ...b,
        status: ['assigned', 'to_pickup', 'on_trip', 'completed', 'cancelled'].includes(b.status)
          ? b.status
          : 'queued',
        queuePosition: qItem.queuePosition,
        priorityTier: qItem.priorityTier,
        priorityTierLabel: qItem.priorityTierLabel,
        waitingDurationSeconds: qItem.waitingDurationSeconds,
        waitingMinutes: qItem.waitMinutes,
        priorityScore: qItem.priorityScore
      };
    } else if (b.status === 'queued' || b.status === 'requested') {
      return { ...b, queuePosition: null };
    }
    return b;
  });

  // If there are queue items not yet in store.bookings, upsert them
  for (const qItem of store.queue) {
    if (!store.bookings.some((b) => b.id === qItem.id)) {
      store.bookings = upsertBookingInList(store.bookings, mapBooking({
        ...qItem,
        status: 'queued',
        bookingId: qItem.id
      }));
    }
  }

  store.bookings = deduplicateBookings(store.bookings);

  notify('queue:updated', store.queue);
  notify('booking:updated', null);
}

export function applySimulationState(sim) {
  if (sim) {
    store.simulation.status = sim.status || store.simulation.status;
    store.simulation.speed = sim.speed || store.simulation.speed;
    store.simulation.simulatedTimeLabel = sim.simulatedTimeLabel || 'Normal Daytime';
    store.simulation.simulatedTime = sim.simulatedTime || null;
    store.simulation.timeCategory = sim.timeCategory || store.simulation.timeCategory;
    store.simulation.isNightHours = Boolean(sim.isNightHours);
    if (typeof sim.clockSeconds === 'number') {
      store.simulation.clockSeconds = sim.clockSeconds;
    } else if (sim.simulatedTime) {
      const dt = new Date(sim.simulatedTime);
      store.simulation.clockSeconds = dt.getHours() * 3600 + dt.getMinutes() * 60 + dt.getSeconds();
    }
    const hours = Math.floor((store.simulation.clockSeconds || 0) / 3600);
    const minutes = Math.floor(((store.simulation.clockSeconds || 0) % 3600) / 60);
    const seconds = (store.simulation.clockSeconds || 0) % 60;
    store.simulation.timeFormatted = [hours, minutes, seconds].map((v) => String(v).padStart(2, '0')).join(':');
    store.simulation.notifications = sim.notifications || store.simulation.notifications;
    notify('simulation:updated', store.simulation);
  }
}

export async function setSimulationTime(payload) {
  store.loading = true;
  notify('loading:changed', true);
  try {
    const res = await api.setSimulationTime(payload);
    if (res.simulation) {
      applySimulationState(res.simulation);
    }
    await refreshSimulationSnapshot();
    return res;
  } catch (err) {
    store.loading = false;
    store.error = err.message || 'Failed to update simulation time';
    notify('data:error', store.error);
    throw err;
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
    store.bookings = deduplicateBookings((bookingsRes.bookings || []).map(mapBooking));
    store.queue = deduplicateQueue((queueRes.queue || []).map(mapQueueItem));
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
  const hours = Math.floor(store.simulation.clockSeconds / 3600);
  const minutes = Math.floor((store.simulation.clockSeconds % 3600) / 60);
  const seconds = store.simulation.clockSeconds % 60;
  store.simulation.timeFormatted = [hours, minutes, seconds].map((v) => String(v).padStart(2, '0')).join(':');
  notify('clock:tick', store.simulation);
}

export async function resetState() {
  store.vehicleFilter = 'all';
  resetToastTracking();
  const simRes = await api.resetSimulation();
  store.simulation = {
    status: simRes.status || 'Idle',
    speed: simRes.speed || 1,
    clockSeconds: 14 * 3600,
    timeFormatted: '14:00:00',
    simulatedTime: null,
    simulatedTimeLabel: 'Normal Daytime',
    timeCategory: { id: 'normal_daytime', label: 'Normal Daytime', isNight: false, hoursRange: '11:00–15:59' },
    isNightHours: false,
    notifications: simRes.notifications || []
  };
  await loadInitialData();
  notify('state:reset', store);
}

export async function completeSimulation() {
  const res = await api.completeSimulation();
  if (res.simulation) {
    applySimulationState(res.simulation);
  }
  await loadInitialData();
  notify('simulation:completed', res);
  return res;
}

export async function clearSimulation() {
  const res = await api.clearSimulation();
  resetToastTracking();
  store.simulation = {
    status: res.simulation?.status || 'Paused',
    speed: res.simulation?.speed || 1,
    clockSeconds: 14 * 3600,
    notifications: []
  };
  await loadInitialData();
  notify('simulation:cleared', res);
  return res;
}
