/* ═══════════════════════════════════════════════════════════════
   socket.js
   – Single socket.io connection  (relative URL — works any host/port)
   – Handles: joinRide, live GPS location + heading, chat
   – Calls window.updateUserMarker / window.removeUser (from map_page.js)

   MAP CHANGES ONLY (chat is untouched):
     • socket.on('ride:started')  → calls window.onRideStarted()
     • window.emitStartRide()     → admin emits 'admin:startRide' to server
   ═══════════════════════════════════════════════════════════════ */

const socket = io();   // relative URL — no hardcoded localhost
window.ridesynkSocket = socket;
const ride_id = rideData._id;
const liveMemberPresence = new Set();

function getMemberRowByUserId(userId) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return null;

  const rows = document.querySelectorAll('.member-item[data-member-user-id]');
  for (const row of rows) {
    if (String(row.getAttribute('data-member-user-id') || '').trim() === normalizedUserId) {
      return row;
    }
  }
  return null;
}

function setMemberPresence(userId, isOnline) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return;

  const row = getMemberRowByUserId(normalizedUserId);
  if (!row) return;

  const badge = row.querySelector('.member-presence-badge');
  const dot = row.querySelector('.member-presence-dot');
  const isAdmin = badge && badge.classList.contains('is-admin');
  if (isAdmin) return;

  if (badge) {
    badge.classList.remove('mbadge-online', 'mbadge-offline', 'is-online', 'is-offline');
    badge.classList.add(isOnline ? 'mbadge-online' : 'mbadge-offline');
    badge.classList.add(isOnline ? 'is-online' : 'is-offline');
    badge.textContent = isOnline ? 'Online' : 'Offline';
  }

  if (dot) {
    dot.classList.remove('is-online', 'is-offline');
    dot.classList.add(isOnline ? 'is-online' : 'is-offline');
  }
}

function applyPresenceFromSet() {
  document.querySelectorAll('.member-item[data-member-user-id]').forEach((row) => {
    const userId = String(row.getAttribute('data-member-user-id') || '').trim();
    if (!userId) return;
    setMemberPresence(userId, liveMemberPresence.has(userId));
  });
}

function resetPresenceWithIds(activeUserIds) {
  liveMemberPresence.clear();
  if (Array.isArray(activeUserIds)) {
    activeUserIds.forEach((id) => {
      const normalized = String(id || '').trim();
      if (normalized) liveMemberPresence.add(normalized);
    });
  }
  applyPresenceFromSet();
}

// ── Helpers ──────────────────────────────────────────────────────────
function getSenderId(sender) {
  if (!sender) return '';
  if (typeof sender === 'string') return sender;
  return sender._id || '';
}
function getSenderInitial(sender) {
  if (!sender || typeof sender === 'string') return '?';
  return (sender.firstname || '?')[0].toUpperCase();
}

// ── Connect: join ride room + start GPS ──────────────────────────────
socket.on('connect', () => {
  console.log('Socket connected:', socket.id);
  socket.emit('join:ride', { rideId: ride_id, userId: userid });
  liveMemberPresence.add(String(userid));
  setMemberPresence(userid, true);
  startLiveLocation();
});
socket.on('disconnect', () => console.log('Socket disconnected'));

// ── Active-user counter ───────────────────────────────────────────────
function updateActiveUsersCounter({ activeCount, totalCount }) {
  const activeEl = document.getElementById('activeUsersCount');
  const totalEl  = document.getElementById('totalUsersCount');
  if (activeEl && Number.isFinite(Number(activeCount))) activeEl.textContent = String(activeCount);
  if (totalEl  && Number.isFinite(Number(totalCount)))  totalEl.textContent  = String(totalCount);
}
socket.on('ride:activeUsers:update', (payload = {}) => {
  updateActiveUsersCounter(payload);
  resetPresenceWithIds(payload.activeUserIds);
});

// ── GPS tracking ─────────────────────────────────────────────────────
let watchId = null;

function showLocationMessage(message) {
  if (window.RideSynkLocationPermission && typeof window.RideSynkLocationPermission.showToast === 'function') {
    window.RideSynkLocationPermission.showToast(message);
  } else {
    console.warn(message);
  }
}

async function ensureTrackingPermission() {
  if (!window.RideSynkLocationPermission || typeof window.RideSynkLocationPermission.queryPermission !== 'function') {
    return true;
  }
  const status = await window.RideSynkLocationPermission.queryPermission();
  if (status === 'granted') return true;
  showLocationMessage('Location access is required');
  return false;
}

async function startLiveLocation() {
  if (!navigator.geolocation) { console.warn('Geolocation not supported'); return; }
  const allowed = await ensureTrackingPermission();
  if (!allowed) return;

  const tracker = window.RideTrackingModule || window.RideDistanceTracker;
  if (tracker && typeof tracker.start === 'function') tracker.start();

  if (watchId !== null) navigator.geolocation.clearWatch(watchId);

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const lat     = pos.coords.latitude;
      const lng     = pos.coords.longitude;
      const heading = pos.coords.heading;
      const speed   = pos.coords.speed;

      // Broadcast to other riders in this room
      socket.emit('location:update', { rideId: ride_id, userId: userid, lat, lng, heading, speed });

      // Distance tracker integration
      const tracker = window.RideTrackingModule || window.RideDistanceTracker;
      const posPayload = { lat, lng, speed, accuracy: pos.coords.accuracy, timestamp: pos.timestamp || Date.now() };
      if (tracker && typeof tracker.onPositionUpdate === 'function') {
        tracker.onPositionUpdate(posPayload);
      } else if (tracker && typeof tracker.onPosition === 'function') {
        tracker.onPosition(posPayload);
      }

      // Render own vehicle on own map
      if (typeof window.updateUserMarker === 'function') {
        window.updateUserMarker(userid, lat, lng, heading, speed);
      }
    },
    (err) => {
      if      (err && err.code === 1) showLocationMessage('Location permission denied');
      else if (err && err.code === 2) showLocationMessage('Unable to fetch location');
      else if (err && err.code === 3) showLocationMessage('Turn on GPS for better accuracy');
      else                            showLocationMessage('Unable to fetch location');
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
  );
}

// ── Receive other riders' locations ──────────────────────────────────
function onRemoteLocationUpdate({ userId, lat, lng, heading, speed }) {
  if (String(userId) === String(userid)) return;   // skip own echo
  const normalizedUserId = String(userId || '').trim();
  if (normalizedUserId) {
    liveMemberPresence.add(normalizedUserId);
    setMemberPresence(normalizedUserId, true);
  }
  if (typeof window.updateUserMarker === 'function') {
    window.updateUserMarker(userId, lat, lng, heading, speed);
  }
}

socket.on('location:update',  onRemoteLocationUpdate);
socket.on('receiveLocation',  onRemoteLocationUpdate);

socket.on('location:sync', (locations) => {
  if (!Array.isArray(locations)) return;
  locations.forEach(item => onRemoteLocationUpdate(item));
});

// ── Rider left ────────────────────────────────────────────────────────
function removeRemoteUser({ userId }) {
  const normalizedUserId = String(userId || '').trim();
  if (normalizedUserId) {
    liveMemberPresence.delete(normalizedUserId);
    setMemberPresence(normalizedUserId, false);
  }
  if (typeof window.removeUser === 'function') window.removeUser(userId);
}
socket.on('location:remove', removeRemoteUser);
socket.on('userLeft',        removeRemoteUser);

// ══════════════════════════════════════════════════════════════════════
//  RIDE-STATE EVENTS  (new — map only, no chat)
// ══════════════════════════════════════════════════════════════════════

/**
 * Server broadcasts 'ride:started' when the admin clicks "Start Ride".
 * All clients (including the admin) receive this and switch the map
 * from static to dynamic main-route mode.
 */
socket.on('ride:started', () => {
  console.log('[RideSynk] ride:started received from server');
  if (typeof window.onRideStarted === 'function') {
    window.onRideStarted();
  }
});

/**
 * Expose a function the admin's UI button can call.
 * Your EJS template should add:
 *   <button id="btnStartRide" onclick="window.emitStartRide()">Start Ride</button>
 * (Show this button only when current user is admin.)
 */
window.emitStartRide = function emitStartRide() {
  if (!window.ridesynkSocket) return;
  window.ridesynkSocket.emit('admin:startRide', { rideId: ride_id, userId: userid });
  console.log('[RideSynk] admin:startRide emitted');
};

// ── Cleanup ───────────────────────────────────────────────────────────
window.addEventListener('beforeunload', () => {
  socket.emit('leave:ride', { rideId: ride_id, userId: userid });
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  const tracker = window.RideTrackingModule || window.RideDistanceTracker;
  if (tracker && typeof tracker.stop === 'function') tracker.stop({ flush: true });
  socket.disconnect();
});

/* ════════════════════════════════════════════════
   CHAT  — completely unchanged below this line
   ════════════════════════════════════════════════ */

function scrollToBottom() {
  const chatBox = document.getElementById('chatMessages');
  if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
}

function sendMessage() {
  const input   = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');
  const message = input.value.trim();
  if (!message) return;
  input.value = '';
  if (sendBtn) {
    sendBtn.classList.remove('send-burst');
    void sendBtn.offsetWidth;
    sendBtn.classList.add('send-burst');
  }
  socket.emit('sendMessage', { rideId: ride_id, senderId: userid, message });
}

socket.on('receiveMessage', (msg) => {
  const chatTabBtn = document.querySelector('[data-tab="chat"]');
  if (chatTabBtn && !chatTabBtn.classList.contains('active')) chatTabBtn.click();
  if (typeof window.snapTo === 'function') {
    const sheetBody = document.getElementById('sheetBody');
    if (sheetBody && sheetBody.style.display === 'none') window.snapTo('mid');
  }
  showMessage(msg);
});

function showMessage(msg) {
  const chatBox = document.getElementById('chatMessages');
  if (!chatBox) return;

  const isMe       = getSenderId(msg.senderId).toString() === userid.toString();
  const container  = document.createElement('div');
  container.className = `msg-container ${isMe ? 'me' : 'them'} msg-enter`;

  const last = chatBox.lastElementChild;
  if (last && last.classList.contains(isMe ? 'me' : 'them')) {
    container.classList.add('continued');
  }

  if (!isMe) {
    const av = document.createElement('div');
    av.className = 'msg-av av-bg-1';
    av.innerText = getSenderInitial(msg.senderId);
    container.appendChild(av);
  }

  const bubble = document.createElement('div');
  bubble.className = isMe ? 'msg-bubble bubble-me' : 'msg-bubble bubble-them';

  if (!isMe && msg.senderId && msg.senderId.firstname) {
    const sender    = document.createElement('div');
    sender.className = 'msg-sender';
    sender.innerText = msg.senderId.firstname;
    bubble.appendChild(sender);
  }

  const textNode    = document.createElement('p');
  textNode.className = 'msg-text';
  textNode.innerText = msg.message;
  bubble.appendChild(textNode);

  const meta = document.createElement('div');
  meta.className = 'msg-meta';

  const timeNode    = document.createElement('span');
  timeNode.className = 'msg-time';
  const rawTime     = msg.time ?? msg.createdAt ?? msg.timestamp ?? Date.now();
  timeNode.innerText = new Date(rawTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  meta.appendChild(timeNode);

  if (isMe) {
    const ticks     = document.createElement('i');
    ticks.className  = 'bi bi-check-all ms-1 msg-ticks';
    meta.appendChild(ticks);
  }

  bubble.appendChild(meta);
  container.appendChild(bubble);
  chatBox.appendChild(container);
  scrollToBottom();
}

window.addEventListener('load', () => {
  scrollToBottom();
  const chatInput = document.getElementById('chatInput');
  if (!chatInput) return;
  chatInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    sendMessage();
  });
});