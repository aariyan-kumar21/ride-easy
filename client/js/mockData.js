/**
 * Temporary mock dataset for frontend dashboard presentation.
 * Will be replaced by live MongoDB + Socket.IO state in backend milestones.
 */

export const BENGALURU_CENTER = [12.9716, 77.5946];

export const MOCK_VEHICLES = [
  { id: 'CAB-101', type: 'cab', capacity: 4, status: 'available', lat: 12.9756, lng: 77.6066, area: 'MG Road' },
  { id: 'CAB-102', type: 'cab', capacity: 6, status: 'on_trip', lat: 12.9784, lng: 77.6408, area: 'Indiranagar' },
  { id: 'CAB-103', type: 'cab', capacity: 4, status: 'assigned', lat: 12.9352, lng: 77.6245, area: 'Koramangala' },
  { id: 'AUTO-201', type: 'auto', capacity: 3, status: 'available', lat: 12.9611, lng: 77.5855, area: 'Lalbagh' },
  { id: 'AUTO-202', type: 'auto', capacity: 3, status: 'available', lat: 12.9915, lng: 77.5712, area: 'Malleshwaram' },
  { id: 'AUTO-203', type: 'auto', capacity: 3, status: 'on_trip', lat: 12.9279, lng: 77.5838, area: 'Jayanagar' },
  { id: 'CAB-104', type: 'cab', capacity: 4, status: 'available', lat: 12.9850, lng: 77.5533, area: 'Rajajinagar' },
  { id: 'AUTO-204', type: 'auto', capacity: 3, status: 'offline', lat: 12.9562, lng: 77.6510, area: 'Domlur' }
];

export const MOCK_BOOKINGS = [
  {
    id: 'BK-1045',
    category: 'Senior Citizen',
    vehicle: 'CAB-103',
    status: 'assigned',
    estPickup: '3 min',
    pickup: [12.9410, 77.6190],
    destination: [12.9716, 77.5946]
  },
  {
    id: 'BK-1044',
    category: 'Woman',
    vehicle: 'CAB-102',
    status: 'on_trip',
    estPickup: 'Picked up',
    pickup: [12.9784, 77.6408],
    destination: [12.9698, 77.7499]
  },
  {
    id: 'BK-1043',
    category: 'Regular',
    vehicle: 'AUTO-203',
    status: 'on_trip',
    estPickup: 'Picked up',
    pickup: [12.9279, 77.5838],
    destination: [12.9507, 77.5848]
  },
  {
    id: 'BK-1042',
    category: 'Senior Citizen',
    vehicle: 'Pending',
    status: 'queued',
    estPickup: '—',
    pickup: [12.9660, 77.6000],
    destination: [12.9810, 77.5750]
  },
  {
    id: 'BK-1041',
    category: 'Regular',
    vehicle: 'CAB-101',
    status: 'completed',
    estPickup: 'Done',
    pickup: [12.9756, 77.6066],
    destination: [12.9900, 77.6100]
  }
];

export const MOCK_QUEUE = [
  { id: 'BK-1042', priorityScore: 44, waitMinutes: 4, category: 'Senior Citizen (+40)' },
  { id: 'BK-1040', priorityScore: 12, waitMinutes: 12, category: 'Regular (+0)' },
  { id: 'BK-1039', priorityScore: 7, waitMinutes: 7, category: 'Woman Daytime (+0)' }
];

