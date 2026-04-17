const User=require("../models/user.js");
const Ride=require("../models/ride.js");
const Message=require("../models/message.js");
const RideMember=require("../models/ride_member.js");
const mongoose=require("mongoose");
const map_token = process.env.MAP_TOKEN;
const {validateRideMember}=require("../utils/validateRideMember.js")
const ExpressError=require("../utils/ExpressError.js");

module.exports.livetracking=async (req,res,next)=>{
    const {id} = req.params;
    
    // Add Security Check: Verify user is a member of this ride
    const isMember = await validateRideMember(id, req.user._id);
    if (!isMember) {
        return next(new ExpressError(403, "Not authorized to view live tracking"));
    }

    const ride = await Ride.findOne({_id:id});
    if(!ride){
        return next(new ExpressError(404,"Ride not found..."));
    }

    // Populate members from ride_member collection — join with User documents
    // userId field in ride_member.js → user fields: _id, username, firstname, lastname
    const rideMembers = await RideMember.find({ rideId: id, status: "active", isActive: true })
        .populate({ path: "userId", select: "_id username firstname lastname email" });

    // Build a flat members array with user data + role — used in live_tracking.ejs
    const membersPopulated = rideMembers.map(rm => ({
        _id:       rm.userId._id,
        username:  rm.userId.username,
        firstname: rm.userId.firstname,
        lastname:  rm.userId.lastname,
        email:     rm.userId.email,
        role:      rm.role   // "admin" | "member" — from ride_member.js
    }));

    // Build rideData object with exact field names from ride.js schema
    // Embed members so live_tracking.ejs can serialize the whole object in one JSON blob
    const rideData = {
        ...ride.toObject(),
        members: membersPopulated
    };

    // message.js uses 'createdAt' (timestamps), NOT a separate 'time' field
    // senderId ref is to User — select firstname for display
    const messages = await Message.find({ rideId: id })
        .sort({ createdAt: 1 })   // ← FIXED: was { time: 1 } but 'time' field does not exist in message.js
        .populate({ path: "senderId", select: "firstname lastname username" });

    // live_tracking.ejs expects: rideData, userid, map_token
    const userid = req.user._id.toString();

    return res.render("map/live_tracking.ejs", { rideData, map_token, userid, messages });
}

module.exports.addmembersform=async (req,res,next)=>{
    try {
        const {id}=req.params;
        const isMember = await validateRideMember(id, req.user._id);
        if (!isMember) {
            return next(new ExpressError(403, "Not authorized to access this ride"));
        }
        
        const ride = await Ride.findById(id);
        if (!ride || ride.adminId.toString() !== req.user._id.toString()) {
            return next(new ExpressError(403, "Only the ride admin can add members"));
        }

        const rideroom=await RideMember.find({rideId:id}).populate("userId").populate("rideId");
        // console.log(rideroom)
        // FIX: added return
        return res.render("rides/add_members.ejs",{data:rideroom,id});
    } catch (e) {
        return next(e);
    }
}

module.exports.ridedetails=async (req,res,next)=>{
    try {
        const {id}=req.params;
        const isMember = await validateRideMember(id, req.user._id);
        if (!isMember) {
            return next(new ExpressError(403, "Not authorized to view this ride"));
        }

        const data=await Ride.findOne({_id:id});
        if (!data) return next(new ExpressError(404, "Ride not found"));
        
        const members=await RideMember.find({rideId:id}).populate("userId");
        // console.log("data = ",data)
        // console.log("id = ",id)
        // console.log("members = ",members)
        // FIX: added return
        return res.render("rides/ride_room.ejs",{data,members,map_token:process.env.MAP_TOKEN});
    } catch (e) {
        return next(e);
    }
}

module.exports.searchmember=async (req, res) => {
    try {
        const { phone } = req.query;
        if (!phone || phone.replace(/\D/g, '').length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid phone number'
            });
        }
        // console.log(phone);
        const data = await User.findOne({phonenumber:phone}).select('_id firstname lastname phonenumber isDeleted status');
        if (!data) {
            return res.status(404).json({
                success: false,
                message: `No user found with number ${phone}`
            });
        }

        return res.json({
            success: true,
            data: data
        });

    } catch (err) {
        // console.log("hkewjrjf");
        console.error('SEARCH ERROR:', err.message);
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
}

module.exports.addmembers=async (req, res) => {
    try {
        const { rideId }  = req.params;
        const { userIds } = req.body;

        const members = Array.isArray(userIds)
            ? userIds.map((id) => String(id || '').trim()).filter(Boolean)
            : [];

        // Validate
        if (members.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No user IDs provided',
                error: 'No user IDs provided'
            });
        }

        const uniqueMembers = new Set(members);
        if (uniqueMembers.size !== members.length) {
            return res.status(400).json({
                success: false,
                message: 'Duplicate users found in selected list',
                error: 'Duplicate users found in selected list'
            });
        }

        const invalidMemberId = members.some((id) => !mongoose.Types.ObjectId.isValid(id));
        if (invalidMemberId) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID in selected list',
                error: 'Invalid user ID in selected list'
            });
        }

        // $addToSet with $each — adds all IDs, no duplicates ever saved
        const ride=await Ride.findById(rideId);
        if(!ride){
            return res.status(400).json({
                success:false,
                message:"no ride exist ",
                error:"no ride exist "
            })
        }

        if(ride.adminId.toString()!=req.user._id.toString()){
            return res.status(400).json({
                success:false,
                message:"only admin can add members ",
                error:"only admin can add members "
            })
        }

        const existingMembers = await RideMember.find({
            rideId,
            userId: { $in: members }
        }).select('userId');

        const existingIds = new Set(existingMembers.map((m) => m.userId.toString()));
        const membersToInsert = members.filter((id) => !existingIds.has(id));

        if (membersToInsert.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Duplicate users found in selected list',
                error: 'Duplicate users found in selected list'
            });
        }

        const membersPayload = membersToInsert.map((id) => ({
            userId: id,
            rideId: rideId,
            role: "member"
        }));
        
        await RideMember.insertMany(membersPayload,{ordered:false});
        await Ride.findByIdAndUpdate(rideId,{ $inc: { totalMembers: membersToInsert.length } });
        return res.json({
            success: true,
            message: `${membersToInsert.length} member(s) added to ride`,
            ride: req.user
        });

    } catch (err) {
        console.error('ADD MEMBERS ERROR:', err.message);
        if (err.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Duplicate users found in selected list',
                error: 'Duplicate users found in selected list'
            });
        }
        return res.status(500).json({
            success: false,
            message: 'Something went wrong',
            error: 'Something went wrong'
        });
    }
}



module.exports.sos=async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(new ExpressError(400, "Invalid ride id"));
        }

        const data = await Ride.findById(id);
        if (!data) {
            return next(new ExpressError(404, "Ride not found"));
        }

        const isMember = await validateRideMember(data._id, req.user._id);
        if (!isMember) {
            return next(new ExpressError(403, "Not allowed"));
        }

        res.render("rides/sos.ejs", { data });
    } catch (error) {
        next(error);
    }
}