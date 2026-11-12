/**
 * Temporary mock bookings and queue data for dashboard presentation.
 * Pickup coordinates align with Bengaluru locations in seedData.js.
 */

export const MOCK_BOOKINGS = [
  {
    id: 'BK-1045',
    passengerId: 'U101',
    category: 'Senior Citizen',
    vehicle: 'C103',
    status: 'assigned',
    estPickup: '3 min',
    pickup: [12.9742, 77.6012],
    destination: [12.9585, 77.6488]
  },
  {
    id: 'BK-1044',
    passengerId: 'U102',
    category: 'Woman',
    vehicle: 'C102',
    status: 'on_trip',
    estPickup: 'Picked up',
    pickup: [12.9389, 77.6211],
    destination: [12.9752, 77.6045]
  },
  {
    id: 'BK-1043',
    passengerId: 'U103',
    category: 'Regular',
    vehicle: 'C106',
    status: 'on_trip',
    estPickup: 'Picked up',
    pickup: [12.9767, 77.5713],
    destination: [12.9784, 77.6408]
  },
  {
    id: 'BK-1042',
    passengerId: 'U104',
    category: 'Senior Citizen',
    vehicle: 'Pending',
    status: 'queued',
    estPickup: '—',
    pickup: [12.9982, 77.5685],
    destination: [12.9796, 77.5907]
  },
  {
    id: 'BK-1041',
    passengerId: 'U105',
    category: 'Regular',
    vehicle: 'C101',
    status: 'completed',
    estPickup: 'Done',
    pickup: [12.9304, 77.5830],
    destination: [12.9660, 77.5998]
  }
];

export const MOCK_QUEUE = [
  {
    id: 'BK-1042',
    passengerId: 'U104',
    priorityScore: 44,
    waitMinutes: 4,
    category: 'Senior Citizen (+40)',
    pickup: [12.9982, 77.5685]
  },
  {
    id: 'BK-1040',
    passengerId: 'U102',
    priorityScore: 12,
    waitMinutes: 12,
    category: 'Regular (+0)',
    pickup: [12.9389, 77.6211]
  },
  {
    id: 'BK-1039',
    passengerId: 'U105',
    priorityScore: 7,
    waitMinutes: 7,
    category: 'Woman Daytime (+0)',
    pickup: [12.9304, 77.5830]
  }
];
