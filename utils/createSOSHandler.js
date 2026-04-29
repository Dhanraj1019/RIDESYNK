const {sanitizeSosLocation}=require("./sanitizeSosLocation.js");
const {enrichSosLocationAddress}=require("./enrichSosLocationAddress.js");
const mongoose=require("mongoose");
const Ride=require("../models/ride.js")
const RideMember=require("../models/ride_member.js");
const Sos=require("../models/sos.js");
const {validateRideMember}=require("../utils/validateRideMember.js");
const {toSosPayload}=require("./getsospaylod.js");

const SOS_COOLDOWN_MS = 60000;
const SOS_NOTIFICATION_MESSAGE = "SOS Alert: A rider needs help. Please contact them immediately.";



module.exports.createSOSHandler = async (req, res) => {
    try {
        const rideId = String(req.body && req.body.rideId || "").trim();
        if (!mongoose.Types.ObjectId.isValid(rideId)) {
            return res.status(400).json({ success: false, message: "Failed to send SOS" });
        }

        const sanitizedLocation = sanitizeSosLocation(req.body && req.body.location);
        if (!sanitizedLocation || !Number.isFinite(sanitizedLocation.lat) || !Number.isFinite(sanitizedLocation.lng)) {
            return res.status(400).json({ success: false, message: "Location is required to send SOS" });
        }

        const locationPromise = enrichSosLocationAddress(sanitizedLocation);

        // Run external location enrichment and DB checks in parallel.
        const [location, ride, isMember, activeSOS, sosCount, recentSOS] = await Promise.all([
            locationPromise,
            Ride.findById(rideId).select("_id").lean(),
            validateRideMember(rideId, req.user._id),
            Sos.findOne({
                rideId: rideId,
                userId: req.user._id,
                status: "active"
            }).select("_id").lean(),
            Sos.countDocuments({ rideId: rideId }),
            Sos.findOne({
                rideId: rideId,
                userId: req.user._id,
                createdAt: { $gte: new Date(Date.now() - SOS_COOLDOWN_MS) }
            }).select("_id").lean()
        ]);

        if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
            return res.status(400).json({ success: false, message: "Location is required to send SOS" });
        }

        if (!ride) {
            return res.status(404).json({ success: false, message: "Failed to send SOS" });
        }
        if (!isMember) {
            return res.status(403).json({ success: false, message: "Failed to send SOS" });
        }
        if (activeSOS) {
            return res.status(409).json({ success: false, message: "SOS already active" });
        }
        if (sosCount >= 3) {
            return res.status(403).json({ success: false, message: "Limit reached: Maximum 3 SOS per ride allowed." });
        }
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
            .select("rideId userId status createdAt resolvedAt location")
            .lean();

        const members = await RideMember.find({
            rideId: ride._id,
            status: "active",
            isActive: true
        }).select("userId").lean();

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

