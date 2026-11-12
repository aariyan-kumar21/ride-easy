const mongoose = require('mongoose');

const pointSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
    label: { type: String, required: true, trim: true, maxlength: 160 }
  },
  { _id: false }
);

const priorityBreakdownSchema = new mongoose.Schema(
  {
    categoryBonus: { type: Number, default: 0 },
    waitingTimeBonus: { type: Number, default: 0 },
    isNightHours: { type: Boolean, default: false },
    reason: { type: String, default: '' }
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    bookingId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    userId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    category: {
      type: String,
      enum: ['senior', 'woman', 'regular'],
      default: 'regular',
      required: true
    },
    vehicleId: {
      type: String,
      default: null,
      index: true
    },
    pickup: {
      type: pointSchema,
      required: true
    },
    destination: {
      type: pointSchema,
      required: true
    },
    passengerCount: {
      type: Number,
      required: true,
      min: 1,
      max: 6
    },
    vehicleType: {
      type: String,
      enum: ['cab', 'auto'],
      required: true
    },
    status: {
      type: String,
      enum: [
        'requested',
        'queued',
        'assigned',
        'to_pickup',
        'arrived',
        'on_trip',
        'completed',
        'cancelled'
      ],
      default: 'requested',
      required: true,
      index: true
    },
    priorityScore: {
      type: Number,
      default: 0,
      index: true
    },
    priorityBreakdown: {
      type: priorityBreakdownSchema,
      default: () => ({})
    },
    estimatedPickupMinutes: {
      type: Number,
      default: null
    },
    routeDistanceMeters: {
      type: Number,
      default: null
    },
    routeDurationSeconds: {
      type: Number,
      default: null
    },
    isEstimatedRoute: {
      type: Boolean,
      default: false
    },
    routeGeometry: {
      type: [[Number]],
      default: []
    }
  },
  {
    timestamps: true
  }
);

bookingSchema.index({ status: 1, priorityScore: -1, createdAt: 1 });

module.exports = mongoose.model('Booking', bookingSchema);

