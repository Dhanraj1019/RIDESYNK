
  /* ── Data ── */
  const alerts = [
    {
      id: 1, member: "Sarah Mitchell", time: "2 min ago",
      location: "Highway Junction, KM 34", type: "Fall Detected", resolved: false,
    },
    {
      id: 2, member: "Mike Chen", time: "15 min ago",
      location: "Coastal Road, KM 12", type: "Manual SOS", resolved: true,
    },
  ];

  /* ── SVG snippets ── */
  const iconTriangle = (size, cls = "") => `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>`;

  const iconMapPin = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>`;

  const iconClock = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>`;

  const iconPhone = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.28h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.77a16 16 0 0 0 6 6l.86-.86a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.5 16z"/>
  </svg>`;

  /* ── Render alert cards ── */
  const list = document.getElementById("alerts-list");

  alerts.forEach((alert, i) => {
    const card = document.createElement("div");
    card.className = `alert-card${alert.resolved ? "" : " active-alert"}`;
    card.style.animationDelay = `${i * 0.05}s`;

    card.innerHTML = `
      <div class="alert-inner">
        <div class="alert-icon${alert.resolved ? "" : " active-icon"}">
          ${iconTriangle(18)}
        </div>
        <div class="alert-body">
          <div class="alert-top">
            <p class="alert-member">${alert.member}</p>
            <span class="badge-status ${alert.resolved ? "badge-resolved" : "badge-active"}">
              ${alert.resolved ? "Resolved" : "Active"}
            </span>
          </div>
          <p class="alert-type">${alert.type}</p>
          <div class="alert-meta">
            <span class="meta-row">${iconMapPin} ${alert.location}</span>
            <span class="meta-row">${iconClock} ${alert.time}</span>
          </div>
          ${!alert.resolved ? `
            <div class="alert-actions">
              <button class="btn-call">${iconPhone} Call</button>
              <button class="btn-resolve" data-id="${alert.id}">Resolve</button>
            </div>` : ""}
        </div>
      </div>
    `;

    // Resolve button — re-renders card as resolved
    if (!alert.resolved) {
      card.querySelector(".btn-resolve").addEventListener("click", () => {
        alert.resolved = true;
        card.classList.remove("active-alert");
        card.querySelector(".alert-icon").classList.remove("active-icon");
        card.querySelector(".badge-status").className = "badge-status badge-resolved";
        card.querySelector(".badge-status").textContent = "Resolved";
        card.querySelector(".alert-actions").remove();
      });
    }

    list.appendChild(card);
  });

  /* ── Modal dismiss (mirrors AnimatePresence exit) ── */
  const modal     = document.getElementById("sos-modal");
  const modalCard = document.getElementById("modal-card");

  document.getElementById("dismiss-btn").addEventListener("click", () => {
    modalCard.classList.add("exiting");
    setTimeout(() => { modal.classList.add("hidden"); }, 200);
  });
