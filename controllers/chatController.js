// ═══════════════════════════════════════════════════════════════════════
// controllers/chatController.js  —  RideSync Chat Controller
//
// Uses EXACT field names from /models/message.js:
//   rideId    → ObjectId ref Ride
//   senderId  → ObjectId ref User   (NOT 'sender')
//   message   → String              (NOT 'text')
//   createdAt → from timestamps
//
// Uses EXACT user.js fields for populate:
//   firstname, lastname, username   (NO 'name', NO 'avatar' field in user.js)
//
// Auth: Passport.js — req.user._id
// ═══════════════════════════════════════════════════════════════════════

const Message     = require("../models/message.js");
const RideMember  = require("../models/ride_member.js");
const mongoose    = require("mongoose");

// ── Helper: build display name from user.js fields ─────────────────────
// user.js has firstname + lastname + username, NOT a single 'name' field
function buildSenderName(userDoc) {
    if (!userDoc) return "Rider";
    const f = String(userDoc.firstname || "").trim();
    const l = String(userDoc.lastname  || "").trim();
    if (f || l) return `${f} ${l}`.trim();
    return String(userDoc.username || "Rider").trim();
}

// ── Helper: format createdAt into HH:MM AM/PM ──────────────────────────
function formatTime(date) {
    return new Date(date).toLocaleTimeString("en-US", {
        hour:   "2-digit",
        minute: "2-digit"
    });
}

// ── GET /api/chat/:rideId/history ──────────────────────────────────────
// Fetch last 50 messages for a ride, shaped for the frontend.
// Returns: { success, messages: [{ _id, userId, name, text, time }] }
module.exports.getChatHistory = async (req, res) => {
    try {
        const { rideId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(rideId)) {
            return res.status(400).json({ success: false, message: "Invalid ride ID" });
        }

        // Verify requester is a member of this ride (security check)
        const isMember = await RideMember.exists({
            rideId,
            userId:   req.user._id,
            status:   "active",
            isActive: true
        });

        if (!isMember) {
            return res.status(403).json({ success: false, message: "Not authorised" });
        }

        // Fetch last 50 messages, oldest first
        // Populate senderId with user.js fields (firstname, lastname, username — no 'name', no 'avatar')
        const messages = await Message.find({ rideId })
            .populate({ path: "senderId", select: "firstname lastname username" })
            .sort({ createdAt: 1 })   // oldest first so chat renders in order
            .limit(50)
            .lean();

        // Shape records into the payload the frontend appendMessage() expects:
        // { _id, userId, name, text, time }
        // message.js uses 'senderId' and 'message' — map to frontend names here
        const shaped = messages.map(msg => ({
            _id:    msg._id.toString(),
            userId: msg.senderId ? msg.senderId._id.toString() : "",
            name:   buildSenderName(msg.senderId),
            text:   msg.message,           // message.js field 'message' → frontend 'text'
            time:   formatTime(msg.createdAt)
        }));

        return res.json({ success: true, messages: shaped });

    } catch (err) {
        console.error("[chatController] getChatHistory error:", err.message);
        return res.status(500).json({ success: false, message: "Failed to load chat history" });
    }
};

// ── saveMessage (internal utility — used by socketHandeler.js) ─────────
// Saves a message to MongoDB using exact message.js field names.
// Returns the saved document, or null on failure.
// Parameters: { rideId, userId, text } — 'text' is the client-side name,
// stored as 'message' in the DB (message.js schema field name).
module.exports.saveMessage = async ({ rideId, userId, text }) => {
    try {
        const trimmed = String(text || "").trim();
        if (!trimmed) return null;

        const saved = await Message.create({
            rideId:   rideId,
            senderId: userId,   // message.js field: senderId
            message:  trimmed   // message.js field: message
        });

        return saved;
    } catch (err) {
        console.error("[chatController] saveMessage error:", err.message);
        return null;
    }
};
