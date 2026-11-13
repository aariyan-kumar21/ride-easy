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
import { focusVehicleOnMap, focusPickupOnMap, getPassengerColor, getShortPassengerId } from './map.js';

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
      ? `${simulation.simulatedTimeLabel}`
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
    banner.textContent = `Backend Notice: ${error}`;
    banner.className = 'api-banner error';
  } else if (loading) {
    banner.textContent = 'Loading simulation data...';
    banner.className = 'api-banner loading';
  } else {
    banner.className = 'api-banner hidden';
    banner.textContent = '';
  }
}

/**
 * Render 4 Compact Stat Cards in Right Column Card A
 */
function renderStats() {
  const { vehicles, bookings, queue } = getState();
  const availableCount = vehicles.filter((v) => v.status === 'available').length;
  const assignedCount = vehicles.filter((v) => v.status === 'assigned' || v.status === 'to_pickup' || v.status === 'on_trip').length;
  const activeRequestsCount = bookings.filter((b) => b.status !== 'completed' && b.status !== 'cancelled').length;

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  };

  setText('stat-active-requests', activeRequestsCount);
  setText('stat-total-cabs', vehicles.length);
  setText('stat-assigned-cabs', assignedCount);
  setText('stat-available-cabs', availableCount);
  setText('requests-count-badge', bookings.length);
}

/**
 * Render Left Column Card B: Active Booking Requests
 */
function renderActiveBookingRequests() {
  const container = document.getElementById('active-booking-requests-list');
  if (!container) return;
  const { bookings, loading, error } = getState();

  if (loading && bookings.length === 0) {
    container.innerHTML = '<div class="muted-text" style="padding:1rem;text-align:center;">Loading requests...</div>';
    return;
  }

  if (error && bookings.length === 0) {
    container.innerHTML = '<div class="muted-text" style="padding:1rem;text-align:center;">Unable to load requests.</div>';
    return;
  }

  if (bookings.length === 0) {
    container.innerHTML = '<div class="muted-text" style="padding:1rem;text-align:center;">No active booking requests yet.</div>';
    return;
  }

  const cancellable = new Set(['requested', 'queued', 'assigned']);

  container.innerHTML = bookings
    .map((b) => {
      const pColor = getPassengerColor(b.userId);
      const shortId = getShortPassengerId(b.userId);
      const pickupText = b.pickupLabel || (b.pickup ? 'Pickup' : 'Origin');
      const destText = b.destinationLabel || (b.destination ? 'Drop' : 'Destination');
      const canStart = b.status === 'assigned' || b.status === 'to_pickup';
      const canCancel = cancellable.has(b.status);

      return `
        <div class="booking-request-item" data-booking-id="${b.id}" title="Click to focus on map">
          <div class="req-left-info">
            <div class="user-avatar-circle" style="background-color: ${pColor};">
              ${shortId}
            </div>
            <div class="req-locations">
              <div class="req-title-row">
                <span class="req-user-id">${b.id}</span>
                <span class="req-pax-count">(${b.passengerCount}p &middot; ${b.category})</span>
              </div>
              <span class="req-path-text">${pickupText} &rarr; ${destText}</span>
            </div>
          </div>
          <div class="req-right-actions">
            <span class="status-pill-badge ${b.status}">${b.status.replace('_', ' ')}</span>
            ${canStart ? `<button type="button" class="action-menu-btn" data-start-id="${b.id}" title="Start Trip" style="color:var(--primary-purple);"><i data-lucide="play"></i></button>` : ''}
            ${canCancel ? `<button type="button" class="action-menu-btn" data-cancel-id="${b.id}" title="Cancel Booking" style="color:var(--pink);"><i data-lucide="x"></i></button>` : ''}
          </div>
        </div>
      `;
    })
    .join('');

  if (typeof lucide !== 'undefined') {
    lucide.createIcons({ root: container });
  }

  // Row click to focus on map
  container.querySelectorAll('.booking-request-item').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const booking = getState().bookings.find((b) => b.id === row.dataset.bookingId);
      if (!booking) return;
      const [lat, lng] = Array.isArray(booking.pickup) ? booking.pickup : [];
      focusPickupOnMap({ lat, lng, passengerId: booking.userId });
    });
  });

  // Start trip action
  container.querySelectorAll('button[data-start-id]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      btn.disabled = true;
      try {
        await startTrip(btn.dataset.startId);
      } catch (err) {
        alert(err.message || 'Could not start trip');
        btn.disabled = false;
      }
    });
  });

  // Cancel booking action
  container.querySelectorAll('button[data-cancel-id]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
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

/**
 * Render Right Column Card B: Active Rides (Live)
 */
function renderActiveRidesLive() {
  const container = document.getElementById('active-rides-live-list');
  const countBadge = document.getElementById('live-rides-count-badge');
  if (!container) return;
  const { bookings } = getState();

  // Active rides are assigned, to_pickup, on_trip, or queued
  const activeRides = bookings.filter((b) => ['assigned', 'to_pickup', 'on_trip', 'queued'].includes(b.status));

  if (countBadge) {
    countBadge.textContent = String(activeRides.length);
  }

  if (activeRides.length === 0) {
    container.innerHTML = '<div class="muted-text" style="padding:1rem;text-align:center;font-size:12px;">No active rides currently on road.</div>';
    return;
  }

  container.innerHTML = activeRides
    .map((b) => {
      const pColor = getPassengerColor(b.userId);
      const shortId = getShortPassengerId(b.userId);
      const isAssigned = b.vehicle && b.vehicle !== 'Pending';
      const vehText = isAssigned ? b.vehicle : 'Matching...';
      const etaText = b.estimatedPickupMinutes != null ? `${b.estimatedPickupMinutes} min ETA` : (isAssigned ? 'En route' : 'In Queue');

      // Progress percentage
      let progressPercent = 30;
      let isMatching = false;
      if (b.status === 'on_trip') progressPercent = 75;
      else if (b.status === 'to_pickup' || b.status === 'assigned') progressPercent = 40;
      else {
        progressPercent = 100;
        isMatching = true;
      }

      return `
        <div class="live-ride-item" data-booking-id="${b.id}" title="Click to view ride on map">
          <div class="ride-header-row">
            <div class="ride-user-meta">
              <div class="user-avatar-circle" style="background-color: ${pColor}; width:28px; height:28px; font-size:11px;">
                ${shortId}
              </div>
              <span class="ride-id-text">${b.id}</span>
              <span class="ride-veh-badge">${vehText}</span>
            </div>
            <span class="ride-eta-badge">${etaText}</span>
          </div>

          <div class="ride-progress-bar-wrap">
            <div class="ride-progress-fill ${isMatching ? 'matching' : ''}" style="width: ${progressPercent}%;"></div>
          </div>

          <div class="ride-footer-row">
            <span>${b.status.replace('_', ' ')}</span>
            <span class="ride-focus-arrow"><i data-lucide="arrow-right"></i></span>
          </div>
        </div>
      `;
    })
    .join('');

  if (typeof lucide !== 'undefined') {
    lucide.createIcons({ root: container });
  }

  container.querySelectorAll('.live-ride-item').forEach((row) => {
    row.addEventListener('click', () => {
      const booking = getState().bookings.find((b) => b.id === row.dataset.bookingId);
      if (!booking) return;
      if (booking.vehicle && booking.vehicle !== 'Pending') {
        focusVehicleOnMap(booking.vehicle);
      } else {
        const [lat, lng] = Array.isArray(booking.pickup) ? booking.pickup : [];
        focusPickupOnMap({ lat, lng, passengerId: booking.userId });
      }
    });
  });
}

/**
 * Render Drawer Table: Waiting Queue
 */
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
        <td><span class="badge-count purple">${item.priorityScore}</span></td>
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
      closeDrawer();
    });
  });
}

/**
 * Render Drawer Table: Fleet Overview
 */
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
        <td>${v.capacity} pax</td>
        <td>
          <select class="status-select-clean" data-status-for="${v.id}" aria-label="Status for ${v.id}">
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
      closeDrawer();
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
  const playIcon = document.getElementById('sim-play-icon');

  const isRunning = simulation.status === 'Running';

  if (pill) {
    pill.className = `status-chip ${simulation.status.toLowerCase()}`;
  }
  if (text) text.textContent = simulation.status;
  if (mapLabel) mapLabel.textContent = `Simulation: ${simulation.status} (${simulation.speed}x)`;

  // Update speed selector pills
  document.querySelectorAll('.speed-pill-btn').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.speed) === Number(simulation.speed));
  });

  // Update play icon
  if (playIcon) {
    playIcon.setAttribute('data-lucide', isRunning ? 'pause' : 'play');
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }
}

function startClockLoop() {
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = setInterval(tickSimulationClock, 1000);
}

function closeDrawer() {
  document.getElementById('side-drawer')?.classList.add('hidden');
  document.getElementById('modal-backdrop')?.classList.add('hidden');
}

function openDrawer(sectionTitle) {
  const drawer = document.getElementById('side-drawer');
  const backdrop = document.getElementById('modal-backdrop');
  const title = document.getElementById('drawer-title');
  if (title) title.textContent = sectionTitle;
  drawer?.classList.remove('hidden');
  backdrop?.classList.remove('hidden');
}

export function initDashboard() {
  const initialState = getState();
  renderStats();
  renderActiveBookingRequests();
  renderActiveRidesLive();
  renderWaitingQueue();
  renderFleetList();
  updateClockUI(initialState.simulation);
  updateSimulationStatusUI(initialState.simulation);
  startClockLoop();

  subscribe((state, changeType) => {
    if (changeType === 'loading:changed' || changeType === 'data:loaded' || changeType === 'data:error') {
      updateBanner();
      renderStats();
      renderActiveBookingRequests();
      renderActiveRidesLive();
      renderWaitingQueue();
      renderFleetList();
    } else if (changeType === 'vehicle:updated' || changeType === 'cab:location') {
      renderStats();
      renderActiveRidesLive();
      renderFleetList();
    } else if (changeType === 'booking:added' || changeType === 'booking:updated' || changeType === 'queue:updated') {
      renderStats();
      renderActiveBookingRequests();
      renderActiveRidesLive();
      renderWaitingQueue();
    } else if (changeType === 'simulation:updated') {
      updateSimulationStatusUI(state.simulation);
      updateClockUI(state.simulation);
    } else if (changeType === 'clock:tick') {
      updateClockUI(state.simulation);
    } else if (changeType === 'state:reset') {
      updateBanner();
      renderStats();
      renderActiveBookingRequests();
      renderActiveRidesLive();
      renderWaitingQueue();
      renderFleetList();
      updateClockUI(state.simulation);
      updateSimulationStatusUI(state.simulation);
    }
  });

  // Drawer events
  document.getElementById('drawer-close-btn')?.addEventListener('click', closeDrawer);
  document.getElementById('modal-backdrop')?.addEventListener('click', closeDrawer);

  // Top Nav Tabs
  document.querySelectorAll('.nav-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      document.querySelectorAll('.nav-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      if (tabName === 'fleet') {
        openDrawer('Fleet Management');
      } else if (tabName === 'analytics') {
        openDrawer('Analytics & Queue');
      } else if (tabName === 'settings') {
        const ctrlCard = document.getElementById('controls-card');
        ctrlCard?.scrollIntoView({ behavior: 'smooth' });
      }
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

  // Play/Pause toggle
  document.getElementById('sim-toggle-play-btn')?.addEventListener('click', () => {
    const isRunning = getState().simulation.status === 'Running';
    handleSimAction(() => setSimulationStatus(isRunning ? 'Paused' : 'Running'));
  });

  // Reset button
  document.getElementById('sim-reset-btn')?.addEventListener('click', () => {
    handleSimAction(() => resetState());
  });

  // Speed selection pills (1x, 2x, 4x)
  document.querySelectorAll('.speed-pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const speed = Number(btn.dataset.speed) || 1;
      handleSimAction(() => setSimulationSpeed(speed));
    });
  });

  // Scenario generator
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
