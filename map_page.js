/* ═══════════════════════════════════════════
   MAPBOX
═══════════════════════════════════════════ */
mapboxgl.accessToken = map_token;

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [75.5, 24.0],
  zoom: 5.5,
  interactive: true
});


map.on("load", async () => {

  const source = sorce_cordinates;
  const destination = destination_cordinates;

  new mapboxgl.Marker({ color: "green" })
    .setLngLat(source)
    .setPopup(new mapboxgl.Popup().setText("Source"))
    .addTo(map);

  new mapboxgl.Marker({ color: "red" })
    .setLngLat(destination)
    .setPopup(new mapboxgl.Popup().setText("Destination"))
    .addTo(map);

  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${source[0]},${source[1]};${destination[0]},${destination[1]}?geometries=geojson&access_token=${mapboxgl.accessToken}`;

  const response = await fetch(url);
  const data = await response.json();

  const route = data.routes[0].geometry;

  map.addSource('route', {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: route
    }
  });

  map.addLayer({
    id: 'route',
    type: 'line',
    source: 'route',
    paint: {
      'line-color': '#007cbf',
      'line-width': 5
    }
  });

});



// map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

// const STOPS = [
//   { c:[73.6833,24.5854], label:'Udaipur City Palace Gate', col:'#6c63ff' },
//   { c:[73.5500,24.7500], label:'Café XYZ — NH48',          col:'#ffb547' },
//   { c:[72.9000,24.6800], label:'Sunset Viewpoint',          col:'#4fc3f7' },
//   { c:[72.7750,24.5950], label:'Guru Shikhar Junction',     col:'#ffb547' },
//   { c:[72.7079,24.5926], label:'Mount Abu — Nakki Lake',    col:'#ff6584' },
// ];

// map.on('load', () => {
//   STOPS.forEach(s => {
//     const el = document.createElement('div');
//     el.style.cssText = `
//       width:14px;height:14px;border-radius:50%;
//       background:${s.col};border:2.5px solid #fff;
//       box-shadow:0 0 10px ${s.col};cursor:pointer;`;
//     new mapboxgl.Marker({ element: el })
//       .setLngLat(s.c)
//       .setPopup(new mapboxgl.Popup({ offset:16, closeButton:false })
//         .setHTML(`<span style="font-family:Nunito,sans-serif;font-size:.77rem;
//           color:#1a1d2e;background:#fff;padding:5px 10px;box-shadow:0 2px 8px rgba(0,0,0,.15);
//           border-radius:8px;display:inline-block;">${s.label}</span>`))
//       .addTo(map);
//   });

//   map.addSource('route', {
//     type:'geojson',
//     data:{ type:'Feature', properties:{},
//            geometry:{ type:'LineString', coordinates:STOPS.map(s=>s.c) } }
//   });
//   map.addLayer({
//     id:'route-line', type:'line', source:'route',
//     paint:{ 'line-color':'#6c63ff','line-width':3,
//             'line-dasharray':[2,2],'line-opacity':.85 }
//   });
// });

/* ═══════════════════════════════════════════
   SLIDE PANEL — drag & snap
   
   The panel uses position:fixed, top:70px, height:calc(100vh - 70px).
   We control visibility purely via translateY:
     CLOSED → translateY(calc(100% - 72px))   only handle peeks
     MID    → translateY(40%)                  half visible
     OPEN   → translateY(0)                    fully visible
   
   We calculate the actual pixel range so drag clamping is correct.
═══════════════════════════════════════════ */
const panel  = document.getElementById('slide-panel');
const handle = document.getElementById('drag-handle');
const pbody  = document.getElementById('panel-body');

// snap positions as fractions of panel height (0 = fully open top)
const SNAPS = {
  closed: null, // computed after layout
  mid:    0.40,
  open:   0.00
};

let state = 'closed';

function panelH() { return panel.offsetHeight; }

function snapPx(s) {
  if (s === 'closed') return panelH() - 72; // only handle shows
  if (s === 'mid')    return panelH() * 0.40;
  return 0; // open
}

function applySnap(s, animate = true) {
  state = s;
  panel.style.transition = animate
    ? 'transform .4s cubic-bezier(.32,.72,0,1)'
    : 'none';
  panel.style.transform = `translateY(${snapPx(s)}px)`;

  // update hint visibility via class
  panel.classList.remove('mid','open');
  if (s === 'mid')  panel.classList.add('mid');
  if (s === 'open') panel.classList.add('open');
}

// initialise without animation
applySnap('closed', false);

// tap handle → cycle states
handle.addEventListener('click', () => {
  if (state === 'closed') applySnap('mid');
  else if (state === 'mid') applySnap('open');
  else applySnap('closed');
});

/* drag */
let startClientY = 0;
let startTY      = 0;
let pointerDown  = false;

function currentTY() {
  // read live translateY from computed style
  const m = new DOMMatrixReadOnly(getComputedStyle(panel).transform);
  return m.m42;
}

handle.addEventListener('pointerdown', e => {
  pointerDown  = true;
  startClientY = e.clientY;
  startTY      = currentTY();
  panel.style.transition = 'none'; // disable animation while dragging
  handle.setPointerCapture(e.pointerId);
  e.preventDefault();
});

handle.addEventListener('pointermove', e => {
  if (!pointerDown) return;
  const dy  = e.clientY - startClientY;
  const raw = startTY + dy;
  // clamp: cannot go above fully open (0) or below fully closed
  const clamped = Math.max(0, Math.min(snapPx('closed'), raw));
  panel.style.transform = `translateY(${clamped}px)`;
  e.preventDefault();
});

handle.addEventListener('pointerup', e => {
  if (!pointerDown) return;
  pointerDown = false;
  const dy = e.clientY - startClientY;

  // decide snap target based on drag direction & distance
  if (Math.abs(dy) < 8) {
    // tiny move = treat as tap → cycle
    if (state === 'closed') applySnap('mid');
    else if (state === 'mid') applySnap('open');
    else applySnap('closed');
  } else if (dy < 0) {
    // dragged UP → move to next higher state
    applySnap(state === 'closed' ? 'mid' : 'open');
  } else {
    // dragged DOWN → move to next lower state
    applySnap(state === 'open' ? 'mid' : 'closed');
  }
  e.preventDefault();
});

// prevent panel scroll from propagating to map
pbody.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });

/* ═══════════════════════════════════════════
   TABS
═══════════════════════════════════════════ */
const chatBar = document.getElementById('chat-bar');

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById('tab-' + tab).classList.add('active');
    chatBar.style.display = tab === 'chat' ? 'flex' : 'none';
    if (tab === 'chat') { applySnap('open'); } else if (state === 'closed') { applySnap('mid'); }
  });
});

/* ═══════════════════════════════════════════
   CHAT SEND
═══════════════════════════════════════════ */
function sendMsg() {
  const inp  = document.getElementById('chat-text');
  const txt  = inp.value.trim();
  if (!txt) return;
  const pane = document.getElementById('tab-chat');
  const time = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
  const div  = document.createElement('div');
  div.className = 'cbubble me';
  div.innerHTML  = `<div class="cav">RK</div>
    <div><div class="bbl">${txt}<span class="bt">${time}</span></div></div>`;
  pane.appendChild(div);
  inp.value = '';
  pbody.scrollTop = pbody.scrollHeight;
}

document.getElementById('chat-text').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendMsg();
});