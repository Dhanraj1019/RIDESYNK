const RideMember=require("../models/ride_member")
const Ride=require("../models/ride");
const mongoose=require("mongoose");
const ExpressError=require("../utils/ExpressError.js");
const {validateRideMember}=require("../utils/validateRideMember");
const {ALLOW_MEMBER_CANCELLATION}=require("../utils/extra.js");

module.exports.cancelride=async (req, res, next) => {
    try {
        const { rideId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(rideId)) {
            req.flash("error", "invalid ride id");
            return res.redirect(req.get("Referrer") || `/ridesync/${req.user._id.toString()}/rides`);
        }

        const ride = await Ride.findById(rideId);
        if (!ride) {
            req.flash("error", "ride not found");
            return res.redirect(req.get("Referrer") || `/ridesync/${req.user._id.toString()}/rides`);
        }

        const normalizedStatus = String(ride.status || "").trim().toLowerCase();
        const canonicalStatus = normalizedStatus === "cancelled" ? "canceled" : normalizedStatus;

        if (canonicalStatus !== "upcoming") {
            return res.status(400).send("Ride cannot be canceled");
        }

        const isCreator = ride.adminId.toString() === req.user._id.toString();
        const isActiveMember = await RideMember.exists({
            rideId: ride._id,
            userId: req.user._id,
            status: "active",
            isActive: true
        });

        const isAuthorized = isCreator || (ALLOW_MEMBER_CANCELLATION && Boolean(isActiveMember));
        if (!isAuthorized) {
            req.flash("error", "you are not authorized to cancel this ride");
            return res.redirect(req.get("Referrer") || `/ridesync/${req.user._id.toString()}/rides`);
        }

        ride.status = "canceled";
        await ride.save();

        req.flash("success", "ride canceled successfully");
        return res.redirect(req.get("Referrer") || `/ridesync/${req.user._id.toString()}/rides`);
    } catch (err) {
        return next(err);
    }
}


module.exports.updatelocation=async (req, res) => {
    try {
        const { rideId } = req.params;
        const { sorce, destination, sorceLocation, destinationLocation } = req.body;
        console.log(rideId);
        if (!mongoose.Types.ObjectId.isValid(rideId)) {
            return res.status(400).json({ success: false, message: "Invalid ride id" });
        }

        if (!String(sorce || "").trim() || !String(destination || "").trim()) {
            return res.status(400).json({ success: false, message: "sorce and destination are required" });
        }

        const parseNum = (value) => {
            const n = Number(value);
            return Number.isFinite(n) ? n : null;
        };

        const srcLat = parseNum(sorceLocation && sorceLocation.lat);
        const srcLng = parseNum(sorceLocation && sorceLocation.lng);
        const dstLat = parseNum(destinationLocation && destinationLocation.lat);
        const dstLng = parseNum(destinationLocation && destinationLocation.lng);

        if (
            srcLat === null || srcLng === null || dstLat === null || dstLng === null ||
            srcLat < -90 || srcLat > 90 || dstLat < -90 || dstLat > 90 ||
            srcLng < -180 || srcLng > 180 || dstLng < -180 || dstLng > 180
        ) {
            return res.status(400).json({ success: false, message: "Invalid location coordinates" });
        }

        const ride = await Ride.findById(rideId);
        if (!ride) {
            return res.status(404).json({ success: false, message: "Ride not found" });
        }
        console.log(ride);
        const isAdmin = req.user && ride.adminId.toString() === req.user._id.toString();
        if (!isAdmin) {
            return res.status(403).json({ success: false, message: "Only admin can update ride location" });
        }

        ride.sorce = String(sorce).trim();
        ride.destination = String(destination).trim();
        ride.sorceLocation = {
            type: "Point",
            coordinates: [srcLng, srcLat]
        };
        ride.destinationLocation = {
            type: "Point",
            coordinates: [dstLng, dstLat]
        };

        const updatedRide = await ride.save();

        return res.status(200).json({
            success: true,
            ride: updatedRide
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: "Server error" });
    }
}



module.exports.createrideform=(req,res)=>{    
    return res.render("rides/create_ride.ejs");
}



module.exports.createride=async (req,res)=>{
    try {
        const { ride = {} } = req.body;
        const date = String(ride.date || '').trim();
        const time = String(ride.time || '').trim();
        const rideDateTime = new Date(`${date}T${time}`);

        if (!date || !time || Number.isNaN(rideDateTime.getTime()) || rideDateTime <= new Date()) {
            return res.status(400).json({
                error: "Please select a future date and time"
            });
        }

        const sorcelocation = JSON.parse(ride.sorcelocation || '{}');
        const destinationlocation = JSON.parse(ride.destinationlocation || '{}');

        if (
            !Array.isArray(sorcelocation.coordinates) || sorcelocation.coordinates.length !== 2 ||
            !Array.isArray(destinationlocation.coordinates) || destinationlocation.coordinates.length !== 2
        ) {
            return res.status(400).json({ error: "Invalid location data" });
        }

        const newRide = new Ride({
            adminId:req.user._id,
            ridename:ride.ridename,
            date,
            time,
            sorce:ride.sorce,
            destination:ride.destination,
            sorceLocation: {
              type:'Point',
              coordinates: sorcelocation.coordinates
            },
            destinationLocation: {
              type:'Point',
              coordinates: destinationlocation.coordinates
            }
        });
        console.log(newRide);
        const data = await newRide.save();
        await RideMember.insertOne({rideId:data._id,userId:req.user._id,role:"admin"});
        req.flash("success","ride created...!");
        return res.redirect(`/ridesync/rideroom/${data._id.toString()}`);
    } catch (error) {
        console.error('Create ride error:', error);
        return res.status(400).json({ error: 'Invalid ride data' });
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