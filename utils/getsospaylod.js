
function getSafeUserName(user) {
    if (!user) return "Unknown rider";
    const first = String(user.firstname || "").trim();
    const last = String(user.lastname || "").trim();
    if (first || last) return `${first} ${last}`.trim();
    return String(user.username || "Unknown rider").trim();
}

module.exports.toSosPayload = (doc) => {
    const location = doc && doc.location && typeof doc.location === "object" ? doc.location : undefined;

    return {
        _id: doc._id,
        rideId: doc.rideId,
        userId: doc.userId && doc.userId._id ? doc.userId._id : doc.userId,
        userName: doc.userId && doc.userId._id ? getSafeUserName(doc.userId) : "Unknown rider",
        status: doc.status,
        createdAt: doc.createdAt,
        resolvedAt: doc.resolvedAt,
        location: location
            ? {
                lat: location.lat,
                lng: location.lng,
                address: location.address
            }
            : undefined
    };
}
