const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");
const Invite = require("../models/invite.model.js");
const Ride = require("../models/ride.js");
const RideMember = require("../models/ride_member.js");

const INVITE_EXPIRY_MINUTES = Number(process.env.RIDE_INVITE_EXPIRY_MINUTES) || 30;

function getInviteValidation(invite) {
    if (!invite) {
        return { ok: false, code: 404, message: "Invite not found" };
    }

    if (invite.isUsed) {
        return { ok: false, code: 410, message: "Invite already used" };
    }

    if (invite.expiresAt.getTime() <= Date.now()) {
        return { ok: false, code: 410, message: "Invite expired" };
    }

    return { ok: true };
}

async function getInviteWithRide(inviteId) {
    const invite = await Invite.findOne({ inviteId })
        .populate({ path: "rideId", select: "ridename sorce destination date time totalMembers adminId" })
        .populate({ path: "createdBy", select: "firstname lastname username" })
        .lean();

    return invite;
}

module.exports.createInvite = async (req, res) => {
    try {
        const { rideId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(rideId)) {
            return res.status(400).json({ success: false, message: "Invalid ride id" });
        }

        const ride = await Ride.findById(rideId).select("_id adminId").lean();
        if (!ride) {
            return res.status(404).json({ success: false, message: "Ride not found" });
        }

        const isAdmin = String(ride.adminId) === String(req.user._id);
        if (!isAdmin) {
            return res.status(403).json({ success: false, message: "Only ride admin can share invite" });
        }

        const inviteId = uuidv4();
        const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MINUTES * 60 * 1000);

        const invite = await Invite.create({
            rideId: ride._id,
            createdBy: req.user._id,
            inviteId,
            expiresAt,
            isUsed: false
        });

        const inviteLink = `${req.protocol}://${req.get("host")}/invite/${invite.inviteId}`;

        return res.status(201).json({
            success: true,
            inviteId: invite.inviteId,
            inviteLink,
            expiresAt: invite.expiresAt
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to create invite" });
    }
};

module.exports.openInvite = async (req, res) => {
    try {
        const { inviteId } = req.params;
        if (!inviteId || inviteId.length < 20) {
            return res.status(400).render("rides/invite.ejs", {
                invite: null,
                ride: null,
                status: "invalid",
                statusMessage: "Invalid invite link"
            });
        }

        if (!req.isAuthenticated || !req.isAuthenticated()) {
            req.session.redirectUrl = req.originalUrl;
            return res.redirect("/ridesynk/entry/login");
        }

        const invite = await getInviteWithRide(inviteId);
        const inviteStatus = getInviteValidation(invite);

        if (!inviteStatus.ok) {
            return res.status(inviteStatus.code).render("rides/invite.ejs", {
                invite: invite || null,
                ride: invite && invite.rideId ? invite.rideId : null,
                status: "error",
                statusMessage: inviteStatus.message
            });
        }

        const ride = invite.rideId;
        const membership = await RideMember.findOne({ rideId: ride._id, userId: req.user._id }).select("status isActive").lean();

        let alreadyJoined = false;
        if (membership && membership.status === "active" && membership.isActive === true) {
            alreadyJoined = true;
        }

        return res.render("rides/invite.ejs", {
            invite,
            ride,
            status: alreadyJoined ? "joined" : "ready",
            statusMessage: alreadyJoined ? "You already joined this ride" : "",
            alreadyJoined
        });
    } catch (error) {
        return res.status(500).render("rides/invite.ejs", {
            invite: null,
            ride: null,
            status: "error",
            statusMessage: "Failed to open invite"
        });
    }
};

module.exports.acceptInvite = async (req, res) => {
    try {
        if (!req.isAuthenticated || !req.isAuthenticated()) {
            req.session.redirectUrl = `/invite/${req.params.inviteId}`;
            return res.redirect("/ridesynk/entry/login");
        }

        const { inviteId } = req.params;
        const invite = await Invite.findOne({ inviteId });
        const inviteStatus = getInviteValidation(invite);
        if (!inviteStatus.ok) {
            return res.status(inviteStatus.code).render("rides/invite.ejs", {
                invite,
                ride: null,
                status: "error",
                statusMessage: inviteStatus.message
            });
        }

        const ride = await Ride.findById(invite.rideId).select("_id totalMembers").lean();
        if (!ride) {
            return res.status(404).render("rides/invite.ejs", {
                invite,
                ride: null,
                status: "error",
                statusMessage: "Ride not found"
            });
        }

        const existing = await RideMember.findOne({ rideId: ride._id, userId: req.user._id });

        if (!existing) {
            await RideMember.create({
                rideId: ride._id,
                userId: req.user._id,
                role: "member",
                status: "active",
                isActive: true,
                joinedAt: new Date()
            });
            await Ride.findByIdAndUpdate(ride._id, { $inc: { totalMembers: 1 } });
        } else if (existing.status !== "active" || existing.isActive !== true) {
            existing.status = "active";
            existing.isActive = true;
            existing.leftAt = null;
            existing.removedAt = null;
            await existing.save();
            await Ride.findByIdAndUpdate(ride._id, { $inc: { totalMembers: 1 } });
        }

        invite.isUsed = true;
        await invite.save();

        req.flash("success", "You joined the ride successfully");
        return res.redirect(`/ridesynk/rideroom/${ride._id}`);
    } catch (error) {
        if (error && error.code === 11000) {
            req.flash("success", "You already joined this ride");
            const invite = await Invite.findOne({ inviteId: req.params.inviteId }).select("rideId").lean();
            if (invite && invite.rideId) {
                return res.redirect(`/ridesynk/rideroom/${invite.rideId}`);
            }
        }

        return res.status(500).render("rides/invite.ejs", {
            invite: null,
            ride: null,
            status: "error",
            statusMessage: "Failed to accept invite"
        });
    }
};

module.exports.declineInvite = async (req, res) => {
    try {
        if (!req.isAuthenticated || !req.isAuthenticated()) {
            return res.redirect("/ridesynk/entry/login");
        }

        const { inviteId } = req.params;
        const invite = await Invite.findOne({ inviteId });
        if (invite && !invite.isUsed && invite.expiresAt.getTime() > Date.now()) {
            invite.isUsed = true;
            await invite.save();
        }

        req.flash("success", "Invite declined");
        return res.redirect("/ridesynk/home");
    } catch (error) {
        return res.redirect("/ridesynk/home");
    }
};
