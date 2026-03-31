(function () {
  "use strict";

  const SOS_MESSAGE = "SOS Alert: A rider needs help. Please contact them immediately.";
  const triggerWrap = document.querySelector("[data-sos-rideid][data-sos-userid]");
  const panelWrap = document.querySelector("[data-sos-panel][data-sos-rideid][data-sos-userid]");
  const routeCard = document.getElementById("routeCard");

  const rideId = String(
    (panelWrap && panelWrap.dataset.sosRideid) ||
      (triggerWrap && triggerWrap.dataset.sosRideid) ||
      (routeCard && routeCard.dataset.rideid) ||
      (window.rideData && window.rideData._id) ||
      ""
  ).trim();

  const userId = String(
    (panelWrap && panelWrap.dataset.sosUserid) ||
      (triggerWrap && triggerWrap.dataset.sosUserid) ||
      (routeCard && routeCard.dataset.currentuserid) ||
      window.userid ||
      ""
  ).trim();

  if (!rideId || !userId) return;

  const triggerBtn = document.getElementById("sosTriggerBtn");
  const errorText = document.getElementById("sosErrorText");
  const overlay = document.getElementById("sosOverlay");
  const overlayTitle = overlay ? overlay.querySelector("h2") : null;
  const overlayDesc = overlay ? overlay.querySelector("p") : null;
  const countdownEl = document.getElementById("sosCountdown");
  const cancelBtn = document.getElementById("sosCancelBtn");

  const refreshBtn = document.getElementById("sosRefreshBtn");
  const activeList = document.getElementById("sosActiveList");
  const resolvedList = document.getElementById("sosResolvedList");
  const activeEmpty = document.getElementById("sosActiveEmpty");
  const resolvedEmpty = document.getElementById("sosResolvedEmpty");

  let timer = null;
  let counter = 5;
  let pollInterval = null;
  let activeSosPopupId = "";
  let pendingSOSLocation = null;
  let permissionModalResolver = null;

  function showError(message) {
    if (!errorText) return;
    errorText.textContent = message;
    setTimeout(() => {
      if (errorText.textContent === message) {
        errorText.textContent = "";
      }
    }, 3500);
  }

  function showLocationErrorModal(message) {
    let modal = document.getElementById("sosLocationErrorModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "sosLocationErrorModal";
      modal.className = "sos-location-modal";
      modal.setAttribute("aria-hidden", "true");
      modal.innerHTML = `
        <div class="sos-location-card" role="dialog" aria-modal="true">
          <h3>Location Required</h3>
          <p id="sosLocationErrorText">Location fetch failed</p>
          <div class="sos-location-actions single">
            <button type="button" id="sosLocationErrorClose" class="sos-location-btn cancel">OK</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const closeBtn = document.getElementById("sosLocationErrorClose");
      if (closeBtn) {
        closeBtn.addEventListener("click", () => {
          modal.classList.remove("visible");
          modal.setAttribute("aria-hidden", "true");
        });
      }
    }

    const textNode = document.getElementById("sosLocationErrorText");
    if (textNode) textNode.textContent = message || "Location fetch failed";
    modal.classList.add("visible");
    modal.setAttribute("aria-hidden", "false");
  }

  function setLoading(state) {
    if (!triggerBtn) return;
    triggerBtn.disabled = state;
    triggerBtn.classList.toggle("loading", state);
  }

  function openOverlay() {
    if (!overlay || !countdownEl) return;
    if (overlayTitle) overlayTitle.textContent = "SOS ACTIVATED";
    if (overlayDesc) overlayDesc.textContent = "Alert will be sent automatically in";
    counter = 5;
    countdownEl.textContent = String(counter);
    overlay.classList.add("visible");
    overlay.setAttribute("aria-hidden", "false");
  }

  function closeOverlay() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (!overlay) return;
    overlay.classList.remove("visible");
    overlay.setAttribute("aria-hidden", "true");
  }

  function ensureSOSPopup() {
    let root = document.getElementById("sosRealtimeModal");
    if (root) return root;

    root = document.createElement("div");
    root.id = "sosRealtimeModal";
    root.className = "sos-realtime-modal";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = `
      <div class="sos-realtime-card" role="alertdialog" aria-live="assertive" aria-modal="true">
        <h3>🚨 SOS Alert</h3>
        <p id="sosRealtimeMsg">A rider needs help</p>
        <p id="sosRealtimeUser" class="sos-realtime-user"></p>
        <p id="sosRealtimeLocation" class="sos-realtime-location"></p>
        <p id="sosRealtimeCoordinates" class="sos-realtime-coordinates"></p>
        <div class="sos-realtime-actions">
          <button type="button" id="sosContactBtn" class="sos-contact-btn">Contact Rider</button>
          <button type="button" id="sosDismissBtn" class="sos-dismiss-btn">Dismiss</button>
        </div>
      </div>
    `;

    document.body.appendChild(root);

    const dismissBtn = document.getElementById("sosDismissBtn");
    if (dismissBtn) {
      dismissBtn.addEventListener("click", hideSOSPopup);
    }

    root.addEventListener("click", (event) => {
      if (event.target === root) {
        hideSOSPopup();
      }
    });

    return root;
  }

  function hideSOSPopup() {
    const root = document.getElementById("sosRealtimeModal");
    if (!root) return;
    root.classList.remove("visible");
    root.setAttribute("aria-hidden", "true");
    activeSosPopupId = "";
  }

  function showSOSPopup(data) {
    const root = ensureSOSPopup();
    const msgNode = document.getElementById("sosRealtimeMsg");
    const userNode = document.getElementById("sosRealtimeUser");
    const locationNode = document.getElementById("sosRealtimeLocation");
    const coordinatesNode = document.getElementById("sosRealtimeCoordinates");
    const contactBtn = document.getElementById("sosContactBtn");

    const sos = (data && data.sos) || {};
    const riderName = String(sos.userName || data.userName || "").trim();
    const message = String(data.message || SOS_MESSAGE).trim();
    const riderPhone = String(data.phone || "").trim();
    const location = (sos && sos.location) || data.location || null;
    const locationName = String((location && location.address) || data.locationName || "").trim();

    activeSosPopupId = String(sos._id || data.sosId || "");

    if (msgNode) msgNode.textContent = message || SOS_MESSAGE;
    if (userNode) {
      userNode.textContent = riderName ? `Rider: ${riderName}` : "";
      userNode.style.display = riderName ? "block" : "none";
    }

    if (locationNode) {
      const lat = Number(location && location.lat);
      const lng = Number(location && location.lng);
      const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

      if (locationName) {
        locationNode.textContent = `Location: ${locationName}`;
        locationNode.style.display = "block";
      } else {
        locationNode.textContent = "";
        locationNode.style.display = "none";
      }

      if (coordinatesNode) {
        if (hasCoords) {
          coordinatesNode.textContent = `Coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          coordinatesNode.style.display = "block";
        } else {
          coordinatesNode.textContent = "";
          coordinatesNode.style.display = "none";
        }
      }
    }

    if (contactBtn) {
      contactBtn.onclick = () => {
        if (!riderPhone) {
          showError("Contact info unavailable");
          return;
        }
        window.location.href = `tel:${riderPhone}`;
      };
    }

    root.classList.add("visible");
    root.setAttribute("aria-hidden", "false");
  }

  window.showSOSPopup = showSOSPopup;

  function beepAndVibrate() {
    if (navigator && typeof navigator.vibrate === "function") {
      navigator.vibrate([100, 60, 100]);
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.0001;

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.stop(ctx.currentTime + 0.3);
  }

  function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unknown time";
    return date.toLocaleString([], {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function getLocationPermissionState() {
    if (!navigator.permissions || !navigator.permissions.query) {
      return Promise.resolve("prompt");
    }

    return navigator.permissions
      .query({ name: "geolocation" })
      .then((result) => result.state)
      .catch(() => "prompt");
  }

  function getCurrentLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject({ code: 2 });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        reject,
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        }
      );
    });
  }

  function resolvePermissionModal(allowed) {
    const resolver = permissionModalResolver;
    permissionModalResolver = null;

    const modal = document.getElementById("sosPermissionModal");
    if (modal) {
      modal.classList.remove("visible");
      modal.setAttribute("aria-hidden", "true");
    }

    if (resolver) resolver(Boolean(allowed));
  }

  function showPermissionModal() {
    let modal = document.getElementById("sosPermissionModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "sosPermissionModal";
      modal.className = "sos-location-modal";
      modal.setAttribute("aria-hidden", "true");
      modal.innerHTML = `
        <div class="sos-location-card" role="dialog" aria-modal="true">
          <h3>Location Permission</h3>
          <p>SOS requires your location to help others reach you.</p>
          <div class="sos-location-actions">
            <button type="button" id="sosAllowLocationBtn" class="sos-location-btn allow">Allow Location</button>
            <button type="button" id="sosCancelLocationBtn" class="sos-location-btn cancel">Cancel</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const allowBtn = document.getElementById("sosAllowLocationBtn");
      const cancelPermissionBtn = document.getElementById("sosCancelLocationBtn");

      if (allowBtn) {
        allowBtn.addEventListener("click", () => resolvePermissionModal(true));
      }
      if (cancelPermissionBtn) {
        cancelPermissionBtn.addEventListener("click", () => resolvePermissionModal(false));
      }

      modal.addEventListener("click", (event) => {
        if (event.target === modal) {
          resolvePermissionModal(false);
        }
      });
    }

    modal.classList.add("visible");
    modal.setAttribute("aria-hidden", "false");

    return new Promise((resolve) => {
      permissionModalResolver = resolve;
    });
  }

  function showDeniedBlocker(message, onRetry, onClose) {
    let blocker = document.getElementById("sosLocationBlocker");
    if (!blocker) {
      blocker = document.createElement("div");
      blocker.id = "sosLocationBlocker";
      blocker.className = "sos-location-blocker";
      blocker.setAttribute("aria-hidden", "true");
      blocker.innerHTML = `
        <div class="sos-location-card" role="dialog" aria-modal="true">
          <h3>Location Required</h3>
          <p id="sosDeniedText">Location permission is required to send SOS.</p>
          <div class="sos-location-actions">
            <button type="button" id="sosDeniedRetryBtn" class="sos-location-btn allow">Retry</button>
            <button type="button" id="sosDeniedCloseBtn" class="sos-location-btn cancel">Close</button>
          </div>
        </div>
      `;
      document.body.appendChild(blocker);

      const closeBtn = document.getElementById("sosDeniedCloseBtn");
      if (closeBtn) {
        closeBtn.addEventListener("click", () => {
          blocker.classList.remove("visible");
          blocker.setAttribute("aria-hidden", "true");
        });
      }
    }

    const textNode = document.getElementById("sosDeniedText");
    if (textNode) textNode.textContent = message || "Location permission is required to send SOS";

    const retryBtn = document.getElementById("sosDeniedRetryBtn");
    if (retryBtn) {
      retryBtn.onclick = async () => {
        if (typeof onRetry === "function") {
          await onRetry();
        }
      };
    }

    const closeBtn = document.getElementById("sosDeniedCloseBtn");
    if (closeBtn) {
      closeBtn.onclick = () => {
        blocker.classList.remove("visible");
        blocker.setAttribute("aria-hidden", "true");
        if (typeof onClose === "function") {
          onClose();
        }
      };
    }

    blocker.classList.add("visible");
    blocker.setAttribute("aria-hidden", "false");
  }

  async function resolveSOSLocation() {
    const permission = await getLocationPermissionState();

    if (permission === "granted") {
      try {
        return await getCurrentLocation();
      } catch (err) {
        showLocationErrorModal("Unable to fetch location");
        return null;
      }
    }

    if (permission === "prompt") {
      const allow = await showPermissionModal();
      if (!allow) return null;

      try {
        return await getCurrentLocation();
      } catch (err) {
        showLocationErrorModal("Location is required to send SOS");
        return null;
      }
    }

    return new Promise((resolve) => {
      showDeniedBlocker("Location permission is required to send SOS", async () => {
        try {
          const loc = await getCurrentLocation();
          const blocker = document.getElementById("sosLocationBlocker");
          if (blocker) {
            blocker.classList.remove("visible");
            blocker.setAttribute("aria-hidden", "true");
          }
          resolve(loc);
        } catch (err) {
          showLocationErrorModal("Turn on GPS to send SOS");
          resolve(null);
        }
      }, () => resolve(null));
    });
  }

  async function api(url, options) {
    const response = await fetch(url, options);
    let data = {};
    try {
      data = await response.json();
    } catch (error) {
      data = {};
    }
    return { response, data };
  }

  async function fetchState() {
    if (!activeList || !resolvedList || !activeEmpty || !resolvedEmpty || !rideId) {
      return;
    }

    const { response, data } = await api(`/sos/ride/${rideId}`, { method: "GET" });
    if (!response.ok || !data.success) {
      showError("Failed to send SOS");
      return;
    }

    renderState(data.active || [], data.resolved || []);
  }

  function createCard(item, isActive) {
    const card = document.createElement("div");
    card.className = `sos-card${isActive ? " active" : ""}`;

    card.innerHTML = `
      <div class="sos-row">
        <div>
          <p class="sos-name">${item.userName || "Unknown rider"}</p>
          <p class="sos-time">${formatTime(item.createdAt)}</p>
        </div>
        <span class="sos-status ${isActive ? "active" : "resolved"}">${isActive ? "active" : "resolved"}</span>
      </div>
    `;

    if (isActive) {
      const resolveBtn = document.createElement("button");
      resolveBtn.className = "sos-resolve-btn";
      resolveBtn.type = "button";
      resolveBtn.textContent = "Mark as Resolved";
      resolveBtn.addEventListener("click", async () => {
        resolveBtn.disabled = true;
        const { response, data } = await api(`/sos/resolve/${item._id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });

        if (!response.ok || !data.success) {
          resolveBtn.disabled = false;
          showError("Failed to send SOS");
          return;
        }

        fetchState();
      });
      card.appendChild(resolveBtn);
    } else if (item.resolvedAt) {
      const resolvedTime = document.createElement("p");
      resolvedTime.className = "sos-time";
      resolvedTime.textContent = `Resolved: ${formatTime(item.resolvedAt)}`;
      card.appendChild(resolvedTime);
    }

    return card;
  }

  function renderState(active, resolved) {
    if (!activeList || !resolvedList || !activeEmpty || !resolvedEmpty) return;

    activeList.innerHTML = "";
    resolvedList.innerHTML = "";

    active.forEach((item) => {
      activeList.appendChild(createCard(item, true));
    });

    resolved.forEach((item) => {
      resolvedList.appendChild(createCard(item, false));
    });

    activeEmpty.style.display = active.length ? "none" : "block";
    resolvedEmpty.style.display = resolved.length ? "none" : "block";

    const ownActive = active.some((item) => String(item.userId) === String(userId));
    if (triggerBtn) {
      triggerBtn.classList.toggle("active-state", ownActive);
    }
  }

  async function sendSOS(location) {
    if (!rideId || !location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
      showLocationErrorModal("Location fetch failed");
      return;
    }

    setLoading(true);
    const { response, data } = await api("/sos/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        rideId,
        location: {
          lat: location.lat,
          lng: location.lng
        }
      })
    });
    setLoading(false);

    if (!response.ok || !data.success) {
      if (data.message === "SOS already active") {
        showError("SOS already active");
      } else {
        showLocationErrorModal(data.message || "Failed to send SOS");
      }
      return;
    }

    beepAndVibrate();
    fetchState();

    if (!window.ridesynkSocket || !window.ridesynkSocket.connected) {
      showSOSPopup({
        message: SOS_MESSAGE,
        location: {
          lat: location.lat,
          lng: location.lng
        },
        sos: {
          _id: data && data.sos && data.sos._id,
          userId,
          userName: "You",
          location: {
            lat: location.lat,
            lng: location.lng
          }
        }
      });
    }
  }

  function startCountdown(location) {
    pendingSOSLocation = location;
    openOverlay();
    timer = setInterval(async () => {
      counter -= 1;
      if (countdownEl) {
        countdownEl.textContent = String(Math.max(counter, 0));
      }

      if (counter <= 0) {
        closeOverlay();
        await sendSOS(pendingSOSLocation);
        pendingSOSLocation = null;
      }
    }, 1000);
  }

  if (triggerBtn) {
    triggerBtn.addEventListener("click", async () => {
      setLoading(true);
      const location = await resolveSOSLocation();
      setLoading(false);
      if (!location) return;
      startCountdown(location);
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", closeOverlay);
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", fetchState);
  }

  const socket = window.ridesynkSocket || (typeof window.io === "function" ? window.io() : null);
  const usingSharedSocket = Boolean(window.ridesynkSocket);

  if (socket) {

    const onConnect = () => {
      socket.emit("join:ride", { rideId, userId });
      fetchState();
    };

    const onSOSTriggered = (payload) => {
      if (!payload || String(payload.rideId) !== String(rideId)) return;
      fetchState();
      showSOSPopup(payload);
      if (String(payload.sos && payload.sos.userId) !== String(userId)) {
        beepAndVibrate();
      }
    };

    const onSOSResolved = (payload) => {
      if (!payload || String(payload.rideId) !== String(rideId)) return;
      fetchState();

      const resolvedId = String(payload.sosId || (payload.sos && payload.sos._id) || "");
      if (!resolvedId || !activeSosPopupId || resolvedId === activeSosPopupId) {
        hideSOSPopup();
      }
    };

    const onSocketError = () => {
      showError("Connection lost");
    };

    socket.on("connect", onConnect);
    socket.on("sos:triggered", onSOSTriggered);
    socket.on("sos:created", onSOSTriggered);
    socket.on("sos:resolved", onSOSResolved);
    socket.on("disconnect", onSocketError);
    socket.on("connect_error", onSocketError);
    socket.on("sos:error", (payload) => {
      const message = payload && payload.message ? payload.message : "Connection lost";
      showError(message);
    });

    if (socket.connected) {
      onConnect();
    }

    window.addEventListener("beforeunload", () => {
      socket.emit("leave:ride", { rideId, userId });
      if (!usingSharedSocket) {
        socket.disconnect();
      }
    });
  } else {
    pollInterval = setInterval(fetchState, 20000);
    showError("Connection lost");
  }

  window.addEventListener("beforeunload", () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  });

  fetchState();
})();
