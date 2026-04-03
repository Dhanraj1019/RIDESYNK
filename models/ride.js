const mongoose = require("mongoose");

const rideSchema = new mongoose.Schema({

  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },

  // 🧾 Basic Info
  ridename: {
    type: String,
    required: true,
    trim: true
  },

  date: {
    type: Date,
    required: true,
    index: true
  },

  time: {
    type: String,
    required: true
  },

  sorce: {
    type: String,
    required: true,
    trim: true
  },

  destination: {
    type: String,
    required: true,
    trim: true
  },

  distance: {
    type: Number,
    required: true,
    min: 0
  },

  // 📍 Geo Locations  (GeoJSON Point)
  sorceLocation: {
    type: {
      type: String,
      enum: ["Point"],
      required: true
    },
    coordinates: {
      type: [Number],   // [lng, lat]  — Mapbox / GeoJSON convention
      required: true
    }
  },

  destinationLocation: {
    type: {
      type: String,
      enum: ["Point"],
      required: true
    },
    coordinates: {
      type: [Number],   // [lng, lat]
      required: true
    }
  },

  // 👥 Members count
  totalMembers: {
    type: Number,
    default: 1   // admin is counted
  },

  // 🚦 Ride Status
  status: {
    type: String,
    enum: ["active", "upcoming", "completed", "canceled", "cancelled", "archived"],
    default: "upcoming",
    index: true
  },

  // 🗑️ Soft delete support
  isDeleted: {
    type: Boolean,
    default: false
  },

  deletedAt: {
    type: Date
  }

}, { timestamps: true });

// ── GEO INDEXES ────────────────────────────────────────────────────────
// FIX: was "sourceLocation" (wrong field name) – field in schema is "sorceLocation"
rideSchema.index({ sorceLocation:       "2dsphere" });
rideSchema.index({ destinationLocation: "2dsphere" });

module.exports = mongoose.model("Ride", rideSchema);