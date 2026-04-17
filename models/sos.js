const mongoose = require("mongoose");

const sosSchema = new mongoose.Schema(
    {
        rideId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Ride",
            required: true,
            index: true
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        resolvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        status: {
            type: String,
            enum: ["active", "resolved"],
            default: "active",
            index: true
        },
        resolvedAt: {
            type: Date,
            default: null
        },
        location: {
            lat: { type: Number },
            lng: { type: Number },
            address: { type: String, trim: true, maxlength: 200 }
        }
    },
    { timestamps: true }
);

sosSchema.index({ rideId: 1, status: 1, createdAt: -1 });

// One active SOS max for same user in same ride.
sosSchema.index(
    { userId: 1, rideId: 1, status: 1 },
    { unique: true, partialFilterExpression: { status: "active" } }
);

module.exports = mongoose.model("Sos", sosSchema);