import {
  getState,
  subscribe,
  setVehicleFilter,
  changeVehicleStatus,
  cancelBooking,
  startTrip,
  setSimulationStatus,
  setSimulationSpeed,
  tickSimulationClock,
  runScenario,
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
  if (periodEl) {
    periodEl.textContent = simulation.simulatedTimeLabel
      ? `Sim: ${simulation.simulatedTimeLabel}`
      : isNight
      ? 'Night Hours'
      : 'Daytime';
  }
}

function updateBanner() {
  const banner = document.getElementById('api-status-banner');
  if (!banner) return;
  const { loading, error } = getState();

  if (error) {
    banner.textContent = `Backend Error: ${error}`;
    banner.className = 'api-banner error';
  } else if (loading) {
    banner.textContent = 'Loading simulation data...';
    banner.className = 'api-banner loading';
  } else {
    banner.className = 'api-banner hidden';
    banner.textContent = '';
  }
}

function renderStats() {
  const { vehicles, bookings, queue } = getState();
  const availableCount = vehicles.filter((v) => v.status === 'available').length;
  const activeCount = vehicles.filter((v) => v.status === 'assigned' || v.status === 'on_trip' || v.status === 'to_pickup').length;

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
  const { bookings, loading, error } = getState();

  if (loading && bookings.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="muted-text">Loading bookings...</td></tr>';
    return;
  }

  if (error && bookings.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="muted-text">Unable to load bookings.</td></tr>';
    return;
  }

  if (bookings.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="muted-text">No bookings yet. Submit a request to begin.</td></tr>';
    return;
  }

  const cancellable = new Set(['requested', 'queued', 'assigned']);

  tbody.innerHTML = bookings
    .map((b) => {
      const distKm = b.routeDistanceMeters != null ? ` · ${(b.routeDistanceMeters / 1000).toFixed(1)} km` : '';
      const etaLabel = `${b.estPickup}${distKm}`;
      const canStart = b.status === 'assigned' || b.status === 'to_pickup';
      const canCancel = cancellable.has(b.status);

      return `
      <tr class="clickable-row" data-booking-id="${b.id}" title="Click to focus pickup on map">
        <td><strong>${b.id}</strong></td>
        <td>${b.category}</td>
        <td>${b.vehicle}</td>
        <td><span class="status-pill ${b.status}">${b.status.replace('_', ' ')}</span></td>
        <td>
          <span>${etaLabel}</span>
          ${canStart ? `<button type="button" class="btn-xs" style="border-color:rgba(56,189,248,0.5);color:#7dd3fc;margin-left:4px;" data-start-id="${b.id}">Start</button>` : ''}
          ${canCancel ? `<button type="button" class="btn-xs btn-cancel" style="margin-left:4px;" data-cancel-id="${b.id}">Cancel</button>` : ''}
        </td>
      </tr>
    `;
    })
    .join('');

  tbody.querySelectorAll('tr[data-booking-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const booking = getState().bookings.find((b) => b.id === row.dataset.bookingId);
      if (!booking) return;
      const [lat, lng] = Array.isArray(booking.pickup) ? booking.pickup : [];
      focusPickupOnMap({ lat, lng, passengerId: booking.userId });
    });
  });

  tbody.querySelectorAll('button[data-start-id]').forEach((btn) => {
    btn.addEventListener('click', async (event) => {
      event.stopPropagation();
      btn.disabled = true;
      try {
        await startTrip(btn.dataset.startId);
      } catch (err) {
        alert(err.message || 'Could not start trip');
        btn.disabled = false;
      }
    });
  });

  tbody.querySelectorAll('button[data-cancel-id]').forEach((btn) => {
    btn.addEventListener('click', async (event) => {
      event.stopPropagation();
      btn.disabled = true;
      try {
        await cancelBooking(btn.dataset.cancelId);
      } catch (err) {
        alert(err.message || 'Could not cancel booking');
        btn.disabled = false;
      }
    });
  });
}

function renderWaitingQueue() {
  const tbody = document.getElementById('waiting-queue-body');
  if (!tbody) return;
  const { queue, loading } = getState();

  if (loading && queue.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted-text">Loading queue...</td></tr>';
    return;
  }

  if (queue.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted-text">Waiting queue is empty.</td></tr>';
    return;
  }

  tbody.innerHTML = queue
    .map(
      (item, index) => `
      <tr class="clickable-row" data-queue-id="${item.id}" title="${item.priorityReason || 'Click to focus pickup on map'}">
        <td>#${index + 1}</td>
        <td><strong>${item.id}</strong></td>
        <td><span class="priority-pill" title="${item.priorityReason}">${item.priorityScore}</span></td>
        <td>${item.waitMinutes} min${item.priorityReason ? ` · <span class="muted-text">${item.priorityReason}</span>` : ''}</td>
      </tr>
    `
    )
    .join('');

  tbody.querySelectorAll('tr[data-queue-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const item = getState().queue.find((q) => q.id === row.dataset.queueId);
      if (!item) return;
      const [lat, lng] = Array.isArray(item.pickup) ? item.pickup : [];
      focusPickupOnMap({ lat, lng, passengerId: item.userId });
    });
  });
}

function renderFleetList() {
  const tbody = document.getElementById('fleet-list-body');
  if (!tbody) return;
  const { vehicles, loading } = getState();

  if (loading && vehicles.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted-text">Loading fleet...</td></tr>';
    return;
  }

  if (vehicles.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted-text">No vehicles found.</td></tr>';
    return;
  }

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
            <option value="to_pickup" ${v.status === 'to_pickup' ? 'selected' : ''}>To Pickup</option>
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
    select.addEventListener('change', async (event) => {
      const vehicleId = select.dataset.statusFor;
      const newStatus = event.target.value;
      select.disabled = true;
      try {
        await changeVehicleStatus(vehicleId, newStatus);
      } catch (err) {
        alert(err.message || 'Failed to update vehicle status');
        renderFleetList();
      }
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

  const notifList = document.getElementById('notification-list');
  const notifCountLabel = document.getElementById('notif-count-label');
  const alerts = simulation.notifications || [];
  if (notifCountLabel) {
    notifCountLabel.textContent = alerts.length > 0 ? `${alerts.length} alerts` : 'Live feed';
  }
  if (notifList) {
    notifList.innerHTML =
      alerts.length === 0
        ? '<li class="muted-text">No dispatch alerts yet.</li>'
        : alerts
            .slice(0, 6)
            .map(
              (n) =>
                `<li><span class="notif-tag ${n.type === 'pickup_arrived' ? 'senior' : 'fleet'}">${
                  n.type === 'pickup_arrived' ? 'Pickup' : n.type === 'trip_completed' ? 'Done' : 'Sim'
                }</span> ${n.message}</li>`
            )
            .join('');
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

  subscribe((state, changeType) => {
    if (changeType === 'loading:changed' || changeType === 'data:loaded' || changeType === 'data:error') {
      updateBanner();
      renderStats();
      renderBookingActivity();
      renderWaitingQueue();
      renderFleetList();
    } else if (changeType === 'vehicle:updated') {
      renderStats();
      renderFleetList();
    } else if (changeType === 'booking:added' || changeType === 'booking:updated' || changeType === 'queue:updated') {
      renderStats();
      renderBookingActivity();
      renderWaitingQueue();
    } else if (changeType === 'filter:changed') {
      syncFilterChips(state.vehicleFilter);
    } else if (changeType === 'simulation:updated') {
      updateSimulationStatusUI(state.simulation);
      updateClockUI(state.simulation);
    } else if (changeType === 'clock:tick') {
      updateClockUI(state.simulation);
    } else if (changeType === 'state:reset') {
      updateBanner();
      renderStats();
      renderBookingActivity();
      renderWaitingQueue();
      renderFleetList();
      updateClockUI(state.simulation);
      updateSimulationStatusUI(state.simulation);
      syncFilterChips(state.vehicleFilter);
    }
  });

  document.querySelectorAll('#vehicle-filter-bar .filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      setVehicleFilter(chip.dataset.filter || 'all');
    });
  });

  const handleSimAction = async (fn) => {
    try {
      await fn();
    } catch (err) {
      const banner = document.getElementById('api-status-banner');
      if (banner) {
        banner.textContent = `Simulation Error: ${err.message || 'Backend unavailable'}`;
        banner.className = 'api-banner error';
      }
    }
  };

  document.getElementById('sim-start-btn')?.addEventListener('click', () => handleSimAction(() => setSimulationStatus('Running')));
  document.getElementById('sim-pause-btn')?.addEventListener('click', () => handleSimAction(() => setSimulationStatus('Paused')));
  document.getElementById('sim-resume-btn')?.addEventListener('click', () => handleSimAction(() => setSimulationStatus('Resume')));
  document.getElementById('sim-reset-btn')?.addEventListener('click', () => handleSimAction(() => resetState()));
  document.getElementById('sim-speed-select')?.addEventListener('change', (event) => {
    handleSimAction(() => setSimulationSpeed(event.target.value));
  });

  const scenarioSelect = document.getElementById('scenario-select');
  const scenarioBtn = document.getElementById('scenario-generate-btn');
  const scenarioFeedback = document.getElementById('scenario-feedback');

  scenarioBtn?.addEventListener('click', async () => {
    const scenarioId = scenarioSelect?.value || 'normal_daytime';
    scenarioBtn.disabled = true;
    if (scenarioFeedback) scenarioFeedback.textContent = 'Generating scenario...';
    try {
      const res = await runScenario(scenarioId);
      const allocCount = res.allocation?.allocated?.length ?? 0;
      const queueCount = res.allocation?.queued?.length ?? 0;
      if (scenarioFeedback) {
        scenarioFeedback.textContent = `Loaded (${res.simulatedTimeLabel}): ${allocCount} allocated, ${queueCount} queued.`;
      }
    } catch (err) {
      if (scenarioFeedback) scenarioFeedback.textContent = err.message || 'Scenario generation failed.';
    } finally {
      scenarioBtn.disabled = false;
    }
  });
}
