import { initMap } from './map.js';
import { initBookingPanel } from './booking.js';
import { initDashboard } from './dashboard.js';
import { initSocket } from './socket.js';
import { loadInitialData } from './state.js';

const SECTION_TITLES = {
  overview: 'Dispatch Overview',
  'live-map': 'Live Bengaluru Map',
  bookings: 'Bookings & Requests',
  'waiting-queue': 'Priority Waiting Queue',
  fleet: 'Fleet Management',
  analytics: 'Dispatch Analytics',
  settings: 'Simulation Settings'
};

function setupNavigation() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const toggleBtn = document.getElementById('sidebar-toggle-btn');
  const closeBtn = document.getElementById('sidebar-close-btn');
  const pageTitle = document.getElementById('page-title');
  const navItems = document.querySelectorAll('.nav-item');

  function closeMobileSidebar() {
    sidebar?.classList.remove('open');
    backdrop?.classList.remove('visible');
  }

  toggleBtn?.addEventListener('click', () => {
    sidebar?.classList.add('open');
    backdrop?.classList.add('visible');
  });

  closeBtn?.addEventListener('click', closeMobileSidebar);
  backdrop?.addEventListener('click', closeMobileSidebar);

  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section || 'overview';
      navItems.forEach((item) => item.classList.remove('active'));
      btn.classList.add('active');

      if (pageTitle && SECTION_TITLES[section]) {
        pageTitle.textContent = SECTION_TITLES[section];
      }

      document.querySelectorAll('[data-panel]').forEach((panel) => {
        const isMatch = section !== 'overview' && panel.dataset.panel === section;
        panel.classList.toggle('panel-focused', isMatch);
        if (isMatch) {
          panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });

      closeMobileSidebar();
    });
  });
}

function setupNotifications() {
  const notifBtn = document.getElementById('notification-btn');
  const popover = document.getElementById('notification-popover');

  notifBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    popover?.classList.toggle('hidden');
  });

  document.addEventListener('click', (event) => {
    if (!popover?.contains(event.target) && event.target !== notifBtn) {
      popover?.classList.add('hidden');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  setupNavigation();
  setupNotifications();
  initMap();
  initDashboard();
  initBookingPanel();
  initSocket();
  loadInitialData();
});
