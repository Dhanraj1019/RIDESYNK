// ═══════════════════════════════════════════════════════════════════════
// travel.model.js — Sub-schema for user travel statistics
// Referenced by models/user.js → { TravelSchema }
// This file was MISSING and caused "Cannot find module './travel.model.js'"
// crash on startup. Recreated from usage patterns in ridecontroller.js.
// ═══════════════════════════════════════════════════════════════════════

const mongoose = require("mongoose");

// Sub-schema (not registered as a standalone model — embedded in User)
const TravelSchema = new mongoose.Schema(
    {
        // Total cumulative distance ridden across all rides (in kilometres)
        totalDistance: {
            type: Number,
            default: 0,
            min: 0
        },

        // Total cumulative ride duration in seconds
        duration: {
            type: Number,
            default: 0,
            min: 0
        },

        // Most recent GPS coordinates snapshot for display / analytics
        // Array of [lng, lat] pairs — matches GeoJSON convention used in ride.js
        coordinates: {
            type: [[Number]],
            default: []
        },

        // Timestamp of the last update — used by userSchema index "travel.updatedAt"
        updatedAt: {
            type: Date,
            default: null
        }
    },
    { _id: false }   // embedded in User, no separate _id needed
);

module.exports = { TravelSchema };
