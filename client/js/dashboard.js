import {
  getState,
  subscribe,
  setVehicleFilter,
  updateVehicleStatus,
  setSimulationStatus,
  setSimulationSpeed,
  tickSimulationClock,
  resetState
} from './state.js';
import { focusVehicleOnMap, focusPickupOnMap } from './map.js';

let clockTimer = null;

function formatClock(totalSeconds) {
  const hrs = Math.floor(totalSeconds / 3600) % 24;
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return [hrs, mins, secs].map((v) => String(v).padStart(2, '0')).join(':');
}

function updateClockUI(simulation) {
  const timeEl = document.getElementById('sim-time-display');
  const periodEl = document.getElementById('sim-period-badge');
  const hour = Math.floor(simulation.clockSeconds / 3600) % 24;
  const isNight = hour >= 22 || hour < 6;

  if (timeEl) timeEl.textContent = formatClock(simulation.clockSeconds);
  if (periodEl) periodEl.textContent = isNight ? 'Night Hours' : 'Daytime';
}

function renderStats() {
  const { vehicles, bookings, queue } = getState();
  const availableCount = vehicles.filter((v) => v.status === 'available').length;
  const activeCount = vehicles.filter((v) => v.status === 'assigned' || v.status === 'on_trip').length;

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  };

  setText('stat-total-bookings', bookings.length);
  setText('stat-available-vehicles', availableCount);
  setText('stat-active-trips', activeCount);
  setText('stat-waiting-requests', queue.length);
  setText('nav-bookings-count', bookings.length);
  setText('nav-queue-count', queue.length);
}

function renderBookingActivity() {
  const tbody = document.getElementById('booking-activity-body');
  if (!tbody) return;
  const { bookings } = getState();

  tbody.innerHTML = bookings
    .map(
      (b) => `
      <tr class="clickable-row" data-booking-id="${b.id}" title="Click to focus pickup on map">
        <td><strong>${b.id}</strong></td>
        <td>${b.category}</td>
        <td>${b.vehicle}</td>
        <td><span class="status-pill ${b.status}">${b.status.replace('_', ' ')}</span></td>
        <td>${b.estPickup}</td>
      </tr>
    `
    )
    .join('');

  tbody.querySelectorAll('tr[data-booking-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const booking = getState().bookings.find((b) => b.id === row.dataset.bookingId);
      if (!booking) return;
      const [lat, lng] = Array.isArray(booking.pickup) ? booking.pickup : [];
      focusPickupOnMap({ lat, lng, passengerId: booking.passengerId });
    });
  });
}

function renderWaitingQueue() {
  const tbody = document.getElementById('waiting-queue-body');
  if (!tbody) return;
  const { queue } = getState();

  tbody.innerHTML = queue
    .map(
      (item, index) => `
      <tr class="clickable-row" data-queue-id="${item.id}" title="Click to focus pickup on map">
        <td>#${index + 1}</td>
        <td><strong>${item.id}</strong></td>
        <td><span class="priority-pill">${item.priorityScore}</span></td>
        <td>${item.waitMinutes} min</td>
      </tr>
    `
    )
    .join('');

  tbody.querySelectorAll('tr[data-queue-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const item = getState().queue.find((q) => q.id === row.dataset.queueId);
      if (!item) return;
      const [lat, lng] = Array.isArray(item.pickup) ? item.pickup : [];
      focusPickupOnMap({ lat, lng, passengerId: item.passengerId });
    });
  });
}

function renderFleetList() {
  const tbody = document.getElementById('fleet-list-body');
  if (!tbody) return;
  const { vehicles } = getState();

  tbody.innerHTML = vehicles
    .map(
      (v) => `
      <tr class="clickable-row" data-vehicle-id="${v.id}" title="Click to focus ${v.id} on map">
        <td><strong>${v.id}</strong></td>
        <td>${v.vehicleType}</td>
        <td>${v.capacity}</td>
        <td>
          <select class="status-select" data-status-for="${v.id}" aria-label="Status for ${v.id}">
            <option value="available" ${v.status === 'available' ? 'selected' : ''}>Available</option>
            <option value="assigned" ${v.status === 'assigned' ? 'selected' : ''}>Assigned</option>
            <option value="on_trip" ${v.status === 'on_trip' ? 'selected' : ''}>On Trip</option>
            <option value="offline" ${v.status === 'offline' ? 'selected' : ''}>Offline</option>
          </select>
        </td>
      </tr>
    `
    )
    .join('');

  tbody.querySelectorAll('tr[data-vehicle-id]').forEach((row) => {
    row.addEventListener('click', () => {
      focusVehicleOnMap(row.dataset.vehicleId);
    });
  });

  tbody.querySelectorAll('select[data-status-for]').forEach((select) => {
    select.addEventListener('click', (event) => event.stopPropagation());
    select.addEventListener('change', (event) => {
      updateVehicleStatus(select.dataset.statusFor, event.target.value);
    });
  });
}

function updateSimulationStatusUI(simulation) {
  const pill = document.getElementById('sim-status-pill');
  const text = document.getElementById('sim-status-text');
  const mapLabel = document.getElementById('map-sim-label');
  const speedBadge = document.getElementById('sim-speed-badge');
  const speedSelect = document.getElementById('sim-speed-select');

  if (pill) pill.className = `sim-status-pill status-${simulation.status.toLowerCase()}`;
  if (text) text.textContent = simulation.status;
  if (mapLabel) mapLabel.textContent = `Simulation: ${simulation.status} (${simulation.speed}x)`;
  if (speedBadge) speedBadge.textContent = `${simulation.speed}x Speed`;
  if (speedSelect && Number(speedSelect.value) !== simulation.speed) {
    speedSelect.value = String(simulation.speed);
  }
}

function syncFilterChips(activeFilter) {
  document.querySelectorAll('#vehicle-filter-bar .filter-chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.filter === activeFilter);
  });
}

function startClockLoop() {
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = setInterval(tickSimulationClock, 1000);
}

export function initDashboard() {
  const initialState = getState();
  renderStats();
  renderBookingActivity();
  renderWaitingQueue();
  renderFleetList();
  updateClockUI(initialState.simulation);
  updateSimulationStatusUI(initialState.simulation);
  syncFilterChips(initialState.vehicleFilter);
  startClockLoop();

  // Granular UI updates driven by the single state store
  subscribe((state, changeType) => {
    if (changeType === 'vehicle:updated') {
      renderStats();
      renderFleetList();
    } else if (changeType === 'booking:added') {
      renderStats();
      renderBookingActivity();
      renderWaitingQueue();
    } else if (changeType === 'filter:changed') {
      syncFilterChips(state.vehicleFilter);
    } else if (changeType === 'simulation:updated') {
      updateSimulationStatusUI(state.simulation);
    } else if (changeType === 'clock:tick') {
      updateClockUI(state.simulation);
    } else if (changeType === 'state:reset') {
      renderStats();
      renderBookingActivity();
      renderWaitingQueue();
      renderFleetList();
      updateClockUI(state.simulation);
      updateSimulationStatusUI(state.simulation);
      syncFilterChips(state.vehicleFilter);
    }
  });

  // Wire vehicle filter bar
  document.querySelectorAll('#vehicle-filter-bar .filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      setVehicleFilter(chip.dataset.filter || 'all');
    });
  });

  // Wire simulation controls
  document.getElementById('sim-start-btn')?.addEventListener('click', () => setSimulationStatus('Running'));
  document.getElementById('sim-pause-btn')?.addEventListener('click', () => setSimulationStatus('Paused'));
  document.getElementById('sim-resume-btn')?.addEventListener('click', () => setSimulationStatus('Running'));
  document.getElementById('sim-reset-btn')?.addEventListener('click', resetState);
  document.getElementById('sim-speed-select')?.addEventListener('change', (event) => {
    setSimulationSpeed(event.target.value);
  });
}
