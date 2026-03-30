const User=require("../models/user");
const Ride=require("../models/ride");
const RideMember=require("../models/ride_member");
const {ALLOW_MEMBER_CANCELLATION}=require("../utils/extra.js");
module.exports.home=async (req,res)=>{
    const data=await User.findOne({_id:req.user._id});
    const rides=await RideMember.find({userId:req.user._id}).populate("rideId");
    // data.rides=rides;
    // console.log(data);
    console.log("rides = ",rides);
    let members=0;
    for(let ride of rides){
        members+=ride.rideId.totalMembers;
    }
    // FIX: added return
    return res.render("listing/home_dashboard.ejs",{data,rides,members});
};

module.exports.setting=async (req,res)=>{
    const data=await User.findOne({_id:req.user._id})
    // FIX: added return
    return res.render("profile/settings.ejs",{data});
};

module.exports.rides=async (req,res)=>{
    const {id} = req.params;
    if (req.user._id.toString() !== id.toString()) {
        req.flash("error", "you are not authorized to view this ride list");
        return res.redirect(`/ridesync/${req.user._id.toString()}/rides`);
    }
    const fulldata=await RideMember.find({userId:id}).select("rideId").populate("rideId");
    console.log(fulldata);
    if(fulldata.length){
        return res.render("rides/rides_list.ejs",{data:fulldata,canMembersCancel:ALLOW_MEMBER_CANCELLATION})
    }
    else{
        return res.render("rides/noride.ejs");
    }
};

module.exports.profile=async (req,res)=>{
    const id=req.user._id;
    const data=await User.findOne({_id:id});
    const rides=await RideMember.find({userId:req.user._id});
    console.log(data);
    // FIX: added return
    return res.render("profile/profile.ejs",{data,rides});
};