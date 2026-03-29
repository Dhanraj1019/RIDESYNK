const mongoose = require("mongoose");
const sosSchema=new mongoose.Schema({
    location:{
        required:true
    },
    rideId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Ride",
        required:true
    },
    userId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true
    }
},{ timestamps: true });

module.exports=mongoose.model("Sos",sosSchema);