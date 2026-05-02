const mbxDirections = require("@mapbox/mapbox-sdk/services/directions");
const mbxGeocoding = require("@mapbox/mapbox-sdk/services/geocoding");
const { haversineMeters } = require("./haversine.js");

const MAPBOX_TIMEOUT_MS = 5000;

function roundKm(value) {
    return Math.round(value * 100) / 100;
}

function isFiniteNumber(value) {
    return Number.isFinite(Number(value));
}

function normalizeCoordinates(coords) {
    if (!Array.isArray(coords) || coords.length !== 2) return null;

    const lng = Number(coords[0]);
    const lat = Number(coords[1]);

    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

    return [lng, lat];
}

function withTimeout(promise, timeoutMs, message) {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error(message)), timeoutMs);
        })
    ]);
}

async function geocodeAddress(address, geocodingClient) {
    const safeAddress = String(address || "").trim();
    if (!safeAddress) return null;

    const response = await withTimeout(
        geocodingClient
            .forwardGeocode({
                query: safeAddress,
                limit: 1
            })
            .send(),
        MAPBOX_TIMEOUT_MS,
        "Mapbox geocoding timeout"
    );

    const feature = response && response.body && response.body.features && response.body.features[0];
    if (!feature || !feature.geometry || !Array.isArray(feature.geometry.coordinates)) return null;

    return normalizeCoordinates(feature.geometry.coordinates);
}

async function fetchRouteDistanceKm(sourceCoords, destinationCoords, directionsClient) {
    const response = await withTimeout(
        directionsClient
            .getDirections({
                profile: "driving",
                waypoints: [
                    { coordinates: sourceCoords },
                    { coordinates: destinationCoords }
                ],
                geometries: "geojson"
            })
            .send(),
        MAPBOX_TIMEOUT_MS,
        "Mapbox directions timeout"
    );

    const route = response && response.body && Array.isArray(response.body.routes)
        ? response.body.routes[0]
        : null;

    const distanceMeters = route && Number(route.distance);
    if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
        throw new Error("Invalid route distance response");
    }

    return roundKm(distanceMeters / 1000);
}

module.exports.calculateRideDistanceKm = async ({
    sourceCoords,
    destinationCoords,
    sourceAddress,
    destinationAddress
}) => {
    try {
        const token = process.env.MAP_TOKEN || process.env.MAPBOX_TOKEN;

        let source = normalizeCoordinates(sourceCoords);
        let destination = normalizeCoordinates(destinationCoords);

        if ((!source || !destination) && token) {
            const geocodingClient = mbxGeocoding({ accessToken: token });
            const tasks = [];
            
            if (!source) {
                tasks.push(geocodeAddress(sourceAddress, geocodingClient).then(res => source = res));
            }
            if (!destination) {
                tasks.push(geocodeAddress(destinationAddress, geocodingClient).then(res => destination = res));
            }

            if (tasks.length > 0) {
                await withTimeout(
                    Promise.all(tasks),
                    MAPBOX_TIMEOUT_MS,
                    "Geocoding parallel timeout"
                ).catch(err => console.error("[geocoding] Parallel error:", err.message));
            }
        }

        if (!source || !destination) {
            return 0;
        }

        if (!token) {
            return roundKm(haversineMeters(source[1], source[0], destination[1], destination[0]) / 1000);
        }

        const directionsClient = mbxDirections({ accessToken: token });

        try {
            return await fetchRouteDistanceKm(source, destination, directionsClient);
        } catch (_) {
            // Fallback keeps creation flow alive if Mapbox Directions is unavailable.
            return roundKm(haversineMeters(source[1], source[0], destination[1], destination[0]) / 1000);
        }
    } catch (_) {
        return 0;
    }
};
