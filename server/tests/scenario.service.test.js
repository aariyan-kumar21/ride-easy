const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getScenarioBlueprint, generateScenario } = require('../src/services/scenario.service');

function matchesFilter(doc, filter) {
  return Object.entries(filter).every(([key, condition]) => {
    const value = doc[key];
    if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
      if ('$in' in condition) return condition.$in.includes(value);
      if ('$gte' in condition) return value >= condition.$gte;
    }
    return value === condition;
  });
}

function createScenarioModels(blueprint) {
  const bookings = blueprint.bookings.map((b) => ({ ...b }));
  const vehicles = blueprint.vehicles.map((v) => ({ ...v }));

  const makeModel = (docs) => ({
    docs,
    async find(filter = {}) {
      return docs.filter((d) => matchesFilter(d, filter)).map((d) => ({ ...d }));
    },
    async findOneAndUpdate(filter, update) {
      const idx = docs.findIndex((d) => matchesFilter(d, filter));
      if (idx === -1) return null;
      Object.assign(docs[idx], update.$set || {});
      return { ...docs[idx] };
    },
    async updateOne(filter, update) {
      const idx = docs.findIndex((d) => matchesFilter(d, filter));
      if (idx === -1) return { modifiedCount: 0 };
      Object.assign(docs[idx], update.$set || {});
      return { modifiedCount: 1 };
    }
  });

  return {
    BookingModel: makeModel(bookings),
    VehicleModel: makeModel(vehicles)
  };
}

const mockRouting = {
  async getRouteEstimate(from, to) {
    return {
      distanceMeters: 2000,
      durationSeconds: 300,
      durationMinutes: 5,
      geometry: [
        [from.lat, from.lng],
        [to.lat, to.lng]
      ],
      isEstimated: false
    };
  }
};

describe('Predefined Demo Scenarios', () => {
  it('Scenario 1: Normal Daytime allocates 5 bookings cleanly', async () => {
    const bp = getScenarioBlueprint('normal_daytime');
    const { BookingModel, VehicleModel } = createScenarioModels(bp);

    const res = await generateScenario('normal_daytime', {
      BookingModel,
      VehicleModel,
      routingService: mockRouting,
      skipDbClear: true
    });

    assert.equal(res.simulatedTimeLabel, '14:00 (Daytime)');
    assert.equal(res.allocation.allocated.length, 5);
    assert.equal(res.allocation.queued.length, 0);
  });

  it('Scenario 2: Peak-Hour Demand places excess requests into priority-ordered queue', async () => {
    const bp = getScenarioBlueprint('peak_hour');
    const { BookingModel, VehicleModel } = createScenarioModels(bp);

    const res = await generateScenario('peak_hour', {
      BookingModel,
      VehicleModel,
      routingService: mockRouting,
      skipDbClear: true
    });

    assert.equal(res.allocation.allocated.length, 4);
    assert.equal(res.allocation.queued.length, 6);
    // Senior citizens (+40) should be allocated before regular passengers
    const allocatedIds = res.allocation.allocated.map((a) => a.bookingId);
    assert.ok(allocatedIds.includes('SC2-BK-02'));
    assert.ok(allocatedIds.includes('SC2-BK-04'));
  });

  it('Scenario 3: Night-Time Priority (10:30 PM) applies woman night bonus (+40) and senior (+20)', async () => {
    const bp = getScenarioBlueprint('night_priority');
    const { BookingModel, VehicleModel } = createScenarioModels(bp);

    const res = await generateScenario('night_priority', {
      BookingModel,
      VehicleModel,
      routingService: mockRouting,
      skipDbClear: true
    });

    assert.equal(res.simulatedTimeLabel, '22:30 (Night Hours)');
    assert.equal(res.allocation.allocated.length, 3);
    assert.equal(res.allocation.queued.length, 3);
    const womanAlloc = res.allocation.allocated.find((a) => a.bookingId === 'SC3-BK-06' || a.bookingId === 'SC3-BK-04');
    assert.ok(womanAlloc);
    assert.equal(womanAlloc.priorityBreakdown.isNightHours, true);
    assert.equal(womanAlloc.priorityBreakdown.categoryBonus, 40);
  });

  it('Scenario 4: Group Booking excludes insufficient-capacity vehicles', async () => {
    const bp = getScenarioBlueprint('group_booking');
    const { BookingModel, VehicleModel } = createScenarioModels(bp);

    const res = await generateScenario('group_booking', {
      BookingModel,
      VehicleModel,
      routingService: mockRouting,
      skipDbClear: true
    });

    // 6-pax booking must get Cab2 (6 seats); 5-pax booking must be queued since only one 6-seat cab exists
    const sixPax = res.allocation.allocated.find((a) => a.bookingId === 'SC4-BK-01');
    assert.equal(sixPax.vehicleId, 'Cab2');
    assert.equal(sixPax.capacity, 6);
    assert.ok(res.allocation.queued.some((q) => q.bookingId === 'SC4-BK-02'));
  });

  it('Scenario 5: Vehicle Cancellation releases booking and reassigns to backup vehicle', async () => {
    const bp = getScenarioBlueprint('vehicle_cancellation');
    const { BookingModel, VehicleModel } = createScenarioModels(bp);

    const res = await generateScenario('vehicle_cancellation', {
      BookingModel,
      VehicleModel,
      routingService: mockRouting,
      skipDbClear: true
    });

    assert.ok(res.cancellationEvent);
    assert.notEqual(res.cancellationEvent.cancelledVehicleId, res.cancellationEvent.reallocatedTo);
    assert.ok(res.cancellationEvent.reallocatedTo);
    assert.equal(res.allocation.allocated[0].bookingId, 'SC5-BK-01');
  });
});

