module.exports.sanitizeSosLocation=(raw)=> {
    if (!raw || typeof raw !== "object") {
        return undefined;
    }

    const lat = Number(raw.lat);
    const lng = Number(raw.lng);
    const address = String(raw.address || "").trim().slice(0, 200);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

    if (hasCoords && (lat < -90 || lat > 90 || lng < -180 || lng > 180)) {
        return undefined;
    }

    if (!hasCoords && !address) {
        return undefined;
    }

    return {
        lat: hasCoords ? lat : undefined,
        lng: hasCoords ? lng : undefined,
        address: address || undefined
    };
}