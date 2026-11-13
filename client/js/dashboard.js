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
  setSimulationTime,
  runScenario,
  resetState,
  completeSimulation,
  clearSimulation
} from './state.js';
import { focusVehicleOnMap, focusPickupOnMap, getPassengerColor, getShortPassengerId } from './map.js';

let clockTimer = null;

function formatClock(totalSeconds) {
  const hrs = Math.floor(totalSeconds / 3600) % 24;
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return [hrs, mins, secs].map((v) => String(v).padStart(2, '0')).join(':');
}

function getClientCategoryKey(hour, minute) {
  const totalMins = hour * 60 + minute;
  if (totalMins >= 5 * 60 && totalMins < 8 * 60) return 'early_morning';
  if (totalMins >= 8 * 60 && totalMins < 11 * 60) return 'morning_peak';
  if (totalMins >= 11 * 60 && totalMins < 16 * 60) return 'normal_daytime';
  if (totalMins >= 16 * 60 && totalMins < 19 * 60) return 'evening_peak';
  if (totalMins >= 19 * 60 && totalMins < 21 * 60) return 'evening';
  return 'night';
}

function getTimeCategoryDetails(categoryKey, hour, minute) {
  switch (categoryKey) {
    case 'early_morning':
      return {
        key: 'early_morning',
        shortTitle: 'Early Morning',
        titleWithRange: 'Early Morning (05:00–07:59)',
        description: 'Light traffic (0.8x delay). Senior Citizen (+40) receives highest priority.',
        styleClass: 'daytime',
        iconName: 'sunrise'
      };
    case 'morning_peak':
      return {
        key: 'morning_peak',
        shortTitle: 'Morning Peak',
        titleWithRange: 'Morning Peak (08:00–10:59)',
        description: 'Heavy traffic (1.4x delay). High commuter rush; Senior priority active.',
        styleClass: 'peak',
        iconName: 'zap'
      };
    case 'normal_daytime':
      return {
        key: 'normal_daytime',
        shortTitle: 'Normal Daytime',
        titleWithRange: 'Normal Daytime (11:00–15:59)',
        description: 'Moderate traffic (1.0x delay). Standard daytime FIFO within tiers; Seniors have Tier 1 priority.',
        styleClass: 'daytime',
        iconName: 'sun'
      };
    case 'evening_peak':
      return {
        key: 'evening_peak',
        shortTitle: 'Evening Peak',
        titleWithRange: 'Evening Peak (16:00–18:59)',
        description: 'Heavy traffic (1.5x delay). Peak congestion; Senior Citizens prioritized.',
        styleClass: 'peak',
        iconName: 'trending-up'
      };
    case 'evening':
      return {
        key: 'evening',
        shortTitle: 'Evening',
        titleWithRange: 'Evening (19:00–20:59)',
        description: 'Moderate traffic (1.1x delay). Daytime priority hierarchy in effect.',
        styleClass: 'daytime',
        iconName: 'sunset'
      };
    case 'night':
    default:
      return {
        key: 'night',
        shortTitle: 'Night Hours',
        titleWithRange: 'Night (21:00–04:59)',
        description: 'Light traffic (0.7x delay). Enhanced Safety: Women receive Tier 2 Night Priority (+30); Seniors Tier 1 (+40).',
        styleClass: 'night',
        iconName: 'moon'
      };
  }
}

function updateClockUI(simulation) {
  const timeEl = document.getElementById('sim-time-display');
  const periodEl = document.getElementById('sim-period-badge');
  const clockSec = simulation?.clockSeconds ?? 14 * 3600;
  const hour = Math.floor(clockSec / 3600) % 24;
  const minute = Math.floor((clockSec % 3600) / 60);

  if (timeEl) timeEl.textContent = formatClock(clockSec);

  // Determine time category & condition
  const categoryKey = simulation?.simulatedTimeCategory || getClientCategoryKey(hour, minute);
  const timeInfo = getTimeCategoryDetails(categoryKey, hour, minute);

  if (periodEl) {
    periodEl.textContent = simulation?.simulatedTimeLabel || timeInfo.shortTitle;
  }

  // Update Time & Traffic card
  const activeCatPill = document.getElementById('active-time-cat-pill');
  if (activeCatPill) {
    activeCatPill.textContent = timeInfo.shortTitle;
    activeCatPill.className = `time-cat-pill ${timeInfo.styleClass}`;
  }

  const condTitle = document.getElementById('traffic-cond-title');
  if (condTitle) condTitle.textContent = timeInfo.titleWithRange;

  const condDesc = document.getElementById('traffic-cond-desc');
  if (condDesc) condDesc.textContent = timeInfo.description;

  const condIcon = document.getElementById('traffic-cond-icon');
  if (condIcon) {
    condIcon.setAttribute('data-lucide', timeInfo.iconName);
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  // Sync custom time input if not focused
  const customPicker = document.getElementById('custom-time-picker');
  if (customPicker && document.activeElement !== customPicker) {
    const hh = String(hour).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');
    customPicker.value = `${hh}:${mm}`;
  }

  // Highlight active preset button if matching exactly
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  document.querySelectorAll('.time-preset-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.time === timeStr);
  });
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
  const countBadge = document.getElementById('requests-count-badge');
  if (!container) return;
  const { bookings, loading, error } = getState();

  const seenIds = new Set();
  const activeBookings = [];
  for (const b of bookings) {
    if (!b || !b.id) continue;
    if (seenIds.has(b.id)) continue;
    if (!['completed', 'cancelled'].includes(b.status)) {
      seenIds.add(b.id);
      activeBookings.push(b);
    }
  }

  if (countBadge) {
    countBadge.textContent = String(activeBookings.length);
  }

  if (loading && activeBookings.length === 0) {
    container.innerHTML = '<div class="muted-text" style="padding:1rem;text-align:center;">Loading requests...</div>';
    return;
  }

  if (error && activeBookings.length === 0) {
    container.innerHTML = '<div class="muted-text" style="padding:1rem;text-align:center;">Unable to load requests.</div>';
    return;
  }

  if (activeBookings.length === 0) {
    container.innerHTML = '<div class="muted-text" style="padding:1rem;text-align:center;">No active booking requests yet.</div>';
    return;
  }

  // Sort active bookings: queued bookings first in their exact priority queue order, then assigned rides
  const sortedActiveBookings = [...activeBookings].sort((a, b) => {
    const isQueuedA = a.status === 'queued' || a.status === 'requested';
    const isQueuedB = b.status === 'queued' || b.status === 'requested';

    if (isQueuedA && !isQueuedB) return -1;
    if (!isQueuedA && isQueuedB) return 1;

    if (isQueuedA && isQueuedB) {
      // First by priority tier
      const tierA = a.priorityTier ?? 3;
      const tierB = b.priorityTier ?? 3;
      if (tierA !== tierB) return tierA - tierB;

      // Then by queue position
      const posA = a.queuePosition ?? Number.MAX_SAFE_INTEGER;
      const posB = b.queuePosition ?? Number.MAX_SAFE_INTEGER;
      if (posA !== posB) return posA - posB;

      // Then by sequence number
      return (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0);
    }

    return 0;
  });

  const cancellable = new Set(['requested', 'queued', 'assigned', 'to_pickup']);

  container.innerHTML = sortedActiveBookings
    .map((b) => {
      const pColor = getPassengerColor(b.rawCategory || b.category);
      const isAuto = String(b.vehicleType).toLowerCase() === 'auto';
      const vehIconSrc = isAuto ? '/assets/auto-icon.png' : '/assets/cab-icon.png';
      const pickupText = b.pickupLabel || 'Pickup location';
      const destText = b.destinationLabel || 'Destination';
      const hasVehicle = b.vehicle && b.vehicle !== 'Pending';
      const vehDisplay = hasVehicle ? b.vehicle : 'Matching vehicle...';
      const canStart = b.status === 'assigned' || b.status === 'to_pickup';
      const canCancel = cancellable.has(b.status);

      const isNight = Boolean(getState().simulation?.isNightHours);
      const defaultDayLabel = b.priorityTier === 1
        ? 'Senior Citizen — Highest Priority'
        : (b.priorityTier === 2 ? 'Woman — Second Priority' : 'Regular — Third Priority');
      const defaultNightLabel = b.priorityTier === 1
        ? 'Woman — Highest Priority'
        : (b.priorityTier === 2 ? 'Senior Citizen — Second Priority' : 'Regular — Third Priority');
      const priorityLabel = b.priorityTierLabel || (isNight ? defaultNightLabel : defaultDayLabel);
      const tierClass = `tier-${b.priorityTier || 3}`;
      const isQueued = b.status === 'queued' || b.status === 'requested';
      const posText = b.queuePosition != null ? `Priority #${b.queuePosition}` : 'In Priority Queue';
      const queueBadge = isQueued
        ? `<span class="queue-pos-badge">${posText} &middot; Waited ${b.waitingMinutes || 0}m</span>`
        : '';

      return `
        <div class="booking-request-card" data-booking-id="${b.id}" title="Click to view on map">
          <div class="booking-card-top-row">
            <div class="booking-user-header">
              <div class="user-avatar-circle" style="background-color: ${pColor};">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <div class="booking-names-col">
                <strong class="booking-pax-name">${b.passengerName}</strong>
                <div class="booking-pax-tags">
                  <span class="booking-cat-badge" style="color:${pColor}; border-color:${pColor};">${b.category}</span>
                  <span class="booking-count-badge">${b.passengerCount} ${b.passengerCount > 1 ? 'Passengers' : 'Passenger'}</span>
                </div>
              </div>
            </div>
            <div class="booking-top-right">
              <span class="status-pill-badge ${b.status}">${b.status.replace('_', ' ')}</span>
              ${canStart ? `<button type="button" class="action-menu-btn" data-start-id="${b.id}" title="Start Trip" style="color:var(--primary-purple);"><i data-lucide="play"></i></button>` : ''}
              ${canCancel ? `<button type="button" class="action-menu-btn" data-cancel-id="${b.id}" title="Cancel Booking" style="color:var(--pink);"><i data-lucide="x"></i></button>` : ''}
            </div>
          </div>

          <div class="booking-priority-indicator ${tierClass}">
            <span class="prio-tag">${priorityLabel}</span>
            ${queueBadge}
          </div>

          <div class="booking-card-body">
            <div class="booking-location-row">
              <span class="loc-label-bold">Pickup:</span>
              <span class="loc-value">${pickupText}</span>
            </div>
            <div class="booking-location-row">
              <span class="loc-label-bold">Drop:</span>
              <span class="loc-value">${destText}</span>
            </div>
          </div>

          <div class="booking-card-footer">
            <div class="booking-veh-assigned">
              <img src="${vehIconSrc}" class="booking-veh-icon-small" alt="${b.vehicleType}" />
              <span>Assigned: <strong>${vehDisplay}</strong></span>
            </div>
            <span class="booking-ref-id">Ref: ${b.id}</span>
          </div>
        </div>
      `;
    })
    .join('');

  if (typeof lucide !== 'undefined') {
    lucide.createIcons({ root: container });
  }

  // Row click to focus on map
  container.querySelectorAll('.booking-request-card').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const booking = getState().bookings.find((b) => b.id === row.dataset.bookingId);
      if (!booking) return;
      const [lat, lng] = Array.isArray(booking.pickup) ? booking.pickup : [];
      focusPickupOnMap({ lat, lng, passengerId: booking.id });
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
 * Follows exact ride lifecycle states:
 * STATE A: CAB ASSIGNED / AUTO ASSIGNED (travelling to pickup)
 * STATE B: PASSENGER PICKED UP (travelling to destination)
 * STATE C: Completed rides removed
 * STATE D: WAITING FOR CAB / WAITING FOR AUTO
 */
function renderActiveRidesLive() {
  const container = document.getElementById('active-rides-live-list');
  const countBadge = document.getElementById('live-rides-count-badge');
  if (!container) return;
  const { bookings } = getState();

  // Active rides are assigned, to_pickup, on_trip, or queued (completed/cancelled are excluded)
  // Deduplicate strictly by bookingId to guarantee exactly one card per active ride
  const seenRideIds = new Set();
  const activeRides = [];
  for (const b of bookings) {
    if (!b || !b.id) continue;
    if (seenRideIds.has(b.id)) continue;
    if (['assigned', 'to_pickup', 'on_trip', 'queued'].includes(b.status)) {
      seenRideIds.add(b.id);
      activeRides.push(b);
    }
  }

  if (countBadge) {
    countBadge.textContent = String(activeRides.length);
  }

  if (activeRides.length === 0) {
    container.innerHTML = '<div class="muted-text" style="padding:1.25rem;text-align:center;font-size:12px;">No active rides currently on road.</div>';
    return;
  }

  container.innerHTML = activeRides
    .map((b) => {
      const pColor = getPassengerColor(b.rawCategory || b.category);
      const isAuto = String(b.vehicleType).toLowerCase() === 'auto';
      const vehIconSrc = isAuto ? '/assets/auto-icon.png' : '/assets/cab-icon.png';
      const hasVehicle = Boolean(b.vehicle && b.vehicle !== 'Pending');
      const vehName = hasVehicle ? b.vehicle : (isAuto ? 'Auto' : 'Cab');

      const isPickedUp = b.status === 'on_trip';
      const isAssigned = (b.status === 'assigned' || b.status === 'to_pickup') && hasVehicle;

      let statusBadgeHtml = '';
      let etaBadgeHtml = '';
      let progressPercent = 20;
      let progressClass = 'progress-assigned';

      if (isPickedUp) {
        // STATE B: PASSENGER PICKED UP / ON THE WAY
        statusBadgeHtml = `<span class="ride-lifecycle-badge badge-pickedup">PASSENGER PICKED UP</span>`;
        const destEta = b.estimatedPickupMinutes != null ? b.estimatedPickupMinutes : 10;
        etaBadgeHtml = `
          <div class="ride-eta-box">
            <span class="ride-eta-label">ETA to destination:</span>
            <strong class="ride-eta-val">${destEta} minutes</strong>
          </div>
        `;
        progressPercent = 75;
        progressClass = 'progress-pickedup';
      } else if (isAssigned) {
        // STATE A: CAB ASSIGNED / AUTO ASSIGNED (TRAVELLING TO PICKUP)
        const badgeText = isAuto ? 'AUTO ASSIGNED' : 'CAB ASSIGNED';
        statusBadgeHtml = `<span class="ride-lifecycle-badge badge-assigned">${badgeText}</span>`;
        const pickupEta = b.estimatedPickupMinutes != null ? b.estimatedPickupMinutes : 4;
        etaBadgeHtml = `
          <div class="ride-eta-box">
            <span class="ride-eta-label">Arriving at pickup:</span>
            <strong class="ride-eta-val">${pickupEta} minutes</strong>
          </div>
        `;
        progressPercent = 35;
        progressClass = 'progress-assigned';
      } else {
        // STATE D: WAITING FOR ALLOCATION
        const waitText = isAuto ? 'WAITING FOR AUTO' : 'WAITING FOR CAB';
        statusBadgeHtml = `<span class="ride-lifecycle-badge badge-waiting">${waitText}</span>`;
        const queuePos = b.queuePosition != null ? `Priority #${b.queuePosition}` : 'In Priority Queue';
        etaBadgeHtml = `
          <div class="ride-eta-box">
            <span class="ride-eta-label">Queue:</span>
            <strong class="ride-eta-val queue-highlight">${queuePos} &middot; ${b.waitingMinutes || 0}m wait</strong>
          </div>
        `;
        progressPercent = 100;
        progressClass = 'progress-waiting';
      }

      const isNight = Boolean(getState().simulation?.isNightHours);
      const defaultDayLabel = b.priorityTier === 1
        ? 'Senior Citizen — Highest Priority'
        : (b.priorityTier === 2 ? 'Woman — Second Priority' : 'Regular — Third Priority');
      const defaultNightLabel = b.priorityTier === 1
        ? 'Woman — Highest Priority'
        : (b.priorityTier === 2 ? 'Senior Citizen — Second Priority' : 'Regular — Third Priority');
      const priorityLabel = b.priorityTierLabel || (isNight ? defaultNightLabel : defaultDayLabel);
      const tierClass = `tier-${b.priorityTier || 3}`;

      const pickupName = b.pickupLabel || 'Pickup Location';
      const destName = b.destinationLabel || 'Destination';

      return `
        <div class="active-ride-card" data-booking-id="${b.id}" title="Click to view ride on map">
          <div class="ride-card-top">
            <div class="ride-passenger-row">
              <span class="category-indicator-dot" style="background-color: ${pColor};"></span>
              <strong class="ride-pax-name">${b.passengerName}</strong>
              <span class="ride-category-pill" style="border-color:${pColor}; color:${pColor};">${b.category}</span>
            </div>
            ${statusBadgeHtml}
          </div>

          <div class="ride-priority-banner ${tierClass}">
            <span class="prio-tag">${priorityLabel}</span>
            ${b.status === 'queued' && b.queuePosition != null ? `<span class="queue-pos-badge">Priority #${b.queuePosition} &middot; ${b.waitingMinutes || 0}m</span>` : ''}
          </div>

          <div class="ride-veh-row">
            <div class="ride-veh-chip">
              <img src="${vehIconSrc}" class="ride-veh-thumb" alt="${vehName}" />
              <span class="ride-veh-name">${hasVehicle ? vehName : (isAuto ? 'Auto Requested' : 'Cab Requested')}</span>
            </div>
            ${etaBadgeHtml}
          </div>

          <div class="ride-route-details">
            <div class="route-line-item">
              <span class="route-point-marker pickup-dot"></span>
              <span class="route-point-label">Pickup:</span>
              <strong class="route-point-name">${pickupName}</strong>
            </div>
            <div class="route-line-item">
              <span class="route-point-marker dest-dot"></span>
              <span class="route-point-label">Drop:</span>
              <strong class="route-point-name">${destName}</strong>
            </div>
          </div>

          <div class="ride-card-progress-wrap">
            <div class="ride-card-progress-fill ${progressClass}" style="width: ${progressPercent}%;"></div>
          </div>
        </div>
      `;
    })
    .join('');

  if (typeof lucide !== 'undefined') {
    lucide.createIcons({ root: container });
  }

  container.querySelectorAll('.active-ride-card').forEach((row) => {
    row.addEventListener('click', () => {
      const booking = getState().bookings.find((b) => b.id === row.dataset.bookingId);
      if (!booking) return;
      if (booking.vehicle && booking.vehicle !== 'Pending') {
        focusVehicleOnMap(booking.vehicle);
      } else if (Array.isArray(booking.pickup)) {
        focusPickupOnMap({ lat: booking.pickup[0], lng: booking.pickup[1], passengerId: booking.id });
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

  const seenQueueIds = new Set();
  const uniqueQueue = [];
  for (const q of queue) {
    if (!q || !q.id) continue;
    if (seenQueueIds.has(q.id)) continue;
    seenQueueIds.add(q.id);
    uniqueQueue.push(q);
  }

  if (loading && uniqueQueue.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted-text">Loading queue...</td></tr>';
    return;
  }

  if (uniqueQueue.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted-text">Waiting queue is empty.</td></tr>';
    return;
  }

  tbody.innerHTML = uniqueQueue
    .map(
      (item, index) => `
      <tr class="clickable-row" data-queue-id="${item.id}" title="${item.priorityReason || 'Click to focus pickup on map'}">
        <td>#${item.queuePosition || (index + 1)}</td>
        <td><strong>${item.passengerName || item.id}</strong> <span class="muted-text" style="font-size:10.5px;">(${item.vehicleType || 'cab'})</span></td>
        <td><span class="badge-count purple">${item.priorityTierLabel || `Tier ${item.priorityTier}`}</span></td>
        <td>${item.waitMinutes || 0} min${item.priorityReason ? ` · <span class="muted-text">${item.priorityReason}</span>` : ''}</td>
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
    } else if (changeType === 'state:reset' || changeType === 'simulation:cleared' || changeType === 'simulation:completed') {
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

  // Complete Simulation button
  document.getElementById('sim-complete-btn')?.addEventListener('click', () => {
    if (confirm('Complete all active and queued feasible rides immediately?')) {
      handleSimAction(() => completeSimulation());
    }
  });

  // Clear Simulation button
  document.getElementById('sim-clear-btn')?.addEventListener('click', () => {
    if (confirm('Clear all simulation data and reset the map with 5 available cabs?')) {
      handleSimAction(() => clearSimulation());
    }
  });

  // Speed selection pills (1x, 2x, 4x, 8x)
  document.querySelectorAll('.speed-pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const speed = Number(btn.dataset.speed) || 1;
      handleSimAction(() => setSimulationSpeed(speed));
    });
  });

  // Predefined Time Presets
  document.querySelectorAll('.time-preset-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const timeVal = btn.dataset.time;
      if (!timeVal) return;
      const customPicker = document.getElementById('custom-time-picker');
      if (customPicker) customPicker.value = timeVal;
      document.querySelectorAll('.time-preset-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const feedback = document.getElementById('time-apply-feedback');
      if (feedback) feedback.textContent = `Applying ${btn.textContent.trim()}...`;

      try {
        await setSimulationTime({ time: timeVal });
        if (feedback) feedback.textContent = `Time updated to ${timeVal}. Waiting queue re-evaluated.`;
        setTimeout(() => {
          if (feedback) feedback.textContent = '';
        }, 3000);
      } catch (err) {
        if (feedback) feedback.textContent = `Error: ${err.message || 'Failed to update time'}`;
      }
    });
  });

  // Apply Custom Time Button
  document.getElementById('apply-time-btn')?.addEventListener('click', async () => {
    const customPicker = document.getElementById('custom-time-picker');
    const timeVal = customPicker?.value || '14:00';
    const applyBtn = document.getElementById('apply-time-btn');
    const feedback = document.getElementById('time-apply-feedback');
    if (applyBtn) applyBtn.disabled = true;
    if (feedback) feedback.textContent = `Applying time ${timeVal}...`;

    try {
      await setSimulationTime({ time: timeVal });
      if (feedback) feedback.textContent = `Time applied: ${timeVal}. Allocation rules updated.`;
      setTimeout(() => {
        if (feedback) feedback.textContent = '';
      }, 3000);
    } catch (err) {
      if (feedback) feedback.textContent = `Error: ${err.message || 'Failed to apply time'}`;
    } finally {
      if (applyBtn) applyBtn.disabled = false;
    }
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
