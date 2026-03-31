const Message = require("../models/message.js");
const RideMember = require("../models/ride_member.js");
const mongoose = require("mongoose");

// In-memory ride live state:
// rideId -> Map<userId, { userId, lat, lng, heading, speed, updatedAt }>
const rideLocationState = new Map();

// In-memory active presence:
// rideId -> Map<userId, Set<socketId>>
const rideActiveUsersState = new Map();

// socket.id -> { rideId, userId }
const socketSessionState = new Map();

function normalizeRideId(payload) {
	if (!payload) return "";
	if (typeof payload === "string") return String(payload).trim();
	if (typeof payload === "object") return String(payload.rideId || payload.roomId || "");
	return "";
}

function normalizeUserId(payload) {
	if (!payload) return "";
	if (typeof payload === "object") return String(payload.userId || "").trim();
	return "";
}

async function canJoinRideRoom(rideId, userId) {
	if (!mongoose.Types.ObjectId.isValid(rideId) || !mongoose.Types.ObjectId.isValid(userId)) {
		return false;
	}

	const isMember = await RideMember.exists({
		rideId,
		userId,
		status: "active",
		isActive: true
	});

	return Boolean(isMember);
}

function getOrCreateRideActiveMap(rideId) {
	if (!rideActiveUsersState.has(rideId)) {
		rideActiveUsersState.set(rideId, new Map());
	}
	return rideActiveUsersState.get(rideId);
}

function addActiveSocketToRide(rideId, userId, socketId) {
	if (!rideId || !userId || !socketId) return;
	const perRide = getOrCreateRideActiveMap(rideId);
	if (!perRide.has(userId)) {
		perRide.set(userId, new Set());
	}
	perRide.get(userId).add(socketId);
}

function removeActiveSocketFromRide(rideId, userId, socketId) {
	if (!rideId || !userId || !socketId) return;
	const perRide = rideActiveUsersState.get(rideId);
	if (!perRide) return;

	const sockets = perRide.get(userId);
	if (!sockets) return;

	sockets.delete(socketId);
	if (sockets.size === 0) {
		perRide.delete(userId);
	}
	if (perRide.size === 0) {
		rideActiveUsersState.delete(rideId);
	}
}

function getActiveUserCount(rideId) {
	const perRide = rideActiveUsersState.get(rideId);
	if (!perRide) return 0;
	return perRide.size;
}

async function getTotalRideMembersCount(rideId) {
	if (!rideId) return 0;
	try {
		return await RideMember.countDocuments({ rideId });
	} catch (err) {
		console.error("countDocuments ride members failed:", err);
		return 0;
	}
}

async function emitActiveUsersUpdate(io, rideId) {
	if (!rideId) return;
	const activeCount = getActiveUserCount(rideId);
	const totalCount = await getTotalRideMembersCount(rideId);
	io.to(rideId).emit("ride:activeUsers:update", { activeCount, totalCount });
}

function upsertRideLocation(rideId, locationPayload) {
	if (!rideLocationState.has(rideId)) {
		rideLocationState.set(rideId, new Map());
	}

	const perRide = rideLocationState.get(rideId);
	const userId = String(locationPayload.userId);

	const location = {
		userId,
		lat: Number(locationPayload.lat),
		lng: Number(locationPayload.lng),
		heading: Number.isFinite(Number(locationPayload.heading)) ? Number(locationPayload.heading) : null,
		speed: Number.isFinite(Number(locationPayload.speed)) ? Number(locationPayload.speed) : null,
		updatedAt: Date.now()
	};

	perRide.set(userId, location);
	return location;
}

function removeSocketUserLocation(socketId) {
	const session = socketSessionState.get(socketId);
	if (!session) return null;

	const { rideId, userId } = session;
	socketSessionState.delete(socketId);

	const perRide = rideLocationState.get(rideId);
	if (!perRide) return { rideId, userId };

	perRide.delete(String(userId));
	if (perRide.size === 0) rideLocationState.delete(rideId);

	return { rideId, userId: String(userId) };
}

function registerSocketHandlers(io) {
	io.on("connection", (socket) => {
		console.log("User connected:");

		const handleJoinRide = async (joinPayload) => {
			const rideId = normalizeRideId(joinPayload);
			const userId = normalizeUserId(joinPayload);
			if (!rideId || !userId) {
				socket.emit("sos:error", { message: "Invalid ride session" });
				return;
			}

			const sessionUserId = socket.request && socket.request.session && socket.request.session.passport
				? String(socket.request.session.passport.user || "")
				: "";
			if (sessionUserId && sessionUserId !== userId) {
				socket.emit("sos:error", { message: "Unauthorized listener" });
				return;
			}

			const authorized = await canJoinRideRoom(rideId, userId);
			if (!authorized) {
				socket.emit("sos:error", { message: "Not allowed in this ride" });
				return;
			}

			socket.join(rideId);
			socketSessionState.set(socket.id, { rideId, userId });
			addActiveSocketToRide(rideId, userId, socket.id);
			console.log("Joined ride:");

			const perRide = rideLocationState.get(rideId);
			if (perRide && perRide.size) {
				socket.emit("location:sync", Array.from(perRide.values()));
			}

			await emitActiveUsersUpdate(io, rideId);
		};

		socket.on("joinRide", handleJoinRide);
		socket.on("join:ride", handleJoinRide);

		socket.on("leave:ride", async (payload) => {
			const rideId = normalizeRideId(payload);
			const userId = normalizeUserId(payload) || (socketSessionState.get(socket.id) || {}).userId;
			if (!rideId || !userId) return;

			removeActiveSocketFromRide(rideId, userId, socket.id);
			socketSessionState.set(socket.id, { rideId, userId });
			await emitActiveUsersUpdate(io, rideId);
		});

		const handleLocationUpdate = (payload) => {
			if (!payload || !payload.rideId || !payload.userId) return;

			const rideId = String(payload.rideId);
			const userId = String(payload.userId);

			const lat = Number(payload.lat);
			const lng = Number(payload.lng);
			if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

			const existing = socketSessionState.get(socket.id);
			if (!existing || String(existing.rideId) !== rideId || String(existing.userId) !== userId) {
				socket.join(rideId);
				socketSessionState.set(socket.id, { rideId, userId });
				addActiveSocketToRide(rideId, userId, socket.id);
				emitActiveUsersUpdate(io, rideId);
			}

			const normalized = upsertRideLocation(rideId, payload);
			socketSessionState.set(socket.id, { rideId, userId });

			// New event name requested.
			socket.to(rideId).emit("location:update", normalized);

			// Legacy compatibility so existing pages don't break.
			socket.to(rideId).emit("receiveLocation", {
				userId: normalized.userId,
				lat: normalized.lat,
				lng: normalized.lng,
				heading: normalized.heading,
				speed: normalized.speed
			});
		};

		// New name
		socket.on("location:update", handleLocationUpdate);
		// Backward-compatible name from current client
		socket.on("sendLocation", handleLocationUpdate);

		socket.on("sendMessage", async (data) => {
			const { rideId, senderId, message } = data || {};
			if (!rideId || !senderId || !message) return;

			const newMsg = new Message({ rideId, senderId, message });
			await newMsg.save();
			await newMsg.populate({ path: "senderId", select: "firstname" });

			io.to(String(rideId)).emit("receiveMessage", newMsg);
		});

		socket.on("disconnect", () => {
			console.log("User disconnected:");
			const session = socketSessionState.get(socket.id);
			if (session && session.rideId && session.userId) {
				removeActiveSocketFromRide(session.rideId, session.userId, socket.id);
				emitActiveUsersUpdate(io, session.rideId);
			}

			const left = removeSocketUserLocation(socket.id);
			if (!left || !left.rideId || !left.userId) return;

			io.to(left.rideId).emit("location:remove", { userId: left.userId });
			io.to(left.rideId).emit("userLeft", { userId: left.userId });
		});
	});
}

module.exports = registerSocketHandlers;
