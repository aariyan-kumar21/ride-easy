const EARTH_RADIUS_METERS = 6371000;
const ROAD_DETOUR_FACTOR = 1.35;
const FALLBACK_AVG_SPEED_KMPH = 24; // Urban Bengaluru demo speed

function toRadians(deg) {
  return (deg * Math.PI) / 180;
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

/**
 * Clean routing-service interface.
 * Uses a clearly labelled Haversine road-factor estimate until live OSRM is wired.
 */
async function getRouteEstimate(from, to) {
  const straightMeters = haversineMeters(from, to);
  const distanceMeters = Math.max(100, Math.round(straightMeters * ROAD_DETOUR_FACTOR));
  const metersPerMinute = (FALLBACK_AVG_SPEED_KMPH * 1000) / 60;
  const durationMinutes = Math.max(1, Math.round(distanceMeters / metersPerMinute));

  return {
    distanceMeters,
    durationMinutes,
    geometry: [
      [from.lat, from.lng],
      [to.lat, to.lng]
    ],
    isEstimated: true,
    provider: 'fallback-estimate'
  };
}

module.exports = { getRouteEstimate, haversineMeters };

