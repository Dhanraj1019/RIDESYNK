const mongoose=require("mongoose");
const Ride=require("../ride");
const deleteRideSchema=Ride.schema.clone();
deleteRideSchema.set("autoIndex", false);
deleteRideSchema.clearIndexes();
module.exports=mongoose.model("DeleteRide",deleteRideSchema);