const mongoose = require("mongoose");

const rideMemberSchema = new mongoose.Schema({

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

  role: {
    type: String,
    enum: ["admin", "member"],
    default: "member"
  },

  // 🔄 Membership lifecycle
  status: {
    type: String,
    enum: ["active", "left", "removed"],
    default: "active",
    index: true
  },

  joinedAt: {
    type: Date,
    default: Date.now
  },

  leftAt: {
    type: Date
  },

  removedAt: {
    type: Date
  },

  // 🔁 Track actions
  // removedBy: {
  //   type: mongoose.Schema.Types.ObjectId,
  //   ref: "User"
  // },

  // 🛡️ Optional: prevent duplicate joins
  isActive: {
    type: Boolean,
    default: true
  }

}, { timestamps: true });

// prevent duplicate join
rideMemberSchema.index({ rideId: 1, userId: 1 }, { unique: true });
rideMemberSchema.index({ userId: 1, status: 1, isActive: 1 });
rideMemberSchema.index({ rideId: 1, status: 1, isActive: 1 });

module.exports = mongoose.model("RideMember", rideMemberSchema);
