const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const { SEED_USERS, SEED_VEHICLES } = require('../seed/seedData');
const { calculatePriority } = require('./priority.service');
const defaultAllocationService = require('./allocation.service');
const defaultRoutingService = require('./routing.service');

const SCENARIO_DEFINITIONS = [
  {
    id: 'normal_daytime',
    name: 'Scenario 1: Normal Daytime',
    description: '5 simultaneous requests (regular & senior) with ample cabs and autos.',
    simulatedTimeLabel: '14:00 (Daytime)'
  },
  {
    id: 'peak_hour',
    name: 'Scenario 2: Peak-Hour Demand',
    description: '10 requests competing for limited vehicles, demonstrating priority queue & retries.',
    simulatedTimeLabel: '18:15 (Peak Daytime)'
  },
  {
    id: 'night_priority',
    name: 'Scenario 3: Night-Time Priority',
    description: 'Simulated 10:30 PM window demonstrating Senior (+40) & Woman Night (+30) rules.',
    simulatedTimeLabel: '22:30 (Night Hours)'
  },
  {
    id: 'group_booking',
    name: 'Scenario 4: Group Booking',
    description: 'Varied passenger counts (1–6) matched strictly against 3, 4, and 6-seat vehicles.',
    simulatedTimeLabel: '15:00 (Daytime)'
  },
  {
    id: 'vehicle_cancellation',
    name: 'Scenario 5: Vehicle Cancellation',
    description: 'Assigned vehicle goes offline before pickup; booking is safely released & reassigned.',
    simulatedTimeLabel: '16:00 (Daytime)'
  }
];

const LOCATIONS = {
  mgRoad: { lat: 12.9756, lng: 77.6066, label: 'MG Road Metro' },
  indiranagar: { lat: 12.9784, lng: 77.6408, label: 'Indiranagar 100ft Rd' },
  koramangala: { lat: 12.9389, lng: 77.6211, label: 'Koramangala 4th Block' },
  majestic: { lat: 12.9767, lng: 77.5713, label: 'Majestic Bus Station' },
  jayanagar: { lat: 12.9304, lng: 77.583, label: 'Jayanagar 4th Block' },
  malleshwaram: { lat: 12.9982, lng: 77.5685, label: 'Malleshwaram 8th Cross' },
  vidhanaSoudha: { lat: 12.9796, lng: 77.5907, label: 'Vidhana Soudha' },
  richmond: { lat: 12.966, lng: 77.5998, label: 'Richmond Circle' },
  domlur: { lat: 12.9592, lng: 77.6476, label: 'Domlur Flyover' },
  ulsoor: { lat: 12.9668, lng: 77.6194, label: 'Ulsoor Lake' }
};

const INDIAN_NAME_POOLS = {
  regular: ['Aarav Sharma', 'Arjun Verma', 'Rohan Mehta', 'Aditya Kumar', 'Rahul Singh', 'Karan Malhotra', 'Vihaan Gupta'],
  woman: ['Ananya Sharma', 'Priya Mehta', 'Aditi Verma', 'Kavya Singh', 'Isha Kapoor', 'Riya Malhotra', 'Meera Nair'],
  senior: ['Rajesh Khanna', 'Suresh Menon', 'Meenakshi Iyer', 'Sunita Sharma', 'Prakash Rao', 'Kamala Devi', 'Shanti Verma']
};

function getRandomIndianName(category) {
  const norm = String(category || 'regular').toLowerCase();
  const pool = INDIAN_NAME_POOLS[norm] || INDIAN_NAME_POOLS.regular;
  return pool[Math.floor(Math.random() * pool.length)];
}

const SCENARIO_NAMES = {
  'U101': 'Rajesh Khanna',
  'U102': 'Ananya Sharma',
  'U103': 'Aarav Sharma',
  'U104': 'Suresh Menon',
  'U105': 'Priya Mehta'
};

function buildBookingDoc({
  bookingId,
  userId,
  passengerName,
  category,
  vehicleType,
  passengerCount,
  pickup,
  destination,
  createdAt
}) {
  const { priorityScore, priorityBreakdown } = calculatePriority(
    { category, createdAt },
    { now: createdAt }
  );

  return {
    bookingId,
    userId,
    passengerName: passengerName || SCENARIO_NAMES[userId] || getRandomIndianName(category),
    category,
    vehicleType,
    passengerCount,
    pickup,
    destination,
    vehicleId: null,
    status: 'requested',
    priorityScore,
    priorityBreakdown,
    createdAt
  };
}

function getScenarioBlueprint(scenarioId) {
  switch (scenarioId) {
    case 'normal_daytime': {
      const simTime = new Date(2026, 10, 12, 14, 0, 0);
      const vehicles = SEED_VEHICLES.map((v) => ({
        ...v,
        status: 'available',
        currentBookingId: null
      }));
      const bookings = [
        buildBookingDoc({ bookingId: 'SC1-BK-01', userId: 'U101', category: 'senior', vehicleType: 'cab', passengerCount: 1, pickup: LOCATIONS.mgRoad, destination: LOCATIONS.indiranagar, createdAt: simTime }),
        buildBookingDoc({ bookingId: 'SC1-BK-02', userId: 'U103', category: 'regular', vehicleType: 'cab', passengerCount: 2, pickup: LOCATIONS.koramangala, destination: LOCATIONS.richmond, createdAt: simTime }),
        buildBookingDoc({ bookingId: 'SC1-BK-03', userId: 'U104', category: 'senior', vehicleType: 'auto', passengerCount: 1, pickup: LOCATIONS.malleshwaram, destination: LOCATIONS.vidhanaSoudha, createdAt: simTime }),
        buildBookingDoc({ bookingId: 'SC1-BK-04', userId: 'U105', category: 'regular', vehicleType: 'auto', passengerCount: 2, pickup: LOCATIONS.jayanagar, destination: LOCATIONS.mgRoad, createdAt: simTime }),
        buildBookingDoc({ bookingId: 'SC1-BK-05', userId: 'U102', category: 'regular', vehicleType: 'cab', passengerCount: 3, pickup: LOCATIONS.majestic, destination: LOCATIONS.ulsoor, createdAt: simTime })
      ];
      return { simTime, simulatedTimeLabel: '14:00 (Daytime)', vehicles, bookings };
    }

    case 'peak_hour': {
      const simTime = new Date(2026, 10, 12, 18, 15, 0);
      // 4 available vehicles (Cab1, Cab2, Auto1, Auto2); rest busy/offline
      const availableIds = new Set(['Cab1', 'Cab2', 'Auto1', 'Auto2']);
      const vehicles = SEED_VEHICLES.map((v) => ({
        ...v,
        status: availableIds.has(v.vehicleId) ? 'available' : 'offline',
        currentBookingId: null
      }));
      const bookings = [
        buildBookingDoc({ bookingId: 'SC2-BK-01', userId: 'U103', category: 'regular', vehicleType: 'cab', passengerCount: 2, pickup: LOCATIONS.mgRoad, destination: LOCATIONS.indiranagar, createdAt: new Date(simTime.getTime() - 12 * 60000) }),
        buildBookingDoc({ bookingId: 'SC2-BK-02', userId: 'U101', category: 'senior', vehicleType: 'cab', passengerCount: 1, pickup: LOCATIONS.koramangala, destination: LOCATIONS.vidhanaSoudha, createdAt: new Date(simTime.getTime() - 2 * 60000) }),
        buildBookingDoc({ bookingId: 'SC2-BK-03', userId: 'U105', category: 'regular', vehicleType: 'cab', passengerCount: 2, pickup: LOCATIONS.jayanagar, destination: LOCATIONS.richmond, createdAt: new Date(simTime.getTime() - 8 * 60000) }),
        buildBookingDoc({ bookingId: 'SC2-BK-04', userId: 'U104', category: 'senior', vehicleType: 'auto', passengerCount: 1, pickup: LOCATIONS.malleshwaram, destination: LOCATIONS.majestic, createdAt: new Date(simTime.getTime() - 1 * 60000) }),
        buildBookingDoc({ bookingId: 'SC2-BK-05', userId: 'U102', category: 'woman', vehicleType: 'cab', passengerCount: 1, pickup: LOCATIONS.indiranagar, destination: LOCATIONS.domlur, createdAt: new Date(simTime.getTime() - 6 * 60000) }),
        buildBookingDoc({ bookingId: 'SC2-BK-06', userId: 'U103', category: 'regular', vehicleType: 'auto', passengerCount: 2, pickup: LOCATIONS.ulsoor, destination: LOCATIONS.mgRoad, createdAt: new Date(simTime.getTime() - 5 * 60000) }),
        buildBookingDoc({ bookingId: 'SC2-BK-07', userId: 'U105', category: 'regular', vehicleType: 'cab', passengerCount: 3, pickup: LOCATIONS.domlur, destination: LOCATIONS.koramangala, createdAt: new Date(simTime.getTime() - 4 * 60000) }),
        buildBookingDoc({ bookingId: 'SC2-BK-08', userId: 'U101', category: 'senior', vehicleType: 'cab', passengerCount: 2, pickup: LOCATIONS.richmond, destination: LOCATIONS.jayanagar, createdAt: simTime }),
        buildBookingDoc({ bookingId: 'SC2-BK-09', userId: 'U102', category: 'regular', vehicleType: 'auto', passengerCount: 1, pickup: LOCATIONS.majestic, destination: LOCATIONS.malleshwaram, createdAt: new Date(simTime.getTime() - 3 * 60000) }),
        buildBookingDoc({ bookingId: 'SC2-BK-10', userId: 'U103', category: 'regular', vehicleType: 'cab', passengerCount: 4, pickup: LOCATIONS.vidhanaSoudha, destination: LOCATIONS.indiranagar, createdAt: simTime })
      ];
      return { simTime, simulatedTimeLabel: '18:15 (Peak Daytime)', vehicles, bookings };
    }

    case 'night_priority': {
      const simTime = new Date(2026, 10, 12, 22, 30, 0); // 10:30 PM
      const availableIds = new Set(['Cab1', 'Cab3', 'Auto1']);
      const vehicles = SEED_VEHICLES.map((v) => ({
        ...v,
        status: availableIds.has(v.vehicleId) ? 'available' : 'offline',
        currentBookingId: null
      }));
      const bookings = [
        buildBookingDoc({ bookingId: 'SC3-BK-01', userId: 'U103', category: 'regular', vehicleType: 'cab', passengerCount: 1, pickup: LOCATIONS.mgRoad, destination: LOCATIONS.indiranagar, createdAt: new Date(simTime.getTime() - 4 * 60000) }),
        buildBookingDoc({ bookingId: 'SC3-BK-02', userId: 'U102', category: 'woman', vehicleType: 'cab', passengerCount: 1, pickup: LOCATIONS.koramangala, destination: LOCATIONS.richmond, createdAt: simTime }),
        buildBookingDoc({ bookingId: 'SC3-BK-03', userId: 'U101', category: 'senior', vehicleType: 'cab', passengerCount: 1, pickup: LOCATIONS.malleshwaram, destination: LOCATIONS.vidhanaSoudha, createdAt: simTime }),
        buildBookingDoc({ bookingId: 'SC3-BK-04', userId: 'U105', category: 'woman', vehicleType: 'auto', passengerCount: 2, pickup: LOCATIONS.jayanagar, destination: LOCATIONS.mgRoad, createdAt: simTime }),
        buildBookingDoc({ bookingId: 'SC3-BK-05', userId: 'U103', category: 'regular', vehicleType: 'auto', passengerCount: 1, pickup: LOCATIONS.majestic, destination: LOCATIONS.ulsoor, createdAt: new Date(simTime.getTime() - 5 * 60000) }),
        buildBookingDoc({ bookingId: 'SC3-BK-06', userId: 'U102', category: 'woman', vehicleType: 'cab', passengerCount: 2, pickup: LOCATIONS.domlur, destination: LOCATIONS.indiranagar, createdAt: new Date(simTime.getTime() - 2 * 60000) })
      ];
      return { simTime, simulatedTimeLabel: '22:30 (Night Hours)', vehicles, bookings };
    }

    case 'group_booking': {
      const simTime = new Date(2026, 10, 12, 15, 0, 0);
      // Cab2 has 6 seats, Cab1 & Cab3 have 4 seats, Auto1 & Auto2 have 3 seats
      const availableIds = new Set(['Cab1', 'Cab2', 'Cab3', 'Auto1', 'Auto2']);
      const vehicles = SEED_VEHICLES.map((v) => ({
        ...v,
        status: availableIds.has(v.vehicleId) ? 'available' : 'offline',
        currentBookingId: null
      }));
      const bookings = [
        buildBookingDoc({ bookingId: 'SC4-BK-01', userId: 'U103', category: 'regular', vehicleType: 'cab', passengerCount: 6, pickup: LOCATIONS.mgRoad, destination: LOCATIONS.indiranagar, createdAt: simTime }),
        buildBookingDoc({ bookingId: 'SC4-BK-02', userId: 'U105', category: 'regular', vehicleType: 'cab', passengerCount: 5, pickup: LOCATIONS.koramangala, destination: LOCATIONS.vidhanaSoudha, createdAt: simTime }),
        buildBookingDoc({ bookingId: 'SC4-BK-03', userId: 'U101', category: 'senior', vehicleType: 'cab', passengerCount: 4, pickup: LOCATIONS.malleshwaram, destination: LOCATIONS.richmond, createdAt: simTime }),
        buildBookingDoc({ bookingId: 'SC4-BK-04', userId: 'U102', category: 'woman', vehicleType: 'auto', passengerCount: 3, pickup: LOCATIONS.jayanagar, destination: LOCATIONS.mgRoad, createdAt: simTime }),
        buildBookingDoc({ bookingId: 'SC4-BK-05', userId: 'U104', category: 'regular', vehicleType: 'auto', passengerCount: 1, pickup: LOCATIONS.majestic, destination: LOCATIONS.ulsoor, createdAt: simTime })
      ];
      return { simTime, simulatedTimeLabel: '15:00 (Daytime)', vehicles, bookings };
    }

    case 'vehicle_cancellation': {
      const simTime = new Date(2026, 10, 12, 16, 0, 0);
      // Cab1 is closest to MG Road, Cab3 is backup cab
      const availableIds = new Set(['Cab1', 'Cab3', 'Auto1']);
      const vehicles = SEED_VEHICLES.map((v) => ({
        ...v,
        status: availableIds.has(v.vehicleId) ? 'available' : 'offline',
        currentBookingId: null
      }));
      const bookings = [
        buildBookingDoc({ bookingId: 'SC5-BK-01', userId: 'U101', category: 'senior', vehicleType: 'cab', passengerCount: 2, pickup: LOCATIONS.mgRoad, destination: LOCATIONS.indiranagar, createdAt: simTime })
      ];
      return { simTime, simulatedTimeLabel: '16:00 (Daytime)', vehicles, bookings };
    }

    default: {
      const err = new Error(`Unknown scenario "${scenarioId}"`);
      err.statusCode = 400;
      throw err;
    }
  }
}

function listScenarios() {
  return SCENARIO_DEFINITIONS;
}

/**
 * Deterministically generate scenario records and run them through the real
 * priority & allocation engines.
 */
async function generateScenario(scenarioId, options = {}) {
  const blueprint = getScenarioBlueprint(scenarioId);
  const BookingModel = options.BookingModel || Booking;
  const VehicleModel = options.VehicleModel || Vehicle;
  const UserModel = options.UserModel || User;
  const allocationService = options.allocationService || defaultAllocationService;
  const routingService = options.routingService || defaultRoutingService;

  // Replace collections cleanly so repeated scenario generation never duplicates records
  if (!options.skipDbClear) {
    await Promise.all([
      BookingModel.deleteMany({}),
      VehicleModel.deleteMany({})
    ]);

    const userCount = await UserModel.countDocuments();
    if (userCount === 0) {
      await UserModel.insertMany(SEED_USERS);
    }

    await VehicleModel.insertMany(blueprint.vehicles);
    await BookingModel.insertMany(blueprint.bookings);
  }

  let allocationResult = await allocationService.runAllocationCycle({
    BookingModel,
    VehicleModel,
    routingService,
    now: blueprint.simTime
  });

  let cancellationEvent = null;

  // Scenario 5: Simulate the initially assigned vehicle going offline before pickup,
  // safely releasing the booking and reallocating to another suitable vehicle.
  if (scenarioId === 'vehicle_cancellation' && allocationResult.allocated.length > 0) {
    const firstAssigned = allocationResult.allocated[0];
    await VehicleModel.updateOne(
      { vehicleId: firstAssigned.vehicleId },
      { $set: { status: 'offline', currentBookingId: null } }
    );
    await BookingModel.updateOne(
      { bookingId: firstAssigned.bookingId },
      { $set: { status: 'requested', vehicleId: null, estimatedPickupMinutes: null } }
    );

    const reallocation = await allocationService.runAllocationCycle({
      BookingModel,
      VehicleModel,
      routingService,
      now: blueprint.simTime
    });

    cancellationEvent = {
      cancelledVehicleId: firstAssigned.vehicleId,
      affectedBookingId: firstAssigned.bookingId,
      reallocatedTo: reallocation.allocated[0]?.vehicleId || null
    };
    allocationResult = reallocation;
  }

  return {
    scenarioId,
    simulatedTime: blueprint.simTime.toISOString(),
    simulatedTimeLabel: blueprint.simulatedTimeLabel,
    allocation: allocationResult,
    cancellationEvent
  };
}

module.exports = {
  listScenarios,
  generateScenario,
  getScenarioBlueprint,
  SCENARIO_DEFINITIONS
};

