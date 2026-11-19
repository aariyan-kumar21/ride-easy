const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const analyticsService = require('../src/services/analytics.service');
const trafficService = require('../src/services/traffic.service');
const analyticsController = require('../src/controllers/analytics.controller');
const trafficController = require('../src/controllers/traffic.controller');

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    send(data) {
      this.body = data;
      return this;
    },
    set(headers) {
      Object.assign(this.headers, headers);
      return this;
    }
  };
}

describe('Bengaluru Traffic & Arrival Analytics Engine', () => {
  beforeEach(() => {
    analyticsService.resetAnalytics();
    trafficService.clearTileCache();
  });

  it('1. Returns simulated baseline for an area with 0 completed arrivals', () => {
    const data = analyticsService.getAreaAnalytics('Indiranagar', 'cab');
    assert.equal(data.area, 'Indiranagar');
    assert.equal(data.isBaseline, true);
    assert.equal(data.source, 'simulated_baseline');
    assert.equal(data.sampleCount, 0);
    assert.equal(typeof data.averageArrivalMinutes, 'number');
    assert.ok(data.averageArrivalMinutes > 0);
    assert.equal(typeof data.averageAssignmentDelayMinutes, 'number');
    assert.ok(data.disclaimer.includes('Average arrival time is calculated'));
  });

  it('2. Keeps simulated baseline until reaching minimum sample size of 5 completed arrivals', () => {
    // Record 4 arrivals (under threshold of 5)
    for (let i = 1; i <= 4; i++) {
      const bId = `BK-TEST-SAMP-${i}`;
      const created = new Date('2026-11-12T14:00:00.000Z');
      const assigned = new Date('2026-11-12T14:01:00.000Z');
      const arrived = new Date('2026-11-12T14:08:00.000Z'); // 8 min arrival, 1 min delay

      analyticsService.recordBookingCreated({
        bookingId: bId,
        pickup: { label: 'Indiranagar 100ft Rd', lat: 12.9784, lng: 77.6408 },
        vehicleType: 'cab',
        createdAt: created
      });
      analyticsService.recordVehicleAssigned(bId, assigned);
      analyticsService.recordVehicleArrived({ bookingId: bId, pickup: { label: 'Indiranagar 100ft Rd' }, vehicleType: 'cab' }, arrived);
    }

    let stats = analyticsService.getAreaAnalytics('Indiranagar', 'cab');
    assert.equal(stats.sampleCount, 4);
    assert.equal(stats.isBaseline, true);
    assert.equal(stats.source, 'simulated_baseline');

    // Record the 5th arrival
    const bId5 = 'BK-TEST-SAMP-5';
    analyticsService.recordBookingCreated({
      bookingId: bId5,
      pickup: { label: 'Indiranagar 100ft Rd', lat: 12.9784, lng: 77.6408 },
      vehicleType: 'cab',
      createdAt: new Date('2026-11-12T14:00:00.000Z')
    });
    analyticsService.recordVehicleAssigned(bId5, new Date('2026-11-12T14:01:30.000Z'));
    analyticsService.recordVehicleArrived({ bookingId: bId5, pickup: { label: 'Indiranagar 100ft Rd' }, vehicleType: 'cab' }, new Date('2026-11-12T14:09:00.000Z'));

    stats = analyticsService.getAreaAnalytics('Indiranagar', 'cab');
    assert.equal(stats.sampleCount, 5);
    assert.equal(stats.isBaseline, false);
    assert.equal(stats.source, 'actual_simulation');
    assert.ok(stats.averageArrivalMinutes >= 7 && stats.averageArrivalMinutes <= 9);
  });

  it('3. Classifies morning peak (7:30 - 11:00 AM) and evening peak (4:30 - 8:30 PM)', () => {
    // 08:00 AM -> Morning Peak
    const morning = analyticsService.getTimePeriod(8 * 3600);
    assert.equal(morning.isPeakHour, true);
    assert.equal(morning.period, 'morning_peak');

    // 07:15 AM -> Normal (before 7:30)
    const early = analyticsService.getTimePeriod(7 * 3600 + 15 * 60);
    assert.equal(early.isPeakHour, false);
    assert.equal(early.period, 'normal');

    // 05:30 PM (17:30) -> Evening Peak
    const evening = analyticsService.getTimePeriod(17 * 3600 + 30 * 60);
    assert.equal(evening.isPeakHour, true);
    assert.equal(evening.period, 'evening_peak');

    // 09:00 PM (21:00) -> Normal (after 20:30)
    const night = analyticsService.getTimePeriod(21 * 3600);
    assert.equal(night.isPeakHour, false);
    assert.equal(night.period, 'normal');
  });

  it('4. Ignores cancelled bookings in arrival analytics calculations', () => {
    const bId = 'BK-CANCEL-1';
    analyticsService.recordBookingCreated({
      bookingId: bId,
      pickup: { label: 'Koramangala 4th Block', lat: 12.9389, lng: 77.6211 },
      vehicleType: 'cab',
      createdAt: new Date()
    });
    analyticsService.recordCancellation(bId);

    analyticsService.recordVehicleArrived({ bookingId: bId, pickup: { label: 'Koramangala 4th Block' }, vehicleType: 'cab' }, new Date());

    const stats = analyticsService.getAreaAnalytics('Koramangala', 'cab');
    assert.equal(stats.sampleCount, 0);
  });

  it('5. getAllArrivalTimes returns all 15 Bengaluru areas with peak hour metadata', async () => {
    const req = { query: {} };
    const res = createMockRes();
    let nextCalled = false;
    await analyticsController.getAllArrivalTimes(req, res, (err) => { nextCalled = err; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.areas);
    assert.ok(res.body.areas.Indiranagar);
    assert.ok(res.body.areas.Koramangala);
    assert.ok(res.body.areas.Whitefield);
    assert.ok(res.body.areas['Electronic City']);
    assert.ok(res.body.areas.Marathahalli);
    assert.ok(res.body.areas['BTM Layout']);
    assert.ok(res.body.areas.Hebbal);
    assert.ok(typeof res.body.isPeakRushHour, 'boolean');
  });

  it('6. getTrafficStatus returns configuration and provider status', async () => {
    const req = {};
    const res = createMockRes();
    let nextCalled = false;
    await trafficController.getStatus(req, res, (err) => { nextCalled = err; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.provider, 'TomTom');
    assert.equal(typeof res.body.configured, 'boolean');
    assert.ok(res.body.message);
  });

  it('7. getTrafficTile gracefully falls back to transparent PNG without crashing', async () => {
    const req = { params: { z: '12', x: '2932', y: '1908' } };
    const res = createMockRes();
    let nextCalled = false;
    await trafficController.getTile(req, res, (err) => { nextCalled = err; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Content-Type'], 'image/png');
    assert.ok(res.body);
    assert.ok(Buffer.isBuffer(res.body));
    assert.ok(res.body.length > 0);
  });

  it('8. getTrafficTile rejects invalid zoom or tile coords with 400', async () => {
    const req = { params: { z: 'abc', x: 'invalid', y: 'tile' } };
    const res = createMockRes();
    let nextCalled = false;
    await trafficController.getTile(req, res, (err) => { nextCalled = err; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'ValidationError');
  });
});
