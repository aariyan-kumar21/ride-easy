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
const vehicleHeadings = new Map(); // vehicleId -> 'left' | 'right'

/**
 * Category-based color mapping:
 * - Women: Pink (#F52D91)
 * - Regular: Blue (#3188F5)
 * - Senior citizens: Yellow (#F4B928)
 */
export function getCategoryColor(category) {
  const cat = String(category || '').toLowerCase();
  if (cat.includes('woman') || cat.includes('women')) return '#F52D91';
  if (cat.includes('senior')) return '#F4B928';
  return '#3188F5';
}

export function getPassengerColor(categoryOrBooking) {
  if (typeof categoryOrBooking === 'object' && categoryOrBooking !== null) {
    return getCategoryColor(categoryOrBooking.rawCategory || categoryOrBooking.category);
  }
  return getCategoryColor(categoryOrBooking);
}

export function getShortPassengerId(userId) {
  const str = String(userId || '');
  if (str.startsWith('U10') && str.length === 4) {
    return 'U' + str.slice(3);
  }
  return str;
}

/**
 * Custom Vehicle Leaflet Marker Icon
 * - Uses exact custom attached assets:
 *   - Cab: /assets/cab-icon.png (Yellow car)
 *   - Auto: /assets/auto-icon.png (Green & Yellow auto-rickshaw)
 * - Vehicle icon moves along OSRM route.
 * - Flips horizontally based on heading (East vs West) without distortion.
 */
function createVehicleIcon(vehicle) {
  const isAuto = String(vehicle.vehicleType).toLowerCase() === 'auto';
  const iconSrc = isAuto ? '/assets/auto-icon.png' : '/assets/cab-icon.png';
  const heading = vehicleHeadings.get(vehicle.id) || 'left';
  // Default images face left. If moving East (right), flip horizontally:
  const flipStyle = heading === 'right' ? 'transform: scaleX(-1);' : '';

  const isAssigned = vehicle.status === 'assigned' || vehicle.status === 'to_pickup';
  const isOnTrip = vehicle.status === 'on_trip';

  let ringClass = 'veh-ring-avail';
  if (isAssigned) ringClass = 'veh-ring-assigned';
  else if (isOnTrip) ringClass = 'veh-ring-ontrip';

  return L.divIcon({
    className: 'urban-vehicle-marker',
    html: `
      <div class="vehicle-map-pin ${ringClass}" title="${vehicle.id} &middot; ${vehicle.vehicleType} (${vehicle.status})">
        <img src="${iconSrc}" class="vehicle-icon-img" style="${flipStyle}" alt="${vehicle.id}" />
      </div>
    `,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -21]
  });
}

function createVehiclePopupHtml(vehicle) {
  const isAuto = String(vehicle.vehicleType).toLowerCase() === 'auto';
  const iconSrc = isAuto ? '/assets/auto-icon.png' : '/assets/cab-icon.png';
  return `
    <div class="map-popup">
      <div class="popup-vehicle-header">
        <img src="${iconSrc}" class="popup-veh-img" alt="${vehicle.id}" />
        <div>
          <div class="popup-clean-title" style="margin:0;">${vehicle.id} &middot; ${isAuto ? 'Auto' : 'Cab'}</div>
          <span class="status-pill-badge ${vehicle.status}" style="font-size:10px; padding:2px 6px;">${vehicle.status.replace('_', ' ')}</span>
        </div>
      </div>
      <div style="margin-top:0.4rem;"><strong>Capacity:</strong> ${vehicle.capacity} seats</div>
      ${vehicle.currentBookingId ? `<div><strong>Assigned Ride:</strong> ${vehicle.currentBookingId}</div>` : ''}
      ${vehicle.area ? `<div><strong>Location:</strong> ${vehicle.area}</div>` : ''}
    </div>
  `;
}

/**
 * Custom Passenger Leaflet Marker Icon
 * - Clean white person/user SVG icon inside circular badge with category-based background.
 * - Women: Pink (#F52D91)
 * - Regular: Blue (#3188F5)
 * - Senior: Yellow (#F4B928)
 */
function createPassengerIcon(passenger) {
  const color = getCategoryColor(passenger.rawCategory || passenger.category);
  const pName = passenger.passengerName || passenger.userId || 'Passenger';

  return L.divIcon({
    className: 'urban-passenger-marker',
    html: `
      <div class="passenger-map-badge" style="background-color: ${color};" title="${pName} (${passenger.category})">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17]
  });
}

function createDestinationIcon(passenger) {
  const color = getCategoryColor(passenger.rawCategory || passenger.category);
  return L.divIcon({
    className: 'urban-passenger-marker',
    html: `
      <div class="destination-map-badge" style="border-color:${color}; color:${color};" title="Destination for ${passenger.passengerName || passenger.userId}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
          <line x1="4" y1="22" x2="4" y2="15"/>
        </svg>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28]
  });
}

function createPassengerPopupHtml(passenger) {
  const color = getCategoryColor(passenger.rawCategory || passenger.category);
  const pName = passenger.passengerName || passenger.userId || 'Passenger';
  return `
    <div class="map-popup">
      <div class="popup-clean-title" style="display:flex; align-items:center; gap:0.4rem;">
        <span style="display:inline-block; width:9px; height:9px; border-radius:50%; background-color:${color};"></span>
        <span>${pName}</span>
      </div>
      <div><strong>Category:</strong> ${passenger.category || 'Regular'}</div>
      <div><strong>Pickup:</strong> ${passenger.pickupLabel || passenger.pickup?.label || 'Pickup Location'}</div>
      <div><strong>Destination:</strong> ${passenger.destinationLabel || passenger.destination?.label || 'Destination'}</div>
      <div><strong>Passengers:</strong> ${passenger.passengerCount || 1}</div>
      ${passenger.vehicle && passenger.vehicle !== 'Pending' ? `<div><strong>Assigned Vehicle:</strong> ${passenger.vehicle}</div>` : ''}
      <div style="font-size:10px; color:var(--text-muted); margin-top:0.35rem;">Booking Ref: ${passenger.bookingId || passenger.id}</div>
    </div>
  `;
}

function createDestinationPopupHtml(passenger) {
  const color = getCategoryColor(passenger.rawCategory || passenger.category);
  const pName = passenger.passengerName || passenger.userId || 'Passenger';
  return `
    <div class="map-popup">
      <div class="popup-clean-title" style="display:flex; align-items:center; gap:0.4rem; color:${color};">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/></svg>
        <span>Destination &middot; ${pName}</span>
      </div>
      <div>${passenger.destinationLabel || passenger.destination?.label || 'Destination Point'}</div>
      <div><strong>Passenger:</strong> ${pName} (${passenger.category || 'Regular'})</div>
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

  const prevLatLng = existing.getLatLng();
  if (prevLatLng && vehicle.lng != null) {
    const dLng = vehicle.lng - prevLatLng.lng;
    if (dLng > 0.00004) {
      vehicleHeadings.set(vehicle.id, 'right');
    } else if (dLng < -0.00004) {
      vehicleHeadings.set(vehicle.id, 'left');
    }
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
  vehicleHeadings.delete(vehicleId);
  return true;
}

export function addPassengerMarker(passenger) {
  if (!passengerLayer) return null;
  const pId = passenger.id || passenger.bookingId || passenger.userId;
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
  const pId = passenger.id || passenger.bookingId || passenger.userId;
  const existing = passengerMarkers.get(pId);
  if (!existing) {
    return addPassengerMarker(passenger);
  }

  existing.setLatLng([passenger.lat, passenger.lng]);
  existing.setIcon(createPassengerIcon(passenger));
  existing.setPopupContent(createPassengerPopupHtml(passenger));

  const existingDest = destinationMarkers.get(pId);
  if (existingDest && passenger.destination) {
    existingDest.setLatLng([passenger.destination.lat, passenger.destination.lng]);
    existingDest.setIcon(createDestinationIcon(passenger));
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

export function clearAllPassengerMarkersAndRoutes() {
  if (passengerLayer) passengerLayer.clearLayers();
  passengerMarkers.clear();
  destinationMarkers.clear();
  if (routeLayerGroup) routeLayerGroup.clearLayers();
  routeLayers.clear();
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

  const routeColor = getPassengerColor(booking.rawCategory || booking.category);
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
  const pName = booking.passengerName || booking.userId || 'Passenger';

  const popupHtml = `
    <div class="map-popup">
      <div class="popup-clean-title" style="color:${routeColor};">${pName} &middot; Route</div>
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
    if (['assigned', 'to_pickup', 'on_trip', 'requested', 'queued'].includes(b.status)) {
      const layer = upsertBookingRoute(b);
      if (layer) activeIds.add(b.id);
    }
  });
  routeLayers.forEach((_layer, bookingId) => {
    if (!activeIds.has(bookingId)) {
      removeBookingRoute(bookingId);
    }
  });
}

function syncAllMarkersFromState() {
  const { vehicles, bookings } = getState();

  // 1. Sync vehicles
  vehicles.forEach(updateVehicleMarker);
  applyVehicleFilter();

  // 2. Active bookings that require passenger markers (deduplicated by bookingId)
  const seenMapIds = new Set();
  const activeBookings = [];
  for (const b of bookings) {
    if (!b || !b.id) continue;
    if (seenMapIds.has(b.id)) continue;
    if (
      ['requested', 'queued', 'assigned', 'to_pickup', 'on_trip'].includes(b.status) &&
      Array.isArray(b.pickup) &&
      b.pickup.length >= 2
    ) {
      seenMapIds.add(b.id);
      activeBookings.push(b);
    }
  }

  const activeBookingIds = new Set(activeBookings.map((b) => b.id));

  // Group active bookings by pickup location proximity (~35 meters / 0.00035 deg)
  const clusters = [];
  activeBookings.forEach((b) => {
    const lat = b.pickup[0];
    const lng = b.pickup[1];
    let found = null;
    for (const c of clusters) {
      const dLat = Math.abs(lat - c.center[0]);
      const dLng = Math.abs(lng - c.center[1]);
      if (dLat < 0.00035 && dLng < 0.00035) {
        found = c;
        break;
      }
    }
    if (found) {
      found.bookings.push(b);
    } else {
      clusters.push({ center: [lat, lng], bookings: [b] });
    }
  });

  // Distribute markers in each cluster with controlled geographic offset
  clusters.forEach((cluster) => {
    const N = cluster.bookings.length;
    const centerLat = cluster.center[0];
    const centerLng = cluster.center[1];

    cluster.bookings.forEach((b, index) => {
      let displayLat = centerLat;
      let displayLng = centerLng;

      if (N > 1) {
        // Small radial offset (~22 meters) so every passenger marker is distinctly visible and clickable
        const angle = (2 * Math.PI * index) / N;
        const radiusLat = 0.00020;
        const radiusLng = 0.00020 / Math.cos((centerLat * Math.PI) / 180);
        displayLat = centerLat + radiusLat * Math.sin(angle);
        displayLng = centerLng + radiusLng * Math.cos(angle);
      }

      addPassengerMarker({
        id: b.id,
        bookingId: b.id,
        userId: b.userId,
        passengerName: b.passengerName,
        category: b.category,
        rawCategory: b.rawCategory,
        passengerCount: b.passengerCount,
        vehicle: b.vehicle,
        lat: displayLat,
        lng: displayLng,
        realPickup: b.pickup,
        pickupLabel: b.pickupLabel,
        destination: b.destination
          ? {
              lat: b.destination[0],
              lng: b.destination[1],
              label: b.destinationLabel
            }
          : null,
        destinationLabel: b.destinationLabel
      });
    });
  });

  // Clean up passenger markers for bookings that completed or cancelled
  passengerMarkers.forEach((_marker, bId) => {
    if (!activeBookingIds.has(bId)) {
      removePassengerMarker(bId);
    }
  });

  // 3. Sync routes
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
    subdomains: ['a', 'b', 'c'],
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
      syncAllMarkersFromState();
      if (payload.vehicle && payload.vehicle !== 'Pending') {
        const vehicle = state.vehicles.find((v) => v.id === payload.vehicle);
        if (vehicle) updateVehicleMarker(vehicle);
      }
    } else if (changeType === 'filter:changed') {
      applyVehicleFilter();
    } else if (changeType === 'state:reset' || changeType === 'simulation:cleared') {
      clearAllPassengerMarkersAndRoutes();
      syncAllMarkersFromState();
      resetMapView();
    } else if (changeType === 'simulation:completed') {
      syncAllMarkersFromState();
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
    clearAllPassengerMarkersAndRoutes,
    resetMapView
  };
}
