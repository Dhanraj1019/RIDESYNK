const User=require("../models/user.js");
const Ride=require("../models/ride.js");
const RideMember=require("../models/ride_member.js");
const {ALLOW_MEMBER_CANCELLATION}=require("../utils/extra.js");
module.exports.home=async (req,res,next)=>{
    try {
        const data=await User.findOne({_id:req.user._id});
        if (!data) {
            req.flash("error", "User data not found.");
            return res.redirect("/logout"); // Or wherever appropriate
        }

        const rides=await RideMember.find({userId:req.user._id}).populate("rideId");
        
        let members=0;
        // Filter out null rideIds (if a ride was deleted but members were left behind)
        const validRides = rides.filter(ride => ride && ride.rideId);
        
        for(let ride of validRides){
            if (ride.rideId.totalMembers) {
                members += ride.rideId.totalMembers;
            }
        }
        
        return res.render("listing/home_dashboard.ejs",{data,rides:validRides,members});
    } catch(e) {
        return next(e);
    }
};

module.exports.setting=async (req,res,next)=>{
    try {
        const data=await User.findOne({_id:req.user._id});
        if (!data) {
            req.flash("error", "User data not found.");
            return res.redirect("/logout");
        }
        return res.render("profile/settings.ejs",{data});
    } catch(e) {
        return next(e);
    }
};

module.exports.rides=async (req,res,next)=>{
    try {
        const {id} = req.params;
        if (req.user._id.toString() !== id.toString()) {
            req.flash("error", "you are not authorized to view this ride list");
            return res.redirect(`/ridesynk/${req.user._id.toString()}/rides`);
        }
        const fulldata=await RideMember.find({userId:id}).select("rideId").populate("rideId");
        
        // Filter out null ride references that might exist due to uncascaded deletes
        const validFulldata = fulldata.filter(fd => fd && fd.rideId);
        
        if(validFulldata.length){
            return res.render("rides/rides_list.ejs",{data:validFulldata,canMembersCancel:ALLOW_MEMBER_CANCELLATION});
        }
        else{
            return res.render("rides/noride.ejs");
        }
    } catch(e) {
        return next(e);
    }
};

module.exports.profile=async (req,res,next)=>{
    try {
        const id=req.user._id;
        const data=await User.findOne({_id:id});
        if (!data) {
            req.flash("error", "User data not found.");
            return res.redirect("/logout");
        }
        const rides=await RideMember.find({userId:req.user._id});
        return res.render("profile/profile.ejs",{data,rides});
    } catch(e) {
        return next(e);
    }
};