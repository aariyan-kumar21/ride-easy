/**
 * Centralized in-memory storage engine for Smart Cab & Auto Allocation System.
 * Replaces MongoDB/Mongoose with fast, deterministic, in-process collections.
 */

const INITIAL_USERS = [
  {
    userId: 'U101',
    name: 'Lakshmi Narayan',
    category: 'senior',
    passengerCount: 1,
    defaultPickup: { lat: 12.9742, lng: 77.6012, label: 'Cubbon Park Metro' },
    defaultDestination: { lat: 12.9585, lng: 77.6488, label: 'Manipal Hospital, HAL' },
    createdAt: new Date('2026-11-12T14:00:00.000Z')
  },
  {
    userId: 'U102',
    name: 'Ananya Rao',
    category: 'woman',
    passengerCount: 2,
    defaultPickup: { lat: 12.9389, lng: 77.6211, label: 'Koramangala 4th Block' },
    defaultDestination: { lat: 12.9752, lng: 77.6045, label: 'MG Road Boulevard' },
    createdAt: new Date('2026-11-12T14:00:00.000Z')
  },
  {
    userId: 'U103',
    name: 'Karthik Shetty',
    category: 'regular',
    passengerCount: 4,
    defaultPickup: { lat: 12.9767, lng: 77.5713, label: 'Majestic Bus Station' },
    defaultDestination: { lat: 12.9784, lng: 77.6408, label: 'Indiranagar 100ft Rd' },
    createdAt: new Date('2026-11-12T14:00:00.000Z')
  },
  {
    userId: 'U104',
    name: 'Raghavendra Iyer',
    category: 'senior',
    passengerCount: 1,
    defaultPickup: { lat: 12.9982, lng: 77.5685, label: 'Malleshwaram 8th Cross' },
    defaultDestination: { lat: 12.9796, lng: 77.5907, label: 'Vidhana Soudha' },
    createdAt: new Date('2026-11-12T14:00:00.000Z')
  },
  {
    userId: 'U105',
    name: 'Meera Nair',
    category: 'regular',
    passengerCount: 2,
    defaultPickup: { lat: 12.9304, lng: 77.583, label: 'Jayanagar 4th Block' },
    defaultDestination: { lat: 12.966, lng: 77.5998, label: 'Richmond Circle' },
    createdAt: new Date('2026-11-12T14:00:00.000Z')
  }
];

const INITIAL_VEHICLES = [
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

const INITIAL_BOOKINGS = [
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
    routeDistanceMeters: 1850,
    createdAt: new Date('2026-11-12T13:57:00.000Z'),
    updatedAt: new Date('2026-11-12T13:57:00.000Z')
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
    routeDistanceMeters: 4200,
    createdAt: new Date('2026-11-12T13:50:00.000Z'),
    updatedAt: new Date('2026-11-12T13:50:00.000Z')
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
    routeDistanceMeters: 6400,
    createdAt: new Date('2026-11-12T13:45:00.000Z'),
    updatedAt: new Date('2026-11-12T13:45:00.000Z')
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
    routeDistanceMeters: null,
    createdAt: new Date('2026-11-12T13:56:00.000Z'),
    updatedAt: new Date('2026-11-12T13:56:00.000Z')
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
    routeDistanceMeters: 4800,
    createdAt: new Date('2026-11-12T13:30:00.000Z'),
    updatedAt: new Date('2026-11-12T13:30:00.000Z')
  }
];

function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (Array.isArray(obj)) return obj.map(deepClone);
  const copy = {};
  for (const [key, val] of Object.entries(obj)) {
    copy[key] = deepClone(val);
  }
  return copy;
}

function matchesFilter(doc, filter = {}) {
  for (const [key, condition] of Object.entries(filter)) {
    const value = doc[key];
    if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
      if ('$in' in condition && !condition.$in.includes(value)) return false;
      if ('$gte' in condition && !(value >= condition.$gte)) return false;
      if ('$lte' in condition && !(value <= condition.$lte)) return false;
      if ('$ne' in condition && value === condition.$ne) return false;
    } else if (value !== condition) {
      return false;
    }
  }
  return true;
}

function applySort(docs, sortOptions = {}) {
  return [...docs].sort((a, b) => {
    for (const [key, dir] of Object.entries(sortOptions)) {
      const valA = a[key];
      const valB = b[key];
      if (valA === valB) continue;
      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;
      const cmp = valA > valB ? 1 : -1;
      return dir === -1 || dir === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}

function wrapDocument(doc, collection) {
  if (!doc || typeof doc !== 'object') return doc;
  const wrapped = deepClone(doc);
  wrapped.toObject = () => deepClone(wrapped);
  wrapped.save = async function () {
    if (collection && collection.data) {
      const idx = collection.data.findIndex((d) =>
        (d._id && d._id === wrapped._id) ||
        (d.bookingId && d.bookingId === wrapped.bookingId) ||
        (d.vehicleId && d.vehicleId === wrapped.vehicleId) ||
        (d.userId && d.userId === wrapped.userId)
      );
      if (idx !== -1) {
        collection.data[idx] = deepClone(wrapped);
        collection.data[idx].updatedAt = new Date();
      }
    }
    return wrapDocument(wrapped, collection);
  };
  return wrapped;
}

class InMemoryCollection {
  constructor(name, initialData = []) {
    this.name = name;
    this.data = initialData.map((d, i) => ({
      _id: d._id || `init_${name}_${i + 1}`,
      ...deepClone(d)
    }));
  }

  reset(data = []) {
    this.data = data.map((d, i) => ({
      _id: d._id || `init_${this.name}_${i + 1}`,
      ...deepClone(d)
    }));
  }

  find(filter = {}) {
    let results = this.data.filter((d) => matchesFilter(d, filter));
    const self = this;

    const query = {
      _filter: filter,
      _sortOptions: null,
      sort(sortOptions) {
        results = applySort(results, sortOptions);
        return query;
      },
      lean() {
        return results.map((d) => deepClone(d));
      },
      then(resolve, reject) {
        return Promise.resolve(results.map((d) => wrapDocument(d, self))).then(resolve, reject);
      }
    };

    return query;
  }

  findOne(filter = {}) {
    const match = this.data.find((d) => matchesFilter(d, filter));
    const self = this;

    const query = {
      lean() {
        return match ? deepClone(match) : null;
      },
      then(resolve, reject) {
        return Promise.resolve(match ? wrapDocument(match, self) : null).then(resolve, reject);
      }
    };

    return query;
  }

  findById(id) {
    return this.findOne({ _id: id });
  }

  async create(doc) {
    const now = new Date();
    const newDoc = {
      _id: doc._id || `id_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: doc.createdAt || now,
      updatedAt: doc.updatedAt || now,
      ...deepClone(doc)
    };
    this.data.push(newDoc);
    return wrapDocument(newDoc, this);
  }

  async insertMany(docs) {
    const inserted = docs.map((d) => ({
      _id: d._id || `id_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: d.createdAt || new Date(),
      updatedAt: d.updatedAt || new Date(),
      ...deepClone(d)
    }));
    this.data.push(...inserted);
    return inserted.map((d) => wrapDocument(d, this));
  }

  async updateOne(filter, update) {
    const idx = this.data.findIndex((d) => matchesFilter(d, filter));
    if (idx === -1) return { modifiedCount: 0 };

    const target = this.data[idx];
    if (update.$set) {
      Object.assign(target, deepClone(update.$set));
    } else {
      Object.assign(target, deepClone(update));
    }
    target.updatedAt = new Date();
    return { modifiedCount: 1 };
  }

  async findOneAndUpdate(filter, update, options = {}) {
    const idx = this.data.findIndex((d) => matchesFilter(d, filter));
    if (idx === -1) return null;

    const target = this.data[idx];
    const prev = deepClone(target);

    if (update.$set) {
      Object.assign(target, deepClone(update.$set));
    } else {
      Object.assign(target, deepClone(update));
    }
    target.updatedAt = new Date();

    return wrapDocument(options.new ? target : prev, this);
  }

  async deleteMany(filter = {}) {
    if (Object.keys(filter).length === 0) {
      const count = this.data.length;
      this.data = [];
      return { deletedCount: count };
    }
    const prev = this.data.length;
    this.data = this.data.filter((d) => !matchesFilter(d, filter));
    return { deletedCount: prev - this.data.length };
  }

  async countDocuments(filter = {}) {
    return this.data.filter((d) => matchesFilter(d, filter)).length;
  }

  async distinct(field, filter = {}) {
    const matched = this.data.filter((d) => matchesFilter(d, filter));
    return Array.from(new Set(matched.map((d) => d[field]).filter(Boolean)));
  }

  async bulkWrite(ops = []) {
    let modifiedCount = 0;
    let upsertedCount = 0;
    for (const op of ops) {
      if (op.updateOne) {
        const { filter, update, upsert } = op.updateOne;
        const idx = this.data.findIndex((d) => matchesFilter(d, filter));
        if (idx !== -1) {
          if (update.$set) {
            Object.assign(this.data[idx], deepClone(update.$set));
          } else if (update.$setOnInsert) {
            // No-op if record already exists
          } else {
            Object.assign(this.data[idx], deepClone(update));
          }
          this.data[idx].updatedAt = new Date();
          modifiedCount++;
        } else if (upsert) {
          const newDoc = {
            _id: `id_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...(update.$setOnInsert ? deepClone(update.$setOnInsert) : {}),
            ...(update.$set ? deepClone(update.$set) : {})
          };
          this.data.push(newDoc);
          upsertedCount++;
        }
      }
    }
    return { modifiedCount, upsertedCount };
  }

  async aggregate(pipeline = []) {
    let docs = [...this.data];
    for (const stage of pipeline) {
      if (stage.$group) {
        const groupField = stage.$group._id.replace(/^\$/, '');
        const groups = new Map();
        for (const doc of docs) {
          const val = doc[groupField];
          groups.set(val, (groups.get(val) || 0) + 1);
        }
        docs = Array.from(groups.entries()).map(([k, count]) => ({ _id: k, count }));
      }
    }
    return docs;
  }
}

// Singleton in-memory collections
const users = new InMemoryCollection('users', INITIAL_USERS);
const vehicles = new InMemoryCollection('vehicles', INITIAL_VEHICLES);
const bookings = new InMemoryCollection('bookings', INITIAL_BOOKINGS);

function resetAll() {
  users.reset(INITIAL_USERS);
  vehicles.reset(INITIAL_VEHICLES);
  bookings.reset(INITIAL_BOOKINGS);
}

module.exports = {
  users,
  vehicles,
  bookings,
  User: users,
  Vehicle: vehicles,
  Booking: bookings,
  resetAll,
  INITIAL_USERS,
  INITIAL_VEHICLES,
  INITIAL_BOOKINGS
};
