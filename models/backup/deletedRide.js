const mongoose = require("mongoose");

// A flexible schema for backups without strict types or unique constraints
const deleteRideSchema = new mongoose.Schema({}, { strict: false, timestamps: true });

deleteRideSchema.set("autoIndex", false); // Prevents Mongoose from building any indexes automatically

module.exports = mongoose.model("DeleteRide", deleteRideSchema);