const { resetAll } = require('../store/memoryStore');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const Booking = require('../models/Booking');

const SEED_USERS = [
  {
    userId: 'U101',
    name: 'Lakshmi Narayan',
    category: 'senior',
    passengerCount: 1,
    defaultPickup: { lat: 12.9742, lng: 77.6012, label: 'Cubbon Park Metro' },
    defaultDestination: { lat: 12.9585, lng: 77.6488, label: 'Manipal Hospital, HAL' }
  },
  {
    userId: 'U102',
    name: 'Ananya Rao',
    category: 'woman',
    passengerCount: 2,
    defaultPickup: { lat: 12.9389, lng: 77.6211, label: 'Koramangala 4th Block' },
    defaultDestination: { lat: 12.9752, lng: 77.6045, label: 'MG Road Boulevard' }
  },
  {
    userId: 'U103',
    name: 'Karthik Shetty',
    category: 'regular',
    passengerCount: 4,
    defaultPickup: { lat: 12.9767, lng: 77.5713, label: 'Majestic Bus Station' },
    defaultDestination: { lat: 12.9784, lng: 77.6408, label: 'Indiranagar 100ft Rd' }
  },
  {
    userId: 'U104',
    name: 'Raghavendra Iyer',
    category: 'senior',
    passengerCount: 1,
    defaultPickup: { lat: 12.9982, lng: 77.5685, label: 'Malleshwaram 8th Cross' },
    defaultDestination: { lat: 12.9796, lng: 77.5907, label: 'Vidhana Soudha' }
  },
  {
    userId: 'U105',
    name: 'Meera Nair',
    category: 'regular',
    passengerCount: 2,
    defaultPickup: { lat: 12.9304, lng: 77.583, label: 'Jayanagar 4th Block' },
    defaultDestination: { lat: 12.966, lng: 77.5998, label: 'Richmond Circle' }
  }
];

const SEED_VEHICLES = [
  { vehicleId: 'C101', vehicleType: 'cab', capacity: 4, status: 'available', latitude: 12.9756, longitude: 77.6066, area: 'MG Road', currentBookingId: null },
  { vehicleId: 'C102', vehicleType: 'cab', capacity: 6, status: 'on_trip', latitude: 12.9784, longitude: 77.6408, area: 'Indiranagar', currentBookingId: 'BK-1044' },
  { vehicleId: 'C103', vehicleType: 'cab', capacity: 4, status: 'assigned', latitude: 12.9352, longitude: 77.6245, area: 'Koramangala', currentBookingId: 'BK-1045' },
  { vehicleId: 'C104', vehicleType: 'auto', capacity: 3, status: 'available', latitude: 12.9611, longitude: 77.5855, area: 'Lalbagh', currentBookingId: null },
  { vehicleId: 'C105', vehicleType: 'auto', capacity: 3, status: 'available', latitude: 12.9915, longitude: 77.5712, area: 'Malleshwaram', currentBookingId: null },
  { vehicleId: 'C106', vehicleType: 'auto', capacity: 3, status: 'on_trip', latitude: 12.9279, longitude: 77.5838, area: 'Jayanagar', currentBookingId: 'BK-1043' },
  { vehicleId: 'C107', vehicleType: 'cab', capacity: 4, status: 'available', latitude: 12.985, longitude: 77.5533, area: 'Rajajinagar', currentBookingId: null },
  { vehicleId: 'C108', vehicleType: 'auto', capacity: 3, status: 'assigned', latitude: 12.9592, longitude: 77.6476, area: 'Domlur', currentBookingId: null },
  { vehicleId: 'C109', vehicleType: 'cab', capacity: 6, status: 'available', latitude: 13.0098, longitude: 77.5511, area: 'Yeshwanthpur', currentBookingId: null },
  { vehicleId: 'C110', vehicleType: 'cab', capacity: 4, status: 'on_trip', latitude: 12.9668, longitude: 77.6194, area: 'Ulsoor', currentBookingId: null }
];

const SEED_BOOKINGS = [
  {
    bookingId: 'BK-1045',
    userId: 'U101',
    category: 'senior',
    vehicleId: 'C103',
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
    category: 'woman',
    vehicleId: 'C102',
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
    category: 'regular',
    vehicleId: 'C106',
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
    category: 'regular',
    vehicleId: 'C101',
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

