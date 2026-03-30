(function () {
  "use strict";

  const LOAD_PROMPT_SEEN_KEY = "rs_loc_prompt_seen";

  const DEFAULT_GEO_OPTIONS = {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 5000
  };

  const state = {
    permission: "unknown",
    lastKnownLocation: null,
    promptResolver: null
  };

  function ensureUI() {
    if (!document.getElementById("rsLocationModal")) {
      const modal = document.createElement("div");
      modal.id = "rsLocationModal";
      modal.className = "rs-loc-modal";
      modal.setAttribute("aria-hidden", "true");
      modal.innerHTML = [
        '<div class="rs-loc-card" role="dialog" aria-modal="true" aria-live="polite">',
        "<h3>Enable Location</h3>",
        "<p>Allow location access for better ride tracking.</p>",
        '<div class="rs-loc-actions">',
        '<button type="button" id="rsLocAllowBtn" class="rs-loc-btn allow">Allow</button>',
        '<button type="button" id="rsLocSkipBtn" class="rs-loc-btn skip">Skip</button>',
        "</div>",
        "</div>"
      ].join("");
      document.body.appendChild(modal);

      const allowBtn = document.getElementById("rsLocAllowBtn");
      const skipBtn = document.getElementById("rsLocSkipBtn");
      allowBtn.addEventListener("click", () => resolvePrompt(true));
      skipBtn.addEventListener("click", () => resolvePrompt(false));
      modal.addEventListener("click", (event) => {
        if (event.target === modal) resolvePrompt(false);
      });
    }

    if (!document.getElementById("rsLocationToast")) {
      const toast = document.createElement("div");
      toast.id = "rsLocationToast";
      toast.className = "rs-loc-toast";
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }

    if (!document.getElementById("rsLocationBlocker")) {
      const blocker = document.createElement("div");
      blocker.id = "rsLocationBlocker";
      blocker.className = "rs-loc-blocker";
      blocker.setAttribute("aria-hidden", "true");
      blocker.innerHTML = [
        '<div class="rs-loc-blocker-card" role="dialog" aria-modal="true">',
        '<h3 id="rsLocBlockerTitle">Location access is required</h3>',
        '<p id="rsLocBlockerMessage">Please enable location permission to continue.</p>',
        '<div class="rs-loc-actions">',
        '<button type="button" id="rsLocRetryBtn" class="rs-loc-btn retry">Retry</button>',
        '<button type="button" id="rsLocDismissBtn" class="rs-loc-btn dismiss">Dismiss</button>',
        "</div>",
        "</div>"
      ].join("");
      document.body.appendChild(blocker);

      const dismissBtn = document.getElementById("rsLocDismissBtn");
      dismissBtn.addEventListener("click", hideBlocker);
    }
  }

  function resolvePrompt(allowed) {
    const resolver = state.promptResolver;
    state.promptResolver = null;
    hidePrompt();
    if (resolver) resolver(Boolean(allowed));
  }

  function showPrompt() {
    ensureUI();
    const modal = document.getElementById("rsLocationModal");
    modal.classList.add("visible");
    modal.setAttribute("aria-hidden", "false");
  }

  function hidePrompt() {
    const modal = document.getElementById("rsLocationModal");
    if (!modal) return;
    modal.classList.remove("visible");
    modal.setAttribute("aria-hidden", "true");
  }

  function showToast(message, durationMs) {
    ensureUI();
    const toast = document.getElementById("rsLocationToast");
    if (!toast) return;
    toast.textContent = message || "Unable to fetch location";
    toast.classList.add("visible");
    setTimeout(() => {
      toast.classList.remove("visible");
    }, Number(durationMs) || 3200);
  }

  function showLoadingToast(message) {
    ensureUI();
    const toast = document.getElementById("rsLocationToast");
    if (!toast) return;
    toast.innerHTML = `<span class="rs-loc-spinner" aria-hidden="true"></span>${message || "Fetching location..."}`;
    toast.classList.add("visible");
  }

  function hideLoadingToast() {
    const toast = document.getElementById("rsLocationToast");
    if (!toast) return;
    toast.classList.remove("visible");
    toast.textContent = "";
  }

  function showBlocker(message, onRetry) {
    ensureUI();
    const blocker = document.getElementById("rsLocationBlocker");
    const msgNode = document.getElementById("rsLocBlockerMessage");
    const retryBtn = document.getElementById("rsLocRetryBtn");

    if (msgNode) {
      msgNode.textContent = message || "Please enable location permission to continue.";
    }

    if (retryBtn) {
      retryBtn.onclick = async () => {
        if (typeof onRetry === "function") {
          await onRetry();
        }
      };
    }

    blocker.classList.add("visible");
    blocker.setAttribute("aria-hidden", "false");
  }

  function hideBlocker() {
    const blocker = document.getElementById("rsLocationBlocker");
    if (!blocker) return;
    blocker.classList.remove("visible");
    blocker.setAttribute("aria-hidden", "true");
  }

  function getFriendlyGeoError(err) {
    if (!err) return "Unable to fetch location";
    if (err.code === 1) return "Location permission denied";
    if (err.code === 2) return "Unable to fetch location";
    if (err.code === 3) return "Turn on GPS for better accuracy";
    return "Unable to fetch location";
  }

  function requestCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation unavailable"));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          state.lastKnownLocation = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: Date.now()
          };
          resolve(state.lastKnownLocation);
        },
        reject,
        DEFAULT_GEO_OPTIONS
      );
    });
  }

  async function queryPermission() {
    if (!navigator.permissions || !navigator.permissions.query) {
      state.permission = "prompt";
      return state.permission;
    }

    try {
      const status = await navigator.permissions.query({ name: "geolocation" });
      state.permission = status.state;
      status.onchange = () => {
        state.permission = status.state;
      };
      return status.state;
    } catch (error) {
      state.permission = "prompt";
      return state.permission;
    }
  }

  async function askAllowOrSkip() {
    showPrompt();
    return new Promise((resolve) => {
      state.promptResolver = resolve;
    });
  }

  async function initialPermissionCheck() {
    const permission = await queryPermission();

    if (permission === "granted") {
      try {
        await requestCurrentPosition();
      } catch (error) {
        showToast(getFriendlyGeoError(error));
      }
      return;
    }

    if (permission === "prompt") {
      if (sessionStorage.getItem(LOAD_PROMPT_SEEN_KEY) === "1") {
        return;
      }

      sessionStorage.setItem(LOAD_PROMPT_SEEN_KEY, "1");
      const allowed = await askAllowOrSkip();
      if (!allowed) return;

      showLoadingToast("Fetching location...");
      try {
        await requestCurrentPosition();
      } catch (error) {
        showToast(getFriendlyGeoError(error));
      } finally {
        hideLoadingToast();
      }
      return;
    }

    showToast("Location access denied. You can enable it in browser settings.");
  }

  async function ensurePermissionForLiveTracking(onGranted) {
    const permission = await queryPermission();

    if (permission === "granted") {
      if (typeof onGranted === "function") onGranted();
      return true;
    }

    if (permission === "prompt") {
      showLoadingToast("Fetching location...");
      try {
        await requestCurrentPosition();
        hideLoadingToast();
        if (typeof onGranted === "function") onGranted();
        return true;
      } catch (error) {
        hideLoadingToast();
        if (error && error.code === 1) {
          showToast("Location is required to use live tracking");
        } else {
          showToast(getFriendlyGeoError(error));
        }
        return false;
      }
    }

    showBlocker("Please enable location permission to continue", async () => {
      const status = await queryPermission();
      if (status === "granted") {
        hideBlocker();
        if (typeof onGranted === "function") onGranted();
      } else {
        showToast("Location access denied. You can enable it in browser settings.");
      }
    });
    return false;
  }

  function attachTrackLiveButtons() {
    const buttons = document.querySelectorAll(".js-track-live[data-live-url]");
    buttons.forEach((button) => {
      if (button.dataset.locBound === "1") return;
      button.dataset.locBound = "1";

      button.addEventListener("click", async (event) => {
        event.preventDefault();
        const targetUrl = button.dataset.liveUrl;
        if (!targetUrl) return;

        await ensurePermissionForLiveTracking(() => {
          window.location.href = targetUrl;
        });
      });
    });
  }

  window.RideSyncLocationPermission = {
    queryPermission,
    requestCurrentPosition,
    ensurePermissionForLiveTracking,
    showToast,
    showBlocker,
    hideBlocker,
    getState: () => ({ ...state })
  };

  document.addEventListener("DOMContentLoaded", () => {
    ensureUI();
    attachTrackLiveButtons();
  });
})();
