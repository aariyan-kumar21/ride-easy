import { initMap } from './map.js';
import { initBookingPanel } from './booking.js';
import { initDashboard } from './dashboard.js';
import { initSocket } from './socket.js';
import { loadInitialData } from './state.js';

document.addEventListener('DOMContentLoaded', () => {
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  initMap();
  initDashboard();
  initBookingPanel();
  initSocket();
  loadInitialData();
});
