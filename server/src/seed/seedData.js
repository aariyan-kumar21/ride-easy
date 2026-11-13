const { resetAll } = require('../store/memoryStore');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const Booking = require('../models/Booking');

const SEED_USERS = [
  {
    userId: 'U101',
    name: 'Rajesh Khanna',
    category: 'senior',
    passengerCount: 1,
    defaultPickup: { lat: 12.9742, lng: 77.6012, label: 'Cubbon Park Metro' },
    defaultDestination: { lat: 12.9585, lng: 77.6488, label: 'Manipal Hospital, HAL' }
  },
  {
    userId: 'U102',
    name: 'Ananya Sharma',
    category: 'woman',
    passengerCount: 2,
    defaultPickup: { lat: 12.9389, lng: 77.6211, label: 'Koramangala 4th Block' },
    defaultDestination: { lat: 12.9752, lng: 77.6045, label: 'MG Road Boulevard' }
  },
  {
    userId: 'U103',
    name: 'Aarav Sharma',
    category: 'regular',
    passengerCount: 4,
    defaultPickup: { lat: 12.9767, lng: 77.5713, label: 'Majestic Bus Station' },
    defaultDestination: { lat: 12.9784, lng: 77.6408, label: 'Indiranagar 100ft Rd' }
  },
  {
    userId: 'U104',
    name: 'Suresh Menon',
    category: 'senior',
    passengerCount: 1,
    defaultPickup: { lat: 12.9982, lng: 77.5685, label: 'Malleshwaram 8th Cross' },
    defaultDestination: { lat: 12.9796, lng: 77.5907, label: 'Vidhana Soudha' }
  },
  {
    userId: 'U105',
    name: 'Priya Mehta',
    category: 'woman',
    passengerCount: 2,
    defaultPickup: { lat: 12.9304, lng: 77.583, label: 'Jayanagar 4th Block' },
    defaultDestination: { lat: 12.966, lng: 77.5998, label: 'Richmond Circle' }
  }
];

const SEED_VEHICLES = [
  { vehicleId: 'Cab1', vehicleType: 'cab', capacity: 4, status: 'available', latitude: 12.9756, longitude: 77.6066, area: 'MG Road', currentBookingId: null },
  { vehicleId: 'Cab2', vehicleType: 'cab', capacity: 6, status: 'available', latitude: 12.9784, longitude: 77.6408, area: 'Indiranagar', currentBookingId: null },
  { vehicleId: 'Cab3', vehicleType: 'cab', capacity: 4, status: 'available', latitude: 12.9352, longitude: 77.6245, area: 'Koramangala', currentBookingId: null },
  { vehicleId: 'Cab4', vehicleType: 'cab', capacity: 4, status: 'available', latitude: 12.9611, longitude: 77.5855, area: 'Lalbagh', currentBookingId: null },
  { vehicleId: 'Cab5', vehicleType: 'cab', capacity: 6, status: 'available', latitude: 12.9915, longitude: 77.5712, area: 'Malleshwaram', currentBookingId: null },
  { vehicleId: 'Auto1', vehicleType: 'auto', capacity: 3, status: 'available', latitude: 12.9716, longitude: 77.5946, area: 'Cubbon Park', currentBookingId: null },
  { vehicleId: 'Auto2', vehicleType: 'auto', capacity: 3, status: 'available', latitude: 12.9389, longitude: 77.6211, area: 'Koramangala 4th Block', currentBookingId: null },
  { vehicleId: 'Auto3', vehicleType: 'auto', capacity: 3, status: 'available', latitude: 12.9767, longitude: 77.5713, area: 'Majestic', currentBookingId: null }
];

const SEED_BOOKINGS = [
  {
    bookingId: 'BK-1045',
    userId: 'U101',
    passengerName: 'Rajesh Khanna',
    category: 'senior',
    vehicleId: 'Cab3',
    pickup: { lat: 12.9742, lng: 77.6012, label: 'Cubbon Park Metro' },
    destination: { lat: 12.9585, lng: 77.6488, label: 'Manipal Hospital, HAL' },
    passengerCount: 1,
    vehicleType: 'cab',
    status: 'assigned',
    priorityScore: 40,
    priorityBreakdown: { categoryBonus: 40, waitingTimeBonus: 0, isNightHours: false, reason: 'Senior citizen (+40)' },
    estimatedPickupMinutes: 3,
    routeDistanceMeters: 1850
  },
  {
    bookingId: 'BK-1044',
    userId: 'U102',
    passengerName: 'Ananya Sharma',
    category: 'woman',
    vehicleId: 'Cab2',
    pickup: { lat: 12.9389, lng: 77.6211, label: 'Koramangala 4th Block' },
    destination: { lat: 12.9752, lng: 77.6045, label: 'MG Road Boulevard' },
    passengerCount: 2,
    vehicleType: 'cab',
    status: 'on_trip',
    priorityScore: 0,
    priorityBreakdown: { categoryBonus: 0, waitingTimeBonus: 0, isNightHours: false, reason: 'Daytime regular window' },
    estimatedPickupMinutes: 0,
    routeDistanceMeters: 4200
  },
  {
    bookingId: 'BK-1043',
    userId: 'U103',
    passengerName: 'Aarav Sharma',
    category: 'regular',
    vehicleId: 'Auto2',
    pickup: { lat: 12.9767, lng: 77.5713, label: 'Majestic Bus Station' },
    destination: { lat: 12.9784, lng: 77.6408, label: 'Indiranagar 100ft Rd' },
    passengerCount: 2,
    vehicleType: 'auto',
    status: 'on_trip',
    priorityScore: 0,
    priorityBreakdown: { categoryBonus: 0, waitingTimeBonus: 0, isNightHours: false, reason: 'Regular passenger' },
    estimatedPickupMinutes: 0,
    routeDistanceMeters: 6400
  },
  {
    bookingId: 'BK-1042',
    userId: 'U104',
    passengerName: 'Suresh Menon',
    category: 'senior',
    vehicleId: null,
    pickup: { lat: 12.9982, lng: 77.5685, label: 'Malleshwaram 8th Cross' },
    destination: { lat: 12.9796, lng: 77.5907, label: 'Vidhana Soudha' },
    passengerCount: 1,
    vehicleType: 'cab',
    status: 'queued',
    priorityScore: 44,
    priorityBreakdown: { categoryBonus: 40, waitingTimeBonus: 4, isNightHours: false, reason: 'Senior citizen (+40) + 4m wait (+4)' },
    estimatedPickupMinutes: null,
    routeDistanceMeters: null
  },
  {
    bookingId: 'BK-1041',
    userId: 'U105',
    passengerName: 'Priya Mehta',
    category: 'regular',
    vehicleId: 'Cab1',
    pickup: { lat: 12.9304, lng: 77.583, label: 'Jayanagar 4th Block' },
    destination: { lat: 12.966, lng: 77.5998, label: 'Richmond Circle' },
    passengerCount: 2,
    vehicleType: 'cab',
    status: 'completed',
    priorityScore: 0,
    priorityBreakdown: { categoryBonus: 0, waitingTimeBonus: 0, isNightHours: false, reason: 'Regular passenger' },
    estimatedPickupMinutes: 0,
    routeDistanceMeters: 4800
  }
];

async function seedDatabase() {
  resetAll();

  const [userCount, vehicleCount, bookingCount] = await Promise.all([
    User.countDocuments(),
    Vehicle.countDocuments(),
    Booking.countDocuments()
  ]);

  console.log(`Seed complete (in-memory). Counts -> Users: ${userCount}, Vehicles: ${vehicleCount}, Bookings: ${bookingCount}`);
}

if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err.message);
      process.exit(1);
    });
}

module.exports = { seedDatabase, SEED_USERS, SEED_VEHICLES, SEED_BOOKINGS };

