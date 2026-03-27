/* ══════════════════════════════════════════
       MOCK DATA
    ══════════════════════════════════════════ */
    const today = new Date();
 
    function daysFromNow(n) {
      const d = new Date(today);
      d.setDate(d.getDate() + n);
      return d;
    }
 
    const rides = [
      // Upcoming
      {
        id: 1, status: 'upcoming',
        name: 'Second Ride',
        date: daysFromNow(0),
        members: 2,
        distance: '84 km',
        from: 'Jaipur',
        to: 'Ajmer',
        icon: 'bi-geo-alt-fill'
      },
      {
        id: 2, status: 'upcoming',
        name: 'Mountain Loop',
        date: daysFromNow(2),
        members: 5,
        distance: '210 km',
        from: 'Delhi',
        to: 'Manali',
        icon: 'bi-geo-alt-fill'
      },
      {
        id: 3, status: 'upcoming',
        name: 'Coastal Highway Run',
        date: daysFromNow(4),
        members: 3,
        distance: '320 km',
        from: 'Mumbai',
        to: 'Goa',
        icon: 'bi-geo-alt-fill'
      },
      {
        id: 4, status: 'upcoming',
        name: 'Desert Dawn Ride',
        date: daysFromNow(9),
        members: 7,
        distance: '150 km',
        from: 'Jodhpur',
        to: 'Jaisalmer',
        icon: 'bi-geo-alt-fill'
      },
      {
        id: 5, status: 'upcoming',
        name: 'Monsoon Express',
        date: daysFromNow(14),
        members: 4,
        distance: '98 km',
        from: 'Pune',
        to: 'Lonavala',
        icon: 'bi-geo-alt-fill'
      },
      // Completed
      {
        id: 6, status: 'completed',
        name: 'First Ride',
        date: daysFromNow(-3),
        members: 2,
        distance: '64 km',
        from: 'Jaipur',
        to: 'Pushkar',
        icon: 'bi-geo-alt-fill'
      },
      {
        id: 7, status: 'completed',
        name: 'Sunrise Sprint',
        date: daysFromNow(-7),
        members: 6,
        distance: '180 km',
        from: 'Bangalore',
        to: 'Mysore',
        icon: 'bi-geo-alt-fill'
      },
      {
        id: 8, status: 'completed',
        name: 'Western Ghats Tour',
        date: daysFromNow(-15),
        members: 8,
        distance: '430 km',
        from: 'Kochi',
        to: 'Munnar',
        icon: 'bi-geo-alt-fill'
      },
      {
        id: 9, status: 'completed',
        name: 'Highway Night Run',
        date: daysFromNow(-22),
        members: 3,
        distance: '260 km',
        from: 'Hyderabad',
        to: 'Tirupati',
        icon: 'bi-geo-alt-fill'
      },
    ];
 
    /* ══════════════════════════════════════════
       HELPERS
    ══════════════════════════════════════════ */
    function formatDate(d) {
      return d.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: '2-digit', year: 'numeric'
      });
    }
 
    function isThisWeek(d) {
      const diff = (d - today) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 7;
    }
 
    /* ══════════════════════════════════════════
       CARD TEMPLATE
    ══════════════════════════════════════════ */
    function buildCard(ride) {
      const isCompleted = ride.status === 'completed';
      const dateStr = formatDate(ride.date);
 
      return `
        <a href="#" class="ride-card" data-id="${ride.id}" data-name="${ride.name.toLowerCase()}">
          <div class="card-icon ${isCompleted ? 'completed' : ''}">
            <i class="bi ${ride.icon}"></i>
          </div>
          <div class="card-body-inner">
            <div class="card-title">${ride.name}</div>
            <div class="card-meta">
              <span>${dateStr}</span>
              <span class="dot"></span>
              <span>${ride.members} riders</span>
              <span class="dot"></span>
              <span>${ride.distance}</span>
            </div>
            <div class="mt-1">
              <span class="ride-badge ${isCompleted ? 'badge-completed' : 'badge-upcoming'}">
                <span class="badge-dot"></span>
                ${isCompleted ? 'Completed' : 'Upcoming'}
              </span>
            </div>
          </div>
          <i class="bi bi-chevron-right card-chevron"></i>
        </a>`;
    }
 
    /* ══════════════════════════════════════════
       RENDER
    ══════════════════════════════════════════ */
    function render(query = '') {
      const q = query.toLowerCase().trim();
 
      // ── Upcoming ──
      const upcoming = rides.filter(r =>
        r.status === 'upcoming' && (!q || r.name.toLowerCase().includes(q))
      );
      const thisWeek = upcoming.filter(r => isThisWeek(r.date));
      const later    = upcoming.filter(r => !isThisWeek(r.date));
 
      document.getElementById('upcoming-this-week').innerHTML =
        thisWeek.length ? thisWeek.map(buildCard).join('') : '<p class="no-result">None this week</p>';
 
      document.getElementById('upcoming-later').innerHTML =
        later.length ? later.map(buildCard).join('') : '<p class="no-result">None later</p>';
 
      const noUpcoming = !upcoming.length;
      document.getElementById('upcoming-no-result').classList.toggle('d-none', !noUpcoming);
      document.getElementById('upcoming-count').textContent = upcoming.length;
 
      // ── Completed ──
      const completed = rides.filter(r =>
        r.status === 'completed' && (!q || r.name.toLowerCase().includes(q))
      );
      document.getElementById('completed-list').innerHTML =
        completed.length ? completed.map(buildCard).join('') : '';
 
      document.getElementById('completed-no-result').classList.toggle('d-none', !!completed.length);
      document.getElementById('completedCount').textContent = completed.length;
    }
 
    // Init counts
    document.getElementById('upcomingCount').textContent =
      rides.filter(r => r.status === 'upcoming').length;
    document.getElementById('completedCount').textContent =
      rides.filter(r => r.status === 'completed').length;
 
    /* ══════════════════════════════════════════
       TAB SWITCHING
    ══════════════════════════════════════════ */
    document.getElementById('tabSwitcher').addEventListener('click', e => {
      const btn = e.target.closest('.tab-item');
      if (!btn) return;
      document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('pane-' + btn.dataset.tab).classList.add('active');
    });
 
    /* ══════════════════════════════════════════
       SEARCH
    ══════════════════════════════════════════ */
    let searchTimer;
    document.getElementById('searchInput').addEventListener('input', e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => render(e.target.value), 180);
    });
 
    /* ══════════════════════════════════════════
       CARD CLICK (demo ripple)
    ══════════════════════════════════════════ */
    document.body.addEventListener('click', e => {
      const card = e.target.closest('.ride-card');
      if (!card) return;
      e.preventDefault();
      card.style.transform = 'scale(0.98)';
      setTimeout(() => card.style.transform = '', 180);
    });
 
    /* ══════════════════════════════════════════
       INIT
    ══════════════════════════════════════════ */
    render();