/* ═══════════════════════════════════════════════════════════════
   socket.js
   – Single socket.io connection  (relative URL — works any host/port)
   – Handles: joinRide, live GPS location + heading, chat
   – Calls window.updateUserMarker / window.removeUser (from map_page.js)
   ═══════════════════════════════════════════════════════════════ */

const socket = io();   // relative URL — no hardcoded localhost
window.ridesyncSocket = socket;
const ride_id = rideData._id;

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
  startLiveLocation();
});
socket.on('disconnect', () => console.log('Socket disconnected'));

function updateActiveUsersCounter({ activeCount, totalCount }) {
  const activeEl = document.getElementById('activeUsersCount');
  const totalEl = document.getElementById('totalUsersCount');
  if (activeEl && Number.isFinite(Number(activeCount))) {
    activeEl.textContent = String(activeCount);
  }
  if (totalEl && Number.isFinite(Number(totalCount))) {
    totalEl.textContent = String(totalCount);
  }
}

socket.on('ride:activeUsers:update', updateActiveUsersCounter);

// ── GPS tracking ─────────────────────────────────────────────────────
let watchId = null;

function showLocationMessage(message) {
  if (window.RideSyncLocationPermission && typeof window.RideSyncLocationPermission.showToast === 'function') {
    window.RideSyncLocationPermission.showToast(message);
  } else {
    console.warn(message);
  }
}

async function ensureTrackingPermission() {
  if (!window.RideSyncLocationPermission || typeof window.RideSyncLocationPermission.queryPermission !== 'function') {
    return true;
  }

  const status = await window.RideSyncLocationPermission.queryPermission();
  if (status === 'granted') {
    return true;
  }

  showLocationMessage('Location access is required');
  return false;
}

async function startLiveLocation() {
  if (!navigator.geolocation) { console.warn('Geolocation not supported'); return; }
  const allowed = await ensureTrackingPermission();
  if (!allowed) return;

  const tracker = window.RideTrackingModule || window.RideDistanceTracker;
  if (tracker && typeof tracker.start === 'function') {
    tracker.start();
  }

  if (watchId !== null) navigator.geolocation.clearWatch(watchId);

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      // Device compass heading (null if unavailable — map_page.js handles it)
      const heading = pos.coords.heading;
      const speed = pos.coords.speed;

      // Broadcast to other riders in this room.
      const payload = { rideId: ride_id, userId: userid, lat, lng, heading, speed };
      socket.emit('location:update', payload);

      const tracker = window.RideTrackingModule || window.RideDistanceTracker;
      if (tracker && typeof tracker.onPositionUpdate === 'function') {
        tracker.onPositionUpdate({
          lat,
          lng,
          speed,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp || Date.now()
        });
      } else if (tracker && typeof tracker.onPosition === 'function') {
        tracker.onPosition({
          lat,
          lng,
          speed,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp || Date.now()
        });
      }

      // Render my own vehicle marker on my own map
      if (typeof window.updateUserMarker === 'function') {
        window.updateUserMarker(userid, lat, lng, heading, speed);
      }
    },
    (err) => {
      if (err && err.code === 1) showLocationMessage('Location permission denied');
      else if (err && err.code === 2) showLocationMessage('Unable to fetch location');
      else if (err && err.code === 3) showLocationMessage('Turn on GPS for better accuracy');
      else showLocationMessage('Unable to fetch location');
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
  );
}

// ── Receive other riders' locations ──────────────────────────────────
function onRemoteLocationUpdate({ userId, lat, lng, heading, speed }) {
  if (String(userId) === String(userid)) return; // skip own echo
  if (typeof window.updateUserMarker === 'function') {
    window.updateUserMarker(userId, lat, lng, heading, speed);
  }
}

socket.on('location:update', onRemoteLocationUpdate);
socket.on('receiveLocation', onRemoteLocationUpdate);

socket.on('location:sync', (locations) => {
  if (!Array.isArray(locations)) return;
  locations.forEach((item) => onRemoteLocationUpdate(item));
});

// ── Rider left ────────────────────────────────────────────────────────
function removeRemoteUser({ userId }) {
  if (typeof window.removeUser === 'function') window.removeUser(userId);
}

socket.on('location:remove', removeRemoteUser);
socket.on('userLeft', removeRemoteUser);

// ── Cleanup ───────────────────────────────────────────────────────────
window.addEventListener('beforeunload', () => {
  socket.emit('leave:ride', { rideId: ride_id, userId: userid });
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  const tracker = window.RideTrackingModule || window.RideDistanceTracker;
  if (tracker && typeof tracker.stop === 'function') {
    tracker.stop({ flush: true });
  }
  socket.disconnect();
});

/* ════════════════════════════════════════════════
   CHAT  (no changes)
   ════════════════════════════════════════════════ */

function scrollToBottom() {
  const chatBox = document.getElementById('chatMessages');
  if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
}

function sendMessage() {
  const input = document.getElementById('chatInput');
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

  const isMe = getSenderId(msg.senderId).toString() === userid.toString();
  const container = document.createElement('div');
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
    const sender = document.createElement('div');
    sender.className = 'msg-sender';
    sender.innerText = msg.senderId.firstname;
    bubble.appendChild(sender);
  }

  const textNode = document.createElement('p');
  textNode.className = 'msg-text';
  textNode.innerText = msg.message;
  bubble.appendChild(textNode);

  const meta = document.createElement('div');
  meta.className = 'msg-meta';

  const timeNode = document.createElement('span');
  timeNode.className = 'msg-time';
  const rawTime = msg.time ?? msg.createdAt ?? msg.timestamp ?? Date.now();
  timeNode.innerText = new Date(rawTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  meta.appendChild(timeNode);

  if (isMe) {
    const ticks = document.createElement('i');
    ticks.className = 'bi bi-check-all ms-1 msg-ticks';
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