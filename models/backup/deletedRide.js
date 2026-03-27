const mongoose=require("mongoose");
const Ride=require("../ride");
const deleteRideSchema=Ride.schema.clone();
module.exports=mongoose.model("DeleteRide",deleteRideSchema);