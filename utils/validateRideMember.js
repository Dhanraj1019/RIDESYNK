const RideMember=require("../models/ride_member");

module.exports.validateRideMember=async (rideId, userId) => {
    return RideMember.exists({
        rideId,
        userId,
        status: "active",
        isActive: true
    });
}