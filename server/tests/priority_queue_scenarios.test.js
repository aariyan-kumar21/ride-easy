const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isNightHour,
  getPassengerPriorityTier,
  calculatePriority,
  sortWaitingBookings,
  assignUniqueQueuePositions,
  updateQueuePositions
} = require('../src/services/priority.service');
const { runAllocationCycle } = require('../src/services/allocation.service');

function matchesFilter(doc, filter) {
  return Object.entries(filter).every(([key, condition]) => {
    const value = doc[key];
    if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
      if ('$in' in condition) return condition.$in.includes(value);
      if ('$nin' in condition) return !condition.$nin.includes(value);
      if ('$gte' in condition) return value >= condition.$gte;
    }
    return value === condition;
  });
}

function createInMemoryModel(initialDocs = []) {
  const docs = initialDocs.map((d, i) => ({
    _id: d._id || `id_${i + 1}`,
    ...JSON.parse(JSON.stringify(d))
  }));

  return {
    docs,
    async find(filter = {}) {
      const filtered = docs.filter((d) => matchesFilter(d, filter));
      const res = filtered.map((d) => ({
        ...d,
        toObject() { return { ...d }; }
      }));
      res.lean = () => Promise.resolve(filtered.map((d) => ({ ...d })));
      res.sort = () => res;
      return res;
    },
    async findOne(filter = {}) {
      const match = docs.find((d) => matchesFilter(d, filter));
      if (!match) return null;
      return {
        ...match,
        toObject() { return { ...match }; }
      };
    },
    async updateOne(filter, update) {
      const idx = docs.findIndex((d) => matchesFilter(d, filter));
      if (idx === -1) return { modifiedCount: 0 };
      if (update.$set) Object.assign(docs[idx], JSON.parse(JSON.stringify(update.$set)));
      return { modifiedCount: 1 };
    },
    async updateMany(filter, update) {
      let count = 0;
      for (const d of docs) {
        if (matchesFilter(d, filter)) {
          if (update.$set) Object.assign(d, JSON.parse(JSON.stringify(update.$set)));
          count++;
        }
      }
      return { modifiedCount: count };
    },
    async findOneAndUpdate(filter, update, options = {}) {
      const idx = docs.findIndex((d) => matchesFilter(d, filter));
      if (idx === -1) return null;
      if (update.$set) Object.assign(docs[idx], JSON.parse(JSON.stringify(update.$set)));
      return {
        ...docs[idx],
        toObject() { return { ...docs[idx] }; }
      };
    }
  };
}

const PICKUP = { lat: 12.9756, lng: 77.6066, label: 'MG Road' };

describe('10 Mandatory Priority Queue Scenarios', () => {

  // Test 1 — Daytime priority (02:00 PM)
  it('Test 1 — Daytime priority orders Senior #1, Woman #2, Regular #3 within batch', () => {
    const time = new Date(2026, 10, 12, 14, 0, 0); // 02:00 PM
    assert.equal(isNightHour(time), false);

    const bookings = [
      { bookingId: 'BK-REG-1', category: 'regular', vehicleType: 'cab', createdAtSimSeconds: 14 * 3600, createdAt: new Date(2026, 10, 12, 14, 0, 0), sequenceNumber: 1 },
      { bookingId: 'BK-WOM-2', category: 'woman', vehicleType: 'cab', createdAtSimSeconds: 14 * 3600 + 1, createdAt: new Date(2026, 10, 12, 14, 0, 1), sequenceNumber: 2 },
      { bookingId: 'BK-SEN-3', category: 'senior', vehicleType: 'cab', createdAtSimSeconds: 14 * 3600 + 2, createdAt: new Date(2026, 10, 12, 14, 0, 2), sequenceNumber: 3 }
    ];

    const sorted = sortWaitingBookings(bookings, { now: time });
    const positions = assignUniqueQueuePositions(sorted);

    assert.equal(positions[0].bookingId, 'BK-SEN-3');
    assert.equal(positions[0].queuePosition, 1);
    assert.equal(positions[0].priorityTier, 1);

    assert.equal(positions[1].bookingId, 'BK-WOM-2');
    assert.equal(positions[1].queuePosition, 2);
    assert.equal(positions[1].priorityTier, 2);

    assert.equal(positions[2].bookingId, 'BK-REG-1');
    assert.equal(positions[2].queuePosition, 3);
    assert.equal(positions[2].priorityTier, 3);
  });

  // Test 2 — Nighttime priority (10:00 PM)
  it('Test 2 — Nighttime priority orders Woman #1, Senior #2, Regular #3 within batch', () => {
    const time = new Date(2026, 10, 12, 22, 0, 0); // 10:00 PM
    assert.equal(isNightHour(time), true);

    const bookings = [
      { bookingId: 'BK-REG-1', category: 'regular', vehicleType: 'cab', createdAtSimSeconds: 22 * 3600, createdAt: new Date(2026, 10, 12, 22, 0, 0), sequenceNumber: 1 },
      { bookingId: 'BK-SEN-2', category: 'senior', vehicleType: 'cab', createdAtSimSeconds: 22 * 3600 + 1, createdAt: new Date(2026, 10, 12, 22, 0, 1), sequenceNumber: 2 },
      { bookingId: 'BK-WOM-3', category: 'woman', vehicleType: 'cab', createdAtSimSeconds: 22 * 3600 + 2, createdAt: new Date(2026, 10, 12, 22, 0, 2), sequenceNumber: 3 }
    ];

    const sorted = sortWaitingBookings(bookings, { now: time });
    const positions = assignUniqueQueuePositions(sorted);

    assert.equal(positions[0].bookingId, 'BK-WOM-3');
    assert.equal(positions[0].queuePosition, 1);
    assert.equal(positions[0].priorityTier, 1);

    assert.equal(positions[1].bookingId, 'BK-SEN-2');
    assert.equal(positions[1].queuePosition, 2);
    assert.equal(positions[1].priorityTier, 2);

    assert.equal(positions[2].bookingId, 'BK-REG-1');
    assert.equal(positions[2].queuePosition, 3);
    assert.equal(positions[2].priorityTier, 3);
  });

  // Test 3 — Duplicate queue number prevention
  it('Test 3 — Five simultaneous waiting bookings receive exactly sequential positions 1, 2, 3, 4, 5 with no duplicates', async () => {
    const time = new Date(2026, 10, 12, 14, 0, 0);
    const BookingModel = createInMemoryModel([
      { bookingId: 'BK-1', category: 'regular', vehicleType: 'cab', status: 'requested', sequenceNumber: 1, createdAtSimSeconds: 50400, createdAt: time },
      { bookingId: 'BK-2', category: 'senior', vehicleType: 'cab', status: 'requested', sequenceNumber: 2, createdAtSimSeconds: 50400, createdAt: time },
      { bookingId: 'BK-3', category: 'woman', vehicleType: 'cab', status: 'requested', sequenceNumber: 3, createdAtSimSeconds: 50400, createdAt: time },
      { bookingId: 'BK-4', category: 'regular', vehicleType: 'cab', status: 'requested', sequenceNumber: 4, createdAtSimSeconds: 50400, createdAt: time },
      { bookingId: 'BK-5', category: 'senior', vehicleType: 'cab', status: 'requested', sequenceNumber: 5, createdAtSimSeconds: 50400, createdAt: time }
    ]);

    const result = await updateQueuePositions({ BookingModel, now: time });
    assert.equal(result.cabs.length, 5);

    const positions = result.cabs.map((c) => c.queuePosition);
    assert.deepEqual(positions, [1, 2, 3, 4, 5]);

    // Check uniqueness
    const uniquePositions = new Set(positions);
    assert.equal(uniquePositions.size, 5);

    // Verify database documents received the exact positions
    for (const doc of BookingModel.docs) {
      assert.ok(doc.queuePosition >= 1 && doc.queuePosition <= 5);
    }
  });

  // Test 4 — Same-category bookings within same batch
  it('Test 4 — Three regular bookings in the same batch maintain original booking order with positions 1, 2, 3', () => {
    const time = new Date(2026, 10, 12, 14, 0, 0);
    const bookings = [
      { bookingId: 'BK-R1', category: 'regular', vehicleType: 'cab', createdAtSimSeconds: 50400, createdAt: new Date(2026, 10, 12, 14, 0, 0), sequenceNumber: 1 },
      { bookingId: 'BK-R2', category: 'regular', vehicleType: 'cab', createdAtSimSeconds: 50401, createdAt: new Date(2026, 10, 12, 14, 0, 1), sequenceNumber: 2 },
      { bookingId: 'BK-R3', category: 'regular', vehicleType: 'cab', createdAtSimSeconds: 50402, createdAt: new Date(2026, 10, 12, 14, 0, 2), sequenceNumber: 3 }
    ];

    const sorted = sortWaitingBookings(bookings, { now: time });
    const positions = assignUniqueQueuePositions(sorted);

    assert.equal(positions[0].bookingId, 'BK-R1');
    assert.equal(positions[0].queuePosition, 1);
    assert.equal(positions[1].bookingId, 'BK-R2');
    assert.equal(positions[1].queuePosition, 2);
    assert.equal(positions[2].bookingId, 'BK-R3');
    assert.equal(positions[2].queuePosition, 3);
  });

  // Test 5 — New senior citizen booking
  it('Test 5 — Daytime: Senior citizen booking moves ahead of 3 waiting regular passengers', async () => {
    const daytime = new Date(2026, 10, 12, 14, 5, 0);
    const BookingModel = createInMemoryModel([
      { bookingId: 'BK-REG-1', category: 'regular', vehicleType: 'cab', status: 'queued', sequenceNumber: 1, createdAtSimSeconds: 50400, createdAt: new Date(2026, 10, 12, 14, 0, 0) },
      { bookingId: 'BK-REG-2', category: 'regular', vehicleType: 'cab', status: 'queued', sequenceNumber: 2, createdAtSimSeconds: 50401, createdAt: new Date(2026, 10, 12, 14, 0, 1) },
      { bookingId: 'BK-REG-3', category: 'regular', vehicleType: 'cab', status: 'queued', sequenceNumber: 3, createdAtSimSeconds: 50402, createdAt: new Date(2026, 10, 12, 14, 0, 2) },
      // Senior arrives 5 minutes later
      { bookingId: 'BK-SEN-NEW', category: 'senior', vehicleType: 'cab', status: 'requested', sequenceNumber: 4, createdAtSimSeconds: 50700, createdAt: daytime }
    ]);

    const result = await updateQueuePositions({ BookingModel, now: daytime });

    assert.equal(result.cabs[0].bookingId, 'BK-SEN-NEW');
    assert.equal(result.cabs[0].queuePosition, 1);
    assert.equal(result.cabs[0].priorityTier, 1);

    assert.equal(result.cabs[1].bookingId, 'BK-REG-1');
    assert.equal(result.cabs[1].queuePosition, 2);

    assert.equal(result.cabs[2].bookingId, 'BK-REG-2');
    assert.equal(result.cabs[2].queuePosition, 3);

    assert.equal(result.cabs[3].bookingId, 'BK-REG-3');
    assert.equal(result.cabs[3].queuePosition, 4);
  });

  // Test 6 — New woman booking at night
  it('Test 6 — Nighttime: Woman booking moves ahead of 2 waiting regular passengers', async () => {
    const night = new Date(2026, 10, 12, 22, 5, 0);
    const BookingModel = createInMemoryModel([
      { bookingId: 'BK-REG-1', category: 'regular', vehicleType: 'cab', status: 'queued', sequenceNumber: 1, createdAtSimSeconds: 79200, createdAt: new Date(2026, 10, 12, 22, 0, 0) },
      { bookingId: 'BK-REG-2', category: 'regular', vehicleType: 'cab', status: 'queued', sequenceNumber: 2, createdAtSimSeconds: 79201, createdAt: new Date(2026, 10, 12, 22, 0, 1) },
      // Woman arrives 5 minutes later
      { bookingId: 'BK-WOM-NEW', category: 'woman', vehicleType: 'cab', status: 'requested', sequenceNumber: 3, createdAtSimSeconds: 79500, createdAt: night }
    ]);

    const result = await updateQueuePositions({ BookingModel, now: night });

    assert.equal(result.cabs[0].bookingId, 'BK-WOM-NEW');
    assert.equal(result.cabs[0].queuePosition, 1);
    assert.equal(result.cabs[0].priorityTier, 1);

    assert.equal(result.cabs[1].bookingId, 'BK-REG-1');
    assert.equal(result.cabs[1].queuePosition, 2);

    assert.equal(result.cabs[2].bookingId, 'BK-REG-2');
    assert.equal(result.cabs[2].queuePosition, 3);
  });

  // Test 7 — Vehicle allocation
  it('Test 7 — Vehicle allocation assigns 3 available vehicles one by one according to sorted queue without double allocation', async () => {
    const now = new Date(2026, 10, 12, 14, 0, 0);
    const BookingModel = createInMemoryModel([
      { bookingId: 'BK-REG', category: 'regular', vehicleType: 'cab', passengerCount: 1, pickup: PICKUP, status: 'requested', sequenceNumber: 1, createdAtSimSeconds: 50400, createdAt: now },
      { bookingId: 'BK-SEN', category: 'senior', vehicleType: 'cab', passengerCount: 1, pickup: PICKUP, status: 'requested', sequenceNumber: 2, createdAtSimSeconds: 50401, createdAt: now },
      { bookingId: 'BK-WOM', category: 'woman', vehicleType: 'cab', passengerCount: 1, pickup: PICKUP, status: 'requested', sequenceNumber: 3, createdAtSimSeconds: 50402, createdAt: now }
    ]);

    const VehicleModel = createInMemoryModel([
      { vehicleId: 'Cab1', vehicleType: 'cab', capacity: 4, status: 'available', currentBookingId: null, latitude: 12.975, longitude: 77.606 },
      { vehicleId: 'Cab2', vehicleType: 'cab', capacity: 4, status: 'available', currentBookingId: null, latitude: 12.978, longitude: 77.640 },
      { vehicleId: 'Cab3', vehicleType: 'cab', capacity: 4, status: 'available', currentBookingId: null, latitude: 12.935, longitude: 77.624 }
    ]);

    const result = await runAllocationCycle({ BookingModel, VehicleModel, now });

    assert.equal(result.allocated.length, 3);
    assert.equal(result.queued.length, 0);

    // Order: Senior first, Woman second, Regular third
    assert.equal(result.allocated[0].bookingId, 'BK-SEN');
    assert.equal(result.allocated[1].bookingId, 'BK-WOM');
    assert.equal(result.allocated[2].bookingId, 'BK-REG');

    // No vehicle double-assigned
    const assignedVehicles = result.allocated.map((a) => a.vehicleId);
    const uniqueVehicles = new Set(assignedVehicles);
    assert.equal(uniqueVehicles.size, 3);
  });

  // Test 8 — Queue recalculation
  it('Test 8 — Four waiting bookings, vehicle assigned to #1 -> remaining passengers receive positions 1, 2, 3', async () => {
    const now = new Date(2026, 10, 12, 14, 0, 0);
    const BookingModel = createInMemoryModel([
      { bookingId: 'BK-SEN-1', category: 'senior', vehicleType: 'cab', passengerCount: 1, pickup: PICKUP, status: 'requested', sequenceNumber: 1, createdAtSimSeconds: 50400, createdAt: now },
      { bookingId: 'BK-WOM-2', category: 'woman', vehicleType: 'cab', passengerCount: 1, pickup: PICKUP, status: 'requested', sequenceNumber: 2, createdAtSimSeconds: 50401, createdAt: now },
      { bookingId: 'BK-REG-3', category: 'regular', vehicleType: 'cab', passengerCount: 1, pickup: PICKUP, status: 'requested', sequenceNumber: 3, createdAtSimSeconds: 50402, createdAt: now },
      { bookingId: 'BK-REG-4', category: 'regular', vehicleType: 'cab', passengerCount: 1, pickup: PICKUP, status: 'requested', sequenceNumber: 4, createdAtSimSeconds: 50403, createdAt: now }
    ]);

    // Only 1 vehicle available
    const VehicleModel = createInMemoryModel([
      { vehicleId: 'Cab1', vehicleType: 'cab', capacity: 4, status: 'available', currentBookingId: null, latitude: 12.975, longitude: 77.606 }
    ]);

    const result = await runAllocationCycle({ BookingModel, VehicleModel, now });

    // #1 (Senior) allocated
    assert.equal(result.allocated.length, 1);
    assert.equal(result.allocated[0].bookingId, 'BK-SEN-1');

    // Remaining 3 bookings receive positions 1, 2, 3
    assert.equal(result.queued.length, 3);
    assert.equal(result.queued[0].bookingId, 'BK-WOM-2');
    assert.equal(result.queued[0].queuePosition, 1);

    assert.equal(result.queued[1].bookingId, 'BK-REG-3');
    assert.equal(result.queued[1].queuePosition, 2);

    assert.equal(result.queued[2].bookingId, 'BK-REG-4');
    assert.equal(result.queued[2].queuePosition, 3);
  });

  // Test 9 — Time change
  it('Test 9 — Daytime queue immediately reorders according to nighttime priority when time changes to 10:00 PM', async () => {
    const dayTime = new Date(2026, 10, 12, 14, 0, 0);
    const BookingModel = createInMemoryModel([
      { bookingId: 'BK-REG', category: 'regular', vehicleType: 'cab', status: 'requested', sequenceNumber: 1, createdAtSimSeconds: 50400, createdAt: dayTime },
      { bookingId: 'BK-WOM', category: 'woman', vehicleType: 'cab', status: 'requested', sequenceNumber: 2, createdAtSimSeconds: 50401, createdAt: dayTime },
      { bookingId: 'BK-SEN', category: 'senior', vehicleType: 'cab', status: 'requested', sequenceNumber: 3, createdAtSimSeconds: 50402, createdAt: dayTime }
    ]);

    // Daytime queue: Senior #1, Woman #2, Regular #3
    const dayResult = await updateQueuePositions({ BookingModel, now: dayTime });
    assert.equal(dayResult.cabs[0].bookingId, 'BK-SEN');
    assert.equal(dayResult.cabs[0].queuePosition, 1);
    assert.equal(dayResult.cabs[1].bookingId, 'BK-WOM');
    assert.equal(dayResult.cabs[1].queuePosition, 2);
    assert.equal(dayResult.cabs[2].bookingId, 'BK-REG');
    assert.equal(dayResult.cabs[2].queuePosition, 3);

    // Switch simulation time to 10:00 PM (Nighttime)
    const nightTime = new Date(2026, 10, 12, 22, 0, 0);
    const nightResult = await updateQueuePositions({ BookingModel, now: nightTime });

    // Nighttime queue: Woman #1, Senior #2, Regular #3
    assert.equal(nightResult.cabs[0].bookingId, 'BK-WOM');
    assert.equal(nightResult.cabs[0].queuePosition, 1);
    assert.equal(nightResult.cabs[0].priorityTier, 1);

    assert.equal(nightResult.cabs[1].bookingId, 'BK-SEN');
    assert.equal(nightResult.cabs[1].queuePosition, 2);
    assert.equal(nightResult.cabs[1].priorityTier, 2);

    assert.equal(nightResult.cabs[2].bookingId, 'BK-REG');
    assert.equal(nightResult.cabs[2].queuePosition, 3);
    assert.equal(nightResult.cabs[2].priorityTier, 3);
  });

  // Test 10 — Simultaneous requests & separate pools
  it('Test 10 — Near-simultaneous requests across Cabs and Autos assign unique positions per pool without race conditions', async () => {
    const time = new Date(2026, 10, 12, 14, 0, 0);
    const BookingModel = createInMemoryModel([
      { bookingId: 'BK-C1', category: 'regular', vehicleType: 'cab', status: 'requested', sequenceNumber: 1, createdAtSimSeconds: 50400, createdAt: time },
      { bookingId: 'BK-C2', category: 'senior', vehicleType: 'cab', status: 'requested', sequenceNumber: 2, createdAtSimSeconds: 50400, createdAt: time },
      { bookingId: 'BK-A1', category: 'regular', vehicleType: 'auto', status: 'requested', sequenceNumber: 3, createdAtSimSeconds: 50400, createdAt: time },
      { bookingId: 'BK-A2', category: 'woman', vehicleType: 'auto', status: 'requested', sequenceNumber: 4, createdAtSimSeconds: 50400, createdAt: time }
    ]);

    const result = await updateQueuePositions({ BookingModel, now: time });

    // Cab queue: Senior is #1, Regular is #2
    assert.equal(result.cabs.length, 2);
    assert.equal(result.cabs[0].bookingId, 'BK-C2');
    assert.equal(result.cabs[0].queuePosition, 1);
    assert.equal(result.cabs[1].bookingId, 'BK-C1');
    assert.equal(result.cabs[1].queuePosition, 2);

    // Auto queue: Woman is #1, Regular is #2
    assert.equal(result.autos.length, 2);
    assert.equal(result.autos[0].bookingId, 'BK-A2');
    assert.equal(result.autos[0].queuePosition, 1);
    assert.equal(result.autos[1].bookingId, 'BK-A1');
    assert.equal(result.autos[1].queuePosition, 2);
  });

});
