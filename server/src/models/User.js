const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
    label: { type: String, trim: true, default: '' }
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    name: {
      type: String,
      required: [true, 'User name is required'],
      trim: true,
      minlength: 2,
      maxlength: 80
    },
    category: {
      type: String,
      enum: ['senior', 'woman', 'regular'],
      default: 'regular',
      required: true,
      index: true
    },
    passengerCount: {
      type: Number,
      min: 1,
      max: 6,
      default: 1
    },
    defaultPickup: {
      type: locationSchema,
      default: undefined
    },
    defaultDestination: {
      type: locationSchema,
      default: undefined
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
);

module.exports = mongoose.model('User', userSchema);

