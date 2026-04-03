/* ═══════════════════════════════════════════════════════════════
   map_page.js  — FULL RIDE TRACKING MAP
   ─────────────────────────────────────────────────────────────
   Route logic:
     BEFORE ride starts
       • Main route   : source → destination  (solid blue, STATIC — drawn once)
       • Per member   : live pos → source     (grey dashed)
       • On reaching source (≤ 80 m): route removed, only marker remains
       • Admin        : no user→source route, special crown marker
     AFTER admin clicks "Start Ride"
       • Main route   : source → admin live pos → destination  (blue, DYNAMIC)
       • All user→source routes cleared
       • Only markers visible for everyone

   NO socket code — socket.js handles all socket events.
   Chat / bottom-sheet / distance-tracker code is unchanged.
   ═══════════════════════════════════════════════════════════════ */

// ── 1. Mapbox token ──────────────────────────────────────────────────
mapboxgl.accessToken = map_token;

const source_coords = rideData.sorceLocation.coordinates;         // [lng, lat]
const dest_coords   = rideData.destinationLocation.coordinates;   // [lng, lat]

// ── Ride-level metadata ──────────────────────────────────────────────
// adminId is the ride creator. Adjust the key to whatever your rideData uses.
const ADMIN_ID = String(rideData.admin || rideData.adminId || '');
function isAdminUser(userId) { return String(userId) === ADMIN_ID; }
const iAmAdmin = isAdminUser(String(userid));

// ── Distance / ETA helpers ────────────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  return haversineMeters(lat1, lng1, lat2, lng2) / 1000;
}
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
  ['distancePeekValue', 'distanceStatValue', 'distanceRouteMetaValue'].forEach(id => {
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
  ['stopsPeekValue', 'stopsStatValue'].forEach(id => {
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
  ['etaPeekValue', 'etaStatValue', 'etaRouteMetaValue'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = label;
  });
}

window._selfSpeedKmh       = null;
window._selfRemainingKm    = null;
window._selfMapboxEtaSec   = null;

function refreshSelfEta() {
  if (window._selfRemainingKm !== null && window._selfRemainingKm <= 0.05) {
    updateEtaUI(20); return;
  }
  const speed = Number(window._selfSpeedKmh);
  if (Number.isFinite(speed) && speed >= 5 && Number.isFinite(window._selfRemainingKm)) {
    updateEtaUI((window._selfRemainingKm / speed) * 3600); return;
  }
  updateEtaUI(window._selfMapboxEtaSec);
}

function renderLiveDistance(km) {
  const el = document.getElementById('liveDistanceValue');
  if (!el) return;
  el.textContent = `Distance: ${km.toFixed(2)} km`;
}

// ══════════════════════════════════════════════════════════════
//  DISTANCE TRACKER  (completely unchanged)
// ══════════════════════════════════════════════════════════════
window.RideDistanceTracker = (() => {
  const LOCATION_THROTTLE_MS = 2500;
  const API_DEBOUNCE_MS      = 12000;
  const RETRY_MS             = 8000;
  const MIN_MOVE_METERS      = 5;
  const MAX_GPS_JUMP_METERS  = 450;
  const IDLE_TIMEOUT_MS      = 60000;

  const endpoint = `/ridesynk/ride/${rideData._id}/update-distance`;
  const queueKey = `ridesynk.distance.queue.${rideData._id}.${userid}`;
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
    isTracking: false, isIdle: false,
    totalDistance: 0, lastPosition: null,
    startedAt: 0, lastMovementAt: 0, lastProcessedAt: 0
  };
  let syncTimer = null, retryTimer = null, uiRaf = null;

  function roundKm(v)    { return Math.round(v * 100) / 100; }
  function toKm(m)       { return roundKm(m / 1000); }
  function getDurationSec() {
    if (!state.startedAt) return 0;
    return Math.max(0, Math.round((Date.now() - state.startedAt) / 1000));
  }
  function persistQueue(items) {
    try { localStorage.setItem(queueKey, JSON.stringify(items)); } catch(e) {}
  }
  function readQueue() {
    try {
      const raw = localStorage.getItem(queueKey);
      if (!raw) return [];
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch(e) { return []; }
  }
  function queuePayload(payload) {
    const q = readQueue(); q.push(payload);
    persistQueue(q.slice(-30));
  }
  function clearRetryTimer() { if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; } }
  function clearSyncTimer()  { if (syncTimer)  { clearTimeout(syncTimer);  syncTimer  = null; } }
  function paintDistance() {
    if (uiRaf) cancelAnimationFrame(uiRaf);
    uiRaf = requestAnimationFrame(() => renderLiveDistance(toKm(state.totalDistance)));
  }
  function buildPayload() {
    return { rideId: String(rideData._id), distance: toKm(state.totalDistance), duration: getDurationSec() };
  }
  async function postPayload(payload) {
    if (!navigator.onLine) { queuePayload(payload); return false; }
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });
      if (!response.ok) { queuePayload(payload); return false; }
      return true;
    } catch(error) { queuePayload(payload); return false; }
  }
  async function flushQueue() {
    const queue = readQueue();
    if (!queue.length || !navigator.onLine) return;
    const keep = [];
    for (const p of queue) { const ok = await postPayload(p); if (!ok) keep.push(p); }
    persistQueue(keep);
  }
  async function syncNow() {
    clearSyncTimer();
    const ok = await postPayload(buildPayload());
    if (ok) { await flushQueue(); clearRetryTimer(); return; }
    clearRetryTimer();
    retryTimer = setTimeout(syncNow, RETRY_MS);
  }
  function scheduleSync() {
    clearSyncTimer();
    syncTimer = setTimeout(syncNow, API_DEBOUNCE_MS);
  }
  function reset(initialMeters = 0) {
    state.totalDistance   = Math.max(0, Number(initialMeters) || 0);
    state.lastPosition    = null;
    state.lastMovementAt  = Date.now();
    state.lastProcessedAt = 0;
    state.startedAt       = Date.now();
    state.isIdle          = false;
    paintDistance();
  }
  function start() {
    if (state.isTracking) return;
    state.isTracking = true;
    if (!state.startedAt) reset(initialDistanceMeters);
    flushQueue();
  }
  function stop(options = {}) {
    state.isTracking = false;
    clearSyncTimer();
    if (options.flush) syncNow();
  }
  function onPosition(position) {
    if (!state.isTracking) return;
    const lat      = Number(position && position.lat);
    const lng      = Number(position && position.lng);
    const accuracy = Number(position && position.accuracy);
    const now      = Number(position && position.timestamp) || Date.now();
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (now - state.lastProcessedAt < LOCATION_THROTTLE_MS) return;
    state.lastProcessedAt = now;
    if (!state.lastPosition) {
      state.lastPosition  = { lat, lng };
      state.lastMovementAt = now;
      return;
    }
    const segM = haversineMeters(state.lastPosition.lat, state.lastPosition.lng, lat, lng);
    if (segM < MIN_MOVE_METERS) {
      if (now - state.lastMovementAt > IDLE_TIMEOUT_MS) state.isIdle = true;
      return;
    }
    if (segM > MAX_GPS_JUMP_METERS && (!Number.isFinite(accuracy) || accuracy > 30)) {
      state.lastPosition = { lat, lng }; return;
    }
    if (segM > MAX_GPS_JUMP_METERS) { state.lastPosition = { lat, lng }; return; }
    state.isIdle = false;
    state.totalDistance += segM;
    state.lastPosition   = { lat, lng };
    state.lastMovementAt = now;
    paintDistance();
    scheduleSync();
  }
  function getState() {
    return { isTracking: state.isTracking, totalDistance: state.totalDistance, lastPosition: state.lastPosition };
  }
  window.addEventListener('online', () => { flushQueue(); syncNow(); });
  return { start, stop, reset, onPosition, getState, flushNow: syncNow };
})();

// Show straight-line distance immediately; route distance replaces it later.
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

// ── 3. Map controls ──────────────────────────────────────────────────
let isSatellite = false;

document.getElementById('btnRecenter').addEventListener('click', () => {
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
  window.map.setStyle(
    isSatellite
      ? 'mapbox://styles/mapbox/satellite-streets-v12'
      : 'mapbox://styles/mapbox/streets-v12'
  );
  // Style change destroys all layers/sources — rebuild after load
  window.map.once('style.load', () => {
    window.map.jumpTo(camera);
    // Redraw main route (static or dynamic depending on ride state)
    if (window.rideStarted && window.adminCurrentPos) {
      const { lat, lng } = window.adminCurrentPos;
      updateDynamicMainRoute(lat, lng, false);
    } else {
      drawMainRoute(false);
    }
    // Re-draw user→source routes for everyone who hasn't reached source yet
    Object.keys(window._lastPos).forEach(id => {
      if (window.rideStarted) return;                   // no routes after start
      if (window.reachedSource[id]) return;             // already reached
      if (isAdminUser(id)) return;                      // admin has no such route
      const pos = window._lastPos[id];
      scheduleUserRoute(id, pos.lat, pos.lng, { force: true });
    });
  });
});

// ── 4. Global state ──────────────────────────────────────────────────
window.liveMarkers  = {};   // userId → mapboxgl.Marker
window.userRoutes   = {};   // userId → { sourceId, casingId, lineId }
window.routeFetching = {};  // userId → bool
window._lastPos     = {};   // userId → { lat, lng }

window.activeRiderPopup      = null;
window.activeRiderPopupUserId = null;

// ── Ride-phase state ─────────────────────────────────────────────────
window.rideStarted      = false;   // true after admin clicks "Start Ride"
window.reachedSource    = {};      // userId → bool  (within 80 m of source)
window.adminCurrentPos  = null;    // { lat, lng } — updated on every admin GPS ping

// ── Source-threshold constant ─────────────────────────────────────────
const SOURCE_REACH_METERS = 80;

// ── Dynamic-route debounce timer ─────────────────────────────────────
let _dynamicRouteTimer = null;

// ── Voice navigation ─────────────────────────────────────────────────
window._navVoiceEnabled       = false;
window._lastSpokenInstruction = null;
window._lastBannerInstruction = null;

setTimeout(() => {
  const btnVoiceToggle = document.getElementById('btnVoiceToggle');
  if (!btnVoiceToggle) return;
  btnVoiceToggle.addEventListener('click', () => {
    window._navVoiceEnabled = !window._navVoiceEnabled;
    const icon = document.getElementById('voiceIcon');
    if (window._navVoiceEnabled) {
      icon.className = 'bi bi-volume-up-fill';
      window.speechSynthesis.speak(new SpeechSynthesisUtterance('Voice navigation enabled.'));
      if (window._currentAnnouncement) {
        setTimeout(() => {
          if (!window._navVoiceEnabled) return;
          const ut2 = new SpeechSynthesisUtterance(window._currentAnnouncement);
          window.speechSynthesis.speak(ut2);
          window._lastSpokenInstruction = window._currentAnnouncement;
        }, 1500);
      }
    } else {
      icon.className = 'bi bi-volume-mute-fill';
      icon.style.color = '';
      window.speechSynthesis.cancel();
    }
  });
}, 500);

// ── 4b. Navigation bar helpers (unchanged) ───────────────────────────
function getNavModifierIcon(modifier) {
  if (!modifier) return 'bi-arrow-up-circle-fill';
  const m = modifier.toLowerCase();
  if (m.includes('right'))                          return 'bi-arrow-right-circle-fill';
  if (m.includes('left'))                           return 'bi-arrow-left-circle-fill';
  if (m.includes('u-turn'))                         return 'bi-arrow-down-circle-fill';
  if (m.includes('arrive') || m.includes('destination')) return 'bi-geo-alt-fill';
  return 'bi-arrow-up-circle-fill';
}
function showNavigationBar(distLabel, instructionText, modifier) {
  const container = document.getElementById('navBarContainer');
  const icon      = document.getElementById('navIcon');
  const distEl    = document.getElementById('navDist');
  const textEl    = document.getElementById('navText');
  if (!container) return;
  container.style.display = 'flex';
  icon.innerHTML          = `<i class="bi ${getNavModifierIcon(modifier)}"></i>`;
  distEl.textContent      = distLabel;
  textEl.textContent      = instructionText;
}

// ── 5. Color palette + member meta ───────────────────────────────────
const USER_COLORS = [
  '#f97316', '#8b5cf6', '#ec4899',
  '#14b8a6', '#eab308', '#06b6d4', '#a3e635'
];
const ADMIN_COLOR  = '#ef4444';   // Red — admin always stands out
let _colorIdx      = 0;
const _userColorMap = {};

const _memberDirectory = Array.isArray(window.rideMembers)
  ? window.rideMembers.reduce((acc, item) => {
      if (!item || !item.userId) return acc;
      acc[String(item.userId)] = item;
      return acc;
    }, {})
  : {};

function getUserColor(userId) {
  if (isAdminUser(userId)) return ADMIN_COLOR;
  if (!_userColorMap[userId]) {
    _userColorMap[userId] = USER_COLORS[_colorIdx % USER_COLORS.length];
    _colorIdx++;
  }
  return _userColorMap[userId];
}

function getMemberMeta(userId) {
  const m = _memberDirectory[String(userId)] || {};
  return {
    name:     m.name     || `Rider ${String(userId).slice(-4)}`,
    initials: m.initials || 'R',
    avatar:   m.avatar   || '',
    isAdmin:  isAdminUser(userId)
  };
}

// ── 6. Marker animation + popup helpers ─────────────────────────────
function moveMarkerSmooth(marker, nextLngLat) {
  const start   = marker.getLngLat();
  const startLng = start.lng, startLat = start.lat;
  const endLng   = nextLngLat[0], endLat = nextLngLat[1];
  const startTime = performance.now();
  const duration  = 550;
  const tick = (now) => {
    const t     = Math.min(1, (now - startTime) / duration);
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
    window.activeRiderPopup       = null;
    window.activeRiderPopupUserId = null;
  }
}

function openRiderNamePopup(userId, lngLat, riderName) {
  if (window.activeRiderPopup && String(window.activeRiderPopupUserId) === String(userId)) {
    closeActiveRiderPopup(); return;
  }
  closeActiveRiderPopup();
  const popup = new mapboxgl.Popup({
    closeButton: false, closeOnClick: false,
    offset: 28, className: 'rider-name-popup'
  })
    .setLngLat(lngLat)
    .setHTML(`<div class="rider-name-popup__text">${riderName}</div>`)
    .addTo(map);
  window.activeRiderPopup       = popup;
  window.activeRiderPopupUserId = userId;
}

// ── 7. Directions API ────────────────────────────────────────────────

/**
 * Fetch a 2-point route (A → B).
 */
async function fetchRoute(fromLng, fromLat, toLng, toLat) {
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/` +
    `${fromLng},${fromLat};${toLng},${toLat}` +
    `?geometries=geojson&overview=full&steps=true&voice_instructions=true&banner_instructions=true` +
    `&access_token=${mapboxgl.accessToken}`;
  try {
    const res  = await fetch(url);
    const json = await res.json();
    if (!json.routes?.length) return null;
    return json.routes[0];
  } catch(e) {
    console.error('fetchRoute:', e);
    return null;
  }
}

/**
 * Fetch a multi-waypoint route (source → via → destination).
 * Used for the dynamic main route after admin starts the ride.
 */
async function fetchMultiRoute(waypoints) {
  // waypoints: array of [lng, lat]
  const coords = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(';');
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
    `?geometries=geojson&overview=full&steps=false` +
    `&access_token=${mapboxgl.accessToken}`;
  try {
    const res  = await fetch(url);
    const json = await res.json();
    if (!json.routes?.length) return null;
    return json.routes[0];
  } catch(e) {
    console.error('fetchMultiRoute:', e);
    return null;
  }
}

// ── 8a. Main route — STATIC (source → destination, solid blue) ───────
async function drawMainRoute(fitToRoute = true) {
  const route = await fetchRoute(
    source_coords[0], source_coords[1],
    dest_coords[0],   dest_coords[1]
  );
  if (!route) return;

  if (typeof route.distance === 'number') updateDistanceUI(route.distance / 1000);
  if (typeof route.duration === 'number') updateEtaUI(route.duration);

  const geometry = route.geometry;

  // Update existing source if present (e.g. after style change)
  if (map.getSource('main-route')) {
    map.getSource('main-route').setData({ type: 'Feature', properties: {}, geometry });
    return;
  }

  // First draw: add source + two layers
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
  const coords = geometry.coordinates;
  const bounds = coords.reduce(
    (b, c) => b.extend(c),
    new mapboxgl.LngLatBounds(coords[0], coords[0])
  );
  map.fitBounds(bounds, { padding: 80 });
}

// ── 8b. Main route — DYNAMIC (source → admin → destination) ──────────
// Called every time admin's GPS updates after ride is started.
// Updates the SAME 'main-route' source — no layer recreation, no flicker.
async function updateDynamicMainRoute(adminLat, adminLng, debounced = true) {
  if (!map.isStyleLoaded()) return;

  const doUpdate = async () => {
    const route = await fetchMultiRoute([
      [source_coords[0], source_coords[1]],
      [adminLng, adminLat],
      [dest_coords[0], dest_coords[1]]
    ]);
    if (!route) return;

    const geometry = route.geometry;

    // The source already exists from drawMainRoute — just update its data
    if (map.getSource('main-route')) {
      map.getSource('main-route').setData({ type: 'Feature', properties: {}, geometry });
    } else {
      // Fallback: source was lost (e.g. after style change mid-ride)
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
    }
  };

  if (!debounced) { doUpdate(); return; }

  // Debounce: wait 3 s after the last admin position update before hitting API
  clearTimeout(_dynamicRouteTimer);
  _dynamicRouteTimer = setTimeout(doUpdate, 3000);
}

// ── 9. Per-user route  (live pos → SOURCE, grey dashed) ──────────────
// Replaces the old "live pos → destination" logic.
const _routeDebounce     = {};
const _lastRouteAnchor   = {};   // userId → { lat, lng }
const _lastRouteFetchAt  = {};   // userId → epoch ms
const ROUTE_MIN_MOVE_METERS = 35;
const ROUTE_MAX_STALE_MS    = 15000;

function shouldRecalculateRoute(userId, lat, lng, force = false) {
  if (force) return true;
  const prev = _lastRouteAnchor[userId];
  if (!prev) return true;
  const movedM    = haversineKm(prev.lat, prev.lng, lat, lng) * 1000;
  const staleForMs = Date.now() - (_lastRouteFetchAt[userId] || 0);
  return movedM >= ROUTE_MIN_MOVE_METERS || staleForMs >= ROUTE_MAX_STALE_MS;
}

function scheduleUserRoute(userId, lat, lng, options = {}) {
  const force = Boolean(options.force);

  // ── Guards: no user→source route in these cases ──
  if (window.rideStarted)             return;   // ride started → only markers
  if (isAdminUser(userId))            return;   // admin has no "go to source" route
  if (window.reachedSource[userId])   return;   // already there

  if (!shouldRecalculateRoute(userId, lat, lng, force)) return;
  clearTimeout(_routeDebounce[userId]);
  _routeDebounce[userId] = setTimeout(() => drawUserRoute(userId, lat, lng), 800);
}

/**
 * Draw or update the grey dashed route: user live pos → source.
 */
async function drawUserRoute(userId, lat, lng) {
  // Re-check guards inside async body (state may have changed by the time timer fires)
  if (window.rideStarted)           return;
  if (isAdminUser(userId))          return;
  if (window.reachedSource[userId]) return;
  if (window.routeFetching[userId]) return;

  window.routeFetching[userId] = true;

  try {
    // Route destination is SOURCE, not the ride destination
    const route = await fetchRoute(
      lng,              lat,               // from: user live position
      source_coords[0], source_coords[1]  // to:   ride source / meeting point
    );
    if (!route) return;

    _lastRouteAnchor[userId]  = { lat, lng };
    _lastRouteFetchAt[userId] = Date.now();

    // Update ETA / distance only for self (own route to source)
    if (String(userId) === String(userid)) {
      if (typeof route.distance === 'number') {
        window._selfRemainingKm = route.distance / 1000;
        updateDistanceUI(window._selfRemainingKm);
      }
      if (typeof route.duration === 'number') {
        window._selfMapboxEtaSec = route.duration;
      }
      refreshSelfEta();

      // Voice / banner navigation toward source
      if (route.legs?.[0]?.steps?.length > 0) {
        const step = route.legs[0].steps[0];
        if (step.bannerInstructions?.length > 0) {
          const banner    = step.bannerInstructions[0];
          const distStr   = formatDistanceLabel(banner.distanceAlongGeometry / 1000);
          const txt       = banner.primary.text;
          const key       = `${distStr}_${txt}`;
          if (window._lastBannerInstruction !== key) {
            window._lastBannerInstruction = key;
            showNavigationBar(distStr, txt, banner.primary.modifier);
          }
        }
        let voiceAnn = '';
        if (step.voiceInstructions?.length > 0) {
          voiceAnn = step.voiceInstructions[0].announcement;
        } else if (route.legs[0].steps.length > 1) {
          voiceAnn = route.legs[0].steps[1].maneuver.instruction;
        } else if (step.maneuver?.instruction) {
          voiceAnn = step.maneuver.instruction;
        }
        if (voiceAnn) {
          window._currentAnnouncement = voiceAnn;
          if (window._navVoiceEnabled && window._lastSpokenInstruction !== voiceAnn) {
            window._lastSpokenInstruction = voiceAnn;
            window.speechSynthesis.speak(new SpeechSynthesisUtterance(voiceAnn));
          }
        }
      }
    }

    const geometry = route.geometry;
    const sourceId = `user-route-${userId}`;
    const casingId = `user-casing-${userId}`;
    const lineId   = `user-line-${userId}`;
    const data     = { type: 'Feature', properties: {}, geometry };

    if (map.getSource(sourceId)) {
      map.getSource(sourceId).setData(data);
    } else {
      map.addSource(sourceId, { type: 'geojson', data });
      // White casing for legibility
      map.addLayer({
        id: casingId, type: 'line', source: sourceId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 0.6 }
      });
      // Grey dashed line (distinct from the blue main route)
      map.addLayer({
        id: lineId, type: 'line', source: sourceId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#6b7280',   // neutral grey
          'line-width': 3,
          'line-opacity': 0.88,
          'line-dasharray': [2, 2]
        }
      });
      window.userRoutes[userId] = { sourceId, casingId, lineId };
    }
  } catch(e) {
    console.error('drawUserRoute:', e);
  } finally {
    window.routeFetching[userId] = false;
  }
}

/**
 * Remove only the route layer for a user (keep their marker).
 * Used when user reaches source (≤ 80 m) or ride starts.
 */
function removeUserRoute(userId) {
  if (!window.userRoutes[userId]) return;
  const { sourceId, casingId, lineId } = window.userRoutes[userId];
  if (map.getLayer(casingId))  map.removeLayer(casingId);
  if (map.getLayer(lineId))    map.removeLayer(lineId);
  if (map.getSource(sourceId)) map.removeSource(sourceId);
  delete window.userRoutes[userId];
  // Cancel any pending debounce to prevent redraw
  clearTimeout(_routeDebounce[userId]);
  delete _routeDebounce[userId];
}

/**
 * Backend-authoritative check: if member is within SOURCE_REACH_METERS,
 * mark them as reached and remove their route.
 */
function checkSourceReached(userId, lat, lng) {
  if (window.rideStarted)           return;   // irrelevant after start
  if (isAdminUser(userId))          return;   // admin doesn't need to reach source
  if (window.reachedSource[userId]) return;   // already marked

  const distM = haversineMeters(lat, lng, source_coords[1], source_coords[0]);
  if (distM <= SOURCE_REACH_METERS) {
    window.reachedSource[userId] = true;
    removeUserRoute(userId);
    console.log(`[RideSynk] Rider ${userId} reached source (${Math.round(distM)} m)`);
  }
}

// ── 10. Vehicle SVG helpers ──────────────────────────────────────────

/** Standard top-down bike SVG for members. */
function makeVehicleSVG(color) {
  return `<svg width="38" height="54" viewBox="0 0 38 54" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="19" cy="51" rx="9" ry="3" fill="rgba(0,0,0,0.20)"/>
  <rect x="13" y="38" width="12" height="13" rx="6" fill="${color}" stroke="#fff" stroke-width="2"/>
  <rect x="12" y="12" width="14" height="28" rx="7" fill="${color}" stroke="#fff" stroke-width="2.5"/>
  <rect x="13" y="3"  width="12" height="13" rx="6" fill="${color}" stroke="#fff" stroke-width="2"/>
  <rect x="7"  y="14" width="5"  height="3"  rx="1.5" fill="${color}" stroke="#fff" stroke-width="1.5"/>
  <rect x="26" y="14" width="5"  height="3"  rx="1.5" fill="${color}" stroke="#fff" stroke-width="1.5"/>
  <circle cx="19" cy="20" r="5" fill="#fff" opacity="0.9"/>
  <polygon points="19,1 15,8 23,8" fill="#fff" opacity="0.95"/>
</svg>`;
}

/**
 * Admin bike SVG — red body + crown badge on top.
 * The crown makes the admin immediately identifiable on the map.
 */
function makeAdminVehicleSVG() {
  return `<svg width="44" height="62" viewBox="0 0 44 62" xmlns="http://www.w3.org/2000/svg">
  <!-- shadow -->
  <ellipse cx="22" cy="59" rx="11" ry="3.5" fill="rgba(0,0,0,0.22)"/>
  <!-- rear wheel -->
  <rect x="15" y="43" width="14" height="15" rx="7" fill="${ADMIN_COLOR}" stroke="#fff" stroke-width="2.2"/>
  <!-- body -->
  <rect x="14" y="14" width="16" height="32" rx="8" fill="${ADMIN_COLOR}" stroke="#fff" stroke-width="2.5"/>
  <!-- front wheel -->
  <rect x="15" y="4"  width="14" height="15" rx="7" fill="${ADMIN_COLOR}" stroke="#fff" stroke-width="2.2"/>
  <!-- handlebars -->
  <rect x="7"  y="17" width="6"  height="3.5" rx="1.8" fill="${ADMIN_COLOR}" stroke="#fff" stroke-width="1.5"/>
  <rect x="31" y="17" width="6"  height="3.5" rx="1.8" fill="${ADMIN_COLOR}" stroke="#fff" stroke-width="1.5"/>
  <!-- helmet -->
  <circle cx="22" cy="23" r="6" fill="#fff" opacity="0.9"/>
  <!-- direction arrow -->
  <polygon points="22,1 17,9 27,9" fill="#fff" opacity="0.95"/>
  <!-- crown badge (top-right corner) -->
  <circle cx="37" cy="7" r="9" fill="#fbbf24" stroke="#fff" stroke-width="1.5"/>
  <text x="37" y="11" text-anchor="middle"
        font-family="sans-serif" font-size="10" fill="#78350f">👑</text>
</svg>`;
}

// ── 11. Heading calculation ──────────────────────────────────────────
function computeHeading(lat1, lng1, lat2, lng2) {
  const toRad = d => d * Math.PI / 180;
  const dLng  = toRad(lng2 - lng1);
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const y  = Math.sin(dLng) * Math.cos(φ2);
  const x  = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// ── 12. Create / move vehicle marker ─────────────────────────────────
// Called by socket.js on every GPS update (self and remote riders).
// NEVER creates a marker at (0,0) — waits for a real GPS fix.
window.updateUserMarker = function updateUserMarker(userId, lat, lng, heading, speedMps) {
  if (!window.map) return;
  if (!lat || !lng || (lat === 0 && lng === 0)) return;
  if (isNaN(lat) || isNaN(lng)) return;

  // GPS anti-spoof: ignore jumps > 500 m unless it's the first fix
  if (window._lastPos[userId]) {
    const jumpM = haversineMeters(window._lastPos[userId].lat, window._lastPos[userId].lng, lat, lng);
    if (jumpM > 500) {
      console.warn(`[RideSynk] GPS jump ${Math.round(jumpM)} m for ${userId} — ignored`);
      return;
    }
  }

  const color      = getUserColor(userId);
  const memberMeta = getMemberMeta(userId);
  const isSelf     = String(userId) === String(userid);
  const isAdmin    = isAdminUser(userId);

  if (window.liveMarkers[userId]) {
    // ── Move existing marker ──
    moveMarkerSmooth(window.liveMarkers[userId], [lng, lat]);

    // Rotate to face direction of travel
    const prev = window._lastPos[userId];
    if (prev) {
      const hdg = computeHeading(prev.lat, prev.lng, lat, lng);
      const el  = window.liveMarkers[userId].getElement();
      const svg = el.querySelector('svg');
      if (svg) svg.style.transform = `rotate(${hdg}deg)`;
    }

    // Update popup position if it's open for this rider
    if (window.activeRiderPopup && String(window.activeRiderPopupUserId) === String(userId)) {
      window.activeRiderPopup.setLngLat([lng, lat]);
    }
  } else {
    // ── First valid GPS fix: build the marker element ──
    const wrap      = document.createElement('div');
    wrap.className  = 'vehicle-wrap rider-marker';
    wrap.style.cssText = `
      width: ${isAdmin ? '44px' : '38px'};
      height: ${isAdmin ? '62px' : '54px'};
      cursor: pointer;
      filter: drop-shadow(0 4px 8px rgba(0,0,0,0.35));
    `;

    // Choose SVG: admin gets crown version, members get standard
    const svgHtml = isAdmin ? makeAdminVehicleSVG() : makeVehicleSVG(color);

    wrap.innerHTML = `${svgHtml}
      <div class="rider-tag ${isSelf ? 'self' : ''}${isAdmin ? ' admin' : ''}">
        ${memberMeta.avatar
          ? `<img src="${memberMeta.avatar}" alt="${memberMeta.name}" class="rider-avatar"/>`
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

  // Save last position for heading calculation
  window._lastPos[userId] = { lat, lng };

  // Update speed display for self
  if (isSelf && Number.isFinite(speedMps) && speedMps >= 0) {
    window._selfSpeedKmh = speedMps * 3.6;
    refreshSelfEta();
  }

  // ── Admin position tracking for dynamic route ──
  if (isAdmin) {
    window.adminCurrentPos = { lat, lng };
    if (window.rideStarted) {
      // Schedule a debounced dynamic route update (3 s after last admin move)
      updateDynamicMainRoute(lat, lng, true);
    }
  }

  // ── Source-reached check (members only, before ride start) ──
  if (!isAdmin && !window.rideStarted) {
    checkSourceReached(userId, lat, lng);
  }

  // ── Schedule user→source route refresh ──
  scheduleUserRoute(userId, lat, lng);
};

// ── 13. Remove user entirely (marker + route) ─────────────────────────
window.removeUser = function removeUser(userId) {
  removeUserRoute(userId);   // remove route first
  if (window.liveMarkers[userId]) {
    if (window.activeRiderPopup && String(window.activeRiderPopupUserId) === String(userId)) {
      closeActiveRiderPopup();
    }
    window.liveMarkers[userId].remove();
    delete window.liveMarkers[userId];
  }
  delete _userColorMap[userId];
  delete _lastRouteAnchor[userId];
  delete _lastRouteFetchAt[userId];
  delete window._lastPos[userId];
  delete window.reachedSource[userId];
};

// ── 14. "Start Ride" event handler ────────────────────────────────────
/**
 * Called by socket.js when the server broadcasts ride:started.
 * 1. Flip the global flag.
 * 2. Remove ALL user→source routes.
 * 3. If admin position is known, immediately begin dynamic route updates.
 */
window.onRideStarted = function onRideStarted() {
  if (window.rideStarted) return;   // idempotent
  window.rideStarted = true;

  console.log('[RideSynk] Ride started — switching to dynamic main route.');

  // Remove every user→source route
  Object.keys(window.userRoutes).forEach(uid => removeUserRoute(uid));

  // Also cancel any pending route debounces
  Object.keys(_routeDebounce).forEach(uid => {
    clearTimeout(_routeDebounce[uid]);
    delete _routeDebounce[uid];
  });

  // Start dynamic route immediately if admin position is already known
  if (window.adminCurrentPos) {
    const { lat, lng } = window.adminCurrentPos;
    updateDynamicMainRoute(lat, lng, false);
  }
};

// ── 15. Map load: static A / B pins + main blue route ────────────────
map.on('load', () => {

  // Source pin A (purple)
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

  // Destination pin B (red)
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

  // Draw the static main blue route (source → destination)
  drawMainRoute();
});

map.on('click', () => { closeActiveRiderPopup(); });

/* ═══════════════════════════════════════════════
   BOTTOM SHEET  (drag/snap — completely unchanged)
   ═══════════════════════════════════════════════ */
const sheet  = document.getElementById('sheet');
const handle = document.getElementById('sheetHandle');
const body   = document.getElementById('sheetBody');
const peek   = document.getElementById('peekStrip');
const tabNav = document.getElementById('tabNav');
const lbl    = document.getElementById('handleLabel');
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
  sheet.style.transform  = `translateY(${Math.max(0, sheet.offsetHeight - vis)}px)`;
}
function snapTo(name, animate = true) {
  const s   = snaps();
  state     = name;
  setVis(s[name], animate);
  const col = name === 'collapsed';
  peek.style.display   = col ? 'flex' : 'none';
  tabNav.style.display = col ? 'none' : 'flex';
  body.style.display   = col ? 'none' : 'block';
  lbl.textContent      = col
    ? '↑ Slide up for trip details'
    : (name === 'expanded' ? '↓ Slide down' : '↑↓ Drag to resize');
  if (!col) body.style.height = (s[name] - 120) + 'px';
  refreshChatBar();
}
window.snapTo = snapTo;

function refreshChatBar() {
  const isChat    = document.querySelector('.tab-btn.active')?.dataset.tab === 'chat';
  const isVisible = isChat && state !== 'collapsed';
  chatBar.classList.toggle('show', isVisible);
  body.classList.toggle('chat-mode', isVisible);
  const chatBarSpace = isVisible ? chatBar.offsetHeight : 0;
  document.documentElement.style.setProperty('--chat-bar-space', `${chatBarSpace}px`);
}

function onStart(e) {
  if (e.target.closest('#sheetBody')) return;
  dragging = true; didDrag = false;
  startY   = e.touches ? e.touches[0].clientY : e.clientY;
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
  const d = [
    ['collapsed', Math.abs(curVis - s.collapsed)],
    ['mid',       Math.abs(curVis - s.mid)],
    ['expanded',  Math.abs(curVis - s.expanded)]
  ];
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
  if (state === 'collapsed')  snapTo('mid');
  else if (state === 'mid')   snapTo('expanded');
  else                        snapTo('collapsed');
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
  sheet.style.transform  = `translateY(${sheet.offsetHeight}px)`;
  requestAnimationFrame(() => snapTo('collapsed', true));
}, 50);