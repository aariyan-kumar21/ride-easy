const env = require('../config/env');

const EARTH_RADIUS_METERS = 6371000;
const ROAD_DETOUR_FACTOR = 1.35;
const FALLBACK_AVG_SPEED_KMPH = 24;
const DEFAULT_TIMEOUT_MS = 5000;

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function isValidPoint(point) {
  if (!point || typeof point !== 'object') return false;
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function haversineMeters(from, to) {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildFallbackEstimate(from, to, reason = 'OSRM unavailable') {
  const straightMeters = haversineMeters(from, to);
  const distanceMeters = Math.max(100, Math.round(straightMeters * ROAD_DETOUR_FACTOR));
  const metersPerSecond = (FALLBACK_AVG_SPEED_KMPH * 1000) / 3600;
  const durationSeconds = Math.max(60, Math.round(distanceMeters / metersPerSecond));
  const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));

  return {
    distanceMeters,
    durationSeconds,
    durationMinutes,
    geometry: [
      [Number(from.lat), Number(from.lng)],
      [Number(to.lat), Number(to.lng)]
    ],
    isEstimated: true,
    fallbackReason: reason
  };
}

/**
 * Fetch a driving route from OSRM and convert GeoJSON [lng, lat] coordinates
 * into Leaflet-compatible [lat, lng] coordinates.
 * Falls back cleanly on timeouts, invalid routes, or API failures.
 */
async function getRouteEstimate(from, to, options = {}) {
  if (!isValidPoint(from) || !isValidPoint(to)) {
    const err = new Error('Invalid origin or destination coordinates');
    err.statusCode = 400;
    throw err;
  }

  const fetchImpl = options.fetchFn || globalThis.fetch;
  const baseUrl = (options.baseUrl || env.osrmBaseUrl || 'https://router.project-osrm.org').replace(/\/+$/, '');
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);

  if (typeof fetchImpl !== 'function') {
    return buildFallbackEstimate(from, to, 'Fetch API unavailable');
  }

  const url = `${baseUrl}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) {
      return buildFallbackEstimate(from, to, `HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data || data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
      return buildFallbackEstimate(from, to, 'No route found');
    }

    const route = data.routes[0];
    const coords = route.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
      return buildFallbackEstimate(from, to, 'Invalid route geometry');
    }

    // Convert OSRM [longitude, latitude] -> Leaflet [latitude, longitude]
    const leafletGeometry = coords.map(([lng, lat]) => [lat, lng]);
    const distanceMeters = Math.round(Number(route.distance) || 0);
    const durationSeconds = Math.round(Number(route.duration) || 0);
    const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));

    return {
      distanceMeters,
      durationSeconds,
      durationMinutes,
      geometry: leafletGeometry,
      isEstimated: false
    };
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'OSRM request timed out' : 'OSRM request failed';
    return buildFallbackEstimate(from, to, reason);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  getRouteEstimate,
  haversineMeters,
  isValidPoint
};
