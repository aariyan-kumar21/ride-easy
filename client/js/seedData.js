/**
 * Reproducible Bengaluru seed data for Milestone 2 (Map & Markers).
 * Coordinates are fixed real-world locations across Bengaluru neighborhoods.
 */

export const BENGALURU_CENTER = [12.9716, 77.5946];
export const DEFAULT_ZOOM = 13;

export const SEED_VEHICLES = [
  { id: 'C101', vehicleType: 'Cab', capacity: 4, status: 'available', lat: 12.9756, lng: 77.6066, area: 'MG Road' },
  { id: 'C102', vehicleType: 'Cab', capacity: 6, status: 'on_trip', lat: 12.9784, lng: 77.6408, area: 'Indiranagar' },
  { id: 'C103', vehicleType: 'Cab', capacity: 4, status: 'assigned', lat: 12.9352, lng: 77.6245, area: 'Koramangala' },
  { id: 'C104', vehicleType: 'Auto', capacity: 3, status: 'available', lat: 12.9611, lng: 77.5855, area: 'Lalbagh' },
  { id: 'C105', vehicleType: 'Auto', capacity: 3, status: 'available', lat: 12.9915, lng: 77.5712, area: 'Malleshwaram' },
  { id: 'C106', vehicleType: 'Auto', capacity: 3, status: 'on_trip', lat: 12.9279, lng: 77.5838, area: 'Jayanagar' },
  { id: 'C107', vehicleType: 'Cab', capacity: 4, status: 'available', lat: 12.9850, lng: 77.5533, area: 'Rajajinagar' },
  { id: 'C108', vehicleType: 'Auto', capacity: 3, status: 'assigned', lat: 12.9592, lng: 77.6476, area: 'Domlur' },
  { id: 'C109', vehicleType: 'Cab', capacity: 6, status: 'available', lat: 13.0098, lng: 77.5511, area: 'Yeshwanthpur' },
  { id: 'C110', vehicleType: 'Cab', capacity: 4, status: 'on_trip', lat: 12.9668, lng: 77.6194, area: 'Ulsoor' }
];

export const SEED_PASSENGERS = [
  {
    id: 'U101',
    category: 'Senior Citizen',
    passengerCount: 1,
    lat: 12.9742,
    lng: 77.6012,
    pickup: { label: 'Cubbon Park Metro', lat: 12.9742, lng: 77.6012 },
    destination: { label: 'Manipal Hospital, HAL', lat: 12.9585, lng: 77.6488 }
  },
  {
    id: 'U102',
    category: 'Woman',
    passengerCount: 2,
    lat: 12.9389,
    lng: 77.6211,
    pickup: { label: 'Koramangala 4th Block', lat: 12.9389, lng: 77.6211 },
    destination: { label: 'MG Road Boulevard', lat: 12.9752, lng: 77.6045 }
  },
  {
    id: 'U103',
    category: 'Regular',
    passengerCount: 4,
    lat: 12.9767,
    lng: 77.5713,
    pickup: { label: 'Majestic Bus Station', lat: 12.9767, lng: 77.5713 },
    destination: { label: 'Indiranagar 100ft Rd', lat: 12.9784, lng: 77.6408 }
  },
  {
    id: 'U104',
    category: 'Senior Citizen',
    passengerCount: 1,
    lat: 12.9982,
    lng: 77.5685,
    pickup: { label: 'Malleshwaram 8th Cross', lat: 12.9982, lng: 77.5685 },
    destination: { label: 'Vidhana Soudha', lat: 12.9796, lng: 77.5907 }
  },
  {
    id: 'U105',
    category: 'Regular',
    passengerCount: 2,
    lat: 12.9304,
    lng: 77.5830,
    pickup: { label: 'Jayanagar 4th Block', lat: 12.9304, lng: 77.5830 },
    destination: { label: 'Richmond Circle', lat: 12.9660, lng: 77.5998 }
  }
];

