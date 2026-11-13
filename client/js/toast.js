/**
 * Toast Notification System for Urban Ride Simulation
 * Displays compact, green-accented success notifications in the top-right corner.
 * Auto-dismisses in 4.5 seconds with duplicate prevention.
 */

const shownPickups = new Set();
const shownCompletions = new Set();

export function showToast({ title, message, type = 'success' }) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `compact-toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-indicator-icon">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    </div>
    <div class="toast-body">
      <div class="toast-headline">${title}</div>
      <div class="toast-subtext">${message}</div>
    </div>
    <button type="button" class="toast-dismiss-btn" aria-label="Close notification">&times;</button>
  `;

  container.appendChild(toast);

  // Auto-dismiss after 4.5s
  const timer = setTimeout(() => {
    toast.classList.add('toast-fade-out');
    setTimeout(() => toast.remove(), 350);
  }, 4500);

  toast.querySelector('.toast-dismiss-btn').addEventListener('click', () => {
    clearTimeout(timer);
    toast.classList.add('toast-fade-out');
    setTimeout(() => toast.remove(), 350);
  });
}

export function notifyBookingPickup(booking) {
  const bId = booking?.id || booking?.bookingId;
  if (!bId) return;
  if (shownPickups.has(bId)) return;
  shownPickups.add(bId);

  const vehText = booking.vehicle && booking.vehicle !== 'Pending' ? ` · Cab: ${booking.vehicle}` : (booking.vehicleId ? ` · Cab: ${booking.vehicleId}` : '');
  showToast({
    title: 'Passenger Picked Up',
    message: `Passenger picked up successfully! Booking: ${bId}${vehText}`,
    type: 'success'
  });
}

export function notifyBookingCompleted(booking) {
  const bId = booking?.id || booking?.bookingId;
  if (!bId) return;
  if (shownCompletions.has(bId)) return;
  shownCompletions.add(bId);

  showToast({
    title: 'Ride Completed',
    message: `Passenger dropped off successfully! Ride completed. (${bId})`,
    type: 'success'
  });
}

export function resetToastTracking() {
  shownPickups.clear();
  shownCompletions.clear();
}

