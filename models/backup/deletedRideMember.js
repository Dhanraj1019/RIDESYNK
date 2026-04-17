const mongoose = require("mongoose");

// A flexible schema for backups without strict types or unique constraints
const deleteRideMemberSchema = new mongoose.Schema({}, { strict: false, timestamps: true });

deleteRideMemberSchema.set("autoIndex", false); // Prevents Mongoose from building any indexes automatically

module.exports = mongoose.model("DeleteRideMember", deleteRideMemberSchema);