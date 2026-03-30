const {sanitizeSosLocation}=require("./sanitizeSosLocation.js");
const {enrichSosLocationAddress}=require("./enrichSosLocationAddress.js");
const mongoose=require("mongoose");
const Ride=require("../models/ride.js")
const RideMember=require("../models/ride_member.js");
const Sos=require("../models/sos.js");
const {validateRideMember}=require("../utils/validateRideMember.js");
const {toSosPayload}=require("./getsospaylod.js");

const SOS_COOLDOWN_MS = 15000;
const SOS_NOTIFICATION_MESSAGE = "SOS Alert: A rider needs help. Please contact them immediately.";



module.exports.createSOSHandler = async (req, res) => {
    try {
        const rideId = String(req.body && req.body.rideId || "").trim();
        if (!mongoose.Types.ObjectId.isValid(rideId)) {
            return res.status(400).json({ success: false, message: "Failed to send SOS" });
        }

        const location = await enrichSosLocationAddress(
            sanitizeSosLocation(req.body && req.body.location)
        );
        if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
            return res.status(400).json({ success: false, message: "Location is required to send SOS" });
        }

        const ride = await Ride.findById(rideId).select("_id");
        if (!ride) {
            return res.status(404).json({ success: false, message: "Failed to send SOS" });
        }

        const isMember = await validateRideMember(ride._id, req.user._id);
        if (!isMember) {
            return res.status(403).json({ success: false, message: "Failed to send SOS" });
        }

        const activeSOS = await Sos.findOne({
            rideId: ride._id,
            userId: req.user._id,
            status: "active"
        }).select("_id");

        if (activeSOS) {
            return res.status(409).json({ success: false, message: "SOS already active" });
        }

        const recentSOS = await Sos.findOne({
            rideId: ride._id,
            userId: req.user._id,
            createdAt: { $gte: new Date(Date.now() - SOS_COOLDOWN_MS) }
        }).select("_id");

        if (recentSOS) {
            return res.status(429).json({ success: false, message: "Failed to send SOS" });
        }

        const sos = await Sos.create({
            rideId: ride._id,
            userId: req.user._id,
            status: "active",
            resolvedAt: null,
            location
        });

        const alert = await Sos.findById(sos._id)
            .populate({ path: "userId", select: "firstname lastname username" })
            .select("rideId userId status createdAt resolvedAt location");

        const members = await RideMember.find({
            rideId: ride._id,
            status: "active",
            isActive: true
        }).select("userId");

        const recipientUserIds = members
            .map((m) => String(m.userId))
            .filter((id) => id !== String(req.user._id));

        const sosPayload = {
            message: SOS_NOTIFICATION_MESSAGE,
            rideId: String(ride._id),
            recipientUserIds,
            location: {
                lat: location.lat,
                lng: location.lng,
                address: location.address
            },
            sos: toSosPayload(alert)
        };

        const io = req.app.get("io");
        if (io) {
            io.to(String(ride._id)).emit("sos:triggered", sosPayload);
            io.to(String(ride._id)).emit("sos:created", sosPayload);
        }

        // FIX: added return
        return res.status(201).json({ success: true, message: "SOS sent", sos: toSosPayload(alert) });
    } catch (error) {
        if (error && error.code === 11000) {
            return res.status(409).json({ success: false, message: "SOS already active" });
        }
        // FIX: added return
        return res.status(500).json({ success: false, message: "Failed to send SOS" });
    }
};

