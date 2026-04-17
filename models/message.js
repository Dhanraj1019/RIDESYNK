const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  rideId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Ride",
    required: true,
    index: true
  },

  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },

  message: {
    type: String,
    required: true
  }

}, { timestamps: true });

// Compound index to drastically speed up room loading (avoids in-memory sort)
messageSchema.index({ rideId: 1, createdAt: 1 });

module.exports = mongoose.model("Message", messageSchema);










// const mongoose = require("mongoose");

// const messageSchema = new mongoose.Schema({
//   rideId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Ride",
//     required: true
//   },
//   senderId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Fulldetail",
//     required: true
//   },
//   message: {
//     type: String,
//     required: true
//   },
//   time: {
//     type: Date,
//     default: Date.now
//   }
// });

// module.exports = mongoose.model("Message", messageSchema);