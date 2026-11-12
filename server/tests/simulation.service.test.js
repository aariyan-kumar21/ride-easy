const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const simulationService = require('../src/services/simulation.service');

function matchesFilter(doc, filter) {
  return Object.entries(filter).every(([key, condition]) => {
    const value = doc[key];
    if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
      if ('$in' in condition) return condition.$in.includes(value);
      if ('$ne' in condition) return value !== condition.$ne;
    }
    return value === condition;
  });
}

function createInMemoryModel(initialDocs) {
  const docs = initialDocs.map((d) => ({ ...d }));
  return {
    docs,
    async find(filter = {}) {
      return docs.filter((d) => matchesFilter(d, filter)).map((d) => ({ ...d }));
    },
    async findOne(filter = {}) {
      const found = docs.find((d) => matchesFilter(d, filter));
      return found ? { ...found } : null;
    },
    async updateOne(filter, update) {
      const idx = docs.findIndex((d) => matchesFilter(d, filter));
      if (idx === -1) return { modifiedCount: 0 };
      Object.assign(docs[idx], update.$set || {});
      return { modifiedCount: 1 };
    }
  };
}

describe('Vehicle Movement Simulation Service', () => {
  beforeEach(async () => {
    await simulationService.resetSimulation({ skipDbReset: true });
  });

  it('1. Interpolates along multi-segment road geometry rather than straight line', () => {
    // L-shaped road: (0,0) -> (0, 0.01) -> (0.01, 0.01)
    const bentRoute = [
      [12.97, 77.60],
      [12.97, 77.61],
      [12.98, 77.61]
    ];
    const profile = simulationService.buildRouteProfile(bentRoute);
    // Halfway along first horizontal segment should still have lat === 12.97
    const midFirstSeg = simulationService.interpolateAlongRoute(profile, profile.cumulative[1] * 0.5);
    assert.equal(midFirstSeg.lat, 12.97);
    assert.ok(midFirstSeg.lng > 77.60 && midFirstSeg.lng < 77.61);

    // Partway into second vertical segment should have lng === 77.61
    const midSecondSeg = simulationService.interpolateAlongRoute(
      profile,
      profile.cumulative[1] + (profile.totalDistance - profile.cumulative[1]) * 0.5
    );
    assert.equal(midSecondSeg.lng, 77.61);
    assert.ok(midSecondSeg.lat > 12.97 && midSecondSeg.lat < 12.98);
  });

  it('2. Pause and resume preserve exact vehicle progress', async () => {
    const BookingModel = createInMemoryModel([
      {
        bookingId: 'BK-SIM-1',
        vehicleId: 'C101',
        status: 'assigned',
        pickup: { lat: 12.9756, lng: 77.6066, label: 'MG Road' },
        destination: { lat: 12.9784, lng: 77.6408, label: 'Indiranagar' },
        routeGeometry: [
          [12.97, 77.60],
          [12.9756, 77.6066]
        ]
      }
    ]);
    const VehicleModel = createInMemoryModel([
      { vehicleId: 'C101', status: 'to_pickup', latitude: 12.97, longitude: 77.60, currentBookingId: 'BK-SIM-1' }
    ]);

    await simulationService.startSimulation({ BookingModel, skipTimer: true });
    await simulationService.stepSimulation({ BookingModel, VehicleModel, stepMeters: 100 });
    const pausedState = simulationService.pauseSimulation();
    assert.equal(pausedState.status, 'Paused');
    const progressBeforePause = pausedState.tracks[0].distanceTraveled;
    assert.equal(progressBeforePause, 100);

    // Stepping while paused should do nothing
    const noOp = await simulationService.stepSimulation({ BookingModel, VehicleModel, stepMeters: 100 });
    assert.equal(noOp.stepped, false);

    await simulationService.resumeSimulation({ BookingModel, skipTimer: true });
    await simulationService.stepSimulation({ BookingModel, VehicleModel, stepMeters: 100 });
    const afterResume = simulationService.getSimulationState();
    assert.equal(afterResume.tracks[0].distanceTraveled, 200);
  });

  it('3. Transitions through arrived -> on_trip -> completed and triggers queue allocation', async () => {
    const BookingModel = createInMemoryModel([
      {
        bookingId: 'BK-SIM-2',
        vehicleId: 'C101',
        status: 'assigned',
        pickup: { lat: 12.971, lng: 77.601, label: 'Pickup' },
        destination: { lat: 12.972, lng: 77.602, label: 'Dest' },
        routeGeometry: [
          [12.97, 77.60],
          [12.971, 77.601]
        ]
      }
    ]);
    const VehicleModel = createInMemoryModel([
      { vehicleId: 'C101', status: 'to_pickup', latitude: 12.97, longitude: 77.60, currentBookingId: 'BK-SIM-2' }
    ]);

    let allocationTriggered = 0;
    const mockRouting = {
      async getRouteEstimate() {
        return {
          distanceMeters: 160,
          durationSeconds: 30,
          durationMinutes: 1,
          geometry: [
            [12.971, 77.601],
            [12.972, 77.602]
          ],
          isEstimated: false
        };
      }
    };
    const mockAllocation = {
      async runAllocationCycle() {
        allocationTriggered += 1;
        return { allocated: [], queued: [] };
      }
    };

    await simulationService.startSimulation({ BookingModel, routingService: mockRouting, skipTimer: true });

    // Step enough to reach pickup (~155m)
    await simulationService.stepSimulation({
      BookingModel,
      VehicleModel,
      routingService: mockRouting,
      allocationService: mockAllocation,
      stepMeters: 500
    });

    assert.equal(BookingModel.docs[0].status, 'on_trip');
    assert.equal(VehicleModel.docs[0].status, 'on_trip');
    const midState = simulationService.getSimulationState();
    assert.ok(midState.notifications.some((n) => n.type === 'pickup_arrived'));

    // Step enough to reach destination
    await simulationService.stepSimulation({
      BookingModel,
      VehicleModel,
      routingService: mockRouting,
      allocationService: mockAllocation,
      stepMeters: 500
    });

    assert.equal(BookingModel.docs[0].status, 'completed');
    assert.equal(VehicleModel.docs[0].status, 'available');
    assert.equal(VehicleModel.docs[0].currentBookingId, null);
    assert.equal(allocationTriggered, 1);
    assert.equal(simulationService.getSimulationState().activeTracksCount, 0);
  });
});

