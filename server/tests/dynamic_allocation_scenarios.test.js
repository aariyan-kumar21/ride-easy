const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { runAllocationCycle } = require('../src/services/allocation.service');
const { calculatePriority, sortRequestsByPriority, isNightHour } = require('../src/services/priority.service');
const { getTimeCategory } = require('../src/config/priority.config');

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

function createInMemoryModel(initialDocs) {
  const docs = initialDocs.map((d) => ({ ...d }));

  return {
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
  };
}

const MG_ROAD = { lat: 12.9756, lng: 77.6066, label: 'MG Road' };
const INDIRANAGAR = { lat: 12.9784, lng: 77.6408, label: 'Indiranagar' };
const KORAMANGALA = { lat: 12.9352, lng: 77.6245, label: 'Koramangala' };

describe('Dynamic Time-Based Priority Allocation Scenarios', () => {
  it('Scenario A — Two regular passengers at 02:00 PM get sequential distinct nearest cabs', async () => {
    const daytime = new Date(2026, 10, 12, 14, 0, 0); // 14:00
    const cat = getTimeCategory(14, 0);
    assert.equal(cat.id, 'normal_daytime');
    assert.equal(cat.isNight, false);

    const BookingModel = createInMemoryModel([
      { bookingId: 'BK-REG-1', category: 'regular', vehicleType: 'cab', passengerCount: 1, pickup: MG_ROAD, status: 'requested', sequenceNumber: 1, createdAt: new Date(2026, 10, 12, 13, 50, 0) },
      { bookingId: 'BK-REG-2', category: 'regular', vehicleType: 'cab', passengerCount: 1, pickup: MG_ROAD, status: 'requested', sequenceNumber: 2, createdAt: new Date(2026, 10, 12, 13, 55, 0) }
    ]);

    const VehicleModel = createInMemoryModel([
      { vehicleId: 'Cab1', vehicleType: 'cab', capacity: 4, status: 'available', currentBookingId: null, latitude: 12.9756, longitude: 77.6066 }, // At MG Road (0 ETA)
      { vehicleId: 'Cab2', vehicleType: 'cab', capacity: 4, status: 'available', currentBookingId: null, latitude: 12.9784, longitude: 77.6408 }, // At Indiranagar (~4 min ETA)
      { vehicleId: 'Cab3', vehicleType: 'cab', capacity: 4, status: 'available', currentBookingId: null, latitude: 12.9352, longitude: 77.6245 }  // At Koramangala
    ]);

    const result = await runAllocationCycle({ BookingModel, VehicleModel, now: daytime });

    assert.equal(result.allocated.length, 2);
    assert.equal(result.allocated[0].bookingId, 'BK-REG-1');
    assert.equal(result.allocated[0].vehicleId, 'Cab1'); // Nearest to Passenger 1
    assert.equal(result.allocated[1].bookingId, 'BK-REG-2');
    assert.equal(result.allocated[1].vehicleId, 'Cab2'); // Nearest remaining to Passenger 2

    // Both received distinct cabs
    assert.notEqual(result.allocated[0].vehicleId, result.allocated[1].vehicleId);
  });

  it('Scenario B — Woman books during night hours (10:00 PM) and gets priority over earlier regular bookings', async () => {
    const nightTime = new Date(2026, 10, 12, 22, 0, 0); // 22:00
    const cat = getTimeCategory(22, 0);
    assert.equal(cat.id, 'night');
    assert.equal(cat.isNight, true);

    const BookingModel = createInMemoryModel([
      { bookingId: 'BK-REG-A', category: 'regular', vehicleType: 'cab', passengerCount: 1, pickup: MG_ROAD, status: 'requested', sequenceNumber: 1, createdAt: new Date(2026, 10, 12, 21, 50, 0) },
      { bookingId: 'BK-REG-B', category: 'regular', vehicleType: 'cab', passengerCount: 1, pickup: MG_ROAD, status: 'requested', sequenceNumber: 2, createdAt: new Date(2026, 10, 12, 21, 52, 0) },
      { bookingId: 'BK-WOM-C', category: 'woman', vehicleType: 'cab', passengerCount: 1, pickup: MG_ROAD, status: 'requested', sequenceNumber: 3, createdAt: new Date(2026, 10, 12, 21, 55, 0) }
    ]);

    const VehicleModel = createInMemoryModel([
      { vehicleId: 'Cab1', vehicleType: 'cab', capacity: 4, status: 'available', currentBookingId: null, latitude: 12.9756, longitude: 77.6066 },
      { vehicleId: 'Cab2', vehicleType: 'cab', capacity: 4, status: 'available', currentBookingId: null, latitude: 12.9784, longitude: 77.6408 },
      { vehicleId: 'Cab3', vehicleType: 'cab', capacity: 4, status: 'available', currentBookingId: null, latitude: 12.9352, longitude: 77.6245 }
    ]);

    const result = await runAllocationCycle({ BookingModel, VehicleModel, now: nightTime });

    assert.equal(result.allocated.length, 3);
    // Woman C (Tier 1 at night) allocated first despite booking later!
    assert.equal(result.allocated[0].bookingId, 'BK-WOM-C');
    assert.equal(result.allocated[0].vehicleId, 'Cab1');
    assert.equal(result.allocated[0].priorityTier, 1);

    // Regular A allocated second
    assert.equal(result.allocated[1].bookingId, 'BK-REG-A');
    assert.equal(result.allocated[1].vehicleId, 'Cab2');

    // Regular B allocated third
    assert.equal(result.allocated[2].bookingId, 'BK-REG-B');
    assert.equal(result.allocated[2].vehicleId, 'Cab3');
  });

  it('Scenario C — Senior citizen books during daytime (02:00 PM) and gets priority over regular & woman bookings', async () => {
    const daytime = new Date(2026, 10, 12, 14, 0, 0);

    const BookingModel = createInMemoryModel([
      { bookingId: 'BK-REG-A', category: 'regular', vehicleType: 'cab', passengerCount: 1, pickup: MG_ROAD, status: 'requested', sequenceNumber: 1, createdAt: new Date(2026, 10, 12, 13, 50, 0) },
      { bookingId: 'BK-WOM-B', category: 'woman', vehicleType: 'cab', passengerCount: 1, pickup: MG_ROAD, status: 'requested', sequenceNumber: 2, createdAt: new Date(2026, 10, 12, 13, 52, 0) },
      { bookingId: 'BK-SEN-C', category: 'senior', vehicleType: 'cab', passengerCount: 1, pickup: MG_ROAD, status: 'requested', sequenceNumber: 3, createdAt: new Date(2026, 10, 12, 13, 55, 0) }
    ]);

    const VehicleModel = createInMemoryModel([
      { vehicleId: 'Cab1', vehicleType: 'cab', capacity: 4, status: 'available', currentBookingId: null, latitude: 12.9756, longitude: 77.6066 },
      { vehicleId: 'Cab2', vehicleType: 'cab', capacity: 4, status: 'available', currentBookingId: null, latitude: 12.9784, longitude: 77.6408 },
      { vehicleId: 'Cab3', vehicleType: 'cab', capacity: 4, status: 'available', currentBookingId: null, latitude: 12.9352, longitude: 77.6245 }
    ]);

    const result = await runAllocationCycle({ BookingModel, VehicleModel, now: daytime });

    assert.equal(result.allocated.length, 3);
    // Daytime hierarchy: Senior (Tier 1) -> Woman (Tier 2) -> Regular (Tier 3)
    assert.equal(result.allocated[0].bookingId, 'BK-SEN-C');
    assert.equal(result.allocated[0].vehicleId, 'Cab1');
    assert.equal(result.allocated[0].priorityTier, 1);

    assert.equal(result.allocated[1].bookingId, 'BK-WOM-B');
    assert.equal(result.allocated[1].vehicleId, 'Cab2');
    assert.equal(result.allocated[1].priorityTier, 2);

    assert.equal(result.allocated[2].bookingId, 'BK-REG-A');
    assert.equal(result.allocated[2].vehicleId, 'Cab3');
    assert.equal(result.allocated[2].priorityTier, 3);
  });

  it('Scenario D — Woman and senior citizen book during night (11:00 PM) -> Woman first, Senior second, Regular third', async () => {
    const nightTime = new Date(2026, 10, 12, 23, 0, 0);

    const BookingModel = createInMemoryModel([
      { bookingId: 'BK-REG-A', category: 'regular', vehicleType: 'cab', passengerCount: 1, pickup: MG_ROAD, status: 'requested', sequenceNumber: 1, createdAt: new Date(2026, 10, 12, 22, 50, 0) },
      { bookingId: 'BK-WOM-B', category: 'woman', vehicleType: 'cab', passengerCount: 1, pickup: MG_ROAD, status: 'requested', sequenceNumber: 2, createdAt: new Date(2026, 10, 12, 22, 52, 0) },
      { bookingId: 'BK-SEN-C', category: 'senior', vehicleType: 'cab', passengerCount: 1, pickup: MG_ROAD, status: 'requested', sequenceNumber: 3, createdAt: new Date(2026, 10, 12, 22, 55, 0) }
    ]);

    const VehicleModel = createInMemoryModel([
      { vehicleId: 'Cab1', vehicleType: 'cab', capacity: 4, status: 'available', currentBookingId: null, latitude: 12.9756, longitude: 77.6066 },
      { vehicleId: 'Cab2', vehicleType: 'cab', capacity: 4, status: 'available', currentBookingId: null, latitude: 12.9784, longitude: 77.6408 },
      { vehicleId: 'Cab3', vehicleType: 'cab', capacity: 4, status: 'available', currentBookingId: null, latitude: 12.9352, longitude: 77.6245 }
    ]);

    const result = await runAllocationCycle({ BookingModel, VehicleModel, now: nightTime });

    assert.equal(result.allocated.length, 3);
    // Nighttime hierarchy: Woman (Tier 1) -> Senior (Tier 2) -> Regular (Tier 3)
    assert.equal(result.allocated[0].bookingId, 'BK-WOM-B');
    assert.equal(result.allocated[0].vehicleId, 'Cab1');
    assert.equal(result.allocated[1].bookingId, 'BK-SEN-C');
    assert.equal(result.allocated[1].vehicleId, 'Cab2');
    assert.equal(result.allocated[2].bookingId, 'BK-REG-A');
    assert.equal(result.allocated[2].vehicleId, 'Cab3');
  });

  it('Scenario E — Only one cab available at night (10:00 PM) -> Woman gets cab; others queued in strict priority order; senior gets next cab when available', async () => {
    const nightTime = new Date(2026, 10, 12, 22, 0, 0);

    const BookingModel = createInMemoryModel([
      { bookingId: 'BK-REG-A', category: 'regular', vehicleType: 'cab', passengerCount: 1, pickup: MG_ROAD, status: 'requested', sequenceNumber: 1, createdAt: new Date(2026, 10, 12, 21, 50, 0) },
      { bookingId: 'BK-REG-B', category: 'regular', vehicleType: 'cab', passengerCount: 1, pickup: MG_ROAD, status: 'requested', sequenceNumber: 2, createdAt: new Date(2026, 10, 12, 21, 52, 0) },
      { bookingId: 'BK-WOM-C', category: 'woman', vehicleType: 'cab', passengerCount: 1, pickup: MG_ROAD, status: 'requested', sequenceNumber: 3, createdAt: new Date(2026, 10, 12, 21, 54, 0) },
      { bookingId: 'BK-SEN-D', category: 'senior', vehicleType: 'cab', passengerCount: 1, pickup: MG_ROAD, status: 'requested', sequenceNumber: 4, createdAt: new Date(2026, 10, 12, 21, 56, 0) }
    ]);

    // Only ONE cab available
    const VehicleModel = createInMemoryModel([
      { vehicleId: 'Cab1', vehicleType: 'cab', capacity: 4, status: 'available', currentBookingId: null, latitude: 12.9756, longitude: 77.6066 }
    ]);

    const result = await runAllocationCycle({ BookingModel, VehicleModel, now: nightTime });

    // 1. Woman C (Tier 1 at night) receives the only cab
    assert.equal(result.allocated.length, 1);
    assert.equal(result.allocated[0].bookingId, 'BK-WOM-C');
    assert.equal(result.allocated[0].vehicleId, 'Cab1');

    // 2. Others placed in waiting queue in strict order: Senior D (#1), Regular A (#2), Regular B (#3)
    assert.equal(result.queued.length, 3);
    assert.equal(result.queued[0].bookingId, 'BK-SEN-D');
    assert.equal(result.queued[0].queuePosition, 1);
    assert.equal(result.queued[1].bookingId, 'BK-REG-A');
    assert.equal(result.queued[1].queuePosition, 2);
    assert.equal(result.queued[2].bookingId, 'BK-REG-B');
    assert.equal(result.queued[2].queuePosition, 3);

    // 3. When a cab becomes available later:
    await VehicleModel.updateOne({ vehicleId: 'Cab1' }, { $set: { status: 'available', currentBookingId: null } });

    const secondCycle = await runAllocationCycle({
      BookingModel,
      VehicleModel,
      now: new Date(2026, 10, 12, 22, 10, 0)
    });

    assert.equal(secondCycle.allocated.length, 1);
    assert.equal(secondCycle.allocated[0].bookingId, 'BK-SEN-D'); // Senior D allocated next!
    assert.equal(secondCycle.queued.length, 2);
    assert.equal(secondCycle.queued[0].bookingId, 'BK-REG-A');
    assert.equal(secondCycle.queued[0].queuePosition, 1);
    assert.equal(secondCycle.queued[1].bookingId, 'BK-REG-B');
    assert.equal(secondCycle.queued[1].queuePosition, 2);
  });

  it('Scenario F — Separate Cab & Auto pools respect priority within their vehicle type without crossover', async () => {
    const nightTime = new Date(2026, 10, 12, 22, 0, 0);

    const BookingModel = createInMemoryModel([
      { bookingId: 'BK-CAB-REG', category: 'regular', vehicleType: 'cab', passengerCount: 1, pickup: MG_ROAD, status: 'requested', sequenceNumber: 1, createdAt: new Date(2026, 10, 12, 21, 50, 0) },
      { bookingId: 'BK-CAB-WOM', category: 'woman', vehicleType: 'cab', passengerCount: 1, pickup: MG_ROAD, status: 'requested', sequenceNumber: 2, createdAt: new Date(2026, 10, 12, 21, 55, 0) },
      { bookingId: 'BK-AUTO-SEN', category: 'senior', vehicleType: 'auto', passengerCount: 1, pickup: MG_ROAD, status: 'requested', sequenceNumber: 3, createdAt: new Date(2026, 10, 12, 21, 55, 0) },
      { bookingId: 'BK-AUTO-REG', category: 'regular', vehicleType: 'auto', passengerCount: 1, pickup: MG_ROAD, status: 'requested', sequenceNumber: 4, createdAt: new Date(2026, 10, 12, 21, 50, 0) }
    ]);

    const VehicleModel = createInMemoryModel([
      { vehicleId: 'Cab1', vehicleType: 'cab', capacity: 4, status: 'available', currentBookingId: null, latitude: 12.9756, longitude: 77.6066 },
      { vehicleId: 'Cab2', vehicleType: 'cab', capacity: 4, status: 'available', currentBookingId: null, latitude: 12.9784, longitude: 77.6408 },
      { vehicleId: 'Auto1', vehicleType: 'auto', capacity: 3, status: 'available', currentBookingId: null, latitude: 12.9716, longitude: 77.5946 },
      { vehicleId: 'Auto2', vehicleType: 'auto', capacity: 3, status: 'available', currentBookingId: null, latitude: 12.9389, longitude: 77.6211 }
    ]);

    const result = await runAllocationCycle({ BookingModel, VehicleModel, now: nightTime });

    assert.equal(result.allocated.length, 4);

    // Auto senior gets auto
    const autoSen = result.allocated.find((a) => a.bookingId === 'BK-AUTO-SEN');
    assert.equal(autoSen.vehicleType, 'auto');

    // Cab woman gets cab
    const cabWom = result.allocated.find((a) => a.bookingId === 'BK-CAB-WOM');
    assert.equal(cabWom.vehicleType, 'cab');

    // Cab regular gets cab
    const cabReg = result.allocated.find((a) => a.bookingId === 'BK-CAB-REG');
    assert.equal(cabReg.vehicleType, 'cab');

    // Auto regular gets auto
    const autoReg = result.allocated.find((a) => a.bookingId === 'BK-AUTO-REG');
    assert.equal(autoReg.vehicleType, 'auto');

    // No cross-type assignments
    for (const alloc of result.allocated) {
      const orig = BookingModel.docs.find((b) => b.bookingId === alloc.bookingId);
      assert.equal(alloc.vehicleType, orig.vehicleType);
    }
  });

  it('Dynamic Time Change — Switching simulation time from daytime to night elevates waiting women ahead of senior and regular bookings', async () => {
    // 1. Daytime: 14:00 (Daytime hierarchy: Senior (Tier 1) -> Woman (Tier 2) -> Regular (Tier 3))
    const dayTime = new Date(2026, 10, 12, 14, 0, 0);

    const bookings = [
      { bookingId: 'BK-REG-1', category: 'regular', vehicleType: 'cab', sequenceNumber: 1, createdAt: new Date(2026, 10, 12, 13, 50, 0) },
      { bookingId: 'BK-WOM-1', category: 'woman', vehicleType: 'cab', sequenceNumber: 2, createdAt: new Date(2026, 10, 12, 13, 52, 0) },
      { bookingId: 'BK-SEN-1', category: 'senior', vehicleType: 'cab', sequenceNumber: 3, createdAt: new Date(2026, 10, 12, 13, 55, 0) }
    ];

    // During daytime, Senior is Tier 1, Woman is Tier 2, Regular is Tier 3:
    const daytimeSorted = sortRequestsByPriority(bookings, { now: dayTime, recalculate: true });
    assert.equal(daytimeSorted[0].bookingId, 'BK-SEN-1');
    assert.equal(daytimeSorted[0].priorityTier, 1);
    assert.equal(daytimeSorted[1].bookingId, 'BK-WOM-1');
    assert.equal(daytimeSorted[1].priorityTier, 2);
    assert.equal(daytimeSorted[2].bookingId, 'BK-REG-1');
    assert.equal(daytimeSorted[2].priorityTier, 3);

    // 2. User changes simulation time to Night: 22:00
    // Nighttime hierarchy: Woman (Tier 1) -> Senior (Tier 2) -> Regular (Tier 3)
    const nightTime = new Date(2026, 10, 12, 22, 0, 0);
    const nightSorted = sortRequestsByPriority(bookings, { now: nightTime, recalculate: true });

    // Woman 1 immediately promoted to Tier 1 and jumps ahead of Senior 1 (Tier 2) and Regular 1 (Tier 3)!
    assert.equal(nightSorted[0].bookingId, 'BK-WOM-1');
    assert.equal(nightSorted[0].priorityTier, 1);
    assert.equal(nightSorted[1].bookingId, 'BK-SEN-1');
    assert.equal(nightSorted[1].priorityTier, 2);
    assert.equal(nightSorted[2].bookingId, 'BK-REG-1');
    assert.equal(nightSorted[2].priorityTier, 3);
  });
});

