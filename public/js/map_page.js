/* ═══════════════════════════════════════════════════════════════
   map_page.js
   – Main route:   source → destination  (solid blue, always drawn)
   – Per-user:     live GPS location → destination  (dashed, unique color)
   – Markers:      source pin A, destination pin B
   – Vehicle:      Google Maps-style top-down bike SVG, rotates with heading
                   Only placed AFTER first real GPS fix (never at 0,0)
   – NO socket code – socket.js handles all socket events
   ═══════════════════════════════════════════════════════════════ */

// ── 1. Mapbox token ──────────────────────────────────────────────────
mapboxgl.accessToken = map_token;

const source_coords = rideData.sorceLocation.coordinates;       // [lng, lat]
const dest_coords = rideData.destinationLocation.coordinates; // [lng, lat]

function haversineKm(lat1, lng1, lat2, lng2) {
  return haversineMeters(lat1, lng1, lat2, lng2) / 1000;
}

// Reusable distance helper used by route and ride-session tracking.
function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = d => d * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1000;
}

function formatDistanceLabel(km) {
  if (!Number.isFinite(km) || km <= 0) return '— km';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

function updateDistanceUI(km) {
  const label = formatDistanceLabel(km);
  ['distancePeekValue', 'distanceStatValue', 'distanceRouteMetaValue'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = label;
  });
  updateStopsUI(km);
}

function estimateFuelStops(distanceKm) {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return null;
  const TANK_RANGE_KM = 250;
  return Math.max(0, Math.ceil(distanceKm / TANK_RANGE_KM) - 1);
}

function formatStopsLabel(distanceKm) {
  const stops = estimateFuelStops(distanceKm);
  if (stops === null) return '— Stops';
  if (stops === 1) return '1 Stop';
  return `${stops} Stops`;
}

function updateStopsUI(distanceKm) {
  const label = formatStopsLabel(distanceKm);
  ['stopsPeekValue', 'stopsStatValue'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = label;
  });
}

function formatEtaLabel(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  if (seconds < 30) return 'Arriving';
  const mins = Math.ceil(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hrs} hr` : `${hrs} hr ${rem} min`;
}

function updateEtaUI(seconds) {
  const label = formatEtaLabel(seconds);
  ['etaPeekValue', 'etaStatValue', 'etaRouteMetaValue'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = label;
  });
}

window._selfSpeedKmh = null;
window._selfRemainingKm = null;
window._selfMapboxEtaSec = null;

function refreshSelfEta() {
  if (window._selfRemainingKm !== null && window._selfRemainingKm <= 0.05) {
    updateEtaUI(20);
    return;
  }

  const speed = Number(window._selfSpeedKmh);
  if (Number.isFinite(speed) && speed >= 5 && Number.isFinite(window._selfRemainingKm)) {
    const etaSec = (window._selfRemainingKm / speed) * 3600;
    updateEtaUI(etaSec);
    return;
  }

  updateEtaUI(window._selfMapboxEtaSec);
}

function renderLiveDistance(km) {
  const el = document.getElementById('liveDistanceValue');
  if (!el) return;
  el.textContent = `Distance: ${km.toFixed(2)} km`;
}

window.RideDistanceTracker = (() => {
  const LOCATION_THROTTLE_MS = 2500;
  const API_DEBOUNCE_MS = 12000;
  const RETRY_MS = 8000;
  const MIN_MOVE_METERS = 5;
  const MAX_GPS_JUMP_METERS = 450;
  const IDLE_TIMEOUT_MS = 60000;

  const endpoint = `/ridesync/ride/${rideData._id}/update-distance`;
  const queueKey = `ridesync.distance.queue.${rideData._id}.${userid}`;
  const initialDistanceMeters = (() => {
    if (currentUserTravel && typeof currentUserTravel === 'object') {
      const km = Number(currentUserTravel.totalDistance);
      return Number.isFinite(km) && km > 0 ? km * 1000 : 0;
    }
    if (typeof currentUserTravel === 'number' && Number.isFinite(currentUserTravel) && currentUserTravel > 0) {
      return currentUserTravel * 1000;
    }
    return 0;
  })();

  const state = {
    isTracking: false,
    isIdle: false,
    totalDistance: 0,
    lastPosition: null,
    startedAt: 0,
    lastMovementAt: 0,
    lastProcessedAt: 0
  };

  let syncTimer = null;
  let retryTimer = null;
  let uiRaf = null;

  function roundKm(valueKm) {
    return Math.round(valueKm * 100) / 100;
  }

  function toKm(meters) {
    return roundKm(meters / 1000);
  }

  function getDurationSec() {
    if (!state.startedAt) return 0;
    return Math.max(0, Math.round((Date.now() - state.startedAt) / 1000));
  }

  function persistQueue(items) {
    try {
      localStorage.setItem(queueKey, JSON.stringify(items));
    } catch (err) {
      console.warn('Failed to persist distance queue', err);
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

  function queuePayload(payload) {
    const queue = readQueue();
    queue.push(payload);
    // Keep queue bounded and avoid unbounded localStorage growth.
    persistQueue(queue.slice(-30));
  }

  function clearRetryTimer() {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  function clearSyncTimer() {
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
  }

  function paintDistance() {
    if (uiRaf) cancelAnimationFrame(uiRaf);
    uiRaf = requestAnimationFrame(() => {
      renderLiveDistance(toKm(state.totalDistance));
    });
  }

  function buildPayload() {
    return {
      rideId: String(rideData._id),
      distance: toKm(state.totalDistance),
      duration: getDurationSec()
    };
  }

  async function postPayload(payload) {
    if (!navigator.onLine) {
      queuePayload(payload);
      return false;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        queuePayload(payload);
        return false;
      }

      return true;
    } catch (error) {
      queuePayload(payload);
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
    clearSyncTimer();
    const payload = buildPayload();
    const success = await postPayload(payload);
    if (success) {
      await flushQueue();
      clearRetryTimer();
      return;
    }

    clearRetryTimer();
    retryTimer = setTimeout(() => {
      syncNow();
    }, RETRY_MS);
  }

  function scheduleSync() {
    clearSyncTimer();
    syncTimer = setTimeout(() => {
      syncNow();
    }, API_DEBOUNCE_MS);
  }

  function reset(initialMeters = 0) {
    state.totalDistance = Math.max(0, Number(initialMeters) || 0);
    state.lastPosition = null;
    state.lastMovementAt = Date.now();
    state.lastProcessedAt = 0;
    state.startedAt = Date.now();
    state.isIdle = false;
    paintDistance();
  }

  function start() {
    if (state.isTracking) return;
    state.isTracking = true;
    if (!state.startedAt) {
      reset(initialDistanceMeters);
    }
    flushQueue();
  }

  function stop(options = {}) {
    state.isTracking = false;
    clearSyncTimer();
    if (options.flush) {
      syncNow();
    }
  }

  function onPosition(position) {
    if (!state.isTracking) return;

    const lat = Number(position && position.lat);
    const lng = Number(position && position.lng);
    const accuracy = Number(position && position.accuracy);
    const now = Number(position && position.timestamp) || Date.now();

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (now - state.lastProcessedAt < LOCATION_THROTTLE_MS) return;
    state.lastProcessedAt = now;

    if (!state.lastPosition) {
      state.lastPosition = { lat, lng };
      state.lastMovementAt = now;
      return;
    }

    const segmentMeters = haversineMeters(state.lastPosition.lat, state.lastPosition.lng, lat, lng);

    if (segmentMeters < MIN_MOVE_METERS) {
      if (now - state.lastMovementAt > IDLE_TIMEOUT_MS) {
        state.isIdle = true;
      }
      return;
    }

    if (segmentMeters > MAX_GPS_JUMP_METERS && (!Number.isFinite(accuracy) || accuracy > 30)) {
      state.lastPosition = { lat, lng };
      return;
    }

    if (segmentMeters > MAX_GPS_JUMP_METERS) {
      state.lastPosition = { lat, lng };
      return;
    }

    state.isIdle = false;
    state.totalDistance += segmentMeters;
    state.lastPosition = { lat, lng };
    state.lastMovementAt = now;

    paintDistance();
    scheduleSync();
  }

  function getState() {
    return {
      isTracking: state.isTracking,
      totalDistance: state.totalDistance,
      lastPosition: state.lastPosition
    };
  }

  window.addEventListener('online', () => {
    flushQueue();
    syncNow();
  });

  return {
    start,
    stop,
    reset,
    onPosition,
    getState,
    flushNow: syncNow
  };
})();

// Show quick straight-line distance immediately, then replace with route distance.
updateDistanceUI(
  haversineKm(source_coords[1], source_coords[0], dest_coords[1], dest_coords[0])
);

// ── 2. Map init ──────────────────────────────────────────────────────
window.map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: source_coords,
  zoom: 12
});
const map = window.map;

// ── NEW: Map controls logic (Recenter, Style Toggle, Directions) ───
let isSatellite = false;

document.getElementById('btnRecenter').addEventListener('click', () => {
  // Fly to user's own last known position, or fallback to source
  const myPos = window._lastPos && window._lastPos[userid];
  if (myPos && myPos.lng && myPos.lat) {
    window.map.flyTo({ center: [myPos.lng, myPos.lat], zoom: 16, essential: true });
  } else {
    window.map.flyTo({ center: source_coords, zoom: 14, essential: true });
  }
});

document.getElementById('btnMapStyle').addEventListener('click', () => {
  isSatellite = !isSatellite;
  const camera = {
    center: window.map.getCenter().toArray(),
    zoom: window.map.getZoom(),
    bearing: window.map.getBearing(),
    pitch: window.map.getPitch()
  };

  if (isSatellite) {
    window.map.setStyle('mapbox://styles/mapbox/satellite-streets-v12');
  } else {
    window.map.setStyle('mapbox://styles/mapbox/streets-v12');
  }

  // Note: Layers & sources on Mapbox are removed when the style changes.
  // Re-add them once the new style loads.
  window.map.once('style.load', () => {
    // Keep the same zoom/center so style toggle feels like Google Maps map/satellite switch.
    window.map.jumpTo(camera);
    drawMainRoute(false);
    // Re-trigger live positions for everything that was drawn
    Object.keys(window._lastPos).forEach(id => {
      const pos = window._lastPos[id];
      scheduleUserRoute(id, pos.lat, pos.lng, { force: true });
    });
  });
});

// ── 3. Global state ──────────────────────────────────────────────────
window.liveMarkers = {};   // userId → mapboxgl.Marker
window.userRoutes = {};   // userId → { sourceId, casingId, lineId }
window.routeFetching = {};   // userId → bool
window._lastPos = {};   // userId → {lat, lng}  for heading calc
window.activeRiderPopup = null;
window.activeRiderPopupUserId = null;

window._navVoiceEnabled = false;
window._lastSpokenInstruction = null;
window._lastBannerInstruction = null;

setTimeout(() => {
  const btnVoiceToggle = document.getElementById('btnVoiceToggle');
  if (btnVoiceToggle) {
    btnVoiceToggle.addEventListener('click', () => {
      window._navVoiceEnabled = !window._navVoiceEnabled;
      const icon = document.getElementById('voiceIcon');
      if (window._navVoiceEnabled) {
        icon.className = 'bi bi-volume-up-fill';
        const ut = new SpeechSynthesisUtterance("Voice navigation enabled.");
        window.speechSynthesis.speak(ut);
        
        if (window._currentAnnouncement) {
          setTimeout(() => {
             if (window._navVoiceEnabled) {
               const ut2 = new SpeechSynthesisUtterance(window._currentAnnouncement);
               window.speechSynthesis.speak(ut2);
               window._lastSpokenInstruction = window._currentAnnouncement;
             }
          }, 1500);
        }
      } else {
        icon.className = 'bi bi-volume-mute-fill';
        icon.style.color = '';
        window.speechSynthesis.cancel();
      }
    });
  }
}, 500);

function getNavModifierIcon(modifier) {
  if (!modifier) return 'bi-arrow-up-circle-fill';
  const m = modifier.toLowerCase();
  if (m.includes('right')) return 'bi-arrow-right-circle-fill';
  if (m.includes('left')) return 'bi-arrow-left-circle-fill';
  if (m.includes('u-turn')) return 'bi-arrow-down-circle-fill';
  if (m.includes('arrive') || m.includes('destination')) return 'bi-geo-alt-fill';
  return 'bi-arrow-up-circle-fill';
}

function showNavigationBar(distLabel, instructionText, modifier) {
  const container = document.getElementById('navBarContainer');
  const icon = document.getElementById('navIcon');
  const distEl = document.getElementById('navDist');
  const textEl = document.getElementById('navText');
  if (!container) return;

  container.style.display = 'flex';
  icon.innerHTML = `<i class="bi ${getNavModifierIcon(modifier)}"></i>`;
  distEl.textContent = distLabel;
  textEl.textContent = instructionText;
}

// ── 4. Per-user color palette ────────────────────────────────────────
const USER_COLORS = [
  '#f97316', '#8b5cf6', '#ec4899',
  '#14b8a6', '#eab308', '#06b6d4', '#a3e635'
];
let _colorIdx = 0;
const _userColorMap = {};
const _memberDirectory = Array.isArray(window.rideMembers)
  ? window.rideMembers.reduce((acc, item) => {
    if (!item || !item.userId) return acc;
    acc[String(item.userId)] = item;
    return acc;
  }, {})
  : {};

function getUserColor(userId) {
  if (!_userColorMap[userId]) {
    _userColorMap[userId] = USER_COLORS[_colorIdx % USER_COLORS.length];
    _colorIdx++;
  }
  return _userColorMap[userId];
}

function getMemberMeta(userId) {
  const m = _memberDirectory[String(userId)] || {};
  return {
    name: m.name || `Rider ${String(userId).slice(-4)}`,
    initials: m.initials || 'R',
    avatar: m.avatar || ''
  };
}

function moveMarkerSmooth(marker, nextLngLat) {
  const start = marker.getLngLat();
  const startLng = start.lng;
  const startLat = start.lat;
  const endLng = nextLngLat[0];
  const endLat = nextLngLat[1];
  const startTime = performance.now();
  const durationMs = 550;

  const tick = (now) => {
    const t = Math.min(1, (now - startTime) / durationMs);
    const eased = 1 - Math.pow(1 - t, 3);
    marker.setLngLat([
      startLng + (endLng - startLng) * eased,
      startLat + (endLat - startLat) * eased
    ]);
    if (t < 1) requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}

function closeActiveRiderPopup() {
  if (window.activeRiderPopup) {
    window.activeRiderPopup.remove();
    window.activeRiderPopup = null;
    window.activeRiderPopupUserId = null;
  }
}

function openRiderNamePopup(userId, lngLat, riderName) {
  if (
    window.activeRiderPopup &&
    String(window.activeRiderPopupUserId) === String(userId)
  ) {
    closeActiveRiderPopup();
    return;
  }

  closeActiveRiderPopup();

  const popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 28,
    className: 'rider-name-popup'
  })
    .setLngLat(lngLat)
    .setHTML(`<div class="rider-name-popup__text">${riderName}</div>`)
    .addTo(map);

  window.activeRiderPopup = popup;
  window.activeRiderPopupUserId = userId;
}

// ── 5. Directions API ────────────────────────────────────────────────
async function fetchRoute(fromLng, fromLat, toLng, toLat) {
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/` +
    `${fromLng},${fromLat};${toLng},${toLat}` +
    `?geometries=geojson&overview=full&steps=true&voice_instructions=true&banner_instructions=true` +
    `&access_token=${mapboxgl.accessToken}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (!json.routes?.length) return null;
    return json.routes[0];
  } catch (e) {
    console.error('fetchRoute:', e);
    return null;
  }
}

// ── 6. Main source → destination route (solid blue) ──────────────────
async function drawMainRoute(fitToRoute = true) {
  const route = await fetchRoute(
    source_coords[0], source_coords[1],
    dest_coords[0], dest_coords[1]
  );
  if (!route) return;

  if (typeof route.distance === 'number') {
    updateDistanceUI(route.distance / 1000);
  }
  if (typeof route.duration === 'number') {
    updateEtaUI(route.duration);
  }

  const geometry = route.geometry;

  if (map.getSource('main-route')) {
    map.getSource('main-route').setData({ type: 'Feature', properties: {}, geometry });
    return;
  }

  map.addSource('main-route', {
    type: 'geojson',
    data: { type: 'Feature', properties: {}, geometry }
  });
  map.addLayer({
    id: 'main-route-casing', type: 'line', source: 'main-route',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.9 }
  });
  map.addLayer({
    id: 'main-route-line', type: 'line', source: 'main-route',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#3b82f6', 'line-width': 5, 'line-opacity': 1 }
  });

  if (!fitToRoute) return;

  // Fit map to full route
  const coords = geometry.coordinates;
  const bounds = coords.reduce(
    (b, c) => b.extend(c),
    new mapboxgl.LngLatBounds(coords[0], coords[0])
  );
  map.fitBounds(bounds, { padding: 80 });
}

// ── 7. Per-user dashed route (live pos → destination) ────────────────
const _routeDebounce = {};
const _lastRouteAnchor = {}; // userId -> { lat, lng }
const _lastRouteFetchAt = {}; // userId -> epoch ms
const ROUTE_MIN_MOVE_METERS = 35;
const ROUTE_MAX_STALE_MS = 15000;

function shouldRecalculateRoute(userId, lat, lng, force = false) {
  if (force) return true;

  const prev = _lastRouteAnchor[userId];
  const lastFetchedAt = _lastRouteFetchAt[userId] || 0;
  if (!prev) return true;

  const movedMeters = haversineKm(prev.lat, prev.lng, lat, lng) * 1000;
  const staleForMs = Date.now() - lastFetchedAt;

  if (movedMeters >= ROUTE_MIN_MOVE_METERS) return true;
  if (staleForMs >= ROUTE_MAX_STALE_MS) return true;
  return false;
}

function scheduleUserRoute(userId, lat, lng, options = {}) {
  const force = Boolean(options.force);
  if (!shouldRecalculateRoute(userId, lat, lng, force)) return;

  clearTimeout(_routeDebounce[userId]);
  _routeDebounce[userId] = setTimeout(() => drawUserRoute(userId, lat, lng), 800);
}

async function drawUserRoute(userId, lat, lng) {
  if (window.routeFetching[userId]) return;
  window.routeFetching[userId] = true;

  const color = getUserColor(userId);

  try {
    const route = await fetchRoute(lng, lat, dest_coords[0], dest_coords[1]);
    if (!route) return;

    _lastRouteAnchor[userId] = { lat, lng };
    _lastRouteFetchAt[userId] = Date.now();

    if (String(userId) === String(userid)) {
      if (typeof route.distance === 'number') {
        window._selfRemainingKm = route.distance / 1000;
        updateDistanceUI(window._selfRemainingKm);
      }
      if (typeof route.duration === 'number') {
        window._selfMapboxEtaSec = route.duration;
      }
      refreshSelfEta();

      if (route.legs && route.legs[0] && route.legs[0].steps && route.legs[0].steps.length > 0) {
        const currentStep = route.legs[0].steps[0];

        if (currentStep.bannerInstructions && currentStep.bannerInstructions.length > 0) {
          const banner = currentStep.bannerInstructions[0];
          const distStr = formatDistanceLabel(banner.distanceAlongGeometry / 1000);
          const txt = banner.primary.text;
          const instructionKey = distStr + "_" + txt;

          if (window._lastBannerInstruction !== instructionKey) {
            window._lastBannerInstruction = instructionKey;
            showNavigationBar(distStr, txt, banner.primary.modifier);
          }
        }

        let voiceAnnouncement = "";
        if (currentStep.voiceInstructions && currentStep.voiceInstructions.length > 0) {
          voiceAnnouncement = currentStep.voiceInstructions[0].announcement;
        } else if (route.legs[0].steps.length > 1) {
          voiceAnnouncement = route.legs[0].steps[1].maneuver.instruction;
        } else if (currentStep.maneuver && currentStep.maneuver.instruction) {
          voiceAnnouncement = currentStep.maneuver.instruction;
        }

        if (voiceAnnouncement) {
          window._currentAnnouncement = voiceAnnouncement;
          if (window._navVoiceEnabled && window._lastSpokenInstruction !== voiceAnnouncement) {
            window._lastSpokenInstruction = voiceAnnouncement;
            const utterance = new SpeechSynthesisUtterance(voiceAnnouncement);
            window.speechSynthesis.speak(utterance);
          }
        }
      }
    }

    const geometry = route.geometry;
    const sourceId = `user-route-${userId}`;
    const casingId = `user-casing-${userId}`;
    const lineId = `user-line-${userId}`;
    const data = { type: 'Feature', properties: {}, geometry };

    if (map.getSource(sourceId)) {
      map.getSource(sourceId).setData(data);
    } else {
      map.addSource(sourceId, { type: 'geojson', data });
      map.addLayer({
        id: casingId, type: 'line', source: sourceId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 0.7 }
      });
      map.addLayer({
        id: lineId, type: 'line', source: sourceId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': color,
          'line-width': 3,
          'line-opacity': 0.9,
          'line-dasharray': [2, 2]
        }
      });
      window.userRoutes[userId] = { sourceId, casingId, lineId };
    }
  } catch (e) {
    console.error('drawUserRoute:', e);
  } finally {
    window.routeFetching[userId] = false;
  }
}

// ── 8. Vehicle marker SVG (top-down bike, Google Maps style) ─────────
function makeVehicleSVG(color) {
  return `<svg width="38" height="54" viewBox="0 0 38 54"
     xmlns="http://www.w3.org/2000/svg">
  <!-- drop shadow -->
  <ellipse cx="19" cy="51" rx="9" ry="3" fill="rgba(0,0,0,0.20)"/>
  <!-- rear wheel -->
  <rect x="13" y="38" width="12" height="13" rx="6"
        fill="${color}" stroke="#fff" stroke-width="2"/>
  <!-- body frame -->
  <rect x="12" y="12" width="14" height="28" rx="7"
        fill="${color}" stroke="#fff" stroke-width="2.5"/>
  <!-- front wheel -->
  <rect x="13" y="3"  width="12" height="13" rx="6"
        fill="${color}" stroke="#fff" stroke-width="2"/>
  <!-- handlebar left -->
  <rect x="7"  y="14" width="5"  height="3"  rx="1.5"
        fill="${color}" stroke="#fff" stroke-width="1.5"/>
  <!-- handlebar right -->
  <rect x="26" y="14" width="5"  height="3"  rx="1.5"
        fill="${color}" stroke="#fff" stroke-width="1.5"/>
  <!-- rider helmet -->
  <circle cx="19" cy="20" r="5" fill="#fff" opacity="0.9"/>
  <!-- direction arrow tip -->
  <polygon points="19,1 15,8 23,8" fill="#fff" opacity="0.95"/>
</svg>`;
}

// ── 9. Heading between two GPS points ────────────────────────────────
function computeHeading(lat1, lng1, lat2, lng2) {
  const toRad = d => d * Math.PI / 180;
  const dLng = toRad(lng2 - lng1);
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const y = Math.sin(dLng) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// ── 10. Create / move vehicle marker ─────────────────────────────────
// Called by socket.js when a GPS update arrives.
// NEVER creates a marker at (0,0) — waits for a real GPS fix.
window.updateUserMarker = function updateUserMarker(userId, lat, lng, heading, speedMps) {
  if (!window.map) return;
  if (!lat || !lng || (lat === 0 && lng === 0)) return;  // guard: no fake 0,0
  if (isNaN(lat) || isNaN(lng)) return;

  const color = getUserColor(userId);
  const memberMeta = getMemberMeta(userId);
  const isSelf = String(userId) === String(userid);

  if (window.liveMarkers[userId]) {
    // ── Move existing vehicle ──
    moveMarkerSmooth(window.liveMarkers[userId], [lng, lat]);

    // Rotate to face direction of travel
    if (window._lastPos[userId]) {
      const prev = window._lastPos[userId];
      const heading = computeHeading(prev.lat, prev.lng, lat, lng);
      const el = window.liveMarkers[userId].getElement();
      el.querySelector('svg').style.transform = `rotate(${heading}deg)`;
    }

    if (window.activeRiderPopup && String(window.activeRiderPopupUserId) === String(userId)) {
      window.activeRiderPopup.setLngLat([lng, lat]);
    }
  } else {
    // ── First valid GPS fix: build the vehicle element ──
    const wrap = document.createElement('div');
    wrap.className = 'vehicle-wrap rider-marker';
    wrap.style.cssText = `
      width: 38px; height: 54px;
      cursor: pointer;
      filter: drop-shadow(0 4px 8px rgba(0,0,0,0.35));
    `;
    wrap.innerHTML = `${makeVehicleSVG(color)}
      <div class="rider-tag ${isSelf ? 'self' : ''}">
        ${memberMeta.avatar
          ? `<img src="${memberMeta.avatar}" alt="${memberMeta.name}" class="rider-avatar" />`
          : `<span class="rider-initial">${memberMeta.initials}</span>`}
      </div>`;

    wrap.addEventListener('click', (event) => {
      event.stopPropagation();
      wrap.classList.add('is-clicked');
      setTimeout(() => wrap.classList.remove('is-clicked'), 150);

      const marker = window.liveMarkers[userId];
      if (!marker) return;
      openRiderNamePopup(userId, marker.getLngLat(), memberMeta.name);
    });

    // Smooth rotation transition on the inner SVG
    wrap.querySelector('svg').style.cssText = `
      transform-origin: 50% 50%;
      transition: transform 0.5s ease;
      display: block;
    `;

    window.liveMarkers[userId] = new mapboxgl.Marker({
      element: wrap,
      anchor: 'center'
    })
      .setLngLat([lng, lat])
      .addTo(window.map);
  }

  // Save last position for next heading calculation
  window._lastPos[userId] = { lat, lng };

  if (isSelf && Number.isFinite(speedMps) && speedMps >= 0) {
    window._selfSpeedKmh = speedMps * 3.6;
    refreshSelfEta();
  }

  // Refresh the dashed live-route for this rider
  scheduleUserRoute(userId, lat, lng);
};

// ── 11. Remove user's marker + route ─────────────────────────────────
window.removeUser = function removeUser(userId) {
  if (window.userRoutes[userId]) {
    const { sourceId, casingId, lineId } = window.userRoutes[userId];
    if (map.getLayer(casingId)) map.removeLayer(casingId);
    if (map.getLayer(lineId)) map.removeLayer(lineId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
    delete window.userRoutes[userId];
  }
  if (window.liveMarkers[userId]) {
    if (window.activeRiderPopup && String(window.activeRiderPopupUserId) === String(userId)) {
      closeActiveRiderPopup();
    }
    window.liveMarkers[userId].remove();
    delete window.liveMarkers[userId];
  }
  delete _userColorMap[userId];
  delete _routeDebounce[userId];
  delete _lastRouteAnchor[userId];
  delete _lastRouteFetchAt[userId];
  delete window._lastPos[userId];
};

// ── 12. Map load: static A / B pins + main blue route ────────────────
map.on('load', () => {

  // ── Source pin  A (purple) ──
  const srcEl = document.createElement('div');
  srcEl.innerHTML = `<svg width="36" height="46" viewBox="0 0 36 46" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="18" cy="44" rx="6" ry="2.5" fill="rgba(0,0,0,0.18)"/>
    <path d="M18 0C9.163 0 2 7.163 2 16c0 12 16 30 16 30S34 28 34 16C34 7.163 26.837 0 18 0z" fill="#6C63FF"/>
    <circle cx="18" cy="16" r="9" fill="white"/>
    <text x="18" y="20.5" text-anchor="middle"
          font-family="DM Sans,sans-serif" font-size="11" font-weight="900" fill="#6C63FF">A</text>
  </svg>`;
  srcEl.style.cssText = 'cursor:pointer;filter:drop-shadow(0 3px 8px rgba(108,99,255,.5));';
  new mapboxgl.Marker({ element: srcEl, anchor: 'bottom' })
    .setLngLat(source_coords)
    .setPopup(new mapboxgl.Popup({ offset: 28, closeButton: false })
      .setHTML(`<b>Start</b><br/>${rideData.sorce || rideData.source || ''}`))
    .addTo(map);

  // ── Destination pin  B (red) ──
  const dstEl = document.createElement('div');
  dstEl.innerHTML = `<svg width="36" height="46" viewBox="0 0 36 46" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="18" cy="44" rx="6" ry="2.5" fill="rgba(0,0,0,0.18)"/>
    <path d="M18 0C9.163 0 2 7.163 2 16c0 12 16 30 16 30S34 28 34 16C34 7.163 26.837 0 18 0z" fill="#FF4F6D"/>
    <circle cx="18" cy="16" r="9" fill="white"/>
    <text x="18" y="20.5" text-anchor="middle"
          font-family="DM Sans,sans-serif" font-size="11" font-weight="900" fill="#FF4F6D">B</text>
  </svg>`;
  dstEl.style.cssText = 'cursor:pointer;filter:drop-shadow(0 3px 8px rgba(255,79,109,.5));';
  new mapboxgl.Marker({ element: dstEl, anchor: 'bottom' })
    .setLngLat(dest_coords)
    .setPopup(new mapboxgl.Popup({ offset: 28, closeButton: false })
      .setHTML(`<b>Destination</b><br/>${rideData.destination || ''}`))
    .addTo(map);

  // ── Draw the main blue route ──
  drawMainRoute();
});

map.on('click', () => {
  closeActiveRiderPopup();
});

/* ═══════════════════════════════════════════════
   BOTTOM SHEET  (drag/snap — unchanged)
   ═══════════════════════════════════════════════ */
const sheet = document.getElementById('sheet');
const handle = document.getElementById('sheetHandle');
const body = document.getElementById('sheetBody');
const peek = document.getElementById('peekStrip');
const tabNav = document.getElementById('tabNav');
const lbl = document.getElementById('handleLabel');
const chatBar = document.getElementById('chatBar');

let state = 'collapsed', dragging = false, didDrag = false;
let startY = 0, startVis = 0, curVis = 0;

function snaps() {
  const vh = window.innerHeight - 60;
  return { collapsed: 110, mid: Math.round(vh * .46), expanded: Math.round(vh * .90) };
}
function setVis(vis, animate) {
  curVis = vis;
  sheet.style.transition = animate ? 'transform .38s cubic-bezier(.32,1,.38,1)' : 'none';
  sheet.style.transform = `translateY(${Math.max(0, sheet.offsetHeight - vis)}px)`;
}
function snapTo(name, animate = true) {
  const s = snaps();
  state = name;
  setVis(s[name], animate);
  const col = name === 'collapsed';
  peek.style.display = col ? 'flex' : 'none';
  tabNav.style.display = col ? 'none' : 'flex';
  body.style.display = col ? 'none' : 'block';
  lbl.textContent = col ? '↑ Slide up for trip details'
    : (name === 'expanded' ? '↓ Slide down' : '↑↓ Drag to resize');
  if (!col) body.style.height = (s[name] - 120) + 'px';
  refreshChatBar();
}
window.snapTo = snapTo;

function refreshChatBar() {
  const isChat = document.querySelector('.tab-btn.active')?.dataset.tab === 'chat';
  const isVisible = isChat && state !== 'collapsed';
  chatBar.classList.toggle('show', isVisible);
  body.classList.toggle('chat-mode', isVisible);

  const chatBarSpace = isVisible ? chatBar.offsetHeight : 0;
  document.documentElement.style.setProperty('--chat-bar-space', `${chatBarSpace}px`);
}

function onStart(e) {
  if (e.target.closest('#sheetBody')) return;
  dragging = true; didDrag = false;
  startY = e.touches ? e.touches[0].clientY : e.clientY;
  startVis = curVis;
  sheet.style.transition = 'none';
}
function onMove(e) {
  if (!dragging) return;
  didDrag = true;
  const y = e.touches ? e.touches[0].clientY : e.clientY;
  const s = snaps();
  const v = Math.min(s.expanded, Math.max(s.collapsed, startVis + (startY - y)));
  setVis(v, false);
  if (v > s.collapsed + 20) {
    peek.style.display = 'none'; tabNav.style.display = 'flex';
    body.style.display = 'block'; body.style.height = (v - 120) + 'px';
  } else {
    peek.style.display = 'flex'; tabNav.style.display = 'none'; body.style.display = 'none';
  }
}
function onEnd() {
  if (!dragging) return;
  dragging = false;
  const s = snaps();
  const d = [['collapsed', Math.abs(curVis - s.collapsed)], ['mid', Math.abs(curVis - s.mid)], ['expanded', Math.abs(curVis - s.expanded)]];
  d.sort((a, b) => a[1] - b[1]);
  snapTo(d[0][0]);
}

handle.addEventListener('mousedown', onStart, { passive: true });
handle.addEventListener('touchstart', onStart, { passive: true });
window.addEventListener('mousemove', onMove, { passive: true });
window.addEventListener('touchmove', onMove, { passive: true });
window.addEventListener('mouseup', onEnd);
window.addEventListener('touchend', onEnd);
handle.addEventListener('click', () => {
  if (didDrag) { didDrag = false; return; }
  if (state === 'collapsed') snapTo('mid');
  else if (state === 'mid') snapTo('expanded');
  else snapTo('collapsed');
});
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (state === 'collapsed') snapTo('mid');
    refreshChatBar();
  });
});
window.addEventListener('resize', () => snapTo(state, false));
setTimeout(() => {
  sheet.style.transition = 'none';
  sheet.style.transform = `translateY(${sheet.offsetHeight}px)`;
  requestAnimationFrame(() => snapTo('collapsed', true));
}, 50);