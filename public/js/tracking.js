(function () {
  const MIN_MOVE_METERS = 5;
  const THROTTLE_MS = 2500;
  const SYNC_DEBOUNCE_MS = 12000;
  const RETRY_MS = 8000;
  const MAX_COORDS = 2000;

  const queueKey = `ridesynk.travel.queue.${rideData._id}.${userid}`;
  const endpoint = `/ridesynk/ride/${rideData._id}/travel-update`;

  const rideState = {
    isTracking: false,
    totalDistance: 0,
    lastPosition: null,
    coordinates: []
  };

  let startedAt = 0;
  let lastProcessedAt = 0;
  let syncTimer = null;
  let retryTimer = null;

  function roundKm(value) {
    return Math.round(value * 100) / 100;
  }

  function metersToKm(value) {
    return roundKm(value / 1000);
  }

  function getDurationSec() {
    if (!startedAt) return 0;
    return Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  }

  function updateDistanceLabel() {
    const el = document.getElementById("liveDistanceValue");
    if (!el) return;
    el.textContent = `Distance: ${metersToKm(rideState.totalDistance).toFixed(2)} km`;
  }

  function routeFeature() {
    return {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: rideState.coordinates
      }
    };
  }

  // Uses a dedicated source/layer so planned directions routes remain untouched.
  function ensureLiveRouteLayer() {
    if (!window.map) return;

    if (!window.map.getSource("live-route")) {
      window.map.addSource("live-route", {
        type: "geojson",
        data: routeFeature()
      });
    }

    if (!window.map.getLayer("live-route-line")) {
      window.map.addLayer({
        id: "live-route-line",
        type: "line",
        source: "live-route",
        layout: {
          "line-join": "round",
          "line-cap": "round"
        },
        paint: {
          "line-color": "#ff0000",
          "line-width": 4,
          "line-opacity": 0.95
        }
      });
    }
  }

  function refreshLiveRoute() {
    if (!window.map) return;
    const source = window.map.getSource("live-route");
    if (!source) return;
    source.setData(routeFeature());
  }

  function persistQueue(items) {
    try {
      localStorage.setItem(queueKey, JSON.stringify(items));
    } catch (err) {
      // Best-effort queue only.
    }
  }

  function readQueue() {
    try {
      const raw = localStorage.getItem(queueKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function buildPayload() {
    return {
      rideId: String(rideData._id),
      distance: metersToKm(rideState.totalDistance),
      coordinates: rideState.coordinates,
      duration: getDurationSec()
    };
  }

  async function postPayload(payload) {
    if (!navigator.onLine) {
      const queue = readQueue();
      queue.push(payload);
      persistQueue(queue.slice(-20));
      return false;
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const queue = readQueue();
        queue.push(payload);
        persistQueue(queue.slice(-20));
        return false;
      }
      return true;
    } catch (error) {
      const queue = readQueue();
      queue.push(payload);
      persistQueue(queue.slice(-20));
      return false;
    }
  }

  async function flushQueue() {
    const queue = readQueue();
    if (!queue.length || !navigator.onLine) return;

    const keep = [];
    for (const payload of queue) {
      const ok = await postPayload(payload);
      if (!ok) keep.push(payload);
    }
    persistQueue(keep);
  }

  async function syncNow() {
    clearTimeout(syncTimer);
    syncTimer = null;

    const ok = await postPayload(buildPayload());
    if (ok) {
      await flushQueue();
      clearTimeout(retryTimer);
      retryTimer = null;
      return;
    }

    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      syncNow();
    }, RETRY_MS);
  }

  function scheduleSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncNow();
    }, SYNC_DEBOUNCE_MS);
  }

  function initializeDistanceFromProfile() {
    if (currentUserTravel && typeof currentUserTravel === "object") {
      const km = Number(currentUserTravel.totalDistance);
      if (Number.isFinite(km) && km > 0) {
        rideState.totalDistance = km * 1000;
      }
    }
    updateDistanceLabel();
  }

  function start() {
    if (rideState.isTracking) return;
    rideState.isTracking = true;
    if (!startedAt) startedAt = Date.now();
    ensureLiveRouteLayer();
    initializeDistanceFromProfile();
    flushQueue();
  }

  function pause() {
    rideState.isTracking = false;
  }

  function resume() {
    if (rideState.isTracking) return;
    rideState.isTracking = true;
  }

  function stop(options = {}) {
    rideState.isTracking = false;
    if (options.flush) {
      syncNow();
    }
  }

  function reset() {
    rideState.totalDistance = 0;
    rideState.lastPosition = null;
    rideState.coordinates = [];
    startedAt = Date.now();
    updateDistanceLabel();
    refreshLiveRoute();
  }

  function onPositionUpdate(position) {
    if (!rideState.isTracking) return;

    const now = Number(position.timestamp) || Date.now();
    if (now - lastProcessedAt < THROTTLE_MS) return;
    lastProcessedAt = now;

    const lat = Number(position.lat);
    const lng = Number(position.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    if (!rideState.lastPosition) {
      rideState.lastPosition = { lat, lng };
      rideState.coordinates.push([lng, lat]);
      refreshLiveRoute();
      return;
    }

    const movedMeters = window.DistanceUtils.haversineMeters(
      rideState.lastPosition.lat,
      rideState.lastPosition.lng,
      lat,
      lng
    );

    if (movedMeters < MIN_MOVE_METERS) {
      return;
    }

    rideState.totalDistance += movedMeters;
    rideState.lastPosition = { lat, lng };
    rideState.coordinates.push([lng, lat]);

    if (rideState.coordinates.length > MAX_COORDS) {
      rideState.coordinates = rideState.coordinates.slice(rideState.coordinates.length - MAX_COORDS);
    }

    updateDistanceLabel();
    refreshLiveRoute();
    scheduleSync();
  }

  window.addEventListener("online", () => {
    flushQueue();
    syncNow();
  });

  if (window.map) {
    if (window.map.isStyleLoaded()) {
      ensureLiveRouteLayer();
      refreshLiveRoute();
    } else {
      window.map.on("load", () => {
        ensureLiveRouteLayer();
        refreshLiveRoute();
      });
    }

    window.map.on("style.load", () => {
      ensureLiveRouteLayer();
      refreshLiveRoute();
    });
  }

  window.RideTrackingModule = {
    state: rideState,
    start,
    pause,
    resume,
    stop,
    reset,
    onPositionUpdate,
    syncNow
  };
})();
