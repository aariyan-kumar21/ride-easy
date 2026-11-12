import { BENGALURU_CENTER, MOCK_VEHICLES, MOCK_BOOKINGS } from './mockData.js';

let mapInstance = null;
let vehicleLayer = null;
let routeLayer = null;
let showVehicles = true;
let showRoutes = true;

const STATUS_COLORS = {
  available: '#22c55e',
  assigned: '#a855f7',
  on_trip: '#38bdf8',
  offline: '#64748b'
};

function createMarkerIcon(color, label) {
  return L.divIcon({
    className: 'custom-map-marker',
    html: `<div style="
      background:${color};
      color:#090b10;
      font-weight:700;
      font-size:10px;
      padding:2px 6px;
      border-radius:999px;
      border:2px solid #090b10;
      box-shadow:0 2px 8px rgba(0,0,0,0.45);
      white-space:nowrap;
    ">${label}</div>`,
    iconSize: [56, 22],
    iconAnchor: [28, 11]
  });
}

function renderVehicles() {
  if (!vehicleLayer) return;
  vehicleLayer.clearLayers();
  if (!showVehicles) return;

  MOCK_VEHICLES.forEach((vehicle) => {
    const color = STATUS_COLORS[vehicle.status] || STATUS_COLORS.offline;
    const marker = L.marker([vehicle.lat, vehicle.lng], {
      icon: createMarkerIcon(color, vehicle.id)
    });

    marker.bindPopup(`
      <strong>${vehicle.id}</strong> (${vehicle.type.toUpperCase()})<br/>
      Status: ${vehicle.status.replace('_', ' ')}<br/>
      Capacity: ${vehicle.capacity} seats<br/>
      Area: ${vehicle.area}
    `);

    marker.addTo(vehicleLayer);
  });
}

function renderMockRoutes() {
  if (!routeLayer) return;
  routeLayer.clearLayers();
  if (!showRoutes) return;

  MOCK_BOOKINGS.filter((b) => b.status === 'assigned' || b.status === 'on_trip').forEach((booking) => {
    const lineColor = booking.status === 'assigned' ? '#a855f7' : '#38bdf8';
    const polyline = L.polyline([booking.pickup, booking.destination], {
      color: lineColor,
      weight: 3,
      opacity: 0.85,
      dashArray: booking.status === 'assigned' ? '6 6' : null
    });
    polyline.bindPopup(`<strong>${booking.id}</strong> — ${booking.category} (${booking.status})`);
    polyline.addTo(routeLayer);

    L.circleMarker(booking.pickup, {
      radius: 5,
      color: '#be185d',
      fillColor: '#be185d',
      fillOpacity: 1
    })
      .bindPopup(`Pickup for ${booking.id}`)
      .addTo(routeLayer);
  });
}

export function initMap() {
  const container = document.getElementById('map-container');
  if (!container || typeof L === 'undefined') return;

  mapInstance = L.map(container, {
    center: BENGALURU_CENTER,
    zoom: 13,
    zoomControl: true
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(mapInstance);

  routeLayer = L.layerGroup().addTo(mapInstance);
  vehicleLayer = L.layerGroup().addTo(mapInstance);

  renderVehicles();
  renderMockRoutes();

  const centerBtn = document.getElementById('map-center-btn');
  const routesBtn = document.getElementById('map-routes-toggle');
  const vehiclesBtn = document.getElementById('map-vehicles-toggle');

  centerBtn?.addEventListener('click', () => {
    mapInstance.setView(BENGALURU_CENTER, 13, { animate: true });
  });

  routesBtn?.addEventListener('click', () => {
    showRoutes = !showRoutes;
    routesBtn.classList.toggle('active', showRoutes);
    renderMockRoutes();
  });

  vehiclesBtn?.addEventListener('click', () => {
    showVehicles = !showVehicles;
    vehiclesBtn.classList.toggle('active', showVehicles);
    renderVehicles();
  });
}
