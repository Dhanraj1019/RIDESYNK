const User=require("../models/user.js");
const Ride=require("../models/ride.js");
const Message=require("../models/message.js");
const RideMember=require("../models/ride_member.js");
const mongoose=require("mongoose");
const map_token = process.env.MAP_TOKEN;
const {validateRideMember}=require("../utils/validateRideMember.js")
const ExpressError=require("../utils/ExpressError.js");

module.exports.livetracking=async (req,res)=>{
    const {id} = req.params;
    const data = await Ride.findOne({_id:id});
    const members=await RideMember.find({rideId:id}).populate("userId");
    // const userid=(await Fulldetail.findOne({userid:req.user._id}).select("_id"))._id.toString();
    const messages = await Message.find({ rideId:id }).sort({ time: 1 }).populate({path:"senderId",select:"firstname"});
    // console.log(data)
    // console.log("members = ",members);
    // console.log(messages);
    // console.log(data)
    // FIX: added return
    return res.render("map/live_tracking.ejs",{data:data.toObject(),map_token,members,messages})
}

module.exports.addmembersform=async (req,res)=>{
    const {id}=req.params;
    const rideroom=await RideMember.find({rideId:id}).populate("userId").populate("rideId");
    // console.log(rideroom)
    // FIX: added return
    return res.render("rides/add_members.ejs",{data:rideroom,id});
}

module.exports.ridedetails=async (req,res)=>{
    const {id}=req.params;
    const data=await Ride.findOne({_id:id});
    const members=await RideMember.find({rideId:id}).populate("userId");
    // console.log("data = ",data)
    // console.log("id = ",id)
    console.log("members = ",members)
    // FIX: added return
    return res.render("rides/ride_room.ejs",{data,members});
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
        console.log(phone);
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
        console.log("hkewjrjf");
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