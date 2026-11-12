import { MOCK_BOOKINGS, MOCK_QUEUE, MOCK_VEHICLES } from './mockData.js';

let bookings = [...MOCK_BOOKINGS];
let queue = [...MOCK_QUEUE];
let simState = 'Paused'; // 'Running' | 'Paused' | 'Idle'
let simSpeed = 1;
let simClockSeconds = 16 * 3600 + 35 * 60; // 16:35:00
let clockTimer = null;

function formatClock(totalSeconds) {
  const hrs = Math.floor(totalSeconds / 3600) % 24;
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return [hrs, mins, secs].map((v) => String(v).padStart(2, '0')).join(':');
}

function updateClockUI() {
  const timeEl = document.getElementById('sim-time-display');
  const periodEl = document.getElementById('sim-period-badge');
  const hour = Math.floor(simClockSeconds / 3600) % 24;
  const isNight = hour >= 22 || hour < 6;

  if (timeEl) timeEl.textContent = formatClock(simClockSeconds);
  if (periodEl) {
    periodEl.textContent = isNight ? 'Night Hours' : 'Daytime';
  }
}

function renderStats() {
  const totalEl = document.getElementById('stat-total-bookings');
  const availEl = document.getElementById('stat-available-vehicles');
  const activeEl = document.getElementById('stat-active-trips');
  const waitEl = document.getElementById('stat-waiting-requests');
  const navBookingsEl = document.getElementById('nav-bookings-count');
  const navQueueEl = document.getElementById('nav-queue-count');

  const availableCount = MOCK_VEHICLES.filter((v) => v.status === 'available').length;
  const activeCount = bookings.filter((b) => b.status === 'assigned' || b.status === 'on_trip').length;

  if (totalEl) totalEl.textContent = String(bookings.length);
  if (availEl) availEl.textContent = String(availableCount);
  if (activeEl) activeEl.textContent = String(activeCount);
  if (waitEl) waitEl.textContent = String(queue.length);
  if (navBookingsEl) navBookingsEl.textContent = String(bookings.length);
  if (navQueueEl) navQueueEl.textContent = String(queue.length);
}

function renderBookingActivity() {
  const tbody = document.getElementById('booking-activity-body');
  if (!tbody) return;

  tbody.innerHTML = bookings
    .map(
      (b) => `
      <tr>
        <td><strong>${b.id}</strong></td>
        <td>${b.category}</td>
        <td>${b.vehicle}</td>
        <td><span class="status-pill ${b.status}">${b.status.replace('_', ' ')}</span></td>
        <td>${b.estPickup}</td>
      </tr>
    `
    )
    .join('');
}

function renderWaitingQueue() {
  const tbody = document.getElementById('waiting-queue-body');
  if (!tbody) return;

  tbody.innerHTML = queue
    .map(
      (item, index) => `
      <tr>
        <td>#${index + 1}</td>
        <td><strong>${item.id}</strong></td>
        <td><span class="priority-pill">${item.priorityScore}</span></td>
        <td>${item.waitMinutes} min</td>
      </tr>
    `
    )
    .join('');
}

function updateSimulationStatusUI() {
  const pill = document.getElementById('sim-status-pill');
  const text = document.getElementById('sim-status-text');
  const mapLabel = document.getElementById('map-sim-label');
  const speedBadge = document.getElementById('sim-speed-badge');

  if (pill) {
    pill.className = `sim-status-pill status-${simState.toLowerCase()}`;
  }
  if (text) text.textContent = simState;
  if (mapLabel) mapLabel.textContent = `Simulation: ${simState} (${simSpeed}x)`;
  if (speedBadge) speedBadge.textContent = `${simSpeed}x Speed`;
}

function startClockLoop() {
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    if (simState === 'Running') {
      simClockSeconds = (simClockSeconds + simSpeed) % 86400;
      updateClockUI();
    }
  }, 1000);
}

export function addMockBooking(booking) {
  bookings = [booking, ...bookings];
  renderStats();
  renderBookingActivity();
}

export function initDashboard() {
  renderStats();
  renderBookingActivity();
  renderWaitingQueue();
  updateClockUI();
  updateSimulationStatusUI();
  startClockLoop();

  document.getElementById('sim-start-btn')?.addEventListener('click', () => {
    simState = 'Running';
    updateSimulationStatusUI();
  });

  document.getElementById('sim-pause-btn')?.addEventListener('click', () => {
    simState = 'Paused';
    updateSimulationStatusUI();
  });

  document.getElementById('sim-resume-btn')?.addEventListener('click', () => {
    simState = 'Running';
    updateSimulationStatusUI();
  });

  document.getElementById('sim-reset-btn')?.addEventListener('click', () => {
    simState = 'Idle';
    simSpeed = 1;
    simClockSeconds = 16 * 3600 + 35 * 60;
    bookings = [...MOCK_BOOKINGS];
    queue = [...MOCK_QUEUE];
    const speedSelect = document.getElementById('sim-speed-select');
    if (speedSelect) speedSelect.value = '1';
    updateClockUI();
    updateSimulationStatusUI();
    renderStats();
    renderBookingActivity();
    renderWaitingQueue();
  });

  document.getElementById('sim-speed-select')?.addEventListener('change', (event) => {
    simSpeed = Number(event.target.value) || 1;
    updateSimulationStatusUI();
  });
}
