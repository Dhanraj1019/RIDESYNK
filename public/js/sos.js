(function () {
  "use strict";

  const SOS_MESSAGE = "SOS Alert: A rider needs help. Please contact them immediately.";
  const triggerWrap = document.querySelector("[data-sos-rideid][data-sos-userid]");
  const panelWrap = document.querySelector("[data-sos-panel][data-sos-rideid][data-sos-userid]");

  if (!triggerWrap && !panelWrap) {
    return;
  }

  const rideId = (panelWrap || triggerWrap).dataset.sosRideid;
  const userId = (panelWrap || triggerWrap).dataset.sosUserid;

  const triggerBtn = document.getElementById("sosTriggerBtn");
  const errorText = document.getElementById("sosErrorText");
  const overlay = document.getElementById("sosOverlay");
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

  function showError(message) {
    if (!errorText) return;
    errorText.textContent = message;
    setTimeout(() => {
      if (errorText.textContent === message) {
        errorText.textContent = "";
      }
    }, 3500);
  }

  function setLoading(state) {
    if (!triggerBtn) return;
    triggerBtn.disabled = state;
    triggerBtn.classList.toggle("loading", state);
  }

  function openOverlay() {
    if (!overlay || !countdownEl) return;
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

  async function sendSOS() {
    if (!rideId) return;

    setLoading(true);
    const { response, data } = await api("/sos/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rideId })
    });
    setLoading(false);

    if (!response.ok || !data.success) {
      if (data.message === "SOS already active") {
        showError("SOS already active");
      } else {
        showError("Failed to send SOS");
      }
      return;
    }

    beepAndVibrate();
    fetchState();
  }

  function startCountdown() {
    openOverlay();
    timer = setInterval(async () => {
      counter -= 1;
      if (countdownEl) {
        countdownEl.textContent = String(Math.max(counter, 0));
      }

      if (counter <= 0) {
        closeOverlay();
        await sendSOS();
      }
    }, 1000);
  }

  if (triggerBtn) {
    triggerBtn.addEventListener("click", startCountdown);
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", closeOverlay);
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", fetchState);
  }

  if (typeof window.io === "function") {
    const socket = window.io();

    socket.on("connect", () => {
      socket.emit("join:ride", { rideId, userId });
    });

    socket.on("sos:created", (payload) => {
      if (!payload || String(payload.rideId) !== String(rideId)) return;
      fetchState();
      if (String(payload.sos && payload.sos.userId) !== String(userId)) {
        window.alert(SOS_MESSAGE);
      }
    });

    socket.on("sos:resolved", (payload) => {
      if (!payload || String(payload.rideId) !== String(rideId)) return;
      fetchState();
    });

    window.addEventListener("beforeunload", () => {
      socket.emit("leave:ride", { rideId, userId });
      socket.disconnect();
    });
  } else {
    pollInterval = setInterval(fetchState, 20000);
  }

  window.addEventListener("beforeunload", () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  });

  fetchState();
})();
