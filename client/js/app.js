import { initMap } from './map.js';
import { initBookingPanel } from './booking.js';
import { initDashboard } from './dashboard.js';
import { initSocket } from './socket.js';
import { loadInitialData } from './state.js';

function boot() {
  if (typeof lucide !== 'undefined') {
    try {
      lucide.createIcons();
    } catch (e) {
      console.warn('Lucide icon rendering warning:', e);
    }
  }

  try {
    initMap();
  } catch (err) {
    console.error('Failed to initMap:', err);
  }

  try {
    initDashboard();
  } catch (err) {
    console.error('Failed to initDashboard:', err);
  }

  try {
    initBookingPanel();
  } catch (err) {
    console.error('Failed to initBookingPanel:', err);
  }

  try {
    initSocket();
  } catch (err) {
    console.error('Failed to initSocket:', err);
  }

  try {
    loadInitialData();
  } catch (err) {
    console.error('Failed to loadInitialData:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
