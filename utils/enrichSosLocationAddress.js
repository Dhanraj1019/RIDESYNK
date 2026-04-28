const map_token = process.env.MAP_TOKEN;
const MAPBOX_TIMEOUT_MS = 3000;

async function fetchWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
}

module.exports.enrichSosLocationAddress=async (location) => {
    if (!location || typeof location !== "object") {
        return location;
    }

    if (location.address) {
        return location;
    }

    if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng) || !map_token) {
        return location;
    }

    try {
        const reverseUrl =
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${location.lng},${location.lat}.json` +
            `?access_token=${map_token}&types=poi,address,place&limit=1`;

        const response = await fetchWithTimeout(reverseUrl, MAPBOX_TIMEOUT_MS);
        const data = await response.json();
        const feature = Array.isArray(data && data.features) ? data.features[0] : null;
        const readable = String((feature && (feature.place_name || feature.text)) || "").trim();

        if (!readable) {
            return location;
        }

        return {
            lat: location.lat,
            lng: location.lng,
            address: readable.slice(0, 200)
        };
    } catch (error) {
        return location;
    }
}
