

  const members = [
    { id: 1, name: "James Rodriguez", status: "active",  bike: "Royal Enfield 650" },
    { id: 2, name: "Mike Chen",        status: "riding",  bike: "Kawasaki Z900"     },
    { id: 3, name: "Sarah Mitchell",   status: "offline", bike: "Honda CB350"       },
    { id: 4, name: "Priya Patel",      status: "active",  bike: "BMW G310R"         },
  ];

  const statusConfig = {
    active:  { label: "Active",  dotClass: "dot-active"  },
    riding:  { label: "Riding",  dotClass: "dot-riding"  },
    offline: { label: "Offline", dotClass: "dot-offline" },
  };

  const chevronSVG = `<svg class="chevron" xmlns="http://www.w3.org/2000/svg" width="16" height="16"
    viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

  const list = document.getElementById("members-list");

  members.forEach((m, i) => {
    const cfg     = statusConfig[m.status];
    const initial = m.name.charAt(0).toUpperCase();

    const btn = document.createElement("button");
    btn.className = "member-card";
    btn.style.animationDelay = `${i * 0.04}s`;
    btn.onclick = () => window.location.href = "/member-detail";

    btn.innerHTML = `
      <div class="avatar">
        ${initial}
        <span class="status-dot ${cfg.dotClass}"></span>
      </div>
      <div class="member-info">
        <p class="member-name">${m.name}</p>
        <p class="member-bike">${m.bike}</p>
      </div>
      <span class="member-status-label">${cfg.label}</span>
      ${chevronSVG}
    `;

    list.appendChild(btn);
  });
