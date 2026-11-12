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

const VEHICLE_STATUS_STYLES = {
  available: { color: '#22c55e', label: 'Available' },
  assigned: { color: '#a855f7', label: 'Assigned' },
  on_trip: { color: '#38bdf8', label: 'On Trip' },
  offline: { color: '#64748b', label: 'Offline' }
};

function createVehicleIcon(vehicle) {
  const style = VEHICLE_STATUS_STYLES[vehicle.status] || VEHICLE_STATUS_STYLES.offline;
  const isAuto = String(vehicle.vehicleType).toLowerCase() === 'auto';
  const shapeRadius = isAuto ? '6px' : '999px';
  const typeTag = isAuto ? 'A' : 'C';

  return L.divIcon({
    className: 'rideeasy-vehicle-marker',
    html: `<div class="map-pin vehicle-pin" style="
      background:${style.color};
      border-radius:${shapeRadius};
    ">
      <span class="pin-type">${typeTag}</span>
      <span class="pin-id">${vehicle.id}</span>
    </div>`,
    iconSize: [64, 24],
    iconAnchor: [32, 12],
    popupAnchor: [0, -12]
  });
}

function createVehiclePopupHtml(vehicle) {
  const statusLabel = (VEHICLE_STATUS_STYLES[vehicle.status] || VEHICLE_STATUS_STYLES.offline).label;
  return `
    <div class="map-popup">
      <div class="popup-title">${vehicle.id} &middot; ${vehicle.vehicleType}</div>
      <div><strong>Status:</strong> ${statusLabel}</div>
      <div><strong>Capacity:</strong> ${vehicle.capacity} seats</div>
      ${vehicle.area ? `<div><strong>Zone:</strong> ${vehicle.area}</div>` : ''}
    </div>
  `;
}

function createPassengerIcon(passengerId) {
  return L.divIcon({
    className: 'rideeasy-passenger-marker',
    html: `<div class="map-pin passenger-pin">
      <span class="pin-type">P</span>
      <span class="pin-id">${passengerId}</span>
    </div>`,
    iconSize: [58, 24],
    iconAnchor: [29, 12],
    popupAnchor: [0, -12]
  });
}

function createDestinationIcon(passengerId) {
  return L.divIcon({
    className: 'rideeasy-destination-marker',
    html: `<div class="map-pin destination-pin">
      <span class="pin-type">D</span>
      <span class="pin-id">${passengerId}</span>
    </div>`,
    iconSize: [54, 22],
    iconAnchor: [27, 11],
    popupAnchor: [0, -11]
  });
}

function createPassengerPopupHtml(passenger) {
  return `
    <div class="map-popup">
      <div class="popup-title">${passenger.id} &middot; ${passenger.category}</div>
      <div><strong>Pickup:</strong> ${passenger.pickup.label}</div>
      <div><strong>Destination:</strong> ${passenger.destination.label}</div>
      <div><strong>Passengers:</strong> ${passenger.passengerCount}</div>
    </div>
  `;
}

function createDestinationPopupHtml(passenger) {
  return `
    <div class="map-popup">
      <div class="popup-title">Destination &middot; ${passenger.id}</div>
      <div>${passenger.destination.label}</div>
      <div><strong>Passenger:</strong> ${passenger.category} (${passenger.passengerCount} pax)</div>
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
  if (passengerMarkers.has(passenger.id)) {
    return updatePassengerMarker(passenger);
  }

  const pickupMarker = L.marker([passenger.lat, passenger.lng], {
    icon: createPassengerIcon(passenger.id)
  });
  pickupMarker.bindPopup(createPassengerPopupHtml(passenger));
  pickupMarker.addTo(passengerLayer);
  passengerMarkers.set(passenger.id, pickupMarker);

  if (passenger.destination?.lat && passenger.destination?.lng) {
    const destMarker = L.marker([passenger.destination.lat, passenger.destination.lng], {
      icon: createDestinationIcon(passenger.id)
    });
    destMarker.bindPopup(createDestinationPopupHtml(passenger));
    destMarker.addTo(passengerLayer);
    destinationMarkers.set(passenger.id, destMarker);
  }

  return pickupMarker;
}

export function updatePassengerMarker(passenger) {
  const existing = passengerMarkers.get(passenger.id);
  if (!existing) {
    return addPassengerMarker(passenger);
  }

  existing.setLatLng([passenger.lat, passenger.lng]);
  existing.setPopupContent(createPassengerPopupHtml(passenger));

  const existingDest = destinationMarkers.get(passenger.id);
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

/**
 * Show/hide existing vehicle markers based on active filter without deleting state.
 */
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

export function getMarkerCounts() {
  return {
    vehicles: vehicleMarkers.size,
    visibleVehicles: getFilteredVehicles().length,
    passengers: passengerMarkers.size,
    destinations: destinationMarkers.size
  };
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

  const activeRouteStatuses = new Set(['assigned', 'to_pickup', 'on_trip']);
  if (!activeRouteStatuses.has(booking.status) || !Array.isArray(booking.routeGeometry) || booking.routeGeometry.length < 2) {
    removeBookingRoute(booking.id);
    return null;
  }

  // Replace only this booking's polyline without disturbing other bookings' routes
  removeBookingRoute(booking.id);

  const isTrip = booking.status === 'on_trip';
  const polyline = L.polyline(booking.routeGeometry, {
    color: isTrip ? '#38bdf8' : '#a855f7',
    weight: 4,
    opacity: 0.9,
    dashArray: isTrip ? null : '8 6'
  });

  const etaText = booking.estimatedPickupMinutes ? `${booking.estimatedPickupMinutes} min` : '—';
  const estSuffix = booking.isEstimatedRoute ? ' (est.)' : '';
  const popupHtml = isTrip
    ? `<div class="map-popup">
         <div class="popup-title">${booking.id} &middot; On Trip</div>
         <div><strong>Destination:</strong> ${booking.destinationLabel || 'Selected destination'}</div>
         <div><strong>Trip ETA:</strong> ${etaText}${estSuffix}</div>
         <div><strong>Distance:</strong> ${formatDistanceKm(booking.routeDistanceMeters)}</div>
       </div>`
    : `<div class="map-popup">
         <div class="popup-title">${booking.id} &middot; To Pickup</div>
         <div><strong>Vehicle:</strong> ${booking.vehicle}</div>
         <div><strong>Est. Pickup:</strong> ${etaText}${estSuffix}</div>
         <div><strong>Distance:</strong> ${formatDistanceKm(booking.routeDistanceMeters)}</div>
       </div>`;

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

  mapInstance = L.map(container, {
    center: BENGALURU_CENTER,
    zoom: DEFAULT_ZOOM,
    zoomControl: true
  });

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
    } else if (changeType === 'vehicle:updated' && payload) {
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

  // Wire map toolbar controls
  document.getElementById('map-center-btn')?.addEventListener('click', resetMapView);
  document.getElementById('map-zoom-in-btn')?.addEventListener('click', () => mapInstance?.zoomIn());
  document.getElementById('map-zoom-out-btn')?.addEventListener('click', () => mapInstance?.zoomOut());

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
    resetMapView,
    getMarkerCounts
  };
}
