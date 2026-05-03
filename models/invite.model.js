const mongoose = require("mongoose");

const inviteSchema = new mongoose.Schema({
    rideId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Ride",
        required: true,
        index: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    inviteId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    expiresAt: {
        type: Date,
        required: true,
        index: true
    }
    // isUsed: {
    //     type: Boolean,
    //     default: false,
    //     index: true
    // }
}, {
    timestamps: true
});

module.exports = mongoose.model("Invite", inviteSchema);
