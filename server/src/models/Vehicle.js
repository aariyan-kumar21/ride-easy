const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema(
  {
    vehicleId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    vehicleType: {
      type: String,
      enum: ['cab', 'auto'],
      required: true,
      index: true
    },
    latitude: {
      type: Number,
      required: true,
      min: -90,
      max: 90
    },
    longitude: {
      type: Number,
      required: true,
      min: -180,
      max: 180
    },
    capacity: {
      type: Number,
      required: true,
      min: 1,
      max: 8
    },
    status: {
      type: String,
      enum: ['available', 'assigned', 'to_pickup', 'on_trip', 'offline'],
      default: 'available',
      required: true,
      index: true
    },
    area: {
      type: String,
      trim: true,
      default: ''
    },
    currentBookingId: {
      type: String,
      default: null,
      index: true
    }
  },
  {
    timestamps: true
  }
);

vehicleSchema.index({ status: 1, vehicleType: 1, capacity: 1 });

module.exports = mongoose.model('Vehicle', vehicleSchema);

