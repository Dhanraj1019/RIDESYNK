const mongoose = require("mongoose");

// Embedded travel schema used inside User for ride telemetry history.
const TravelSchema = new mongoose.Schema({
    totalDistance: {
        type: Number,
        default: 0
    },
    coordinates: {
        type: [[Number]],
        default: []
    },
    duration: {
        type: Number,
        default: 0
    },
    updatedAt: {
        type: Date,
        default: null
    }
}, {
    _id: false
});

module.exports = { TravelSchema };
