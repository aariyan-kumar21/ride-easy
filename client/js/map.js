import { BENGALURU_CENTER, DEFAULT_ZOOM } from './seedData.js';
import { getState, getFilteredVehicles, subscribe } from './state.js';

let mapInstance = null;
let routeLayerGroup = null;
let vehicleLayer = null;
let passengerLayer = null;
let showVehicles = true;
let showPassengers = true;

// Marker & route reference maps for in-place updates without recreating the map
const vehicleMarkers = new Map();
const passengerMarkers = new Map();
const destinationMarkers = new Map();
const routeLayers = new Map();

/**
 * Color palette matching the design specification:
 * - Purple: #8954F6 for U1
 * - Pink:   #F52D91 for U2
 * - Orange: #FF9415 for U3
 * - Blue:   #3188F5 for U4
 * - Green:  #16B85A for U5
 */
export function getPassengerColor(userId) {
  const str = String(userId || '');
  if (str.includes('101') || str.endsWith('1')) return '#8954F6'; // Purple (U1)
  if (str.includes('102') || str.endsWith('2')) return '#F52D91'; // Pink (U2)
  if (str.includes('103') || str.endsWith('3')) return '#FF9415'; // Orange (U3)
  if (str.includes('104') || str.endsWith('4')) return '#3188F5'; // Blue (U4)
  if (str.includes('105') || str.endsWith('5')) return '#16B85A'; // Green (U5)
  return '#8954F6';
}

export function getShortPassengerId(userId) {
  const str = String(userId || '');
  if (str.startsWith('U10') && str.length === 4) {
    return 'U' + str.slice(3);
  }
  return str;
}

function createVehicleIcon(vehicle) {
  const isAuto = String(vehicle.vehicleType).toLowerCase() === 'auto';
  const isAssignedOrTrip = vehicle.status === 'assigned' || vehicle.status === 'to_pickup' || vehicle.status === 'on_trip';
  const statusClass = `status-${vehicle.status}`;
  const iconSvg = isAuto
    ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>`
    : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>`;

  const assignedPassengerTag = vehicle.currentBookingId ? ` <span style="opacity:0.85;font-size:10px;">• ${vehicle.currentBookingId}</span>` : '';

  return L.divIcon({
    className: 'urban-vehicle-marker',
    html: `
      <div class="vehicle-map-badge ${statusClass}">
        ${iconSvg}
        <span>${vehicle.id}</span>
        ${isAssignedOrTrip ? assignedPassengerTag : '<span class="veh-status-dot"></span>'}
      </div>
    `,
    iconSize: [80, 26],
    iconAnchor: [40, 13],
    popupAnchor: [0, -14]
  });
}

function createVehiclePopupHtml(vehicle) {
  const isAuto = String(vehicle.vehicleType).toLowerCase() === 'auto';
  return `
    <div class="map-popup">
      <div class="popup-clean-title">${vehicle.id} &middot; ${isAuto ? 'Auto' : 'Cab'}</div>
      <div><strong>Status:</strong> ${vehicle.status.replace('_', ' ')}</div>
      <div><strong>Capacity:</strong> ${vehicle.capacity} passengers</div>
      ${vehicle.currentBookingId ? `<div><strong>Assigned Booking:</strong> ${vehicle.currentBookingId}</div>` : ''}
      ${vehicle.area ? `<div><strong>Zone:</strong> ${vehicle.area}</div>` : ''}
    </div>
  `;
}

function createPassengerIcon(passenger) {
  const pId = passenger.id || passenger.userId;
  const shortId = getShortPassengerId(pId);
  const color = getPassengerColor(pId);

  return L.divIcon({
    className: 'urban-passenger-marker',
    html: `
      <div class="passenger-map-badge" style="background-color: ${color};">
        ${shortId}
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });
}

function createDestinationIcon(passenger) {
  const pId = passenger.id || passenger.userId;
  const shortId = getShortPassengerId(pId);

  return L.divIcon({
    className: 'urban-passenger-marker',
    html: `
      <div class="destination-map-badge" title="Drop for ${shortId}">
        ${shortId}
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28]
  });
}

function createPassengerPopupHtml(passenger) {
  const pId = passenger.id || passenger.userId;
  return `
    <div class="map-popup">
      <div class="popup-clean-title">Pickup &middot; ${pId} (${getShortPassengerId(pId)})</div>
      <div><strong>Category:</strong> ${passenger.category || 'Regular'}</div>
      <div><strong>Pickup:</strong> ${passenger.pickup?.label || 'Pickup point'}</div>
      <div><strong>Destination:</strong> ${passenger.destination?.label || 'Destination'}</div>
      <div><strong>Passengers:</strong> ${passenger.passengerCount || 1}</div>
    </div>
  `;
}

function createDestinationPopupHtml(passenger) {
  const pId = passenger.id || passenger.userId;
  return `
    <div class="map-popup">
      <div class="popup-clean-title">Destination &middot; ${pId} (${getShortPassengerId(pId)})</div>
      <div>${passenger.destination?.label || 'Destination Point'}</div>
      <div><strong>Passenger:</strong> ${passenger.category || 'Regular'}</div>
    </div>
  `;
}

export function addVehicleMarker(vehicle) {
  if (!vehicleLayer) return null;
  if (vehicleMarkers.has(vehicle.id)) {
    return updateVehicleMarker(vehicle);
  }

  const marker = L.marker([vehicle.lat, vehicle.lng], {
    icon: createVehicleIcon(vehicle)
  });
  marker.bindPopup(createVehiclePopupHtml(vehicle));
  marker.addTo(vehicleLayer);
  vehicleMarkers.set(vehicle.id, marker);
  return marker;
}

export function updateVehicleMarker(vehicle) {
  const existing = vehicleMarkers.get(vehicle.id);
  if (!existing) {
    return addVehicleMarker(vehicle);
  }

  existing.setLatLng([vehicle.lat, vehicle.lng]);
  existing.setIcon(createVehicleIcon(vehicle));
  existing.setPopupContent(createVehiclePopupHtml(vehicle));
  return existing;
}

export function removeVehicleMarker(vehicleId) {
  const existing = vehicleMarkers.get(vehicleId);
  if (!existing || !vehicleLayer) return false;
  vehicleLayer.removeLayer(existing);
  vehicleMarkers.delete(vehicleId);
  return true;
}

export function addPassengerMarker(passenger) {
  if (!passengerLayer) return null;
  const pId = passenger.id || passenger.userId;
  if (passengerMarkers.has(pId)) {
    return updatePassengerMarker(passenger);
  }

  const pickupMarker = L.marker([passenger.lat, passenger.lng], {
    icon: createPassengerIcon(passenger)
  });
  pickupMarker.bindPopup(createPassengerPopupHtml(passenger));
  pickupMarker.addTo(passengerLayer);
  passengerMarkers.set(pId, pickupMarker);

  if (passenger.destination?.lat && passenger.destination?.lng) {
    const destMarker = L.marker([passenger.destination.lat, passenger.destination.lng], {
      icon: createDestinationIcon(passenger)
    });
    destMarker.bindPopup(createDestinationPopupHtml(passenger));
    destMarker.addTo(passengerLayer);
    destinationMarkers.set(pId, destMarker);
  }

  return pickupMarker;
}

export function updatePassengerMarker(passenger) {
  const pId = passenger.id || passenger.userId;
  const existing = passengerMarkers.get(pId);
  if (!existing) {
    return addPassengerMarker(passenger);
  }

  existing.setLatLng([passenger.lat, passenger.lng]);
  existing.setPopupContent(createPassengerPopupHtml(passenger));

  const existingDest = destinationMarkers.get(pId);
  if (existingDest && passenger.destination) {
    existingDest.setLatLng([passenger.destination.lat, passenger.destination.lng]);
    existingDest.setPopupContent(createDestinationPopupHtml(passenger));
  }
  return existing;
}

export function removePassengerMarker(passengerId) {
  if (!passengerLayer) return false;
  let removed = false;

  const pickup = passengerMarkers.get(passengerId);
  if (pickup) {
    passengerLayer.removeLayer(pickup);
    passengerMarkers.delete(passengerId);
    removed = true;
  }

  const dest = destinationMarkers.get(passengerId);
  if (dest) {
    passengerLayer.removeLayer(dest);
    destinationMarkers.delete(passengerId);
  }

  return removed;
}

export function applyVehicleFilter() {
  if (!vehicleLayer) return;
  const visibleIds = new Set(getFilteredVehicles().map((v) => v.id));

  vehicleMarkers.forEach((marker, vehicleId) => {
    const isVisible = visibleIds.has(vehicleId);
    if (isVisible && !vehicleLayer.hasLayer(marker)) {
      marker.addTo(vehicleLayer);
    } else if (!isVisible && vehicleLayer.hasLayer(marker)) {
      vehicleLayer.removeLayer(marker);
    }
  });
}

export function focusVehicleOnMap(vehicleId) {
  if (!mapInstance) return;
  const marker = vehicleMarkers.get(vehicleId);
  if (!marker) return;

  if (!showVehicles) {
    showVehicles = true;
    vehicleLayer.addTo(mapInstance);
    document.getElementById('map-vehicles-toggle')?.classList.add('active');
  }
  if (!vehicleLayer.hasLayer(marker)) {
    marker.addTo(vehicleLayer);
  }

  mapInstance.setView(marker.getLatLng(), 15, { animate: true });
  marker.openPopup();
}

export function focusPickupOnMap({ lat, lng, passengerId }) {
  if (!mapInstance) return;

  if (!showPassengers) {
    showPassengers = true;
    passengerLayer.addTo(mapInstance);
    document.getElementById('map-passengers-toggle')?.classList.add('active');
  }

  const marker = passengerId ? passengerMarkers.get(passengerId) : null;
  if (marker) {
    mapInstance.setView(marker.getLatLng(), 15, { animate: true });
    marker.openPopup();
    return;
  }

  if (typeof lat === 'number' && typeof lng === 'number') {
    mapInstance.setView([lat, lng], 15, { animate: true });
  }
}

export function resetMapView() {
  if (!mapInstance) return;
  mapInstance.setView(BENGALURU_CENTER, DEFAULT_ZOOM, { animate: true });
}

function formatDistanceKm(meters) {
  if (meters === null || meters === undefined) return '—';
  return `${(meters / 1000).toFixed(1)} km`;
}

export function removeBookingRoute(bookingId) {
  if (!routeLayerGroup) return false;
  const existing = routeLayers.get(bookingId);
  if (!existing) return false;
  routeLayerGroup.removeLayer(existing);
  routeLayers.delete(bookingId);
  return true;
}

export function upsertBookingRoute(booking) {
  if (!routeLayerGroup || !booking) return null;

  const activeRouteStatuses = new Set(['assigned', 'to_pickup', 'on_trip', 'requested', 'queued']);
  if (!activeRouteStatuses.has(booking.status) || !Array.isArray(booking.routeGeometry) || booking.routeGeometry.length < 2) {
    removeBookingRoute(booking.id);
    return null;
  }

  removeBookingRoute(booking.id);

  const routeColor = getPassengerColor(booking.userId);
  const isPending = booking.status === 'requested' || booking.status === 'queued';
  const isTrip = booking.status === 'on_trip';

  const polyline = L.polyline(booking.routeGeometry, {
    color: routeColor,
    weight: isTrip ? 5 : 4,
    opacity: 0.88,
    dashArray: isPending ? '8, 8' : null
  });

  const etaText = booking.estimatedPickupMinutes ? `${booking.estimatedPickupMinutes} min` : '—';
  const estSuffix = booking.isEstimatedRoute ? ' (est.)' : '';
  const shortId = getShortPassengerId(booking.userId);

  const popupHtml = `
    <div class="map-popup">
      <div class="popup-clean-title">${booking.id} &middot; Passenger ${shortId}</div>
      <div><strong>Status:</strong> ${booking.status.replace('_', ' ')}</div>
      <div><strong>Vehicle:</strong> ${booking.vehicle || 'Matching...'}</div>
      <div><strong>ETA:</strong> ${etaText}${estSuffix}</div>
      <div><strong>Distance:</strong> ${formatDistanceKm(booking.routeDistanceMeters)}</div>
    </div>
  `;

  polyline.bindPopup(popupHtml);
  polyline.addTo(routeLayerGroup);
  routeLayers.set(booking.id, polyline);
  return polyline;
}

function syncAllRoutesFromState() {
  const { bookings } = getState();
  const activeIds = new Set();
  bookings.forEach((b) => {
    const layer = upsertBookingRoute(b);
    if (layer) activeIds.add(b.id);
  });
  routeLayers.forEach((_layer, bookingId) => {
    if (!activeIds.has(bookingId)) {
      removeBookingRoute(bookingId);
    }
  });
}

function syncAllMarkersFromState() {
  const { vehicles, passengers } = getState();
  vehicles.forEach(updateVehicleMarker);
  passengers.forEach(updatePassengerMarker);
  applyVehicleFilter();
  syncAllRoutesFromState();
}

export function initMap() {
  const container = document.getElementById('map-container');
  if (!container || typeof L === 'undefined') return;
  if (mapInstance) {
    mapInstance.invalidateSize();
    return;
  }

  mapInstance = L.map(container, {
    center: BENGALURU_CENTER,
    zoom: DEFAULT_ZOOM,
    zoomControl: false // Using custom sleek zoom controls in toolbar
  });

  // Standard OpenStreetMap street tiles (No API key required)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(mapInstance);

  routeLayerGroup = L.layerGroup().addTo(mapInstance);
  passengerLayer = L.layerGroup().addTo(mapInstance);
  vehicleLayer = L.layerGroup().addTo(mapInstance);

  syncAllMarkersFromState();

  // Keep map synchronized with centralized state
  subscribe((state, changeType, payload) => {
    if (changeType === 'data:loaded') {
      syncAllMarkersFromState();
    } else if ((changeType === 'vehicle:updated' || changeType === 'cab:location') && payload) {
      updateVehicleMarker(payload);
      applyVehicleFilter();
    } else if ((changeType === 'booking:added' || changeType === 'booking:updated') && payload) {
      upsertBookingRoute(payload);
      const vehicle = state.vehicles.find((v) => v.id === payload.vehicle);
      if (vehicle) updateVehicleMarker(vehicle);
    } else if (changeType === 'filter:changed') {
      applyVehicleFilter();
    } else if (changeType === 'state:reset') {
      syncAllMarkersFromState();
      resetMapView();
    }
  });

  // Map toolbar controls
  document.getElementById('map-center-btn')?.addEventListener('click', resetMapView);
  document.getElementById('map-zoom-in-btn')?.addEventListener('click', () => mapInstance?.zoomIn());
  document.getElementById('map-zoom-out-btn')?.addEventListener('click', () => mapInstance?.zoomOut());

  // Handle map invalidation and layout rendering transitions
  window.addEventListener('resize', () => {
    mapInstance?.invalidateSize();
  });
  requestAnimationFrame(() => {
    mapInstance?.invalidateSize();
  });
  setTimeout(() => {
    mapInstance?.invalidateSize();
  }, 100);
  setTimeout(() => {
    mapInstance?.invalidateSize();
  }, 400);

  const passengersBtn = document.getElementById('map-passengers-toggle');
  const vehiclesBtn = document.getElementById('map-vehicles-toggle');

  passengersBtn?.addEventListener('click', () => {
    showPassengers = !showPassengers;
    passengersBtn.classList.toggle('active', showPassengers);
    if (showPassengers) {
      passengerLayer.addTo(mapInstance);
    } else {
      mapInstance.removeLayer(passengerLayer);
    }
  });

  vehiclesBtn?.addEventListener('click', () => {
    showVehicles = !showVehicles;
    vehiclesBtn.classList.toggle('active', showVehicles);
    if (showVehicles) {
      vehicleLayer.addTo(mapInstance);
    } else {
      mapInstance.removeLayer(vehicleLayer);
    }
  });

  window.RideEasyMap = {
    addVehicleMarker,
    updateVehicleMarker,
    removeVehicleMarker,
    addPassengerMarker,
    updatePassengerMarker,
    removePassengerMarker,
    focusVehicleOnMap,
    focusPickupOnMap,
    upsertBookingRoute,
    removeBookingRoute,
    resetMapView
  };
}
