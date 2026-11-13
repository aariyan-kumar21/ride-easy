const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { runAllocationCycle } = require('../src/services/allocation.service');

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

function createInMemoryModel(initialDocs, opts = {}) {
  const docs = initialDocs.map((d) => ({ ...d }));

  return {
    docs,
    async find(filter = {}) {
      return docs.filter((d) => matchesFilter(d, filter)).map((d) => ({ ...d }));
    },
    async findOneAndUpdate(filter, update) {
      if (opts.failOnBookingUpdate) {
        throw new Error('Simulated booking persistence failure');
      }
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

describe('Smart Cab & Auto Allocation Engine', () => {
  it('1. One booking and multiple available cabs selects lowest road ETA', async () => {
    const BookingModel = createInMemoryModel([
      {
        bookingId: 'BK-1',
        category: 'regular',
        vehicleType: 'cab',
        passengerCount: 2,
        pickup: MG_ROAD,
        status: 'requested',
        createdAt: new Date(2026, 10, 12, 14, 0, 0)
      }
    ]);

    const VehicleModel = createInMemoryModel([
      { vehicleId: 'C102', vehicleType: 'cab', capacity: 4, status: 'available', currentBookingId: null, latitude: 12.9352, longitude: 77.6245 }, // Farther (Koramangala)
      { vehicleId: 'C101', vehicleType: 'cab', capacity: 4, status: 'available', currentBookingId: null, latitude: 12.9745, longitude: 77.6055 }  // Closest (MG Road)
    ]);

    const result = await runAllocationCycle({
      BookingModel,
      VehicleModel,
      now: new Date(2026, 10, 12, 14, 0, 0)
    });

    assert.equal(result.allocated.length, 1);
    assert.equal(result.allocated[0].vehicleId, 'C101');
    assert.equal(BookingModel.docs[0].status, 'assigned');
    assert.equal(VehicleModel.docs.find((v) => v.vehicleId === 'C101').status, 'to_pickup');
    assert.equal(VehicleModel.docs.find((v) => v.vehicleId === 'C102').status, 'available');
  });

  it('2. Multiple bookings submitted simultaneously never double-assign a vehicle', async () => {
    const now = new Date(2026, 10, 12, 14, 0, 0);
    const BookingModel = createInMemoryModel([
      { bookingId: 'BK-1', category: 'regular', vehicleType: 'cab', passengerCount: 1, pickup: MG_ROAD, status: 'requested', createdAt: now },
      { bookingId: 'BK-2', category: 'regular', vehicleType: 'cab', passengerCount: 1, pickup: MG_ROAD, status: 'requested', createdAt: now },
      { bookingId: 'BK-3', category: 'regular', vehicleType: 'cab', passengerCount: 1, pickup: MG_ROAD, status: 'requested', createdAt: now }
    ]);

    const VehicleModel = createInMemoryModel([
      { vehicleId: 'C101', vehicleType: 'cab', capacity: 4, status: 'available', currentBookingId: null, latitude: 12.975, longitude: 77.606 },
      { vehicleId: 'C102', vehicleType: 'cab', capacity: 4, status: 'available', currentBookingId: null, latitude: 12.976, longitude: 77.607 }
    ]);

    await Promise.all([
      runAllocationCycle({ BookingModel, VehicleModel, now }),
      runAllocationCycle({ BookingModel, VehicleModel, now })
    ]);

    const assignedVehicles = BookingModel.docs.filter((b) => b.status === 'assigned').map((b) => b.vehicleId);
    assert.equal(assignedVehicles.length, 2);
    assert.equal(new Set(assignedVehicles).size, 2);
    assert.equal(BookingModel.docs.filter((b) => b.status === 'queued').length, 1);
  });

  it('3. Senior citizen wins scarce cab over regular passenger', async () => {
    const now = new Date(2026, 10, 12, 14, 0, 0);
    const BookingModel = createInMemoryModel([
      { bookingId: 'BK-REG', category: 'regular', vehicleType: 'cab', passengerCount: 1, pickup: MG_ROAD, status: 'requested', createdAt: new Date(2026, 10, 12, 13, 55, 0) },
      { bookingId: 'BK-SEN', category: 'senior', vehicleType: 'cab', passengerCount: 1, pickup: MG_ROAD, status: 'requested', createdAt: now }
    ]);

    const VehicleModel = createInMemoryModel([
      { vehicleId: 'C101', vehicleType: 'cab', capacity: 4, status: 'available', currentBookingId: null, latitude: 12.975, longitude: 77.606 }
    ]);

    const result = await runAllocationCycle({ BookingModel, VehicleModel, now });
    assert.equal(result.allocated[0].bookingId, 'BK-SEN');
    assert.equal(result.allocated[0].priorityScore, 40);
    assert.equal(result.queued[0].bookingId, 'BK-REG');
  });

  it('4. Night-time woman priority (+40) beats regular passenger', async () => {
    const night = new Date(2026, 10, 12, 23, 30, 0);
    const BookingModel = createInMemoryModel([
      { bookingId: 'BK-REG', category: 'regular', vehicleType: 'auto', passengerCount: 1, pickup: MG_ROAD, status: 'requested', createdAt: new Date(2026, 10, 12, 23, 25, 0) },
      { bookingId: 'BK-WOM', category: 'woman', vehicleType: 'auto', passengerCount: 1, pickup: MG_ROAD, status: 'requested', createdAt: night }
    ]);

    const VehicleModel = createInMemoryModel([
      { vehicleId: 'C104', vehicleType: 'auto', capacity: 3, status: 'available', currentBookingId: null, latitude: 12.975, longitude: 77.606 }
    ]);

    const result = await runAllocationCycle({ BookingModel, VehicleModel, now: night });
    assert.equal(result.allocated[0].bookingId, 'BK-WOM');
    assert.equal(result.allocated[0].priorityScore, 40);
    assert.equal(result.queued[0].bookingId, 'BK-REG');
  });

  it('5. Insufficient seating capacity prevents assignment and selects larger vehicle', async () => {
    const now = new Date(2026, 10, 12, 14, 0, 0);
    const BookingModel = createInMemoryModel([
      { bookingId: 'BK-GRP', category: 'regular', vehicleType: 'cab', passengerCount: 5, pickup: MG_ROAD, status: 'requested', createdAt: now }
    ]);

    const VehicleModel = createInMemoryModel([
      { vehicleId: 'C101', vehicleType: 'cab', capacity: 4, status: 'available', currentBookingId: null, latitude: 12.9756, longitude: 77.6066 }, // Too small
      { vehicleId: 'C102', vehicleType: 'cab', capacity: 6, status: 'available', currentBookingId: null, latitude: 12.9784, longitude: 77.6408 }  // Fits 5
    ]);

    const result = await runAllocationCycle({ BookingModel, VehicleModel, now });
    assert.equal(result.allocated[0].vehicleId, 'C102');
    assert.equal(VehicleModel.docs.find((v) => v.vehicleId === 'C101').status, 'available');
  });

  it('6. No available vehicles places booking into waiting queue', async () => {
    const now = new Date(2026, 10, 12, 14, 0, 0);
    const BookingModel = createInMemoryModel([
      { bookingId: 'BK-WAIT', category: 'regular', vehicleType: 'cab', passengerCount: 2, pickup: MG_ROAD, status: 'requested', createdAt: now }
    ]);

    const VehicleModel = createInMemoryModel([
      { vehicleId: 'C101', vehicleType: 'cab', capacity: 4, status: 'on_trip', currentBookingId: 'BK-OLD', latitude: 12.9756, longitude: 77.6066 },
      { vehicleId: 'C104', vehicleType: 'auto', capacity: 3, status: 'available', currentBookingId: null, latitude: 12.9756, longitude: 77.6066 } // Wrong type
    ]);

    const result = await runAllocationCycle({ BookingModel, VehicleModel, now });
    assert.equal(result.allocated.length, 0);
    assert.equal(result.queued.length, 1);
    assert.equal(BookingModel.docs[0].status, 'queued');
  });

  it('7. Vehicle becoming available after trip completion allocates queued booking with updated waiting bonus', async () => {
    const createdAt = new Date(2026, 10, 12, 14, 0, 0);
    const later = new Date(2026, 10, 12, 14, 5, 0);
    const BookingModel = createInMemoryModel([
      { bookingId: 'BK-Q1', category: 'regular', vehicleType: 'cab', passengerCount: 2, pickup: INDIRANAGAR, status: 'queued', createdAt }
    ]);

    const VehicleModel = createInMemoryModel([
      { vehicleId: 'C101', vehicleType: 'cab', capacity: 4, status: 'available', currentBookingId: null, latitude: 12.9756, longitude: 77.6066 }
    ]);

    const result = await runAllocationCycle({ BookingModel, VehicleModel, now: later });
    assert.equal(result.allocated.length, 1);
    assert.equal(result.allocated[0].bookingId, 'BK-Q1');
    assert.equal(result.allocated[0].priorityScore, 5); // +5 min wait
    assert.equal(BookingModel.docs[0].createdAt.getTime(), createdAt.getTime()); // Original createdAt preserved
  });

  it('8. Two requests competing for the same vehicle result in one assigned and one queued, and rollback releases vehicle on error', async () => {
    const now = new Date(2026, 10, 12, 14, 0, 0);
    const BookingModel = createInMemoryModel([
      { bookingId: 'BK-A', category: 'regular', vehicleType: 'cab', passengerCount: 1, pickup: MG_ROAD, status: 'requested', createdAt: now },
      { bookingId: 'BK-B', category: 'regular', vehicleType: 'cab', passengerCount: 1, pickup: MG_ROAD, status: 'requested', createdAt: now }
    ]);

    const VehicleModel = createInMemoryModel([
      { vehicleId: 'C101', vehicleType: 'cab', capacity: 4, status: 'available', currentBookingId: null, latitude: 12.9756, longitude: 77.6066 }
    ]);

    const result = await runAllocationCycle({ BookingModel, VehicleModel, now });
    assert.equal(result.allocated.length, 1);
    assert.equal(result.allocated[0].bookingId, 'BK-A'); // Deterministic tie-breaker
    assert.equal(result.queued.length, 1);
    assert.equal(result.queued[0].bookingId, 'BK-B');

    // Verify rollback releases vehicle if booking update throws
    const FailingBookingModel = createInMemoryModel(
      [{ bookingId: 'BK-FAIL', category: 'regular', vehicleType: 'cab', passengerCount: 1, pickup: MG_ROAD, status: 'requested', createdAt: now }],
      { failOnBookingUpdate: true }
    );
    const RollbackVehicleModel = createInMemoryModel([
      { vehicleId: 'C109', vehicleType: 'cab', capacity: 4, status: 'available', currentBookingId: null, latitude: 12.9756, longitude: 77.6066 }
    ]);

    await assert.rejects(() =>
      runAllocationCycle({ BookingModel: FailingBookingModel, VehicleModel: RollbackVehicleModel, now })
    );
    assert.equal(RollbackVehicleModel.docs[0].status, 'available');
    assert.equal(RollbackVehicleModel.docs[0].currentBookingId, null);
  });
});

