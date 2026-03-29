/* ══════════════════════════════════════════════════
   MAPBOX PLACE SEARCH — works with your existing HTML
   No HTML changes needed
══════════════════════════════════════════════════ */

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGhhbnJhajUzNjgiLCJhIjoiY21tajZ6Y2RrMDVsdDJwc2Fnejd3MGlqZSJ9.PSjj-o-pd1Qx0cU47SLqJQ'; // replace with your token

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseRideDateTime(dateValue, timeValue) {
  if (!dateValue || !timeValue) return null;
  const rideDateTime = new Date(`${dateValue}T${timeValue}`);
  return Number.isNaN(rideDateTime.getTime()) ? null : rideDateTime;
}

function validateFutureDateTime(dateValue, timeValue) {
  const rideDateTime = parseRideDateTime(dateValue, timeValue);
  if (!rideDateTime) {
    return { valid: false, message: 'Please select a future date and time' };
  }

  if (rideDateTime <= new Date()) {
    return { valid: false, message: 'Please select a future date and time' };
  }

  return { valid: true, message: '' };
}

function setErrorMessage(errorNode, message) {
  if (!errorNode) return;
  errorNode.textContent = message || '';
}

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

  const createRideForm = document.querySelector('form[action="/ridesync/createride"]');
  const dateInput = document.getElementById('ride-date');
  const timeInput = document.getElementById('ride-time');
  const errorNode = document.getElementById('error-msg');

  if (dateInput) {
    dateInput.min = toDateInputValue(new Date());
  }

  const runDateTimeValidation = () => {
    if (!dateInput || !timeInput) return true;
    const result = validateFutureDateTime(dateInput.value, timeInput.value);
    setErrorMessage(errorNode, result.valid ? '' : result.message);
    return result.valid;
  };

  if (dateInput) dateInput.addEventListener('input', runDateTimeValidation);
  if (timeInput) timeInput.addEventListener('input', runDateTimeValidation);

  if (createRideForm) {
    createRideForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const isValidByBrowser = createRideForm.checkValidity();
      createRideForm.classList.add('was-validated');
      if (!isValidByBrowser) return;

      if (!runDateTimeValidation()) return;

      try {
        const formData = new FormData(createRideForm);
        const body = new URLSearchParams(formData);

        const response = await fetch('/ridesync/createride', {
          method: 'POST',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
          },
          body: body.toString()
        });

        if (!response.ok) {
          let payload = null;
          try {
            payload = await response.json();
          } catch (e) {
            payload = null;
          }

          const message = payload && payload.error
            ? payload.error
            : 'Unable to create ride. Please try again.';
          setErrorMessage(errorNode, message);
          return;
        }

        if (response.redirected && response.url) {
          window.location.href = response.url;
          return;
        }

        window.location.reload();
      } catch (error) {
        setErrorMessage(errorNode, 'Unable to create ride. Please try again.');
      }
    });
  }

  /* Start location input */
  const sourceInput = document.querySelector('input[name="ride[sorce]"]');
  if (sourceInput) {
    attachSearch(sourceInput, 'ride[sorcelocation]');
  }

  /* Destination input */
  const destInput = document.querySelector('input[name="ride[destination]"]');
  if (destInput) {
    attachSearch(destInput, 'ride[destinationlocation]');
  }

  /* ── Add Stop button ── */
  const stopsContainer = document.getElementById('stops-container');
  const addStopBtn     = document.getElementById('add-stop-btn');
  let   stopCount      = 0;
  const MAX_STOPS      = 3;

  if (!stopsContainer || !addStopBtn) return;

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