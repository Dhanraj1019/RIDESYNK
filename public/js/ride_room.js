let confirmed = false;
let resetTimer = null;

function handleConfirm(btn) {
  if (!confirmed) {
    // First click — ask to confirm
    confirmed = true;
    btn.textContent = '⚠ Tap again to confirm';
    btn.style.background = '#E24B4A';
    btn.style.borderColor = '#E24B4A';
    btn.style.color = '#ffffff';

    // Auto-reset after 3 seconds if user doesn't confirm
    resetTimer = setTimeout(() => {
      confirmed = false;
      btn.textContent = 'Cancel ride';
      btn.style.background = '';
      btn.style.borderColor = '';
      btn.style.color = '';
    }, 3000);

  } else {
    // Second click — confirmed!
    clearTimeout(resetTimer);
    confirmed = false;
    btn.textContent = '✓ Cancelled';
    btn.style.background = '#dcfce7';
    btn.style.borderColor = '#86efac';
    btn.style.color = '#15803d';
    btn.disabled = true;

    // Reset button after 2 seconds
    setTimeout(() => {
      btn.textContent = 'Cancel ride';
      btn.style.background = '';
      btn.style.borderColor = '';
      btn.style.color = '';
      btn.disabled = false;
    }, 2000);
  }
}

// this is new lines add by edit button

document.addEventListener("DOMContentLoaded", () => {
  const routeCard = document.getElementById("routeCard");
  const routeEditBtn = document.getElementById("routeEditBtn");
  const routeViewMode = document.getElementById("routeViewMode");
  const routeEditMode = document.getElementById("routeEditMode");
  const sourceText = document.getElementById("sourceText");
  const destinationText = document.getElementById("destinationText");
  const rideDateText = document.getElementById("rideDateText");
  const rideTimeText = document.getElementById("rideTimeText");
  const sourceInput = document.getElementById("sourceInput");
  const destinationInput = document.getElementById("destinationInput");
  const rideDateInput = document.getElementById("rideDateInput");
  const rideTimeInput = document.getElementById("rideTimeInput");
  const routeSaveBtn = document.getElementById("routeSaveBtn");
  const routeCancelBtn = document.getElementById("routeCancelBtn");
  const routeEditError = document.getElementById("routeEditError");

  if (
    !routeCard ||
    !routeEditBtn ||
    !routeViewMode ||
    !routeEditMode ||
    !sourceText ||
    !destinationText ||
    !rideDateText ||
    !rideTimeText ||
    !sourceInput ||
    !destinationInput ||
    !rideDateInput ||
    !rideTimeInput ||
    !routeSaveBtn ||
    !routeCancelBtn ||
    !routeEditError
  ) {
    return;
  }

  let originalSource = sourceText.textContent.trim();
  let originalDestination = destinationText.textContent.trim();
  let originalRideDate = rideDateText.textContent.trim();
  let originalRideTime = rideTimeText.textContent.trim();
  let originalSourceLocation = {
    lat: sourceInput.dataset.lat,
    lng: sourceInput.dataset.lng
  };
  let originalDestinationLocation = {
    lat: destinationInput.dataset.lat,
    lng: destinationInput.dataset.lng
  };

  function showRouteError(message) {
    routeEditError.textContent = message || "";
    routeEditError.classList.toggle("d-none", !message);
  }

  function getMinRideDateValue() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function isFutureRideDateTime(dateValue, timeValue) {
    if (!dateValue || !timeValue) return false;
    const rideDateTime = new Date(`${dateValue}T${timeValue}`);
    return !Number.isNaN(rideDateTime.getTime()) && rideDateTime > new Date();
  }

  function pickLocation(input, fallback) {
    const lat = input.dataset.coordsLat || input.dataset.lat || fallback.lat;
    const lng = input.dataset.coordsLng || input.dataset.lng || fallback.lng;

    return {
      lat: Number(lat),
      lng: Number(lng)
    };
  }

  function setSaveButtonState() {
    const nextSource = sourceInput.value.trim();
    const nextDestination = destinationInput.value.trim();
    const nextDate = rideDateInput.value.trim();
    const nextTime = rideTimeInput.value.trim();
    routeSaveBtn.disabled = !nextSource || !nextDestination || !nextDate || !nextTime;
  }

  function enterEditMode() {
    sourceInput.value = originalSource;
    destinationInput.value = originalDestination;
    rideDateInput.value = originalRideDate;
    rideTimeInput.value = originalRideTime;
    rideDateInput.min = getMinRideDateValue();
    showRouteError("");

    routeViewMode.classList.add("d-none");
    routeEditMode.classList.remove("d-none");

    setSaveButtonState();
    sourceInput.focus();
  }

  function exitEditMode() {
    routeEditMode.classList.add("d-none");
    routeViewMode.classList.remove("d-none");
  }

  routeEditBtn.addEventListener("click", enterEditMode);

  routeCancelBtn.addEventListener("click", () => {
    sourceInput.value = originalSource;
    destinationInput.value = originalDestination;
    rideDateInput.value = originalRideDate;
    rideTimeInput.value = originalRideTime;
    showRouteError("");
    exitEditMode();
  });

  routeSaveBtn.addEventListener("click", async () => {
    const nextSource = sourceInput.value.trim();
    const nextDestination = destinationInput.value.trim();
    const nextRideDate = rideDateInput.value.trim();
    const nextRideTime = rideTimeInput.value.trim();
    const rideId = routeCard.dataset.rideid;

    if (!nextSource || !nextDestination || !nextRideDate || !nextRideTime || !rideId) {
      showRouteError("Source, destination, date and time are required.");
      setSaveButtonState();
      return;
    }

    if (!isFutureRideDateTime(nextRideDate, nextRideTime)) {
      showRouteError("Please select a future date and time.");
      setSaveButtonState();
      return;
    }

    const sorceLocation = pickLocation(sourceInput, originalSourceLocation);
    const destinationLocation = pickLocation(destinationInput, originalDestinationLocation);

    if (
      !Number.isFinite(sorceLocation.lat) ||
      !Number.isFinite(sorceLocation.lng) ||
      !Number.isFinite(destinationLocation.lat) ||
      !Number.isFinite(destinationLocation.lng)
    ) {
      showRouteError("Please select valid source and destination locations.");
      setSaveButtonState();
      return;
    }

    showRouteError("");
    routeSaveBtn.disabled = true;

    try {
      const response = await fetch(`/ridesynk/ride/update-location/${rideId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sorce: nextSource,
          destination: nextDestination,
          date: nextRideDate,
          time: nextRideTime,
          sorceLocation,
          destinationLocation
        })
      });

      if (!response.ok) {
        let payload = null;
        try {
          payload = await response.json();
        } catch (_) {
          payload = null;
        }
        showRouteError((payload && payload.message) || "Unable to update ride details.");
        setSaveButtonState();
        return;
      }
    } catch (error) {
      showRouteError("Unable to update ride details.");
      setSaveButtonState();
      return;
    }

    sourceText.textContent = nextSource;
    destinationText.textContent = nextDestination;
    rideDateText.textContent = nextRideDate;
    rideTimeText.textContent = nextRideTime;

    originalSource = nextSource;
    originalDestination = nextDestination;
    originalRideDate = nextRideDate;
    originalRideTime = nextRideTime;
    originalSourceLocation = sorceLocation;
    originalDestinationLocation = destinationLocation;

    sourceInput.dataset.lat = String(sorceLocation.lat);
    sourceInput.dataset.lng = String(sorceLocation.lng);
    destinationInput.dataset.lat = String(destinationLocation.lat);
    destinationInput.dataset.lng = String(destinationLocation.lng);

    exitEditMode();

    window.location.href = `/ridesynk/rideroom/${rideId}`;
  });

  sourceInput.addEventListener("input", setSaveButtonState);
  destinationInput.addEventListener("input", setSaveButtonState);
  rideDateInput.addEventListener("input", () => {
    showRouteError("");
    setSaveButtonState();
  });
  rideTimeInput.addEventListener("input", () => {
    showRouteError("");
    setSaveButtonState();
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const shareRideBtn = document.getElementById("shareRideBtn");
  const shareContainer = document.getElementById("shareContainer");
  const shareCloseBtn = document.getElementById("shareCloseBtn");
  const inviteLinkInput = document.getElementById("inviteLinkInput");
  const copyInviteLinkBtn = document.getElementById("copyInviteLinkBtn");
  const shareCopyPrimaryBtn = document.getElementById("shareCopyPrimaryBtn");
  const nativeShareBtn = document.getElementById("nativeShareBtn");
  const shareFeedback = document.getElementById("shareFeedback");

  if (!shareRideBtn || !shareContainer || !inviteLinkInput || !copyInviteLinkBtn || !shareCopyPrimaryBtn || !nativeShareBtn || !shareFeedback) {
    return;
  }

  if (navigator.share) {
    nativeShareBtn.style.display = "inline-flex";
  }

  let cachedInviteLink = "";

  function setShareFeedback(message, isError = false) {
    shareFeedback.textContent = message || "";
    shareFeedback.style.color = isError ? "#dc2626" : "#16a34a";
  }

  async function copyCurrentInviteLink() {
    if (!inviteLinkInput.value) return;
    try {
      await navigator.clipboard.writeText(inviteLinkInput.value);
      setShareFeedback("Copied!");
    } catch (error) {
      inviteLinkInput.select();
      document.execCommand("copy");
      setShareFeedback("Copied!");
    }
  }

  shareCloseBtn.addEventListener("click", () => {
    shareContainer.classList.remove("active");
    shareContainer.setAttribute("aria-hidden", "true");
  });

  shareRideBtn.addEventListener("click", async () => {
    const rideId = shareRideBtn.dataset.rideid;
    if (!rideId) return;

    if (cachedInviteLink) {
      inviteLinkInput.value = cachedInviteLink;
      shareContainer.classList.toggle("active");
      shareContainer.setAttribute("aria-hidden", shareContainer.classList.contains("active") ? "false" : "true");
      return;
    }

    const originalLabel = shareRideBtn.innerHTML;
    shareRideBtn.disabled = true;
    shareRideBtn.textContent = "Generating...";
    setShareFeedback("");

    try {
      const response = await fetch(`/api/invite/create/${rideId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });

      const data = await response.json();
      if (!response.ok || !data.success || !data.inviteLink) {
        setShareFeedback("Unable to generate invite link", true);
        shareRideBtn.innerHTML = originalLabel;
        shareRideBtn.disabled = false;
        return;
      }

      cachedInviteLink = data.inviteLink;
      inviteLinkInput.value = data.inviteLink;
      shareContainer.classList.add("active");
      shareContainer.setAttribute("aria-hidden", "false");
      setShareFeedback("Link ready to share");
      shareRideBtn.innerHTML = originalLabel;
      shareRideBtn.disabled = false;
    } catch (error) {
      setShareFeedback("Unable to generate invite link", true);
      shareRideBtn.innerHTML = originalLabel;
      shareRideBtn.disabled = false;
    }
  });

  copyInviteLinkBtn.addEventListener("click", copyCurrentInviteLink);
  shareCopyPrimaryBtn.addEventListener("click", copyCurrentInviteLink);

  nativeShareBtn.addEventListener("click", async () => {
    if (!navigator.share || !inviteLinkInput.value) return;
    try {
      await navigator.share({
        title: "Ride Invite",
        text: "Join my ride using this link",
        url: inviteLinkInput.value
      });
      setShareFeedback("Shared successfully");
    } catch (error) {
      if (error && error.name !== "AbortError") {
        setShareFeedback("Unable to open share dialog", true);
      }
    }
  });
});







/* ══════════════════════════════════════════════════
   MAPBOX PLACE SEARCH — works with your existing HTML
   No HTML changes needed
══════════════════════════════════════════════════ */

const MAPBOX_TOKEN = map_token; // replace with your token

/* ── Debounce helper ── */
function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

/* ── Fetch suggestions from Mapbox Geocoding API ── */
async function fetchSuggestions(query) {
  if (!query || query.trim().length < 2) return [];
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/`
    + `${encodeURIComponent(query.trim())}.json`
    + `?access_token=${MAPBOX_TOKEN}`
    + `&autocomplete=true`
    + `&limit=6`
    + `&language=en`
    + `&country=IN`;          // remove or change for other countries
  try {
    const res  = await fetch(url);
    const data = await res.json();
    return data.features || [];
  } catch (e) {
    console.error('Geocoding failed:', e);
    return [];
  }
}

/* ── Create & position a suggestions dropdown ── */
function createDropdown() {
  const ul = document.createElement('ul');
  ul.style.cssText = `
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 9999;
    background: #fff;
    border: 1.5px solid #e8e9f0;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    list-style: none;
    margin: 4px 0 0;
    padding: 6px 0;
    max-height: 240px;
    overflow-y: auto;
    display: none;
  `;
  return ul;
}

/* ── Render suggestions inside dropdown ── */
function renderSuggestions(features, ul, onSelect) {
  ul.innerHTML = '';

  if (!features.length) {
    ul.innerHTML = `<li style="padding:12px 14px;font-size:13px;color:#8e8fa8;text-align:center">No results found</li>`;
    ul.style.display = 'block';
    return;
  }

  features.forEach(f => {
    const parts   = f.place_name.split(',');
    const name    = parts[0].trim();
    const address = parts.slice(1).join(',').trim();
    const coords  = f.geometry.coordinates; // [lng, lat]

    const li = document.createElement('li');
    li.style.cssText = `
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 14px;
      cursor: pointer;
      transition: background .15s;
    `;
    li.innerHTML = `
      <div style="
        width:28px;height:28px;border-radius:50%;
        background:#ede9ff;display:flex;
        align-items:center;justify-content:center;flex-shrink:0;margin-top:2px
      ">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="#6C63FF"
          xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75
                   7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38
                   0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5
                   2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:#1a1a2e;
                    white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${name}
        </div>
        <div style="font-size:11px;color:#8e8fa8;margin-top:2px;
                    white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${address}
        </div>
      </div>
    `;

    li.addEventListener('mouseenter', () => li.style.background = '#f5f6fa');
    li.addEventListener('mouseleave', () => li.style.background = '');

    li.addEventListener('mousedown', (e) => {
      e.preventDefault(); // prevent input blur before click fires
      onSelect({ name: f.place_name, shortName: name, coords });
      ul.style.display = 'none';
      ul.innerHTML = '';
    });

    ul.appendChild(li);
  });

  ul.style.display = 'block';
}

/* ══════════════════════════════════════════════════
   CORE — attach search to any input element
   input     : the <input> DOM element
   hiddenName: name attr for hidden coord input (optional)
══════════════════════════════════════════════════ */
function attachSearch(input, hiddenName = null) {
  /* Make parent position:relative so dropdown anchors correctly */
  const parent = input.parentElement;
  parent.style.position = 'relative';

  /* Create dropdown and inject after input */
  const ul = createDropdown();
  parent.appendChild(ul);

  /* Optional hidden input to store coordinates for form submission */
  let hiddenInput = null;
  if (hiddenName) {
    hiddenInput = document.createElement('input');
    hiddenInput.type = 'hidden';
    hiddenInput.name = hiddenName;
    parent.appendChild(hiddenInput);
  }

  /* Debounced search */
  const doSearch = debounce(async (query) => {
    if (!query || query.trim().length < 2) {
      ul.style.display = 'none';
      return;
    }
    // Show loading state
    ul.innerHTML = `<li style="padding:12px 14px;font-size:13px;color:#8e8fa8;text-align:center">
      Searching…
    </li>`;
    ul.style.display = 'block';

    const features = await fetchSuggestions(query);
    renderSuggestions(features, ul, ({ name, shortName, coords }) => {
      input.value = shortName;          // fill input with short place name
      if (hiddenInput) {
        hiddenInput.value = JSON.stringify({
          name,
          coordinates: coords           // [lng, lat]  ← stored for backend
        });
      }
      input.dataset.placeName  = name;
      input.dataset.coordsLng  = coords[0];
      input.dataset.coordsLat  = coords[1];
      input.dispatchEvent(new Event('placeselected', { bubbles: true }));
    });
  }, 300);

  input.addEventListener('input', (e) => {
    // Clear stored coords when user edits manually
    delete input.dataset.coordsLng;
    delete input.dataset.coordsLat;
    if (hiddenInput) hiddenInput.value = '';
    doSearch(e.target.value);
  });

  /* Close on outside click */
  document.addEventListener('click', (e) => {
    if (!parent.contains(e.target)) {
      ul.style.display = 'none';
    }
  });

  /* Close on Escape */
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { ul.style.display = 'none'; }
  });
}

/* ══════════════════════════════════════════════════
   ATTACH to your existing Start + Destination inputs
══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  /* Start location input */
  const sourceInput = document.getElementById('sourceInput') || document.querySelector('input[name="ride[sorce]"]');
  if (sourceInput) {
    attachSearch(sourceInput, 'ride[sorcelocation]');
  }

  /* Destination input */
  const destInput = document.getElementById('destinationInput') || document.querySelector('input[name="ride[destination]"]');
  if (destInput) {
    attachSearch(destInput, 'ride[destinationlocation]');
  }

  /* ── Add Stop button ── */
  const stopsContainer = document.getElementById('stops-container');
  const addStopBtn     = document.getElementById('add-stop-btn');
  let   stopCount      = 0;
  const MAX_STOPS      = 3;

  if (!stopsContainer || !addStopBtn) {
    return;
  }

  addStopBtn.addEventListener('click', () => {
    if (stopCount >= MAX_STOPS) return;
    stopCount++;

    const row = document.createElement('div');
    row.className = 'route-row';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '0.5rem';
    row.innerHTML = `
      <div class="pin-dot" style="flex-shrink:0">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
      </div>
      <input class="field-input" type="text"
        name="ride[stops][${stopCount}]"
        placeholder="Stop ${stopCount}" style="flex:1" />
      <button type="button" class="remove-stop-btn" style="
        border:none;background:none;cursor:pointer;
        color:#8e8fa8;font-size:18px;padding:0 4px;line-height:1;
      " title="Remove stop">×</button>
    `;

    /* Attach search to the new stop input */
    const stopInput = row.querySelector('input');
    attachSearch(stopInput, `ride[stoplocations][${stopCount}]`);

    /* Remove stop logic */
    row.querySelector('.remove-stop-btn').addEventListener('click', () => {
      row.remove();
      stopCount--;
      addStopBtn.style.display = stopCount >= MAX_STOPS ? 'none' : '';
    });

    stopsContainer.appendChild(row);
    addStopBtn.style.display = stopCount >= MAX_STOPS ? 'none' : '';

    /* Focus the new input */
    stopInput.focus();
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const sosBtn = document.getElementById("rideRoomSosBtn");
  const overlay = document.getElementById("sosLogsOverlay");
  const closeBtn = document.getElementById("sosLogsCloseBtn");
  const container = document.getElementById("sosLogsContainer");
  const routeCard = document.getElementById("routeCard");

  if (!sosBtn || !overlay || !closeBtn || !container || !routeCard) {
    return;
  }

  const rideId = sosBtn.dataset.rideid || routeCard.dataset.rideid;

  async function fetchAndRenderLogs() {
    try {
      container.innerHTML = '<div class="no-logs">Loading logs...</div>';
      const res = await fetch(`/sos/ride/${rideId}`);
      if (!res.ok) throw new Error("Failed to fetch logs");
      
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Failed to fetch logs");
      
      // Merge active and resolved logs and sort by newest first
      const activeLogs = data.active || [];
      const resolvedLogs = data.resolved || [];
      const allLogs = [...activeLogs, ...resolvedLogs].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );

      container.innerHTML = "";

      if (allLogs.length === 0) {
        container.innerHTML = '<div class="no-logs">No SOS logs found for this ride.</div>';
        return;
      }

      function escapeHtml(text) {
        if (!text) return "";
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }

      allLogs.forEach(log => {
        const isResolved = log.status === "resolved";
        const div = document.createElement("div");
        div.className = "sos-log-item";

        // Build location display string
        let locationStr = "Unknown location";
        if (log.location && log.location.address) {
          locationStr = log.location.address;
        } else if (log.location && typeof log.location.lat === "number" && typeof log.location.lng === "number") {
          locationStr = `${log.location.lat.toFixed(4)}, ${log.location.lng.toFixed(4)}`;
        }

        const resolveContent = isResolved
          ? `
             <div class="log-detail"><strong>✅ Resolved by:</strong> ${escapeHtml(log.resolvedByName || "Unknown")}</div>
             <div class="log-detail"><strong>🕓 Resolved:</strong> ${new Date(log.resolvedAt).toLocaleString()}</div>
             <div class="status-badge resolved">RESOLVED</div>
            `
          : `<div class="status-badge active">ACTIVE</div>`;

        div.innerHTML = `
           <div class="log-header ${isResolved ? "resolved" : "active"}">🚨 SOS ALERT</div>
           <div class="log-detail"><strong>👤 Created by:</strong> ${escapeHtml(log.userName || "Unknown")}</div>
           <div class="log-detail"><strong>📍 Location:</strong> ${escapeHtml(locationStr)}</div>
           <div class="log-detail"><strong>🕒 Created:</strong> ${new Date(log.createdAt).toLocaleString()}</div>
           ${resolveContent}
        `;
        container.appendChild(div);
      });
    } catch (err) {
      console.error(err);
      container.innerHTML = '<div class="no-logs">Error loading SOS logs. Please try again.</div>';
    }
  }

  function openLogsPanel() {
    overlay.classList.remove("d-none");
    overlay.setAttribute("aria-hidden", "false");
    fetchAndRenderLogs();
  }

  function closeLogsPanel() {
    overlay.classList.add("d-none");
    overlay.setAttribute("aria-hidden", "true");
  }

  sosBtn.addEventListener("click", openLogsPanel);
  closeBtn.addEventListener("click", closeLogsPanel);
  
  // Close if clicking outside the panel
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      closeLogsPanel();
    }
  });

  // Optional socket listening for real-time SOS additions
  if (typeof socket !== "undefined" && socket) {
    socket.on("sos:alert", () => {
      if (!overlay.classList.contains("d-none")) fetchAndRenderLogs();
    });
    socket.on("sos:resolved", () => {
      if (!overlay.classList.contains("d-none")) fetchAndRenderLogs();
    });
  }
});
