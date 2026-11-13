const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Booking, Vehicle, resetAll } = require('../src/store/memoryStore');
const { executeAllocationCycle } = require('../src/services/allocation.service');
const { updateQueuePositions, calculatePriority } = require('../src/services/priority.service');

const mockRoutingService = {
  getRouteEstimate: async (origin, dest) => ({
    durationMinutes: 4,
    distanceMeters: 2500,
    durationSeconds: 240,
    geometry: [[origin.lat, origin.lng], [dest.lat, dest.lng]],
    isEstimated: true
  })
};

describe('Deduplication & Canonical Booking ID Scenarios', () => {
  beforeEach(() => {
    resetAll();
  });

  it('Test 1 — All cabs occupied: 5 assigned, 1 queued, zero duplicates', async () => {
    // 1. Ensure exactly 5 available cabs in pool
    await Vehicle.deleteMany({});
    for (let i = 1; i <= 5; i++) {
      await Vehicle.create({
        vehicleId: `Cab${i}`,
        vehicleType: 'cab',
        capacity: 4,
        status: 'available',
        latitude: 12.97 + i * 0.005,
        longitude: 77.59 + i * 0.005,
        currentBookingId: null
      });
    }

    const simTime = new Date('2026-11-14T14:00:00.000Z');

    // 2. Book 5 rides -> all 5 must be assigned
    for (let i = 1; i <= 5; i++) {
      const b = await Booking.create({
        bookingId: `BK-INIT-${i}`,
        userId: `U${i}`,
        passengerName: `Passenger ${i}`,
        category: 'regular',
        vehicleType: 'cab',
        passengerCount: 1,
        pickup: { lat: 12.9716, lng: 77.5946, label: 'MG Road' },
        destination: { lat: 12.9784, lng: 77.6408, label: 'Indiranagar' },
        status: 'requested',
        createdAt: simTime,
        createdAtSimSeconds: 14 * 3600
      });

      await executeAllocationCycle({
        BookingModel: Booking,
        VehicleModel: Vehicle,
        routingService: mockRoutingService,
        now: simTime
      });
    }

    const assignedCount = await Booking.countDocuments({ status: 'assigned' });
    assert.equal(assignedCount, 5, 'All 5 initial cabs must be assigned');

    // 3. Book a 6th ride -> must enter waiting queue
    const sixth = await Booking.create({
      bookingId: 'BK-SIXTH-01',
      userId: 'U6',
      passengerName: 'Waiting Passenger',
      category: 'regular',
      vehicleType: 'cab',
      passengerCount: 1,
      pickup: { lat: 12.9716, lng: 77.5946, label: 'MG Road' },
      destination: { lat: 12.9784, lng: 77.6408, label: 'Indiranagar' },
      status: 'requested',
      createdAt: simTime,
      createdAtSimSeconds: 14 * 3600
    });

    const allocResult = await executeAllocationCycle({
      BookingModel: Booking,
      VehicleModel: Vehicle,
      routingService: mockRoutingService,
      now: simTime
    });

    // 4. Verify exactly 5 assigned and 1 waiting booking
    const allBookings = await Booking.find({}).lean();
    assert.equal(allBookings.length, 6, 'Total booking records must be exactly 6');

    const assigned = allBookings.filter((b) => b.status === 'assigned');
    const queued = allBookings.filter((b) => b.status === 'queued');

    assert.equal(assigned.length, 5, 'Exactly 5 assigned bookings');
    assert.equal(queued.length, 1, 'Exactly 1 queued booking');
    assert.equal(queued[0].bookingId, 'BK-SIXTH-01');
    assert.equal(queued[0].queuePosition, 1);

    // 5. Verify no duplicate booking IDs exist anywhere in storage
    const uniqueIds = new Set(allBookings.map((b) => b.bookingId));
    assert.equal(uniqueIds.size, 6, 'All 6 booking records must have unique booking IDs');
  });

  it('Test 2 — Multiple waiting passengers: 5 assigned, 5 queued, exactly 10 unique records', async () => {
    await Vehicle.deleteMany({});
    for (let i = 1; i <= 5; i++) {
      await Vehicle.create({
        vehicleId: `Cab${i}`,
        vehicleType: 'cab',
        capacity: 4,
        status: 'available',
        latitude: 12.97 + i * 0.005,
        longitude: 77.59 + i * 0.005,
        currentBookingId: null
      });
    }

    const simTime = new Date('2026-11-14T14:00:00.000Z');

    // Create 10 bookings
    for (let i = 1; i <= 10; i++) {
      await Booking.create({
        bookingId: `BK-TEST2-${String(i).padStart(2, '0')}`,
        userId: `U${i}`,
        passengerName: `Passenger ${i}`,
        category: i % 2 === 0 ? 'woman' : 'regular',
        vehicleType: 'cab',
        passengerCount: 1,
        pickup: { lat: 12.9716, lng: 77.5946, label: 'MG Road' },
        destination: { lat: 12.9784, lng: 77.6408, label: 'Indiranagar' },
        status: 'requested',
        createdAt: new Date(simTime.getTime() + i * 1000),
        createdAtSimSeconds: 14 * 3600 + i
      });

      await executeAllocationCycle({
        BookingModel: Booking,
        VehicleModel: Vehicle,
        routingService: mockRoutingService,
        now: simTime
      });
    }

    const allBookings = await Booking.find({}).lean();
    assert.equal(allBookings.length, 10, 'Must have exactly 10 booking records');

    const assigned = allBookings.filter((b) => b.status === 'assigned');
    const queued = allBookings.filter((b) => b.status === 'queued');

    assert.equal(assigned.length, 5, 'Exactly 5 assigned bookings');
    assert.equal(queued.length, 5, 'Exactly 5 waiting bookings');

    // Queue positions must be 1, 2, 3, 4, 5 with no duplicates
    const positions = queued.map((b) => b.queuePosition).sort((a, b) => a - b);
    assert.deepEqual(positions, [1, 2, 3, 4, 5], 'Waiting bookings must have sequential positions 1..5');

    const uniqueIds = new Set(allBookings.map((b) => b.bookingId));
    assert.equal(uniqueIds.size, 10, 'All 10 booking records must have unique IDs');
  });

  it('Test 3 — Queue position changes: existing cards update positions without creating new records', async () => {
    await Vehicle.deleteMany({}); // No vehicles available -> all enter queue
    const simTime = new Date('2026-11-14T14:00:00.000Z');

    // 1. Create two regular bookings
    await Booking.create({
      bookingId: 'BK-REG-1',
      userId: 'U1',
      passengerName: 'Regular One',
      category: 'regular',
      vehicleType: 'cab',
      passengerCount: 1,
      pickup: { lat: 12.9716, lng: 77.5946, label: 'MG Road' },
      destination: { lat: 12.9784, lng: 77.6408, label: 'Indiranagar' },
      status: 'requested',
      createdAt: simTime,
      createdAtSimSeconds: 14 * 3600
    });

    await Booking.create({
      bookingId: 'BK-REG-2',
      userId: 'U2',
      passengerName: 'Regular Two',
      category: 'regular',
      vehicleType: 'cab',
      passengerCount: 1,
      pickup: { lat: 12.9716, lng: 77.5946, label: 'MG Road' },
      destination: { lat: 12.9784, lng: 77.6408, label: 'Indiranagar' },
      status: 'requested',
      createdAt: new Date(simTime.getTime() + 1000),
      createdAtSimSeconds: 14 * 3600 + 1
    });

    await updateQueuePositions({ BookingModel: Booking, now: simTime });

    let b1 = await Booking.findOne({ bookingId: 'BK-REG-1' }).lean();
    let b2 = await Booking.findOne({ bookingId: 'BK-REG-2' }).lean();
    assert.equal(b1.queuePosition, 1);
    assert.equal(b2.queuePosition, 2);

    // 2. Add a higher-priority Senior Citizen in daytime
    await Booking.create({
      bookingId: 'BK-SENIOR-1',
      userId: 'U3',
      passengerName: 'Senior One',
      category: 'senior',
      vehicleType: 'cab',
      passengerCount: 1,
      pickup: { lat: 12.9716, lng: 77.5946, label: 'MG Road' },
      destination: { lat: 12.9784, lng: 77.6408, label: 'Indiranagar' },
      status: 'requested',
      createdAt: new Date(simTime.getTime() + 2000),
      createdAtSimSeconds: 14 * 3600 + 2
    });

    // 3. Recalculate queue
    await updateQueuePositions({ BookingModel: Booking, now: simTime });

    const totalDocs = await Booking.countDocuments({});
    assert.equal(totalDocs, 3, 'Total documents must be exactly 3');

    const senior = await Booking.findOne({ bookingId: 'BK-SENIOR-1' }).lean();
    b1 = await Booking.findOne({ bookingId: 'BK-REG-1' }).lean();
    b2 = await Booking.findOne({ bookingId: 'BK-REG-2' }).lean();

    assert.equal(senior.queuePosition, 1, 'Senior moves to Priority #1');
    assert.equal(b1.queuePosition, 2, 'Regular One updates to Priority #2');
    assert.equal(b2.queuePosition, 3, 'Regular Two updates to Priority #3');

    // Confirm booking IDs did not change
    assert.equal(senior.bookingId, 'BK-SENIOR-1');
    assert.equal(b1.bookingId, 'BK-REG-1');
    assert.equal(b2.bookingId, 'BK-REG-2');
  });

  it('Test 4 — Repeated backend creation / events: updates existing record rather than inserting duplicates', async () => {
    // Attempting to create booking with the same bookingId multiple times
    const initial = await Booking.create({
      bookingId: 'BK-REPEATED-01',
      userId: 'U1',
      passengerName: 'Idempotent User',
      category: 'regular',
      vehicleType: 'cab',
      passengerCount: 1,
      pickup: { lat: 12.9716, lng: 77.5946, label: 'MG Road' },
      destination: { lat: 12.9784, lng: 77.6408, label: 'Indiranagar' },
      status: 'requested',
      queuePosition: 1
    });

    // Second create with same bookingId (e.g. repeated event)
    const duplicateAttempt = await Booking.create({
      bookingId: 'BK-REPEATED-01',
      userId: 'U1',
      passengerName: 'Idempotent User',
      category: 'regular',
      vehicleType: 'cab',
      passengerCount: 1,
      pickup: { lat: 12.9716, lng: 77.5946, label: 'MG Road' },
      destination: { lat: 12.9784, lng: 77.6408, label: 'Indiranagar' },
      status: 'queued',
      queuePosition: 2
    });

    const all = await Booking.find({ bookingId: 'BK-REPEATED-01' }).lean();
    assert.equal(all.length, 1, 'Exactly one record must exist in storage');
    assert.equal(all[0].status, 'queued');
    assert.equal(all[0].queuePosition, 2);
  });

  it('Test 5 — Vehicle becomes available: waiting booking is assigned without creating a second record', async () => {
    await Vehicle.deleteMany({});
    const cab = await Vehicle.create({
      vehicleId: 'Cab1',
      vehicleType: 'cab',
      capacity: 4,
      status: 'to_pickup',
      latitude: 12.9756,
      longitude: 77.6066,
      currentBookingId: 'BK-FIRST'
    });

    const simTime = new Date('2026-11-14T14:00:00.000Z');

    // Active booking 1
    await Booking.create({
      bookingId: 'BK-FIRST',
      userId: 'U1',
      passengerName: 'First Rider',
      category: 'regular',
      vehicleType: 'cab',
      vehicleId: 'Cab1',
      passengerCount: 1,
      pickup: { lat: 12.9716, lng: 77.5946, label: 'MG Road' },
      destination: { lat: 12.9784, lng: 77.6408, label: 'Indiranagar' },
      status: 'assigned',
      createdAt: simTime,
      createdAtSimSeconds: 14 * 3600
    });

    // Waiting booking 2
    await Booking.create({
      bookingId: 'BK-WAITING',
      userId: 'U2',
      passengerName: 'Waiting Rider',
      category: 'woman',
      vehicleType: 'cab',
      passengerCount: 1,
      pickup: { lat: 12.9716, lng: 77.5946, label: 'MG Road' },
      destination: { lat: 12.9784, lng: 77.6408, label: 'Indiranagar' },
      status: 'queued',
      queuePosition: 1,
      createdAt: new Date(simTime.getTime() + 1000),
      createdAtSimSeconds: 14 * 3600 + 1
    });

    // Complete ride 1 -> release Cab1 to available
    await Booking.updateOne({ bookingId: 'BK-FIRST' }, { $set: { status: 'completed' } });
    await Vehicle.updateOne({ vehicleId: 'Cab1' }, { $set: { status: 'available', currentBookingId: null } });

    // Trigger allocation cycle
    await executeAllocationCycle({
      BookingModel: Booking,
      VehicleModel: Vehicle,
      routingService: mockRoutingService,
      now: simTime
    });

    const waitingBooking = await Booking.findOne({ bookingId: 'BK-WAITING' }).lean();
    assert.equal(waitingBooking.status, 'assigned', 'Waiting booking transitions to assigned');
    assert.equal(waitingBooking.vehicleId, 'Cab1', 'Assigned to newly available Cab1');
    assert.equal(waitingBooking.queuePosition, null, 'queuePosition is cleared');

    const allDocs = await Booking.find({}).lean();
    assert.equal(allDocs.length, 2, 'Total booking records remains exactly 2');
    const waitingCopies = allDocs.filter((b) => b.bookingId === 'BK-WAITING');
    assert.equal(waitingCopies.length, 1, 'No duplicate record created for waiting booking');
  });

  it('Test 6 — Same passenger name: two bookings with same name but different bookingIds exist separately', async () => {
    const simTime = new Date('2026-11-14T14:00:00.000Z');

    const b1 = await Booking.create({
      bookingId: 'BK-NAME-01',
      userId: 'U101',
      passengerName: 'Rajesh Khanna',
      category: 'senior',
      vehicleType: 'cab',
      passengerCount: 1,
      pickup: { lat: 12.9742, lng: 77.6012, label: 'Cubbon Park' },
      destination: { lat: 12.9585, lng: 77.6488, label: 'Manipal Hospital' },
      status: 'requested',
      createdAt: simTime
    });

    const b2 = await Booking.create({
      bookingId: 'BK-NAME-02',
      userId: 'U102',
      passengerName: 'Rajesh Khanna', // Same name
      category: 'senior',
      vehicleType: 'auto',
      passengerCount: 1,
      pickup: { lat: 12.9982, lng: 77.5685, label: 'Malleshwaram' },
      destination: { lat: 12.9796, lng: 77.5907, label: 'Vidhana Soudha' },
      status: 'requested',
      createdAt: new Date(simTime.getTime() + 5000)
    });

    const allRajesh = await Booking.find({ passengerName: 'Rajesh Khanna' }).lean();
    assert.equal(allRajesh.length, 2, 'Both bookings for Rajesh Khanna must exist');
    assert.equal(allRajesh[0].bookingId, 'BK-NAME-01');
    assert.equal(allRajesh[1].bookingId, 'BK-NAME-02');
    assert.notEqual(allRajesh[0].bookingId, allRajesh[1].bookingId);
  });
});

