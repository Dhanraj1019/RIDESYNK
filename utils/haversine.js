function toRadians(degrees) {
    return (degrees * Math.PI) / 180;
}

// Reusable geodesic distance helper using the Haversine formula.
module.exports.haversineMeters = (lat1, lng1, lat2, lng2) => {
    const EARTH_RADIUS_KM = 6371;

    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_KM * c * 1000;
};
