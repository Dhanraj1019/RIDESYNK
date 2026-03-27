

  const rides = [
    { id: 1, name: "Weekend Coastal Run", members: 8,  status: "active",    date: "Today, 6:00 AM",   distance: "98 km"  },
    { id: 2, name: "Mountain Trail Ride", members: 5,  status: "upcoming",  date: "Mar 1, 7:30 AM",   distance: "145 km" },
    { id: 3, name: "City Night Cruise",   members: 12, status: "completed", date: "Feb 20, 9:00 PM",  distance: "42 km"  },
    { id: 4, name: "Valley Explorer",     members: 6,  status: "completed", date: "Feb 15, 8:00 AM",  distance: "210 km" },
  ];

  const badgeClass = {
    active:    "badge-status badge-active",
    upcoming:  "badge-status badge-upcoming",
    completed: "badge-status badge-completed",
  };

  // SVG icons (12px — matches Lucide size={12})
  const iconMapPin = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>`;

  const iconUsers = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>`;

  const iconRoute = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/>
    <path d="M12 19h4.5a3.5 3.5 0 0 0 0-7h-8a3.5 3.5 0 0 1 0-7H12"/>
  </svg>`;

  const list = document.getElementById("rides-list");

  rides.forEach((ride, i) => {
    const btn = document.createElement("button");
    btn.className = "ride-card";
    btn.style.animationDelay = `${i * 0.04}s`;

    btn.innerHTML = `
      <div class="card-top">
        <p class="ride-name">${ride.name}</p>
        <span class="${badgeClass[ride.status]}">${ride.status}</span>
      </div>
      <div class="card-meta">
        <span class="meta-item">${iconMapPin} ${ride.date}</span>
        <span class="meta-item">${iconUsers} ${ride.members}</span>
        <span class="meta-item">${iconRoute} ${ride.distance}</span>
      </div>
    `;

    btn.addEventListener("click", () => {
      window.location.href = ride.status === "completed" ? "/ride-summary" : "/ride-room";
    });

    list.appendChild(btn);
  });
