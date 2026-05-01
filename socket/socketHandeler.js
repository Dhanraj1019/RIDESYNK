// ═══════════════════════════════════════════════════════════════════════
// socket/socketHandeler.js  —  RideSync Socket.IO Server Handler
//
// This file was MISSING (socket/ directory was empty).
// server.js line 39: const registerSocketHandlers = require("./socket/socketHandeler.js");
// server.js line 167: registerSocketHandlers(io);
// Without this file the server crashes on startup with:
//   "Cannot find module './socket/socketHandeler.js'"
//
// Reconstructed to match all client socket events defined in:
//   public/js/map_page.js  (client emits + listens)
//   public/js/socket.js    (client connection)
//
// CLIENT EMITS  →  SERVER LISTENS TO:
//   joinRide          { rideId }
//   sendLocation      { rideId, userId, lat, lng, name, isAdmin }
//   rideStarted       { rideId }                   (admin only)
//   rideEnded         { rideId }                   (admin only)
//   sendMessage       { rideId, userId, name, text, time }
//
// SERVER EMITS  →  CLIENT LISTENS TO:
//   receiveLocation   { userId, lat, lng, name, isAdmin }
//   rideStatusUpdate  { status }
//   receiveMessage    { userId, name, text, time }
//   userLeft          { userId }
//   liveCount         { count, total }
// ═══════════════════════════════════════════════════════════════════════

const Ride = require("../models/ride.js");
const RideMember = require("../models/ride_member.js");
const Message = require("../models/message.js");
const Sos = require("../models/sos.js");
const chatController = require("../controllers/chatController.js");
const { toSosPayload } = require("../utils/getsospaylod.js");
const SOCKET_DEBUG = process.env.SOCKET_DEBUG === "true";
const LOCATION_THROTTLE_MS = Number(process.env.SOCKET_LOCATION_THROTTLE_MS) || 3000;
const SOCKET_EVENT_LIMIT_WINDOW_MS = Number(process.env.SOCKET_EVENT_LIMIT_WINDOW_MS) || 10000;
const SOCKET_EVENT_LIMIT_MAX = Number(process.env.SOCKET_EVENT_LIMIT_MAX) || 60;

// rideId → Set of connected userId strings
const rideRooms = new Map();

// rideId → Set of userId strings currently live (have sent a location recently)
const liveUsers = new Map();

// rideId → Map of userId strings to their latest location payload
const activeLocations = new Map();

// (rideTotalCache removed - liveCount handled by client)

// rideId → { started: boolean, status: string }
const rideStatusMap = new Map();

// rideId → { lat, lng } — admin's last known location for late joiners
const adminLocationMap = new Map();

// socketId:eventName -> lightweight abuse bucket
const socketEventBuckets = new Map();

// Idle TTL for abandoned rides (cleanup leak)
const RIDE_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const rideLastActive = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [rid, ts] of rideLastActive.entries()) {
        if (now - ts > RIDE_TTL_MS) {
            liveUsers.delete(rid);
            activeLocations.delete(rid);
            rideRooms.delete(rid);
            rideStatusMap.delete(rid);
            adminLocationMap.delete(rid);
            rideLastActive.delete(rid);
            console.log(`[socket] TTL cleanup abandoned ride ${rid}`);
        }
    }
}, 1000 * 60 * 60);

// ── Stale-location heartbeat ────────────────────────────────────────────
// Detects users who silently dropped (network timeout, background tab killed)
// without a clean WebSocket disconnect. If a user hasn't sent a location
// update in 45s, broadcast memberOffline for them so all clients can
// remove them from the "live" count and members panel.
const STALE_LOCATION_MS = 45000; // 45 seconds
setInterval(() => {
    const now = Date.now();
    for (const [rid, locMap] of activeLocations.entries()) {
        for (const [uid, payload] of locMap.entries()) {
            const updatedAt = payload._updatedAt || 0;
            if (updatedAt > 0 && now - updatedAt > STALE_LOCATION_MS) {
                // User has gone stale — broadcast offline to this ride room
                getLiveSet(rid).delete(uid);
                locMap.delete(uid);
                io.to(rid).emit("memberOffline", { userId: uid });
                if (SOCKET_DEBUG) console.log(`[socket] Stale location for uid=${uid} in ride=${rid} — marked offline`);
            }
        }
    }
}, 15000); // Check every 15 seconds

// ── Helper: get or create a ride room set ───────────────────────────────
function getRideRoom(rideId) {
    if (!rideRooms.has(rideId)) {
        rideRooms.set(rideId, new Set());
    }
    return rideRooms.get(rideId);
}

// ── Helper: get or create an active locations map ──────────────────────
function getActiveLocations(rideId) {
    if (!activeLocations.has(rideId)) {
        activeLocations.set(rideId, new Map());
    }
    return activeLocations.get(rideId);
}

// ── Helper: get or create a live users set ─────────────────────────────
function getLiveSet(rideId) {
    if (!liveUsers.has(rideId)) {
        liveUsers.set(rideId, new Set());
    }
    return liveUsers.get(rideId);
}

// (broadcastLiveCount removed - liveCount handled by client)

// ── Helper: sanitize a string id ───────────────────────────────────────
function safeId(val) {
    return String(val || "").trim();
}

// ── Helper: validate ObjectId format (24-char hex) ─────────────────────
function isValidObjectId(id) {
    return /^[0-9a-fA-F]{24}$/.test(safeId(id));
}

// ── Helper: escape HTML to prevent XSS in chat messages ────────────────
function escapeHtml(text) {
    const map2 = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return String(text || "").replace(/[&<>"']/g, m => map2[m]);
}

function isSocketRateLimited(socketId, eventName) {
    const key = `${socketId}:${eventName}`;
    const now = Date.now();
    let bucket = socketEventBuckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
        bucket = { count: 0, resetAt: now + SOCKET_EVENT_LIMIT_WINDOW_MS };
        socketEventBuckets.set(key, bucket);
    }

    bucket.count += 1;
    return bucket.count > SOCKET_EVENT_LIMIT_MAX;
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN EXPORT — called once from server.js as registerSocketHandlers(io)
// ═══════════════════════════════════════════════════════════════════════
module.exports = function registerSocketHandlers(io) {

    // socketId → { userId, name, rideId }
    // Declared OUTSIDE io.on('connection') so it persists across all connections
    const socketUserMap = new Map();

    io.on("connection", (socket) => {
        // Track which rideIds this socket has joined (for cleanup on disconnect)
        const joinedRides = new Set();
        let socketUserId = null;
        let lastLocationEmitAt = 0;
        // ── joinRide ────────────────────────────────────────────────────
        // Client emits: { rideId, userId, name }
        // Server: adds socket to the ride's Socket.IO room + rideRooms map
        // and broadcasts memberJoined to others in the room
        socket.on("joinRide", async ({ rideId, userId, name } = {}) => {
            const rid = safeId(rideId);
            const uid = safeId(userId);
            if (!isValidObjectId(rid)) return;

            try {
                socket.join(rid);
                getRideRoom(rid).add(socket.id);
                joinedRides.add(rid);

                // Track socket → user mapping for disconnect handler
                if (uid && isValidObjectId(uid)) {
                    socketUserId = uid;
                    socketUserMap.set(socket.id, {
                        userId: uid,
                        name:   String(name || "A rider"),
                        rideId: rid
                    });

                    // Notify OTHER members someone joined (not the joiner themselves)
                    socket.to(rid).emit("memberJoined", {
                        userId: uid,
                        name:   String(name || "A rider")
                    });
                }

                // Send all current active locations to the newly joined user immediately (Step 1)
                // const activeLocs = getActiveLocations(rid);
                // const initialMembers = {};
                // for (const [memberId, locData] of activeLocs.entries()) {
                //     initialMembers[memberId] = locData;
                // }
                // Send all members to the newly joined user immediately
                const membersList = await RideMember.find({ rideId: rid }).populate("userId", "firstname lastname username").lean();
                const activeLocs = getActiveLocations(rid);
                const initialMembersArr = membersList.map(m => {
                    const uidStr = m.userId ? m.userId._id.toString() : "";
                    const loc = activeLocs.get(uidStr);
                    const isAdm = m.role === "admin";
                    const isOnline = getLiveSet(rid).has(uidStr);
                    let memberName = "Rider";
                    if (m.userId) {
                        const f = (m.userId.firstname || "").trim();
                        const l = (m.userId.lastname || "").trim();
                        memberName = (f || l) ? `${f} ${l}`.trim() : (m.userId.username || "Rider");
                    }
                    return {
                        userId: uidStr,
                        name: memberName,
                        lat: loc ? loc.lat : null,
                        lng: loc ? loc.lng : null,
                        isAdmin: isAdm,
                        isOnline: isOnline
                    };
                }).filter(m => m.userId !== "");

                socket.emit("initialMembers", initialMembersArr);

                // Send current ride state to late joiner
                const rideState = rideStatusMap.get(rid);
                const adminLoc = adminLocationMap.get(rid);
                socket.emit("rideState", {
                    started: rideState ? rideState.started : false,
                    status: rideState ? rideState.status : "upcoming",
                    adminLocation: adminLoc || null
                });

                const activeSOS = await Sos.find({ rideId: rid, status: "active" })
                    .populate({ path: "userId", select: "firstname lastname username" })
                    .sort({ createdAt: -1 })
                    .select("rideId userId status createdAt resolvedAt location")
                    .lean();

                if (activeSOS.length > 0) {
                    socket.emit("activeSOS", activeSOS.map(toSosPayload));
                }
            } catch (err) {
                console.error("[socket] joinRide error:", err.message);
            }
        });

        // ── sendLocation ────────────────────────────────────────────────
        // Client emits: { rideId, userId, lat, lng, name, isAdmin }
        // Server: broadcasts to others in the same ride room
        socket.on("sendLocation", async ({ rideId, userId, lat, lng, name, isAdmin } = {}) => {
            if (isSocketRateLimited(socket.id, "sendLocation")) return;

            const rid = safeId(rideId);
            const uid = safeId(userId);

            if (!isValidObjectId(rid) || !isValidObjectId(uid)) return;

            const parsedLat = Number(lat);
            const parsedLng = Number(lng);
            if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return;
            if (parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) return;

            const now = Date.now();
            if (now - lastLocationEmitAt < LOCATION_THROTTLE_MS) return;
            lastLocationEmitAt = now;
            rideLastActive.set(rid, now);

            // Track this userId as live for this ride
            socketUserId = uid;
            getLiveSet(rid).add(uid);

            const payload = {
                userId: uid,
                lat: parsedLat,
                lng: parsedLng,
                name: String(name || "Rider"),
                isAdmin: Boolean(isAdmin),
                _updatedAt: now   // used by stale-location heartbeat to detect silent drops
            };
            getActiveLocations(rid).set(uid, payload);

            // Track admin location for late joiners
            if (payload.isAdmin) {
                adminLocationMap.set(rid, { lat: parsedLat, lng: parsedLng });
            }

            // Also make sure this socket is in the room (in case joinRide was missed)
            if (!joinedRides.has(rid)) {
                socket.join(rid);
                getRideRoom(rid).add(socket.id);
                joinedRides.add(rid);
            }

            // Broadcast to everyone in the room so every client, including the sender,
            // renders the same route and marker state.
            io.to(rid).emit("receiveLocation", payload);
            if (SOCKET_DEBUG) console.log(`[socket] LOCATION BROADCAST: user=${uid} ride=${rid}`);

            if (payload.isAdmin) {
                io.to(rid).emit("adminLocationUpdated", {
                    lat: parsedLat,
                    lng: parsedLng
                });
            }

            // Live count handled by client
        });

        // ── rideStarted ─────────────────────────────────────────────────
        // Client emits: { rideId }   (admin only — enforced by checking adminId server-side)
        // Server: updates ride status to "active" in DB + broadcasts to room
        async function broadcastRideStarted({ rideId, adminId, adminLocation } = {}) {
            const rid = safeId(rideId);
            if (!isValidObjectId(rid)) return;

            try {
                // Update ride status in DB — field name is "status", value "active"
                // (ride.js enum: "active" | "upcoming" | "completed" | "canceled")
                await Ride.findByIdAndUpdate(rid, { status: "active", rideStarted: true });

                // Track ride as started for late joiners
                rideStatusMap.set(rid, { started: true, status: "active" });
                if (adminLocation && Number.isFinite(Number(adminLocation.lat)) && Number.isFinite(Number(adminLocation.lng))) {
                    adminLocationMap.set(rid, { lat: Number(adminLocation.lat), lng: Number(adminLocation.lng) });
                }

                const payload = {
                    rideId: rid,
                    adminId: adminId ? safeId(adminId) : undefined,
                    adminLocation: adminLocation && Number.isFinite(Number(adminLocation.lat)) && Number.isFinite(Number(adminLocation.lng))
                        ? { lat: Number(adminLocation.lat), lng: Number(adminLocation.lng) }
                        : undefined
                };

                // Broadcast the new route-start event requested by the live map,
                // and keep the existing status event for current clients.
                io.to(rid).emit("rideStarted", payload);
                io.to(rid).emit("rideStatusUpdate", { status: "started" });
            } catch (err) {
                console.error("[socket] rideStarted error:", err.message);
            }
        }

        socket.on("startRide", (data = {}) => {
            broadcastRideStarted(data);
        });

        socket.on("rideStarted", (data = {}) => {
            broadcastRideStarted(data);
        });

        // ── rideEnded ───────────────────────────────────────────────────
        // Client emits: { rideId }   (admin only)
        // Server: updates ride status to "completed" in DB + broadcasts to room
        socket.on("rideEnded", async ({ rideId } = {}) => {
            const rid = safeId(rideId);
            if (!isValidObjectId(rid)) return;

            try {
                await Ride.findByIdAndUpdate(rid, { status: "completed" });
                io.to(rid).emit("rideStatusUpdate", { status: "ended" });

                // Clean up live tracking state for this ride
                liveUsers.delete(rid);
                activeLocations.delete(rid);
                rideRooms.delete(rid);
                rideStatusMap.delete(rid);
                adminLocationMap.delete(rid);
                rideLastActive.delete(rid);
            } catch (err) {
                console.error("[socket] rideEnded error:", err.message);
            }
        });

        // ── sendMessage ─────────────────────────────────────────────────
        // Client emits: { rideId, userId, name, text, time }
        // Server:
        //   1. Validates input
        //   2. Saves to MongoDB via chatController.saveMessage
        //      (uses exact message.js fields: senderId, message)
        //   3. Broadcasts to ALL in room via io.to() including sender,
        //      with _id so client can set data-msg-id for dedup
        socket.on("sendMessage", async ({ rideId, userId, name, text, time } = {}) => {
            try {
                if (isSocketRateLimited(socket.id, "sendMessage")) return;

                const rid = safeId(rideId);
                const uid = safeId(userId);

                if (!isValidObjectId(rid) || !isValidObjectId(uid)) return;

                const rawText = String(text || "").trim();
                if (!rawText) return;                    // block empty
                if (rawText.length > 500) return;        // block over-length (matches client limit)

                const safeText = rawText;
                const safeTime = String(time || new Date().toLocaleTimeString("en-US", {
                    hour: "2-digit", minute: "2-digit"
                }));
                const safeName = String(name || "Rider");

                // Save to DB first — chatController.saveMessage uses exact schema field names
                // message.js: { rideId, senderId, message } — saveMessage maps text → message
                const saved = await chatController.saveMessage({
                    rideId: rid,
                    userId: uid,
                    text: rawText  // saveMessage stores this as 'message' in DB
                });

                // Build broadcast payload — includes _id so client can set data-msg-id for dedup
                const msgData = {
                    _id: saved ? saved._id.toString() : `tmp-${Date.now()}`,
                    userId: uid,
                    name: safeName,
                    text: safeText,
                    time: safeTime
                };

                // Broadcast to ALL sockets in the room INCLUDING the sender.
                // The sender's client will receive this and check data-msg-id to skip
                // messages it already appended optimistically.
                io.to(rid).emit("receiveMessage", msgData);
            } catch (err) {
                console.error("[socket] sendMessage error:", err.message);
            }
        });

        // ── sosTriggered (compat event) ────────────────────────────────
        // Client emits: { rideId, userId, name, phone, location }
        // Server re-broadcasts to full ride room.
        socket.on("sosTriggered", (data = {}) => {
            const rid = safeId(data.rideId);
            if (!isValidObjectId(rid)) return;
            io.to(rid).emit("receiveSOS", data);
        });

        socket.on("sendSOS", (data = {}) => {
            const rid = safeId(data.rideId);
            if (!isValidObjectId(rid)) return;
            io.to(rid).emit("receiveSOS", data);
        });

        // ── resolveSOS (compat event) ──────────────────────────────────
        // Client emits: { rideId, userId }
        // Server re-broadcasts resolved user to full ride room.
        socket.on("resolveSOS", ({ rideId, userId } = {}) => {
            const rid = safeId(rideId);
            if (!isValidObjectId(rid)) return;
            io.to(rid).emit("sosResolved", { userId });
        });

        // ── disconnect ──────────────────────────────────────────────────
        // Clean up room membership and broadcast userLeft + memberOffline
        socket.on("disconnect", () => {
            for (const key of socketEventBuckets.keys()) {
                if (key.startsWith(`${socket.id}:`)) socketEventBuckets.delete(key);
            }

            // Use socketUserMap for accurate userId lookup on disconnect
            const userData = socketUserMap.get(socket.id);
            if (userData) {
                const { userId, rideId } = userData;
                socket.to(rideId).emit("memberOffline", { userId });
                socketUserMap.delete(socket.id);
            }
            // Clean up room membership and broadcast userLeft + memberOffline
            // Use a proper async function to iterate the Set to avoid unhandled promise rejections
            const processCleanup = async () => {
                for (const rid of joinedRides) {
                    try {
                        // Remove socket from room tracking
                        const room = getRideRoom(rid);
                        room.delete(socket.id);
                        if (room.size === 0) rideRooms.delete(rid);

                        // Remove user from live set, active locations, and broadcast their departure
                        if (socketUserId) {
                            getLiveSet(rid).delete(socketUserId);
                            getActiveLocations(rid).delete(socketUserId);
                            io.to(rid).emit("userLeft", { userId: socketUserId });
                        }
                    } catch (err) {
                        console.error("[socket] disconnect cleanup error:", err.message);
                    }
                }
            };
            processCleanup();
        });

    }); // end io.on("connection")

}; // end registerSocketHandlers
