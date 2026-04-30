/* ═══════════════════════════════════════════════════════════════════════
   map_page.js  —  RideSync Live Tracking Client Logic
   Schema-driven: field names match /models/ride.js, /models/user.js,
                  /models/ride_member.js, /models/message.js exactly.

   ride.js fields used:
     adminId, ridename, sorce, sorceLocation{type,coordinates:[lng,lat]},
     destination, destinationLocation{type,coordinates:[lng,lat]},
     status(active|upcoming|completed|canceled|cancelled),
     totalMembers, distance

   user.js fields used:
     _id, username, firstname, lastname, email (no avatar field exists)

   ride_member.js fields used:
     rideId, userId, role(admin|member), status(active|left|removed), joinedAt

   message.js fields used:
     rideId, senderId, message, createdAt (timestamps)
   ═══════════════════════════════════════════════════════════════════════ */

import socket from "/js/socket.js";
const DEBUG_LOG = false;

/* ── READ EJS-INJECTED GLOBALS ──────────────────────────────────────── */
const map_token = window.__MAP_TOKEN__;
const userid = window.__USERID__;
const rideData = window.__RIDE_DATA__;

/* ── CRITICAL: sorceLocation is GeoJSON — coordinates: [lng, lat] ──── */
// sorceLocation.coordinates[0] = lng, [1] = lat
// destinationLocation.coordinates[0] = lng, [1] = lat

const srcLng = rideData.sorceLocation.coordinates[0];
const srcLat = rideData.sorceLocation.coordinates[1];
const dstLng = rideData.destinationLocation.coordinates[0];
const dstLat = rideData.destinationLocation.coordinates[1];

/* ── USER NAME (no avatar in schema — use firstname+lastname or username) */
function buildDisplayName(userObj) {
  if (!userObj) return "Rider";
  const f = (userObj.firstname || "").trim();
  const l = (userObj.lastname || "").trim();
  if (f || l) return `${f} ${l}`.trim();
  return userObj.username || "Rider";
}

/* ── IDENTIFY CURRENT USER IN MEMBERS LIST ──────────────────────────── */
// rideData.members is an array of populated user objects (populated server-side)
// Each member: { _id, username, firstname, lastname, email, role (from ride_member) }
const myMember = rideData.members.find(m => m._id.toString() === userid);
const myName = myMember ? buildDisplayName(myMember) : "You";

/* ── ADMIN CHECK: adminId in ride.js ────────────────────────────────── */
const adminId = rideData.adminId.toString(); // Alias per prompt
const isAdmin = adminId === userid.toString();
const adminUserId = adminId;

/* ── RIDE STATUS ────────────────────────────────────────────────────── */
// status enum: "active" | "upcoming" | "completed" | "canceled" | "cancelled"
// Server may also emit "started" — treat both "active" and "started" as ride in progress
let rideStarted = window.rideStarted !== undefined ? window.rideStarted : (rideData.status === "active" || rideData.status === "started");

let adminLiveLocation = null;
let isRideStarted = rideStarted;

/* ── STATE ──────────────────────────────────────────────────────────── */
const userMarkers = new Map();   // userId (string) → { marker, lat, lng, name, isAdminUser }
const reachedSourceUsers = new Set();
let myLat = null;
let myLng = null;
let followMode = true;
let followTarget = isAdmin ? userid : adminUserId;
let watchId = null;
let lastEmitTime = 0;
const EMIT_THROTTLE = 3000;

// Tracks latest confirmed location per user (for members panel distances)
const memberLocations = new Map();  // userId → { lat, lng, updatedAt }

// Tracks which users are currently online in the socket room
const onlineUsers = new Set();

// Tracks which users have already fired the "reached source" notification
const reachedNotified = new Set();

// Throttled wrapper for renderMembersPanel — max 1 call per 2 seconds
let _membersPanelTimer = null;
function throttledRenderMembersPanel() {
  if (_membersPanelTimer) return;
  _membersPanelTimer = setTimeout(() => {
    _membersPanelTimer = null;
    renderMembersPanel();
  }, 2000);
}

/* ── NAVIGATION STATE ───────────────────────────────────────────────── */
let navigationSteps = [];
let currentStepIndex = 0;
let lastInstruction = "";
let totalDistance = 0;
let totalDuration = 0;
let adminOfflineTimer = null;
let routeRedrawTimer = null;
let voiceEnabled = true;
let lastRouteOrigin = null;
let activeRouteRequestId = 0;
let lastDynamicRouteUpdateTime = 0;
let lastDynamicRouteUpdateLocation = null;
let isSatelliteView = false;
let uiState = "idle"; // idle | countdown | active (UI-only state machine)
let countdownTimer = null;
let countdownValue = 5;
const activeSosCards = new Map(); // sosId -> cardEl
const activeSOSList = [];

/* ── MAPBOX INIT ────────────────────────────────────────────────────── */
mapboxgl.accessToken = map_token;

const MAP_STYLE_STREETS = "mapbox://styles/mapbox/streets-v12";
const MAP_STYLE_SATELLITE = "mapbox://styles/mapbox/satellite-streets-v12";

// Initial center: admin sees source, members try geolocation (fallback to source)
const initialCenter = [srcLng, srcLat];

const map = new mapboxgl.Map({
  container: "map",
  style: MAP_STYLE_STREETS,
  center: initialCenter,
  zoom: 13,
  pitch: 45,
  bearing: 0,
  antialias: true
});

/* ── HELPERS ────────────────────────────────────────────────────────── */
function removeLayerSafe(id) {
  if (map.getLayer(id)) map.removeLayer(id);
}

function removeSourceSafe(id) {
  if (map.getSource(id)) map.removeSource(id);
}

function removeDottedPathForUser(userId) {
  const uid = String(userId);
  const ids = [
    {
      layerId: `dotted-${uid}`,
      casingId: `dotted-${uid}-casing`,
      sourceId: `dotted-src-${uid}`
    },
    {
      layerId: `dotted-path-${uid}`,
      casingId: `dotted-path-${uid}-casing`,
      sourceId: `dotted-path-${uid}`
    }
  ];

  // Fade out opacity for smooth removal
  ids.forEach(({ layerId, casingId }) => {
    try { if (map.getLayer(layerId)) map.setPaintProperty(layerId, 'line-opacity', 0); } catch (_) { }
    try { if (map.getLayer(casingId)) map.setPaintProperty(casingId, 'line-opacity', 0); } catch (_) { }
  });

  // Remove layers/sources after fade completes (300ms default Mapbox transition)
  setTimeout(() => {
    ids.forEach(({ layerId, casingId, sourceId }) => {
      if (map.getLayer(casingId)) map.removeLayer(casingId);
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    });
  }, 300);

  dottedPathThrottle.delete(uid);
}

function enhanceMapLabels() {
  const style = map.getStyle();
  if (!style || !Array.isArray(style.layers)) return;

  const labelLayerPattern = /(poi|place|settlement|airport|transit|natural-point|water-point)/i;

  style.layers.forEach((layer) => {
    if (!layer || layer.type !== "symbol" || !labelLayerPattern.test(String(layer.id || ""))) {
      return;
    }

    try {
      map.setLayoutProperty(layer.id, "visibility", "visible");
    } catch (_) { }

    try {
      map.setLayoutProperty(layer.id, "text-optional", true);
    } catch (_) { }

    try {
      map.setLayoutProperty(layer.id, "icon-optional", true);
    } catch (_) { }

    try {
      map.setLayoutProperty(layer.id, "text-ignore-placement", true);
    } catch (_) { }

    try {
      map.setLayoutProperty(layer.id, "text-allow-overlap", true);
    } catch (_) { }
  });
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function escapeHtml(text) {
  const map2 = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(text).replace(/[&<>"']/g, m => map2[m]);
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function sosElements() {
  return {
    triggerBtn: document.getElementById("btn-sos"),
    overlay: document.getElementById("sos-overlay"),
    countdown: document.getElementById("sos-countdown"),
    cancelBtn: document.getElementById("sos-cancel-btn"),
    stack: document.getElementById("sos-alert-stack")
  };
}

function showSOSPopup(data) {
  const sos = data && data.sos ? data.sos : data;
  if (!sos) return;
  upsertSosCard(sos);
}

function handleActiveSOS(sos) {
  if (!sos || sos.status !== "active") return;

  const existingIdx = activeSOSList.findIndex(s => String(s.userId || s._id) === String(sos.userId || sos._id));
  if (existingIdx === -1) {
    activeSOSList.push(sos);
  } else {
    activeSOSList[existingIdx] = sos;
  }

  showSOSPopup(sos);
  activateSOSMarker(sos.userId);

  const isMine = String(sos.userId) === String(userid);
  if (!isMine) {
    isMuted = false;
    playSOSSound();
  }
}

async function fetchActiveSOS() {
  try {
    const res = await fetch(`/sos/active/${rideData._id}`, { credentials: "include" });
    const data = await res.json();
    const alerts = Array.isArray(data) ? data : (data.active || []);

    if (alerts.length > 0) {
      alerts.forEach(handleActiveSOS);
    }
  } catch (err) {
    console.warn("[sos] Failed to fetch active SOS alerts:", err);
  }
}

let sosAudio = null;
let isMuted = false;
let sosSoundPlayed = false;
const SOS_AUDIO_URL = "/music/sos.mp3";

function getSOSAudio() {
  if (!sosAudio) {
    sosAudio = document.createElement("audio");
    sosAudio.id = "sos-audio";
    sosAudio.src = SOS_AUDIO_URL;
    sosAudio.loop = true;
    sosAudio.preload = "auto";
    sosAudio.setAttribute("playsinline", "true");
    sosAudio.style.display = "none";
    sosAudio.addEventListener("error", () => {
      console.warn("SOS audio failed to load:", SOS_AUDIO_URL);
      toast("SOS sound file could not load.", "error");
    });
    document.body.appendChild(sosAudio);
  }
  return sosAudio;
}

function hasAudibleActiveSOS() {
  return activeSOSList.some((sos) => {
    return sos && sos.status === "active" && String(sos.userId) !== String(userid);
  });
}

function playSOSSound() {
  if (isMuted) return;
  if (sosSoundPlayed) return;

  const audio = getSOSAudio();
  audio.muted = false;
  audio.volume = 1;

  if (audio.paused) {
    audio.play().catch(err => {
      console.warn("Audio play blocked by browser:", err);
    });
  }
  sosSoundPlayed = true;
}

function stopSOSSound() {
  if (sosAudio) {
    sosAudio.pause();
    sosAudio.currentTime = 0;
  }
  sosSoundPlayed = false;
}

function muteSOSAlert() {
  isMuted = true;
  stopSOSSound();
}
window.muteSOSAlert = muteSOSAlert; // Export for onclick handler in HTML
window.stopSOS = muteSOSAlert;

function focusMap(location) {
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return;
  map.flyTo({
    center: [location.lng, location.lat],
    zoom: 16
  });
}

function activateSOSMarker(userId) {
  const marker = getMarker(userId);
  if (!marker) return;
  const el = marker.getElement ? marker.getElement() : marker;
  if (el && el.classList) el.classList.add("sos-blink");
}

function deactivateSOSMarker(userId) {
  const marker = getMarker(userId);
  if (!marker) return;
  const el = marker.getElement ? marker.getElement() : marker;
  if (el && el.classList) el.classList.remove("sos-blink");
}

function getMarker(userId) {
  const uid = String(userId || "");
  const markerData = userMarkers.get(uid);
  return markerData ? markerData.marker : null;
}

function setSosUiState(nextState) {
  uiState = nextState;
  const { triggerBtn, overlay } = sosElements();
  if (triggerBtn) triggerBtn.classList.toggle("is-active", uiState !== "idle");
  if (overlay) {
    overlay.classList.toggle("visible", uiState === "countdown");
    overlay.setAttribute("aria-hidden", uiState === "countdown" ? "false" : "true");
  }
}

function clearSosCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function cancelSosCountdown() {
  clearSosCountdown();
  setSosUiState("idle");
}

function buildSosSubLine(sos) {
  const location = sos && sos.location;
  if (location && location.address) return location.address;
  if (location && Number.isFinite(location.lat) && Number.isFinite(location.lng)) {
    return `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;
  }
  return "Location unavailable";
}

let mySosCount = 0;
let lastSosTime = 0;

async function triggerSOS() {
  const { triggerBtn } = sosElements();
  if (uiState !== "countdown") return;

  clearSosCountdown();

  const now = Date.now();
  if (mySosCount >= 3) {
    toast("Limit reached: Maximum 3 SOS per ride", "error");
    setSosUiState("idle");
    return;
  }
  if (now - lastSosTime < 60000) {
    toast("Please wait 60 seconds before sending another SOS.", "warn");
    setSosUiState("idle");
    return;
  }

  mySosCount++;
  lastSosTime = now;

  setSosUiState("active");
  if (triggerBtn) triggerBtn.disabled = true;

  try {
    if (!Number.isFinite(myLat) || !Number.isFinite(myLng)) {
      throw new Error("GPS location unavailable");
    }

    const rideId = rideData._id;
    const location = { lat: myLat, lng: myLng };

    const res = await fetch("/sos/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        rideId,
        location
      })
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.message || "Failed to send SOS");
    }

    toast("SOS sent to ride members.", "success");
  } catch (err) {
    toast(err.message || "Failed to send SOS", "error");
  } finally {
    if (triggerBtn) triggerBtn.disabled = false;
    setSosUiState("idle");
  }
}

function startSosCountdown() {
  if (uiState !== "idle") return;
  const { countdown } = sosElements();
  countdownValue = 5;
  if (countdown) countdown.textContent = String(countdownValue);

  const timestampEl = document.getElementById("sos-timestamp");
  if (timestampEl) {
    const formatted = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    timestampEl.textContent = `Initiated at ${formatted}`;
  }

  setSosUiState("countdown");
  clearSosCountdown();

  countdownTimer = setInterval(() => {
    countdownValue -= 1;
    if (countdown) countdown.textContent = String(Math.max(0, countdownValue));
    if (countdownValue <= 0) {
      clearSosCountdown();
      if (uiState === "countdown") {
        triggerSOS();
      }
    }
  }, 1000);
}

function removeSosCard(sosId) {
  const existing = activeSosCards.get(String(sosId));
  if (!existing) return;
  existing.remove();
  activeSosCards.delete(String(sosId));
}

function upsertSosCard(sos) {
  if (!sos) return;
  const cardId = String(sos._id || sos.userId);
  if (!cardId || cardId === "undefined") return;

  const { stack } = sosElements();
  if (!stack) return;

  removeSosCard(cardId);

  const card = document.createElement("div");
  card.className = "sos-alert-card";
  const isMine = String(sos.userId) === String(userid);
  const title = isMine ? "Your SOS is active" : `${sos.name || sos.userName || "Rider"} needs help`;
  const sub = buildSosSubLine(sos);
  const phoneMarkup = sos.phone ? `<div class="sos-alert-phone">📞 ${escapeHtml(sos.phone)}</div>` : '';

  card.innerHTML = `
    <div class="sos-alert-content">
      <div class="sos-alert-title">${escapeHtml(title)}</div>
      <div class="sos-alert-sub">${escapeHtml(sub)}</div>
      ${phoneMarkup}
    </div>
    <div class="sos-alert-actions">
      <button class="sos-alert-track-btn" onclick="trackSOSUser('${escapeHtml(String(sos.userId))}')" type="button">Track Rider</button>
      <button class="sos-alert-mute-btn" type="button" title="Mute Alert">🔕 Mute</button>
      <button class="sos-alert-resolve-btn" type="button">Resolve</button>
    </div>
  `;

  const muteBtn = card.querySelector(".sos-alert-mute-btn");
  if (muteBtn) {
    muteBtn.addEventListener("click", () => {
      muteSOSAlert();
      muteBtn.textContent = "🔇 Muted";
      muteBtn.disabled = true;
    });
  }

  const resolveBtn = card.querySelector(".sos-alert-resolve-btn");
  if (resolveBtn) {
    resolveBtn.addEventListener("click", async () => {
      try {
        resolveBtn.disabled = true;

        // Optimistically resolve via Socket for immediate UI updates
        socket.emit("resolveSOS", { rideId: rideData._id, userId: sos.userId });

        // If it exists in DB, resolve it there too
        if (sos._id) {
          const res = await fetch(`/sos/resolve/${sos._id}`, {
            method: "POST",
            credentials: "include"
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            toast(data.message || "Failed to resolve SOS in DB", "error");
          }
        }
      } catch (e) {
        resolveBtn.disabled = false;
        toast(e.message || "Failed to resolve SOS", "error");
      }
    });
  }

  stack.prepend(card);
  activeSosCards.set(cardId, card);
}

function setupSosUi() {
  const { triggerBtn, cancelBtn } = sosElements();
  if (triggerBtn) {
    triggerBtn.addEventListener("click", startSosCountdown);
  }
  if (cancelBtn) {
    cancelBtn.addEventListener("click", cancelSosCountdown);
  }
}


/* ── HAVERSINE FORMULA ──────────────────────────────────────────────── */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ── TOAST NOTIFICATION ─────────────────────────────────────────────── */
function toast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add("visible"));
  });

  setTimeout(() => {
    el.classList.remove("visible");
    setTimeout(() => el.remove(), 350);
  }, 3200);
}

/* ── SOURCE & DESTINATION PINS ──────────────────────────────────────── */
function addStaticPins() {
  function createLabelMarker(label, coords, color, title) {
    const el = document.createElement("div");
    el.className = "marker-label";
    el.innerText = label;

    el.style.background = color;
    el.style.color = "#fff";
    el.style.padding = "6px 10px";
    el.style.borderRadius = "50%";
    el.style.fontWeight = "bold";
    el.style.cursor = "pointer";

    const popup = new mapboxgl.Popup({ offset: 25, closeButton: false }).setText(title);

    const marker = new mapboxgl.Marker(el)
      .setLngLat(coords)
      .setPopup(popup)
      .addTo(map);

    el.addEventListener("click", (e) => {
      e.stopPropagation();
      map.flyTo({
        center: coords,
        zoom: 15,
        essential: true
      });
      marker.togglePopup();
    });
  }

  const srcTitle = rideData.sorce || "Source Location";
  const dstTitle = rideData.destination || "Destination Location";

  createLabelMarker("S", [srcLng, srcLat], "#16a34a", srcTitle);
  createLabelMarker("D", [dstLng, dstLat], "#dc2626", dstTitle);
}

function restoreMapOverlaysAfterStyleChange() {
  enhanceMapLabels();
  addStaticPins();

  if (rideStarted) {
    if (userMarkers.has(adminUserId)) {
      const adminLoc = userMarkers.get(adminUserId);
      drawLiveRoute(adminLoc.lat, adminLoc.lng);
    } else if (isAdmin && Number.isFinite(myLat) && Number.isFinite(myLng)) {
      drawLiveRoute(myLat, myLng);
    }
    return;
  }

  drawStaticRoute();
}

function renderRoute(routeGeoJSON, isDynamic = false, color = "#3b82f6") {
  const sourceId = "route-source";
  const layerId = "route-layer";

  // Clean up any old static-route or route sources if they exist from previous state
  removeLayerSafe("static-route");
  removeSourceSafe("static-route");
  removeLayerSafe("route");
  removeSourceSafe("route");

  if (map.getSource(sourceId)) {
    map.getSource(sourceId).setData(routeGeoJSON);
  } else {
    map.addSource(sourceId, {
      type: "geojson",
      data: routeGeoJSON
    });

    map.addLayer({
      id: layerId,
      type: "line",
      source: sourceId,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": color,
        "line-width": 5,
        "line-opacity": 0.8
      }
    });
  }

  if (!isDynamic) {
    const bounds = new mapboxgl.LngLatBounds();
    routeGeoJSON.geometry.coordinates.forEach(c => bounds.extend(c));
    map.fitBounds(bounds, { padding: 80, duration: 1000 });
  }
}

/* ── STATIC ROUTE (before ride starts) ─────────────────────────────── */
async function renderStaticRoute() {
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/` +
    `${srcLng},${srcLat};${dstLng},${dstLat}` +
    `?geometries=geojson&steps=true&overview=full&access_token=${map_token}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data.routes || !data.routes.length) {
      toast("Could not load route.", "error");
      return;
    }
    const route = data.routes[0];
    navigationSteps = route.legs[0].steps;
    totalDistance = route.distance;
    totalDuration = route.duration;

    const routeGeoJSON = { type: "Feature", geometry: route.geometry };
    // Static route is always blue before ride starts
    renderRoute(routeGeoJSON, false, "#3b82f6");
  } catch (e) {
    toast("Network error loading route.", "error");
  }
}

/* ── DOTTED PATH (each user → sorce via real roads) ────────────────── */
// Uses Mapbox Directions API for real road geometry instead of straight lines.
// sourceId = 'dotted-src-{userId}', layerId = 'dotted-{userId}'
// Also creates a white casing layer 'dotted-{userId}-casing' for visibility.

const dottedPathThrottle = new Map();  // userId → last fetch timestamp
const DOTTED_THROTTLE_MS = 15000;      // max 1 API call per 15s per user

async function updateDottedPath(userId, lat, lng) {
  const dist = haversine(lat, lng, srcLat, srcLng);
  const uid = String(userId);
  const layerId = `dotted-path-${uid}`;
  const casingId = `${layerId}-casing`;
  const srcId = layerId;

  // Within 80m of source — remove path, rider has arrived
  if (dist <= 80) {
    reachedSourceUsers.add(uid);
    if (DEBUG_LOG) console.log("USER REACHED SOURCE", uid);
    const markerData = userMarkers.get(uid);
    if (markerData) markerData.hasReachedSource = true;
    removeDottedPathForUser(uid);

    // Fire "reached source" notification once per user
    if (!reachedNotified.has(uid)) {
      reachedNotified.add(uid);
      const reachedMember = rideData.members.find(m => m._id.toString() === uid);
      const reachedName = reachedMember ? buildDisplayName(reachedMember) : 'A rider';

      if (uid === userid) {
        showNotif({ type: 'reached', title: 'You reached the source! 🎉', sub: rideData.sorce, name: reachedName });
      } else {
        showNotif({ type: 'reached', title: `${reachedName} reached the source`, sub: rideData.sorce, name: reachedName });
      }
    }

    return;
  }

  if (rideStarted || reachedSourceUsers.has(uid)) {
    removeDottedPathForUser(uid);
    return;
  }

  // Throttle: only fetch Directions API every DOTTED_THROTTLE_MS
  const now = Date.now();
  const lastFetch = dottedPathThrottle.get(uid) || 0;
  if (now - lastFetch < DOTTED_THROTTLE_MS) {
    // Between API fetches — source exists, skip
    return;
  }
  dottedPathThrottle.set(uid, now);

  try {
    // Fetch real road route from Mapbox Directions API
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/` +
      `${lng},${lat};${srcLng},${srcLat}` +
      `?geometries=geojson&overview=full&steps=false&access_token=${map_token}`;

    const res = await fetch(url);
    const data = await res.json();

    if (!data.routes || data.routes.length === 0) {
      console.warn(`[RideSynk] No road route for ${uid} - drawing fallback`);
      drawFallbackLine(uid, lat, lng, layerId, casingId, srcId);
      return;
    }

    const geojson = {
      type: 'Feature',
      geometry: data.routes[0].geometry   // real road geometry
    };

    // Update existing source or create new
    if (map.getSource(srcId)) {
      map.getSource(srcId).setData(geojson);
    } else {
      map.addSource(srcId, { type: 'geojson', data: geojson });

      // Casing (white outline for visibility on any background)
      map.addLayer({
        id: casingId,
        type: 'line',
        source: srcId,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': 7,
          'line-opacity': 0.6
        }
      });

      // Main amber dotted line on top
      map.addLayer({
        id: layerId,
        type: 'line',
        source: srcId,
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: {
          'line-color': '#f59e0b',
          'line-width': 4,
          'line-dasharray': [2, 2],
          'line-opacity': 1,
          'line-blur': 0
        }
      });

      console.log(`[RideSynk] Road route drawn for userId: ${uid}`);
    }
  } catch (err) {
    console.error(`[RideSynk] updateDottedPath fetch error for ${uid}:`, err);
    drawFallbackLine(uid, lat, lng, layerId, casingId, srcId);
  }
}

// Fallback: straight line if Directions API fails
function drawFallbackLine(userId, lat, lng, layerId, casingId, srcId) {
  const geojson = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [[lng, lat], [srcLng, srcLat]]
    }
  };

  if (map.getSource(srcId)) {
    map.getSource(srcId).setData(geojson);
  } else {
    map.addSource(srcId, { type: 'geojson', data: geojson });
    map.addLayer({
      id: layerId,
      type: 'line',
      source: srcId,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#f59e0b',
        'line-width': 4,
        'line-dasharray': [2, 2],
        'line-opacity': 1
      }
    });
  }
}

function clearAllDottedPaths() {
  const allIds = new Set([...userMarkers.keys(), userid]);
  allIds.forEach(uid => {
    removeDottedPathForUser(uid);
  });

  dottedPathThrottle.clear();
  console.log('[RideSynk] All dotted paths cleared');
}

/* ── MARKER SYSTEM ──────────────────────────────────────────────────── */
function upsertMarker(userId, lat, lng, name, isAdminUser) {
  if (userMarkers.has(userId)) {
    animateMarker(userId, lat, lng);
  } else {
    const el = document.createElement("div");
    // Class avatar-marker for the UI update
    el.className = `avatar-marker rider-marker ${isAdminUser ? "admin-marker" : "member-marker"}`;
    el.textContent = getInitials(name);
    el.title = name;

    const popup = new mapboxgl.Popup({ offset: 25, closeButton: false }).setText(name);

    const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
      .setLngLat([lng, lat])
      .setPopup(popup)
      .addTo(map);

    el.addEventListener("click", (e) => {
      e.stopPropagation();
      map.flyTo({
        center: [lng, lat],
        zoom: 15,
        essential: true
      });
      // Explicitly toggle the popup so it shows since we stopped propagation
      marker.togglePopup();
    });

    userMarkers.set(userId, { marker, lat, lng, name, isAdminUser });
  }
}

function animateMarker(userId, targetLat, targetLng) {
  const data = userMarkers.get(userId);
  if (!data) return;

  const startLat = data.lat;
  const startLng = data.lng;
  const startTime = performance.now();
  const DURATION = 800;

  function step(now) {
    const t = Math.min((now - startTime) / DURATION, 1);
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

    const lat = startLat + (targetLat - startLat) * ease;
    const lng = startLng + (targetLng - startLng) * ease;

    data.marker.setLngLat([lng, lat]);

    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      data.lat = targetLat;
      data.lng = targetLng;
    }
  }
  requestAnimationFrame(step);
}

/* ── CAMERA FOLLOW ──────────────────────────────────────────────────── */
function centerOnUser(lat, lng) {
  if (!followMode) return;
  map.easeTo({ center: [lng, lat], zoom: 15, pitch: 45, duration: 500 });
}

map.on("dragstart", () => {
  followMode = false;
  document.getElementById("btn-recenter").classList.add("active");
});

/* ── VOICE NAVIGATION ───────────────────────────────────────────────── */
function speak(text) {
  if (!voiceEnabled || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  // Pick local English voice if available
  const voices = speechSynthesis.getVoices();
  const preferred = voices.find(v => v.lang === "en-US" && v.localService);
  if (preferred) utterance.voice = preferred;

  speechSynthesis.speak(utterance);
}

/* ── MANEUVER ICONS ─────────────────────────────────────────────────── */
function updateManeuverIcon(type, modifier) {
  const icons = {
    "turn-right": "↱",
    "turn-left": "↰",
    "turn-slight-right": "↗",
    "turn-slight-left": "↖",
    "turn-sharp-right": "⤵",
    "turn-sharp-left": "⤴",
    "straight": "↑",
    "arrive": "🏁",
    "arrive-right": "🏁",
    "arrive-left": "🏁",
    "roundabout": "↻",
    "rotary": "↻",
    "merge": "⤴",
    "fork": "⑂",
    "depart": "▶",
    "continue": "↑",
    "end of road-right": "↱",
    "end of road-left": "↰",
    "ramp": "↗"
  };
  const key = modifier ? `${type}-${modifier}` : type;
  document.getElementById("nav-icon").textContent = icons[key] || icons[type] || "↑";
}

/* ── TURN-BY-TURN NAVIGATION ────────────────────────────────────────── */
function findNearestNavigationStepIndex(steps, lat, lng) {
  if (!Array.isArray(steps) || steps.length === 0) return 0;

  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < steps.length; i++) {
    const location = steps[i] && steps[i].maneuver && steps[i].maneuver.location;
    if (!Array.isArray(location) || location.length !== 2) continue;

    const distance = haversine(lat, lng, location[1], location[0]);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function updateNavigation(lat, lng) {
  if (!navigationSteps.length) return;

  const step = navigationSteps[currentStepIndex];
  if (!step || !step.maneuver || !Array.isArray(step.maneuver.location)) return;
  const stepEnd = step.maneuver.location;                       // [lng, lat]
  const distToStep = haversine(lat, lng, stepEnd[1], stepEnd[0]);

  if (distToStep < 30 && currentStepIndex < navigationSteps.length - 1) {
    currentStepIndex++;
  }

  const current = navigationSteps[currentStepIndex];
  if (!current || !current.maneuver) return;
  const instruction = current.maneuver.instruction;

  const remaining = navigationSteps
    .slice(currentStepIndex)
    .reduce((sum, s) => sum + s.distance, 0);
  const duration = navigationSteps
    .slice(currentStepIndex)
    .reduce((sum, s) => sum + s.duration, 0);

  const distText = remaining > 1000
    ? `${(remaining / 1000).toFixed(1)} km`
    : `${Math.round(remaining)} m`;
  const etaText = `${Math.round(duration / 60)} min`;

  document.getElementById("nav-instruction").textContent = instruction;
  document.getElementById("nav-sub").textContent = `${distText} remaining · ETA: ${etaText}`;

  updateManeuverIcon(current.maneuver.type, current.maneuver.modifier);

  if (instruction !== lastInstruction) {
    speak(instruction);
    lastInstruction = instruction;
  }
}

/* ── LIVE ROUTE (after ride starts, from admin's live position) ─────── */
// Displays a dynamic blue line from source → admin's location → destination
// This route updates as the admin moves along the route.
// Admin is treated as an intermediate waypoint, not just another member.
async function drawLiveRoute(currentLat, currentLng) {
  clearTimeout(adminOfflineTimer);
  adminOfflineTimer = setTimeout(() => {
    toast("Live route refresh paused.", "warn");
  }, 10000);

  if (!Number.isFinite(currentLat) || !Number.isFinite(currentLng)) {
    return;
  }

  const requestId = ++activeRouteRequestId;

  let coordinates = [
    rideData.sorceLocation.coordinates,   // [lng, lat]
    [currentLng, currentLat],             // admin's live location [lng, lat]
    rideData.destinationLocation.coordinates
  ];

  const distFromSrc = haversine(currentLat, currentLng, srcLat, srcLng);
  
  // EDGE CASE: If admin is very close to source (<50m), simplify to destination only
  if (distFromSrc < 50) {
    coordinates = [
      [currentLng, currentLat],
      rideData.destinationLocation.coordinates
    ];
  }

  if (DEBUG_LOG) console.log("[Route] Live route coordinates:", coordinates);

  const coordsString = coordinates
    .map(coord => coord.join(","))
    .join(";");

  // FORCE WAYPOINT ORDER (ensures source → admin → destination sequence)
  const wpParam = coordinates.length === 3 ? "&waypoints=0;1;2" : "&waypoints=0;1";

  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsString}` +
    `?overview=full&geometries=geojson&steps=true${wpParam}&access_token=${map_token}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (requestId !== activeRouteRequestId) return;
    if (!data.routes || !data.routes.length) return;

    const routeGeoJSON = data.routes[0].geometry;

    // Extract navigation steps from the appropriate leg
    let steps = [];
    if (distFromSrc < 50 && data.routes[0].legs[0]) {
      steps = data.routes[0].legs[0].steps || [];
    } else if (distFromSrc >= 50 && data.routes[0].legs[1]) {
      steps = data.routes[0].legs[1].steps || [];
    } else if (data.routes[0].legs[0]) {
      steps = data.routes[0].legs[0].steps || [];
    }

    navigationSteps = steps;
    if (navigationSteps.length) {
      currentStepIndex = findNearestNavigationStepIndex(navigationSteps, currentLat, currentLng);
    }
    lastRouteOrigin = { lat: currentLat, lng: currentLng };

    const routeData = { type: "Feature", geometry: routeGeoJSON };
    // Live route is always blue
    renderRoute(routeData, true, "#3b82f6");
    if (DEBUG_LOG) console.log("[Route] Live route recalculated successfully");
  } catch (e) {
    console.error("[Route] Error fetching live route:", e);
    toast("Failed to update route.", "error");
  }
}

function scheduleRouteRedraw(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  if (lastRouteOrigin) {
    const movedDistance = haversine(lat, lng, lastRouteOrigin.lat, lastRouteOrigin.lng);
    if (movedDistance < 50) return;
  } else if (routeRedrawTimer) {
    // If we haven't drawn the route yet (lastRouteOrigin is null)
    // but the timer is already running, don't keep resetting it.
    return;
  }

  clearTimeout(routeRedrawTimer);
  routeRedrawTimer = setTimeout(() => {
    routeRedrawTimer = null;
    drawLiveRoute(lat, lng);
  }, 5000);
}

function shouldUpdateRoute(lat, lng) {
  const adminLat = Number(lat);
  const adminLng = Number(lng);
  if (!Number.isFinite(adminLat) || !Number.isFinite(adminLng)) return false;

  const now = Date.now();
  if (now - lastDynamicRouteUpdateTime < 2000) return false;

  if (lastDynamicRouteUpdateLocation) {
    const movedDistance = haversine(
      adminLat,
      adminLng,
      lastDynamicRouteUpdateLocation.lat,
      lastDynamicRouteUpdateLocation.lng
    );
    if (movedDistance < 20) return false;
  }

  lastDynamicRouteUpdateTime = now;
  lastDynamicRouteUpdateLocation = { lat: adminLat, lng: adminLng };
  return true;
}

function updateDynamicRoute(adminLocationOrLat, adminLng) {
  const lat = Number(
    typeof adminLocationOrLat === "object" && adminLocationOrLat !== null
      ? adminLocationOrLat.lat
      : adminLocationOrLat
  );
  const lng = Number(
    typeof adminLocationOrLat === "object" && adminLocationOrLat !== null
      ? adminLocationOrLat.lng
      : adminLng
  );
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  clearTimeout(routeRedrawTimer);
  routeRedrawTimer = null;
  drawLiveRoute(lat, lng);
}

let isRideModeActivated = false;

/* ── ACTIVATE RIDE MODE ─────────────────────────────────────────────── */
function activateRideMode() {
  // Guard — safe to call multiple times (socket events, page-load sync, etc.)
  if (isRideModeActivated) {
    // Even if guard fires, guarantee nav panel is visible
    const np = document.getElementById("nav-panel");
    if (np && np.style.display !== "flex") {
      np.style.display = "flex";
      np.classList.add("visible");
      console.log('[RideSynk] activateRideMode guard — nav panel forced visible');
    }
    return;
  }
  isRideModeActivated = true;
  rideStarted = true;
  isRideStarted = true;
  console.log('[RideSynk] activateRideMode: ACTIVATING');

  // Show nav panel — multiple methods for reliability
  const navPanel = document.getElementById("nav-panel");
  if (navPanel) {
    navPanel.style.display = "flex";
    navPanel.style.visibility = "visible";
    navPanel.removeAttribute("hidden");
    navPanel.classList.remove("hidden");
    requestAnimationFrame(() => navPanel.classList.add("visible"));
    console.log('[RideSynk] Nav panel shown');
  }

  const btnStart = document.getElementById("btn-start-ride");
  const btnEnd = document.getElementById("btn-end-ride");
  if (btnStart) btnStart.style.display = "none";
  if (btnEnd) { btnEnd.style.display = "flex"; }

  clearAllDottedPaths();
  // We will leave the static-route alone here, and only remove it specifically when drawLiveRoute succeeds.

  // Update status badge in trip plan
  updateStatusBadge("active");

  toast("Ride started! Navigation enabled.", "success");

  // Show SOS button when ride starts or when entering an already running ride
  const btnSos = document.getElementById("btn-sos") || document.querySelector(".sos-ctrl-btn");
  if (btnSos) {
    btnSos.style.display = "flex";
  }

  // ALWAYS use admin's live location for the main route
  if (userMarkers.has(adminUserId)) {
    const adminLoc = userMarkers.get(adminUserId);
    drawLiveRoute(adminLoc.lat, adminLoc.lng);
  } else if (isAdmin && Number.isFinite(myLat) && Number.isFinite(myLng)) {
    drawLiveRoute(myLat, myLng);
  }

  console.log('[RideSynk] activateRideMode: complete');
}

/* ── SHOW RIDE ENDED OVERLAY ────────────────────────────────────────── */
function showRideEndedOverlay() {
  const overlay = document.getElementById("ride-ended-overlay");
  overlay.style.display = "flex";
  speak("The ride has ended. Thank you for riding with us.");
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  if (adminOfflineTimer) clearTimeout(adminOfflineTimer);
}

/* ── STATUS BADGE HELPER ────────────────────────────────────────────── */
function updateStatusBadge(status) {
  const el = document.getElementById("status-badge");
  if (!el) return;
  const labels = {
    active: { text: "🟢 Active", cls: "status-active" },
    upcoming: { text: "🔵 Upcoming", cls: "status-upcoming" },
    completed: { text: "⬜ Completed", cls: "status-completed" },
    canceled: { text: "🔴 Canceled", cls: "status-canceled" },
    cancelled: { text: "🔴 Cancelled", cls: "status-cancelled" }
  };
  const info = labels[status] || { text: status, cls: "status-upcoming" };
  el.textContent = info.text;
  el.className = `status-badge ${info.cls}`;
}

/* ── MEMBERS PANEL RENDER ───────────────────────────────────────────── */
function renderMembersPanel() {
  const container = document.getElementById('members-list');
  if (!container) return;

  const liveCountLabel = document.getElementById("live-count-label");
  if (liveCountLabel) {
    liveCountLabel.textContent = `${onlineUsers.size} / ${rideData.members.length} Riders Live`;
  }

  // Build member data with computed distances from memberLocations
  const memberData = rideData.members.map((member) => {
    const uid = member._id.toString();
    const isMemberAdmin = uid === adminUserId;
    const isMe = uid === userid;
    const isOnline = onlineUsers.has(uid);
    const loc = memberLocations.get(uid);
    const name = buildDisplayName(member);

    let distanceM = null;
    let distanceText = '\u23f3 Waiting for GPS...';
    let status = 'waiting';

    if (loc) {
      const distToSrc = haversine(loc.lat, loc.lng, srcLat, srcLng);
      const hasReached = distToSrc < 80 || reachedSourceUsers.has(uid);

      if (hasReached || rideStarted) {
        // After reaching source OR ride started -> show distance to destination
        const distToDst = haversine(loc.lat, loc.lng, dstLat, dstLng);
        distanceM = distToDst;
        status = hasReached ? 'reached' : 'onway';

        if (distToDst < 100) {
          distanceText = '\ud83c\udfc1 Near destination';
        } else if (distToDst < 1000) {
          distanceText = `${Math.round(distToDst)} m to destination`;
        } else {
          distanceText = `${(distToDst / 1000).toFixed(1)} km to destination`;
        }
        if (DEBUG_LOG) console.log('DISTANCE SWITCHED TO DESTINATION', uid);
      } else {
        // Before reaching source -> show distance to source
        distanceM = distToSrc;
        status = 'onway';
        if (distToSrc < 1000) {
          distanceText = `${Math.round(distToSrc)} m from source`;
        } else {
          distanceText = `${(distToSrc / 1000).toFixed(1)} km from source`;
        }
      }
    }

    return { uid, isMemberAdmin, isMe, isOnline, distanceM, distanceText, status, name };
  });

  // Sort: admin first, then closest to source first, then waiting last
  memberData.sort((a, b) => {
    if (a.isMemberAdmin && !b.isMemberAdmin) return -1;
    if (!a.isMemberAdmin && b.isMemberAdmin) return 1;
    if (a.distanceM !== null && b.distanceM !== null) return a.distanceM - b.distanceM;
    if (a.distanceM !== null) return -1;
    if (b.distanceM !== null) return 1;
    return 0;
  });

  const avatarColors = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2'];

  container.innerHTML = memberData.map((d, i) => {
    const initials = getInitials(d.name);
    const color = d.isMemberAdmin ? '#2563eb' : avatarColors[i % avatarColors.length];

    const adminBadge = d.isMemberAdmin
      ? `<span class="member-badge admin-badge">\ud83d\udc51 Admin</span>`
      : '';
    const meBadge = d.isMe
      ? `<span class="member-badge me-badge">You</span>`
      : '';
    const statusBadge = d.status === 'reached'
      ? `<span class="member-badge reached-badge">\u2705 Reached</span>`
      : d.status === 'onway'
        ? `<span class="member-badge onway-badge">\ud83d\udee3\ufe0f On the way</span>`
        : `<span class="member-badge waiting-badge">\u23f3 Waiting</span>`;

    return `
      <div class="member-card ${d.isMemberAdmin ? 'card-admin' : ''} ${d.isMe ? 'card-me' : ''}">
        <div class="member-avatar-wrap">
          <div class="member-avatar" style="background:${escapeHtml(color)}">${escapeHtml(initials)}</div>
          <span class="online-dot ${d.isOnline ? 'dot-online' : 'dot-offline'}" title="${d.isOnline ? 'Live' : 'Offline'}"></span>
        </div>
        <div class="member-info">
          <div class="member-name-row">
            <span class="member-name">${escapeHtml(d.name)}</span>
            ${adminBadge}${meBadge}
          </div>
          <div class="member-distance">${escapeHtml(d.distanceText)}</div>
          <div class="member-status-row">${statusBadge}</div>
        </div>
      </div>`;
  }).join('');
}

/* ── CHAT: APPEND MESSAGE ───────────────────────────────────────────── */
function appendMessage(msg, isMine) {
  const container = document.getElementById("chat-messages");
  if (!container) return;

  // Remove the empty-state placeholder if present
  const empty = container.querySelector(".chat-empty");
  if (empty) empty.remove();

  const wrapper = document.createElement("div");
  wrapper.className = `chat-message ${isMine ? "mine" : "theirs"}`;
  // Set data-msg-id for dedup in receiveMessage handler
  if (msg._id) wrapper.dataset.msgId = String(msg._id);

  wrapper.innerHTML = `
    ${!isMine ? `<div class="chat-sender">${escapeHtml(msg.name)}</div>` : ""}
    <div class="chat-bubble">${escapeHtml(msg.text)}</div>
    <div class="chat-time">${escapeHtml(String(msg.time || ""))}</div>`;

  container.appendChild(wrapper);
  container.scrollTop = container.scrollHeight;
}


/* ── CHAT: SEND MESSAGE ─────────────────────────────────────────────── */
function sendMessage() {
  const input = document.getElementById("chat-input");
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;             // block empty
  if (text.length > 500) return; // block over-length (server also enforces this)

  const msg = {
    rideId: rideData._id,
    userId: userid,
    name: myName,
    text: text,
    time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  };

  socket.emit("sendMessage", msg);
  // NOTE: No optimistic appendMessage here.
  // The server broadcasts back to ALL clients (including sender) via io.to(rid)
  // with a real DB _id, so the message appears only after confirmed save.
  input.value = "";
  input.focus();
}


/* ── SEARCH BAR: GEOCODING ──────────────────────────────────────────── */
let geocodeTimer = null;

function setupSearch() {
  const input = document.getElementById("search-input");
  const dropdown = document.getElementById("search-dropdown");
  const clearBtn = document.getElementById("search-clear");
  if (!input || !dropdown) return;

  input.addEventListener("input", () => {
    const q = input.value.trim();
    clearBtn.classList.toggle("visible", q.length > 0);

    clearTimeout(geocodeTimer);
    if (q.length < 2) {
      dropdown.classList.remove("visible");
      dropdown.innerHTML = "";
      return;
    }

    geocodeTimer = setTimeout(async () => {
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
          `${encodeURIComponent(q)}.json` +
          `?access_token=${map_token}&limit=5&types=place,address,poi`;
        const res = await fetch(url);
        const data = await res.json();
        renderSearchResults(data.features || []);
      } catch (e) {
        /* silent failure — search is non-critical */
      }
    }, 400);
  });

  input.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      dropdown.classList.remove("visible");
      dropdown.innerHTML = "";
      input.blur();
    }
  });

  clearBtn.addEventListener("click", () => {
    input.value = "";
    clearBtn.classList.remove("visible");
    dropdown.classList.remove("visible");
    dropdown.innerHTML = "";
    input.focus();
  });

  document.addEventListener("click", e => {
    if (!document.getElementById("search-bar").contains(e.target)) {
      dropdown.classList.remove("visible");
      dropdown.innerHTML = "";
    }
  });
}

function renderSearchResults(features) {
  const dropdown = document.getElementById("search-dropdown");
  dropdown.innerHTML = "";

  if (!features.length) {
    dropdown.classList.remove("visible");
    return;
  }

  features.slice(0, 5).forEach(f => {
    const item = document.createElement("div");
    item.className = "search-result-item";
    item.innerHTML = `
      <span class="search-result-icon">📍</span>
      <span class="search-result-text">${escapeHtml(f.place_name)}</span>`;

    item.addEventListener("click", () => {
      const [lng, lat] = f.center;
      map.flyTo({ center: [lng, lat], zoom: 15, pitch: 45, duration: 800 });
      document.getElementById("search-input").value = f.place_name;
      dropdown.classList.remove("visible");
      dropdown.innerHTML = "";
      document.getElementById("search-clear").classList.add("visible");
      followMode = false;
      document.getElementById("btn-recenter").classList.add("active");
    });
    dropdown.appendChild(item);
  });

  dropdown.classList.add("visible");
}

/* ── BOTTOM SHEET DRAG ──────────────────────────────────────────────── */
function setupBottomSheetDrag() {
  const sheet = document.getElementById("bottom-sheet");
  const handle = document.querySelector(".drag-handle-wrapper");
  if (!sheet || !handle) return;

  let startY = 0;
  let startH = 0;
  let isDragging = false;

  function onStart(e) {
    isDragging = true;
    startY = e.touches ? e.touches[0].clientY : e.clientY;
    startH = sheet.offsetHeight;
    sheet.style.transition = "none";
    document.body.style.userSelect = "none";
  }

  function onMove(e) {
    if (!isDragging) return;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const delta = startY - clientY;
    const newH = Math.min(Math.max(startH + delta, 72), window.innerHeight * 0.9);
    sheet.style.height = `${newH}px`;
    sheet.classList.remove("collapsed", "expanded");
  }

  function onEnd() {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.userSelect = "";
    sheet.style.transition = "";

    const h = sheet.offsetHeight;
    const vh = window.innerHeight;

    if (h < vh * 0.15) {
      sheet.classList.add("collapsed");
      sheet.classList.remove("expanded");
    } else if (h > vh * 0.55) {
      sheet.classList.add("expanded");
      sheet.classList.remove("collapsed");
    } else {
      sheet.classList.remove("collapsed", "expanded");
      sheet.style.height = "30vh";
    }
  }

  handle.addEventListener("mousedown", onStart);
  handle.addEventListener("touchstart", onStart, { passive: true });
  window.addEventListener("mousemove", onMove);
  window.addEventListener("touchmove", onMove, { passive: true });
  window.addEventListener("mouseup", onEnd);
  window.addEventListener("touchend", onEnd);
}

/* ── TAB SWITCHING ──────────────────────────────────────────────────── */
function setupTabs() {
  const tabs = document.querySelectorAll(".tab-btn");
  const panes = document.querySelectorAll(".tab-content");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      panes.forEach(p => p.classList.remove("active"));

      tab.classList.add("active");
      const target = document.getElementById(tab.dataset.target);
      if (target) target.classList.add("active");

      // Re-render members whenever that tab becomes active
      if (tab.dataset.target === "tab-members") {
        renderMembersPanel();
      }

      // Scroll chat to bottom when switching to chat
      if (tab.dataset.target === "tab-chat") {
        const msgs = document.getElementById("chat-messages");
        if (msgs) msgs.scrollTop = msgs.scrollHeight;
      }
    });
  });
}

let locationAlertShown = false;

/* ── GEOLOCATION WATCH ──────────────────────────────────────────────── */
function startGeolocation() {
  if (!navigator.geolocation) {
    toast("Geolocation not supported by your browser.", "error");
    return;
  }

  // Pre-check for initial prompt to ensure fast failure/success
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      // Success! We can reset the alert shown flag.
      locationAlertShown = false;
      initWatch();
    },
    (err) => {
      // Execute the watch anyway so it recovers when they turn GPS back on
      initWatch();
    },
    { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
  );
}

function initWatch() {
  if (watchId !== null) return; // Prevent double watching

  watchId = navigator.geolocation.watchPosition(
    pos => {
      // If we get a position cleanly, reset the alert flag so we can warn again if it drops
      locationAlertShown = false;
      const { latitude: lat, longitude: lng } = pos.coords;
      myLat = lat;
      myLng = lng;

      const now = Date.now();
      if (now - lastEmitTime < EMIT_THROTTLE) return;
      lastEmitTime = now;

      socket.emit("sendLocation", {
        rideId: rideData._id,
        userId: userid,
        lat,
        lng,
        name: myName,
        isAdmin: isAdmin
      });
      if (DEBUG_LOG) console.log("LOCATION SENT", { lat, lng, rideId: rideData._id });

      // Update own marker on map
      upsertMarker(userid, lat, lng, myName, isAdmin);

      // Track own location for members panel
      memberLocations.set(userid, { lat, lng, updatedAt: Date.now() });
      onlineUsers.add(userid);

      updateDottedPath(userid, lat, lng);

      if (followMode && followTarget === userid) {
        centerOnUser(lat, lng);
      }

      if (rideStarted) {
        updateNavigation(lat, lng);
        // Route updates for admin are now purely handled by receiving adminLocationUpdated
      }

      // Always re-render members panel (throttled to prevent DOM thrashing)
      throttledRenderMembersPanel();
    },
    err => {
      let errorMsg = "Location error.";
      if (err.code === 1) {
        errorMsg = "Location access denied. Please allow location permissions in your browser settings.";
      } else if (err.code === 2) {
        errorMsg = "Device location is turned off. Please turn on your device's Location / GPS to continue.";
        if (!locationAlertShown) {
          alert("Your browser has location permission, but your device GPS is turned OFF. Please turn on Location setting in your device menu to use live tracking.");
          locationAlertShown = true;
        }
      } else if (err.code === 3) {
        errorMsg = "GPS request timed out. Please ensure your location services are enabled.";
        if (!locationAlertShown) {
          alert("Getting your location timed out. Please make sure your device GPS is turned ON and you have clear view of the sky.");
          locationAlertShown = true;
        }
      }

      toast(errorMsg, "error");
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
  );
}

/* ── SOCKET EVENTS ──────────────────────────────────────────────────── */
socket.on("connect", () => {
  // Include userId + name so server can broadcast memberJoined to others
  socket.emit("joinRide", { rideId: rideData._id, userId: userid, name: myName });
});

socket.on("initialMembers", (members) => {
  members.forEach(user => {
    const uid = user.userId.toString();
    
    // Always track user in online users
    onlineUsers.add(uid);

    // Render if we have location
    if (user.lat !== null && user.lng !== null) {
      upsertMarker(uid, user.lat, user.lng, user.name, user.isAdmin);
      memberLocations.set(uid, { lat: user.lat, lng: user.lng, updatedAt: Date.now() });
      updateDottedPath(uid, user.lat, user.lng);

      if (uid === adminUserId || user.isAdmin) {
        adminLiveLocation = { lat: user.lat, lng: user.lng };
        // Route updates now handled by strict logic in adminLocationUpdated or checkAndActivateRideStatus
      }
    }
  });
  throttledRenderMembersPanel();
});

socket.on("rideState", ({ started, status, adminLocation } = {}) => {
  if (DEBUG_LOG) console.log('[RideSynk] rideState received:', { started, status, adminLocation });
  if (started || status === 'active' || status === 'started') {
    rideData.status = 'active';
    isRideStarted = true;
    rideStarted = true;
    waitForMapThenActivate();
    if (adminLocation) {
      adminLiveLocation = adminLocation;
      updateDynamicRoute(adminLocation);
    }
  } else if (status === 'completed' || status === 'ended') {
    rideData.status = 'completed';
    showRideEndedOverlay();
  }
});

socket.on("receiveLocation", ({ userId, lat, lng, name, isAdmin: senderIsAdmin }) => {
  const uid = userId.toString();
  upsertMarker(uid, lat, lng, name, senderIsAdmin);
  if (DEBUG_LOG) console.log("LOCATION RECEIVED", { userId: uid, lat, lng });
  if (DEBUG_LOG) console.log("MAP UPDATED", uid);

  // Track location for members panel distances
  memberLocations.set(uid, { lat, lng, updatedAt: Date.now() });
  onlineUsers.add(uid);
  updateDottedPath(uid, lat, lng);

  // Just track admin location for late updates, route drawing is handled by adminLocationUpdated
  if (uid === adminUserId || senderIsAdmin) {
    adminLiveLocation = { lat, lng };
  }

  // Follow admin if we're a member
  if (!isAdmin && uid === adminUserId && followMode) {
    centerOnUser(lat, lng);
  }

  // Always re-render members panel
  throttledRenderMembersPanel();
});

socket.on("adminLocationUpdated", ({ lat, lng }) => {

  // ❗ ONLY UPDATE AFTER RIDE START
  if (!rideStarted) return;

  adminLiveLocation = { lat, lng };
  if (shouldUpdateRoute(lat, lng)) {
    updateDynamicRoute(lat, lng);
  }
});

// We removed updateRouteSmooth and getRoute so the map does not draw weird individual dotted lines.

socket.on("memberJoined", ({ userId, name }) => {
  // Don't notify yourself joining
  if (userId === userid) return;

  onlineUsers.add(userId);
  throttledRenderMembersPanel();

  showNotif({
    type: 'join',
    title: `${name} joined the ride`,
    sub: 'Now tracking their location',
    name
  });
});

socket.on("rideStarted", (data = {}) => {
  isRideStarted = true;
  rideStarted = true;
  rideData.status = "active";
  waitForMapThenActivate();

  const loc = data.adminLocation || adminLiveLocation;
  if (loc) {
    updateDynamicRoute(loc);
  }
});

socket.on("rideStatusUpdate", ({ status }) => {
  console.log('[RideSynk] rideStatusUpdate received:', status);
  if (status === "started" || status === "active") {
    rideData.status = "active";    // sync local state
    waitForMapThenActivate();      // safe even if map not loaded yet

    showNotif({
      type: 'start',
      title: 'Ride has started! 🚀',
      sub: `${rideData.sorce} → ${rideData.destination}`
    });
  }
  if (status === "ended" || status === "completed") {
    rideData.status = "completed";
    showRideEndedOverlay();

    showNotif({
      type: 'end',
      title: 'Ride has ended 🏁',
      sub: 'Hope you had a great journey!'
    });
  }
});

socket.on("receiveMessage", msg => {
  // Dedup: if we already have this message (by _id), skip it.
  // This prevents double-display when the server echoes back to the sender.
  if (msg._id) {
    const existing = document.querySelector(`[data-msg-id="${msg._id}"]`);
    if (existing) return;
  }

  const isMine = msg.userId === userid;
  appendMessage(msg, isMine);

  // Unread badge if chat tab not active
  const chatTab = document.querySelector('[data-target="tab-chat"]');
  if (chatTab && !chatTab.classList.contains("active") && !isMine) {
    chatTab.style.position = "relative";
    let dot = chatTab.querySelector(".unread-dot");
    if (!dot) {
      dot = document.createElement("span");
      dot.className = "unread-dot";
      dot.style.cssText =
        "position:absolute;top:6px;right:10px;width:8px;height:8px;" +
        "border-radius:50%;background:#dc2626;";
      chatTab.appendChild(dot);
    }
  }
});

// Remove unread dot when chat tab is clicked
document.addEventListener("click", e => {
  const chatTabBtn = document.querySelector('[data-target="tab-chat"]');
  if (chatTabBtn && chatTabBtn.contains(e.target)) {
    const dot = chatTabBtn.querySelector(".unread-dot");
    if (dot) dot.remove();
  }
});

socket.on("userLeft", ({ userId }) => {
  const uid = userId.toString();
  const data = userMarkers.get(uid);
  if (data) {
    data.marker.remove();
    userMarkers.delete(uid);
    removeDottedPathForUser(uid);
  }
  // Mark offline in onlineUsers (keeps memberLocations for last-known distance)
  onlineUsers.delete(uid);
  throttledRenderMembersPanel();
});

// (liveCount listener removed - handled dynamically by renderMembersPanel)

socket.on("memberOffline", ({ userId }) => {
  if (!userId) return;
  onlineUsers.delete(userId.toString());
  throttledRenderMembersPanel();
  // Silent — no toast for offline to avoid spam
});

socket.on("sos:triggered", ({ sos }) => {
  if (!sos || sos.status !== "active") return;
  handleActiveSOS(sos);
  toast("SOS alert received.", "warn");
  if (String(sos.userId) !== String(userid) && sos.location) {
    focusMap(sos.location);
  }
});

socket.on("sos:created", ({ sos }) => {
  if (!sos || sos.status !== "active") return;
  handleActiveSOS(sos);
  if (String(sos.userId) !== String(userid) && sos.location) {
    focusMap(sos.location);
  }
});

socket.on("receiveSOS", (data = {}) => {
  const sos = data.sos || {
    _id: data._id || data.userId,
    userId: data.userId,
    name: data.name,
    phone: data.phone,
    location: data.location,
    status: data.status || "active"
  };
  handleActiveSOS(sos);
});

socket.on("activeSOS", (data) => {
  const alerts = Array.isArray(data) ? data : [data && data.sos ? data.sos : data];
  alerts
    .filter(sos => sos && sos.status === "active")
    .forEach(handleActiveSOS);
});

function removeSOS(userId) {
  if (!userId) return;
  const cleanId = String(userId);
  const existingSos = activeSOSList.find(sos => String(sos.userId || sos._id) === cleanId);

  // 1. Remove UI notification card (hide popup)
  removeSosCard(userId);
  if (existingSos && existingSos._id) {
    removeSosCard(existingSos._id);
  }

  // 2. Extinguish the red blinking avatar (remove blinking class)
  deactivateSOSMarker(userId);

  // 3. System Cleanup
  clearSosCountdown();
  uiState = "idle";
  setSosUiState("idle");
  sosSoundPlayed = false;

  // 4. Unload from array cache
  const idx = activeSOSList.findIndex(sos => String(sos.userId || sos._id) === cleanId);
  if (idx !== -1) {
    activeSOSList.splice(idx, 1);
  }

  if (activeSOSList.length === 0) {
    stopSOSSound();
    isMuted = false;
  }
}

socket.on("sos:resolved", ({ sosId, sos }) => {
  const resolvedId = sosId || (sos && sos._id);
  const resolvedUserId = sos && sos.userId;
  if (resolvedId) {
    removeSosCard(resolvedId);
  }
  if (resolvedUserId) {
    removeSOS(resolvedUserId);
  }
  if (sos && sos.status === "resolved") {
    toast("SOS resolved.", "success");
  }
});

socket.on("sosResolved", ({ userId } = {}) => {
  removeSOS(userId);
});

/* ── NOTIFICATION SYSTEM ─────────────────────────────────────────────────── */
const NOTIF_DURATION = 4000;

const notifColors = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2'];

function getMemberColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return notifColors[Math.abs(hash) % notifColors.length];
}

function notifTypeIcon(type) {
  return { join: '👋', reached: '✅', start: '🚀', end: '🏁', info: 'i' }[type] || 'i';
}

function notifTypeColor(type) {
  return { join: '#2563eb', reached: '#16a34a', start: '#7c3aed', end: '#dc2626', info: '#0891b2' }[type] || '#64748b';
}

/**
 * showNotif({ type, title, sub, name })
 * type: 'join' | 'reached' | 'start' | 'end' | 'info'
 */
function showNotif({ type = 'info', title, sub = '', name = '' }) {
  const stack = document.getElementById('notif-stack');
  if (!stack) return;

  const card = document.createElement('div');
  card.className = `notif-card notif-${type}`;
  card.style.setProperty('--notif-duration', `${NOTIF_DURATION}ms`);

  const initials = name ? getInitials(name) : notifTypeIcon(type);
  const color = name ? getMemberColor(name) : notifTypeColor(type);

  card.innerHTML = `
    <div class="notif-avatar" style="background:${escapeHtml(color)}">${escapeHtml(initials)}</div>
    <div class="notif-text">
      <div class="notif-title">${escapeHtml(title)}</div>
      ${sub ? `<div class="notif-sub">${escapeHtml(sub)}</div>` : ''}
    </div>
    <div class="notif-progress"></div>`;

  card.addEventListener('click', () => dismissNotif(card));
  stack.appendChild(card);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => card.classList.add('notif-visible'));
  });

  setTimeout(() => dismissNotif(card), NOTIF_DURATION);
}

function dismissNotif(card) {
  if (!card || card.classList.contains('notif-hiding')) return;
  card.classList.remove('notif-visible');
  card.classList.add('notif-hiding');
  setTimeout(() => card.remove(), 400);
}

/* ── RIDE STATUS SYNC ON PAGE LOAD ──────────────────────────────────── */
// Handles: late joiners, riders who go back and rejoin, stale EJS data

async function checkAndActivateRideStatus() {
  console.log('[RideSynk] Checking ride status...');

  // Step 1: Try fetching fresh status from server
  let freshStatus = null;
  try {
    const res = await fetch(`/ridesynk/ride/${rideData._id}/status`, {
      credentials: 'include'   // send session cookies
    });
    if (res.ok) {
      const data = await res.json();
      freshStatus = data.status;
      console.log('[RideSynk] Server status:', freshStatus);
    }
  } catch (err) {
    console.log('[RideSynk] Could not fetch server status — using EJS data');
  }

  // Step 2: Use server status if available, else fall back to EJS data
  const effectiveStatus = freshStatus || rideData.status;
  rideData.status = effectiveStatus;   // keep local state in sync
  console.log('[RideSynk] Effective status:', effectiveStatus);

  // Step 3: Act on status
  // IMPORTANT: Do NOT set rideStarted = true here!
  // Let activateRideMode() handle it — it has its own guard + nav-panel logic.
  if (effectiveStatus === 'active' || effectiveStatus === 'started') {
    console.log('[RideSynk] Ride already started — activating nav');

    // Also explicitly verify SOS is brought back
    const btnSos = document.getElementById("btn-sos") || document.querySelector(".sos-ctrl-btn");
    if (btnSos) btnSos.style.display = "flex";

    activateRideMode();
  } else if (effectiveStatus === 'ended' || effectiveStatus === 'completed') {
    console.log('[RideSynk] Ride ended — showing overlay');
    showRideEndedOverlay();
  } else {
    console.log('[RideSynk] Ride pending — waiting for start');
  }
}

// Socket event may fire before map loads — handle gracefully
function waitForMapThenActivate() {
  if (map.loaded()) {
    activateRideMode();
  } else {
    map.once('load', () => activateRideMode());
  }
}

/* ── MAP LOAD ───────────────────────────────────────────────────────── */
map.on("load", () => {
  console.log('[RideSynk] Map loaded');

  // Hide loading screen
  const loader = document.getElementById("map-loader");
  if (loader) {
    loader.classList.add("hidden");
    setTimeout(() => loader.remove(), 600);
  }

  enhanceMapLabels();
  addStaticPins();

  if (!rideStarted) {
    renderStaticRoute();
  } else {
    // wait for admin location updates
  }

  startGeolocation();

  // Check & sync ride status — activates nav if already started
  checkAndActivateRideStatus();
});

/* ── BUTTON WIRING ──────────────────────────────────────────────────── */

// Back button
document.getElementById("btn-back").addEventListener("click", () => {
  history.back();
});

// Recenter button
document.getElementById("btn-recenter").addEventListener("click", () => {
  followMode = true;
  document.getElementById("btn-recenter").classList.remove("active");

  const target = userMarkers.get(followTarget);
  if (target) {
    map.flyTo({ center: [target.lng, target.lat], zoom: 15, pitch: 45, duration: 800 });
  } else if (myLat !== null) {
    map.flyTo({ center: [myLng, myLat], zoom: 15, pitch: 45, duration: 800 });
  } else {
    map.flyTo({ center: [srcLng, srcLat], zoom: 13, pitch: 45, duration: 800 });
  }
});

// Satellite view toggle
document.getElementById("btn-satellite").addEventListener("click", () => {
  isSatelliteView = !isSatelliteView;

  const nextStyle = isSatelliteView ? MAP_STYLE_SATELLITE : MAP_STYLE_STREETS;
  const btn = document.getElementById("btn-satellite");

  btn.classList.toggle("active", isSatelliteView);
  btn.setAttribute("aria-pressed", isSatelliteView ? "true" : "false");
  btn.title = isSatelliteView ? "Street view" : "Satellite view";

  map.once("style.load", () => {
    restoreMapOverlaysAfterStyleChange();
  });

  map.setStyle(nextStyle);
});

// Zoom in
document.getElementById("btn-zoom-in").addEventListener("click", () => {
  map.zoomIn({ duration: 300 });
});

// Zoom out
document.getElementById("btn-zoom-out").addEventListener("click", () => {
  map.zoomOut({ duration: 300 });
});

// Reset bearing / north
document.getElementById("btn-compass").addEventListener("click", () => {
  map.easeTo({ bearing: 0, pitch: 0, duration: 600 });
});

// Speaker toggle
document.getElementById("btn-speaker").addEventListener("click", () => {
  voiceEnabled = !voiceEnabled;
  const btn = document.getElementById("btn-speaker");
  btn.textContent = voiceEnabled ? "🔊" : "🔇";
  btn.classList.toggle("muted", !voiceEnabled);

  if (!voiceEnabled) {
    speechSynthesis.cancel();
  } else {
    speak("Voice navigation enabled");
  }
});

// Start ride (admin only)
const btnStartRide = document.getElementById("btn-start-ride");
if (btnStartRide && isAdmin) {
  btnStartRide.addEventListener("click", () => {
    const adminLocation = Number.isFinite(myLat) && Number.isFinite(myLng)
      ? { lat: myLat, lng: myLng }
      : null;

    socket.emit("startRide", {
      rideId: rideData._id,
      adminId: userid,
      adminLocation
    });
    activateRideMode();
    if (adminLocation) updateDynamicRoute(adminLocation);
  });
}

// End ride (admin only)
const btnEndRide = document.getElementById("btn-end-ride");
if (btnEndRide && isAdmin) {
  btnEndRide.addEventListener("click", () => {
    socket.emit("rideEnded", { rideId: rideData._id });
    showRideEndedOverlay();
  });
}

// Chat send button
document.getElementById("btn-send-chat").addEventListener("click", sendMessage);

// Chat enter key
document.getElementById("chat-input").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

/* ── INIT TABS, DRAG, SEARCH ────────────────────────────────────────── */
setupTabs();
setupBottomSheetDrag();
setupSearch();
renderMembersPanel();
setupSosUi();
fetchActiveSOS();

window.addEventListener("load", fetchActiveSOS);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    fetchActiveSOS();
  }
});

/* ── UPDATE TRIP PLAN TAB UI ────────────────────────────────────────── */
updateStatusBadge(rideData.status);

// Admin-only buttons — hide from non-admins
if (!isAdmin) {
  const s = document.getElementById("btn-start-ride");
  const e = document.getElementById("btn-end-ride");
  if (s) s.style.display = "none";
  if (e) e.style.display = "none";
} else if (rideStarted) {
  // Admin + ride already active
  const s = document.getElementById("btn-start-ride");
  const e = document.getElementById("btn-end-ride");
  if (s) s.style.display = "none";
  if (e) e.style.display = "flex";
}

/* -- LOAD CHAT HISTORY ON PAGE OPEN ------------------------------------ */
// Fetches last 50 messages from GET /api/chat/:rideId/history
// and renders them so users see previous chat immediately.
async function loadChatHistory() {
  try {
    const res = await fetch(`/api/chat/${rideData._id}/history`);
    const data = await res.json();
    if (!data.success) return;

    const container = document.getElementById("chat-messages");
    if (!container) return;

    container.innerHTML = ""; // clear placeholder

    if (data.messages.length === 0) {
      const empty = document.createElement("div");
      empty.className = "chat-empty";
      empty.textContent = "No messages yet. Say hello! \uD83D\uDC4B";
      container.appendChild(empty);
      return;
    }

    // getChatHistory shapes messages as { _id, userId, name, text, time }
    // appendMessage will set data-msg-id from _id for future dedup
    data.messages.forEach(msg => appendMessage(msg, msg.userId === userid));
    container.scrollTop = container.scrollHeight;
  } catch (err) {
    console.error("[chat] Failed to load chat history:", err);
  }
}

loadChatHistory();

/* -- PAGE CLEANUP ------------------------------------------------------- */
window.addEventListener("beforeunload", () => {
  clearSosCountdown();
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  socket.disconnect();
  if (window.speechSynthesis) speechSynthesis.cancel();
  if (adminOfflineTimer) clearTimeout(adminOfflineTimer);
  if (routeRedrawTimer) clearTimeout(routeRedrawTimer);
});

/* ── DEBUG HELPER (remove after confirming everything works) ────────── */
window.__rideSynkDebug = {
  getRideStarted: () => rideStarted,
  getMapLoaded: () => map.loaded(),
  getRideStatus: () => rideData.status,
  forceActivate: () => {
    rideStarted = false;   // reset guard
    activateRideMode();
  }
};
console.log('[RideSynk] Debug available: window.__rideSynkDebug');

/* ── STEP 6 & 8 — SOS POPUP UI TRACK RIDER HELPER ────────── */
function getUserLocation(userId) {
  const uid = String(userId || "");
  const markerData = userMarkers.get(uid);
  if (markerData) return { lat: markerData.lat, lng: markerData.lng };
  const memData = memberLocations.get(uid);
  if (memData) return { lat: memData.lat, lng: memData.lng };
  return null;
}

window.trackSOSUser = function (userId) {
  const loc = getUserLocation(userId);
  if (loc) {
    map.flyTo({
      center: [loc.lng, loc.lat],
      zoom: 17
    });
    followTarget = String(userId);
    followMode = true;
    const btn = document.getElementById("btn-recenter");
    if (btn) btn.classList.remove("active");
  } else {
    toast("Rider location not currently available", "warn");
  }
};
