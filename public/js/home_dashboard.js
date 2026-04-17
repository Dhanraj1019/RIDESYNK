  // const user = { fullName:"John Doe", email:"john@email.com", bikeName:"Ducati Monster 821", phone:"+1 555-0100" };
  // const rides = [
  //   { id:1, name:"Weekend Coastal Run",  members:8,  status:"active",    date:"Today, 6:00 AM"  },
  //   { id:2, name:"Mountain Trail Ride",  members:5,  status:"upcoming",  date:"Mar 1, 7:30 AM"  },
  //   { id:3, name:"City Night Cruise",    members:12, status:"completed", date:"Feb 20, 9:00 PM" },
  // ];
  // const badgeClass = { active:"badge-status badge-active", upcoming:"badge-status badge-upcoming", completed:"badge-status badge-completed" };
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
  if (document.getElementById("greeting-text")) {
      document.getElementById("greeting-text").textContent = greeting;
  }

  
  const drawer  = document.getElementById("profile-drawer");
  const overlay = document.getElementById("drawer-overlay");
  
  if (document.getElementById("open-drawer") && drawer && overlay) {
      document.getElementById("open-drawer").addEventListener("click",  () => { drawer.classList.add("open");    overlay.classList.add("open");    });
  }
  if (document.getElementById("close-drawer") && drawer && overlay) {
      document.getElementById("close-drawer").addEventListener("click", () => { drawer.classList.remove("open"); overlay.classList.remove("open"); });
  }
  if (overlay && drawer) {
      overlay.addEventListener("click", () => { drawer.classList.remove("open"); overlay.classList.remove("open"); });
  }

  function setActive(tab) {
    document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));
    const el = document.getElementById("nav-" + tab);
    if (el) el.classList.add("active");
  }




  // document.getElementById("user-name").textContent       = user.fullName;
  // document.getElementById("avatar-initials").textContent = initials;
  // document.getElementById("drawer-avatar").textContent   = initials;
  // document.getElementById("drawer-name").textContent     = user.fullName;
  // document.getElementById("drawer-email").textContent    = user.email;
  // document.getElementById("drawer-bike").textContent     = user.bikeName || "—";
  // document.getElementById("drawer-phone").textContent    = user.phone    || "—";

  // const list = document.getElementById("rides-list");
  // rides.forEach((ride, i) => {
  //   const btn = document.createElement("button");
  //   btn.className = "ride-card";
  //   btn.style.animationDelay = `${i * 0.05}s`;
  //   btn.onclick = () => window.location.href = "/ride-room";
  //   btn.innerHTML = `
  //     <div class="ride-icon">
  //       <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
  //     </div>
  //     <div class="ride-info">
  //       <p class="ride-name">${ride.name}</p>
  //       <p class="ride-meta">${ride.date} · ${ride.members} riders</p>
  //     </div>
  //     <span class="${badgeClass[ride.status]}">${ride.status}</span>
  //     <svg class="chevron" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
  //   `;
  //   list.appendChild(btn);
  // });

