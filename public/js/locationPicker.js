/* locationPicker.js */

document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('locationPickerModal');
  if (!modal) return;

  const closeBtn = document.getElementById('lp-close-btn');
  const confirmBtn = document.getElementById('lp-confirm-btn');
  const useMyLocationBtn = document.getElementById('lp-use-my-location');
  const addressText = document.getElementById('lp-address-text');
  const mapContainer = document.getElementById('lp-map');
  const marker = document.getElementById('lp-marker');

  let map = null;
  let currentMode = null; // 'sorce' | 'destination'
  let currentCenter = null; // [lng, lat]
  let currentAddress = "";

  let reverseGeocodeTimeout;

  // Initialize Mapbox map
  function initMap() {
    if (map) return;

    // Mapbox Token is assumed to be defined in global scope `map_token` setup in create_ride.ejs
    mapboxgl.accessToken = typeof MAPBOX_TOKEN !== 'undefined' ? MAPBOX_TOKEN : (typeof map_token !== 'undefined' ? map_token : '');

    map = new mapboxgl.Map({
      container: 'lp-map',
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [78.9629, 20.5937], // Default India Center
      zoom: 4,
    });

    // Geolocation attempt on first load
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        const { longitude, latitude } = position.coords;
        map.setCenter([longitude, latitude]);
        map.setZoom(14);
      }, () => {
        // failed to get location, keep default
      }, { enableHighAccuracy: true, timeout: 30000, maximumAge: 10000 });
    }

    map.on('move', () => {
      marker.classList.add('dragging');
    });

    map.on('moveend', () => {
      marker.classList.remove('dragging');
      const center = map.getCenter();
      currentCenter = [center.lng, center.lat];
      debouncedReverseGeocode(center.lng, center.lat);
    });
  }

  function debouncedReverseGeocode(lng, lat) {
    clearTimeout(reverseGeocodeTimeout);
    addressText.textContent = "Locating...";
    reverseGeocodeTimeout = setTimeout(() => {
      reverseGeocode(lng, lat);
    }, 400);
  }

  async function reverseGeocode(lng, lat) {
    try {
      const token = mapboxgl.accessToken;
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&limit=1`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.features && data.features.length > 0) {
        currentAddress = data.features[0].place_name;
        addressText.textContent = currentAddress;
      } else {
        currentAddress = "Selected Location";
        addressText.textContent = "Selected Location";
      }
    } catch (err) {
      console.error(err);
      currentAddress = "Selected Location";
      addressText.textContent = "Location (Coordinates)";
    }
  }

  function openModal(mode) {
    currentMode = mode;
    modal.classList.remove('hide');
    marker.className = `lp-marker-center mode-${mode}`;

    // Defer initialization to ensure modal is visible for proper canvas sizing
    setTimeout(() => {
      initMap();
      map.resize();

      // trigger reverse geocode for current center
      const center = map.getCenter();
      currentCenter = [center.lng, center.lat];
      debouncedReverseGeocode(center.lng, center.lat);
    }, 50);
  }

  function closeModal() {
    modal.classList.add('hide');
  }

  /* Listeners */

  // Open buttons
  document.querySelectorAll('.pick-on-map-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const mode = btn.getAttribute('data-mode');
      openModal(mode);
    });
  });

  // Close button
  closeBtn.addEventListener('click', closeModal);

  // Use My Location
  useMyLocationBtn.addEventListener('click', () => {
    if (navigator.geolocation) {
      addressText.textContent = "Getting GPS location...";
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { longitude, latitude } = position.coords;
          map.flyTo({ center: [longitude, latitude], zoom: 15 });
        },
        (error) => {
          console.warn("Geolocation Error:", error);
          alert("Location access denied or unavailable. Please move map manually.");
          debouncedReverseGeocode(currentCenter[0], currentCenter[1]); // revert text
        },
        { enableHighAccuracy: true, timeout: 30000, maximumAge: 5000 }
      );
    } else {
      alert("Geolocation is not supported by your browser");
    }
  });

  // Confirm Location
  confirmBtn.addEventListener('click', () => {
    if (!currentCenter || !currentMode) return;

    // Find the input elements
    const textInput = document.querySelector(`input[name="ride[${currentMode}]"]`);
    if (!textInput) {
      console.warn("Could not find input for mode:", currentMode);
      closeModal();
      return;
    }

    // Find the hidden input
    const hiddenName = currentMode === 'sorce' ? 'ride[sorcelocation]' : 'ride[destinationlocation]';
    let hiddenInput = document.querySelector(`input[name="${hiddenName}"]`);

    // If hidden input doesn't exist yet, we inject it via JS since it's dynamically created by attachSearch in create_ride.js
    if (!hiddenInput) {
      hiddenInput = document.createElement('input');
      hiddenInput.type = 'hidden';
      hiddenInput.name = hiddenName;
      textInput.parentElement.appendChild(hiddenInput);
    }

    // Set values
    // Using short name for the text input (usually before first comma)
    const shortName = currentAddress.split(',')[0].trim();
    textInput.value = shortName;
    textInput.dataset.placeName = currentAddress;
    textInput.dataset.coordsLng = currentCenter[0];
    textInput.dataset.coordsLat = currentCenter[1];

    // Trigger input/change events for local validation logic in create_ride / ride_room
    textInput.dispatchEvent(new Event('input', { bubbles: true }));
    textInput.dispatchEvent(new Event('change', { bubbles: true }));

    hiddenInput.value = JSON.stringify({
      name: currentAddress,
      coordinates: currentCenter
    });

    closeModal();
  });
});