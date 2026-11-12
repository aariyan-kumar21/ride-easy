const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getRouteEstimate, isValidPoint } = require('../src/services/routing.service');

const MG_ROAD = { lat: 12.9756, lng: 77.6066 };
const INDIRANAGAR = { lat: 12.9784, lng: 77.6408 };

describe('OSRM Routing Service', () => {
  it('1. Parses OSRM GeoJSON route and converts [lng, lat] to Leaflet [lat, lng]', async () => {
    const mockFetch = async (url) => {
      assert.match(url, /\/route\/v1\/driving\/77\.6066,12\.9756;77\.6408,12\.9784\?overview=full&geometries=geojson/);
      return {
        ok: true,
        async json() {
          return {
            code: 'Ok',
            routes: [
              {
                distance: 4123.6,
                duration: 620.4,
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [77.6066, 12.9756],
                    [77.625, 12.977],
                    [77.6408, 12.9784]
                  ]
                }
              }
            ]
          };
        }
      };
    };

    const route = await getRouteEstimate(MG_ROAD, INDIRANAGAR, { fetchFn: mockFetch });
    assert.equal(route.isEstimated, false);
    assert.equal(route.distanceMeters, 4124);
    assert.equal(route.durationSeconds, 620);
    assert.equal(route.durationMinutes, 10);
    assert.deepEqual(route.geometry, [
      [12.9756, 77.6066],
      [12.977, 12.925 === 12.925 ? 77.625 : 0],
      [12.9784, 77.6408]
    ]);
  });

  it('2. Rejects invalid coordinates with 400 error', async () => {
    assert.equal(isValidPoint({ lat: 95, lng: 77.6 }), false);
    await assert.rejects(
      () => getRouteEstimate({ lat: 95, lng: 77.6 }, INDIRANAGAR),
      (err) => err.statusCode === 400
    );
  });

  it('3. Falls back cleanly on OSRM timeout without crashing', async () => {
    const slowFetch = (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });

    const route = await getRouteEstimate(MG_ROAD, INDIRANAGAR, {
      fetchFn: slowFetch,
      timeoutMs: 25
    });

    assert.equal(route.isEstimated, true);
    assert.equal(route.fallbackReason, 'OSRM request timed out');
    assert.ok(route.distanceMeters > 0);
    assert.ok(route.durationSeconds > 0);
    assert.equal(route.geometry.length, 2);
  });

  it('4. Falls back cleanly on OSRM HTTP error or NoRoute response', async () => {
    const errorFetch = async () => ({ ok: false, status: 503 });
    const res1 = await getRouteEstimate(MG_ROAD, INDIRANAGAR, { fetchFn: errorFetch });
    assert.equal(res1.isEstimated, true);
    assert.equal(res1.fallbackReason, 'HTTP 503');

    const noRouteFetch = async () => ({
      ok: true,
      async json() {
        return { code: 'NoRoute', routes: [] };
      }
    });
    const res2 = await getRouteEstimate(MG_ROAD, INDIRANAGAR, { fetchFn: noRouteFetch });
    assert.equal(res2.isEstimated, true);
    assert.equal(res2.fallbackReason, 'No route found');
  });
});

