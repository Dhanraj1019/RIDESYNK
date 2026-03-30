const mongoose=require("mongoose");
const Sos=require("../models/sos.js");
const {toSosPayload}=require("../utils/getsospaylod.js");
const {validateRideMember}=require("../utils/validateRideMember.js");

module.exports.ride=async (req, res) => {
    try {
        const { rideId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(rideId)) {
            return res.status(400).json({ success: false, message: "Failed to fetch SOS" });
        }

        const isMember = await validateRideMember(rideId, req.user._id);
        if (!isMember) {
            return res.status(403).json({ success: false, message: "Failed to fetch SOS" });
        }

        const alerts = await Sos.find({ rideId })
            .populate({ path: "userId", select: "firstname lastname username" })
            .sort({ createdAt: -1 })
            .select("rideId userId status createdAt resolvedAt location");

        const active = [];
        const resolved = [];

        for (const alert of alerts) {
            const formatted = toSosPayload(alert);
            if (alert.status === "active") {
                active.push(formatted);
            } else {
                resolved.push(formatted);
            }
        }

        // FIX: added return
        return res.json({ success: true, active, resolved });
    } catch (error) {
        // FIX: added return
        return res.status(500).json({ success: false, message: "Failed to fetch SOS" });
    }
};
module.exports.resolve = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Failed to resolve SOS" });
        }

        const alert = await Sos.findById(id);
        if (!alert) {
            return res.status(404).json({ success: false, message: "Failed to resolve SOS" });
        }

        const isMember = await validateRideMember(alert.rideId, req.user._id);
        if (!isMember) {
            return res.status(403).json({ success: false, message: "Failed to resolve SOS" });
        }

        if (alert.status !== "resolved") {
            alert.status = "resolved";
            alert.resolvedAt = new Date();
            await alert.save();
        }

        const resolved = await Sos.findById(alert._id)
            .populate({ path: "userId", select: "firstname lastname username" })
            .select("rideId userId status createdAt resolvedAt location");

        const io = req.app.get("io");
        if (io) {
            io.to(String(alert.rideId)).emit("sos:resolved", {
                rideId: String(alert.rideId),
                sosId: String(alert._id),
                sos: toSosPayload(resolved)
            });
        }

        // FIX: added return
        return res.json({ success: true, message: "SOS resolved", sos: toSosPayload(resolved) });
    } catch (error) {
        // FIX: added return
        return res.status(500).json({ success: false, message: "Failed to resolve SOS" });
    }
}
