import { initMap } from './map.js';
import { initBookingPanel } from './booking.js';
import { initDashboard } from './dashboard.js';
import { initSocket } from './socket.js';

const API_BASE_URL = window.location.port === '5500' ? 'http://localhost:5000' : '';

async function checkBackendHealth() {
  const indicator = document.getElementById('health-indicator');
  const backendStat = document.getElementById('stat-backend');

  try {
    const response = await fetch(`${API_BASE_URL}/api/health`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    if (indicator) {
      indicator.textContent = `Backend: ${data.status.toUpperCase()}`;
      indicator.className = 'status-pill status-online';
    }
    if (backendStat) {
      backendStat.textContent = 'Online';
    }
  } catch (error) {
    if (indicator) {
      indicator.textContent = 'Backend: Offline';
      indicator.className = 'status-pill status-offline';
    }
    if (backendStat) {
      backendStat.textContent = 'Offline';
    }
    console.error('Backend health check failed:', error);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initBookingPanel();
  initDashboard();
  initSocket();
  checkBackendHealth();
});

