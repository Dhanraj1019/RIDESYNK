const mongoose = require("mongoose");
const passportLocalMongoose = require("passport-local-mongoose").default;
const RideMember=require("./ride_member.js");
const Ride=require("./ride.js");
const userSchema = new mongoose.Schema({
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  username: {
    type: String,
    unique:true,
    required: true,
    trim: true
  },

  email: {
    type: String,
    required: true,
    unique:true,
    lowercase: true,
    trim: true
  },

  firstname: {
    type: String,
    trim: true
  },

  lastname: {
    type: String,
    trim: true
  },

  phonenumber: {
    type: String,
    unique:true,
    sparse: true,
    trim: true
  },

  vehical: {
    type: String,
    trim: true
  },

  travel:{
    type:Number,
    default:0
  },
  // 🔴 Deletion lifecycle
  status: {
    type: String,
    enum: ["active", "pending_delete", "archived"],
    default: "active"
  },

  isDeleted: {
    type: Boolean,
    default: false
  },

  deletedAt: {
    type: Date
  },

  deleteAfter: {
    type: Date,
    index: true   // ⚡ important for cron performance
  },

  // deletedReason: {
  //   type: String,
  //   enum: ["user", "admin", "system"],
  //   default: "user"
  // }

}, { timestamps: true });

// adds hash + salt (password handled securely)
userSchema.plugin(passportLocalMongoose);

// userSchema.post("findOneAndDelete",async (list)=>{
//       const rides=await RideMember.find({userId:list._id,role:"admin"});
//       const adminrides=rides.map(m=>
//         m.rideId
//       )
//       await Ride.deleteMany({_id:{$in:adminrides}});
//       await RideMember.deleteMany({rideId:{$in:adminrides}})
//       await RideMember.deleteMany({userId:list._id});
//       console.log("rides deleted...........");
// })

module.exports = mongoose.model("User", userSchema);