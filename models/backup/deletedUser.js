const mongoose = require("mongoose");

// A flexible schema for backups without strict types or unique constraints
const deletedUserSchema = new mongoose.Schema({}, { strict: false, timestamps: true });

deletedUserSchema.set("autoIndex", false); // Prevents Mongoose from building any indexes automatically

module.exports = mongoose.model("DeleteUser", deletedUserSchema);