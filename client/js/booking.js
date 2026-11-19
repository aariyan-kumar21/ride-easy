import { createBooking, getState, subscribe } from './state.js';

const LOCATION_COORDS = {
  'Cubbon Park Metro': [12.9742, 77.6012],
  'Koramangala 4th Block': [12.9389, 77.6211],
  'Majestic Bus Station': [12.9767, 77.5713],
  'Manipal Hospital, HAL': [12.9585, 77.6488],
  'MG Road Boulevard': [12.9752, 77.6045],
  'Indiranagar 100ft Rd': [12.9784, 77.6408],
  'MG Road Metro Station': [12.9756, 77.6066],
  'Kempegowda Bus Station (Majestic)': [12.9767, 77.5713],
  'Whitefield ITPL': [12.9855, 77.7362],
  'Electronic City Phase 1': [12.8452, 77.6602],
  'Marathahalli Bridge': [12.9591, 77.6974],
  'BTM Layout 2nd Stage': [12.9166, 77.6101],
  'Hebbal Flyover': [13.0358, 77.5970],
  'Jayanagar 4th Block': [12.9304, 77.5830],
  'Malleshwaram 8th Cross': [12.9982, 77.5685],
  'Vidhana Soudha': [12.9796, 77.5907],
  'Richmond Circle': [12.9660, 77.5998]
};

const POPULAR_LOCATIONS = [
  { label: 'Cubbon Park Metro', area: 'Cubbon Park' },
  { label: 'Koramangala 4th Block', area: 'Koramangala' },
  { label: 'Indiranagar 100ft Rd', area: 'Indiranagar' },
  { label: 'Whitefield ITPL', area: 'Whitefield' },
  { label: 'Electronic City Phase 1', area: 'Electronic City' },
  { label: 'Marathahalli Bridge', area: 'Marathahalli' },
  { label: 'BTM Layout 2nd Stage', area: 'BTM Layout' },
  { label: 'Hebbal Flyover', area: 'Hebbal' },
  { label: 'Majestic Bus Station', area: 'Majestic' },
  { label: 'MG Road Boulevard', area: 'MG Road' },
  { label: 'Jayanagar 4th Block', area: 'Jayanagar' },
  { label: 'Malleshwaram 8th Cross', area: 'Malleshwaram' },
  { label: 'Vidhana Soudha', area: 'Vidhana Soudha' },
  { label: 'Richmond Circle', area: 'Richmond Circle' },
  { label: 'Manipal Hospital, HAL', area: 'HAL' }
];

function matchAreaName(label) {
  if (!label || typeof label !== 'string') return 'Cubbon Park';
  const clean = label.trim().toLowerCase();
  if (clean.includes('indiranagar')) return 'Indiranagar';
  if (clean.includes('koramangala')) return 'Koramangala';
  if (clean.includes('whitefield') || clean.includes('itpl')) return 'Whitefield';
  if (clean.includes('electronic city') || clean.includes('ecity')) return 'Electronic City';
  if (clean.includes('marathahalli')) return 'Marathahalli';
  if (clean.includes('btm')) return 'BTM Layout';
  if (clean.includes('hebbal')) return 'Hebbal';
  if (clean.includes('mg road')) return 'MG Road';
  if (clean.includes('cubbon')) return 'Cubbon Park';
  if (clean.includes('majestic') || clean.includes('kempegowda')) return 'Majestic';
  if (clean.includes('jayanagar')) return 'Jayanagar';
  if (clean.includes('malleshwaram')) return 'Malleshwaram';
  if (clean.includes('vidhana')) return 'Vidhana Soudha';
  if (clean.includes('richmond')) return 'Richmond Circle';
  if (clean.includes('manipal') || clean.includes('hal')) return 'HAL';
  return 'Cubbon Park';
}

function updatePickupArrivalAnalyticsCard(pickupLabel, vehicleType = 'cab') {
  const card = document.getElementById('pickup-arrival-card');
  const avgValEl = document.getElementById('pickup-avg-arrival-value');
  const sourceBadgeEl = document.getElementById('pickup-source-badge');
  const delayValEl = document.getElementById('pickup-delay-value');
  if (!card) return;

  const areaKey = matchAreaName(pickupLabel);
  const state = getState();
  const areaData = state.traffic?.areasAnalytics?.[areaKey];

  if (!areaData) {
    if (avgValEl) avgValEl.textContent = '~6 min';
    if (sourceBadgeEl) {
      sourceBadgeEl.textContent = 'Simulated baseline';
      sourceBadgeEl.className = 'arrival-source-pill baseline';
    }
    if (delayValEl) delayValEl.textContent = 'Assign delay: ~1.0m';
    return;
  }

  const avgMin = areaData.averageArrivalMinutes || 6;
  const delayMin = areaData.averageAssignmentDelayMinutes || 1.1;

  if (avgValEl) {
    avgValEl.textContent = `~${avgMin} min`;
  }

  if (sourceBadgeEl) {
    const isBase = Boolean(areaData.isBaseline);
    sourceBadgeEl.textContent = isBase ? 'Simulated baseline' : `Based on ${areaData.sampleCount} rides`;
    sourceBadgeEl.className = `arrival-source-pill ${isBase ? 'baseline' : 'actual'}`;
    sourceBadgeEl.title = isBase
      ? 'Awaiting minimum sample size of 5 rides. Showing simulated baseline.'
      : `Calculated from ${areaData.sampleCount} completed simulated rides in this area.`;
  }

  if (delayValEl) {
    delayValEl.textContent = `Assign delay: ~${delayMin}m`;
  }
}

function showFeedback(el, message, isError = false) {
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden', 'feedback-error');
  if (isError) {
    el.classList.add('feedback-error');
  }
}

export function initBookingPanel() {
  const form = document.getElementById('booking-form');
  const feedbackEl = document.getElementById('booking-feedback');
  const passengerInput = document.getElementById('passenger-count');
  const passengerDisplay = document.getElementById('passenger-count-display');
  const decBtn = document.getElementById('passenger-dec-btn');
  const incBtn = document.getElementById('passenger-inc-btn');
  const submitBtn = document.getElementById('request-ride-btn');

  const toggleIndBtn = document.getElementById('toggle-individual-btn');
  const toggleGrpBtn = document.getElementById('toggle-group-btn');

  const tileCab = document.getElementById('vehicle-tile-cab');
  const tileAuto = document.getElementById('vehicle-tile-auto');

  const passengerCountGroup = document.getElementById('passenger-count-group');
  const pickupInput = document.getElementById('pickup-input');
  const suggestionsDropdown = document.getElementById('pickup-suggestions-dropdown');

  function getSelectedVehicle() {
    return form?.querySelector('input[name="vehicleType"]:checked')?.value || 'cab';
  }

  function setBookingMode(isGroup) {
    if (isGroup) {
      toggleGrpBtn?.classList.add('active');
      toggleGrpBtn?.setAttribute('aria-selected', 'true');
      toggleIndBtn?.classList.remove('active');
      toggleIndBtn?.setAttribute('aria-selected', 'false');

      // Show passenger count selector only in Group mode
      if (passengerCountGroup) passengerCountGroup.style.display = '';

      // Groups default to 4 passengers (min 2, max 6 for cab / 3 for auto)
      const veh = getSelectedVehicle();
      const curr = Number(passengerInput?.value || 1);
      const startCount = curr < 2 ? (veh === 'auto' ? 3 : 4) : curr;
      setPassengerCount(startCount, true);
    } else {
      toggleIndBtn?.classList.add('active');
      toggleIndBtn?.setAttribute('aria-selected', 'true');
      toggleGrpBtn?.classList.remove('active');
      toggleGrpBtn?.setAttribute('aria-selected', 'false');

      // Hide passenger count selector completely in Individual mode (strictly 1 passenger)
      if (passengerCountGroup) passengerCountGroup.style.display = 'none';
      setPassengerCount(1, false);
    }
  }

  function setPassengerCount(val, isGroup) {
    const veh = getSelectedVehicle();
    const maxVal = veh === 'auto' ? 3 : 6;
    const minVal = isGroup ? 2 : 1;
    const clamped = isGroup ? Math.max(minVal, Math.min(val, maxVal)) : 1;

    if (passengerInput) passengerInput.value = String(clamped);
    if (passengerDisplay) passengerDisplay.textContent = String(clamped);
  }

  // Counter Step Buttons: only functional in Group mode
  decBtn?.addEventListener('click', () => {
    const isGroup = toggleGrpBtn?.classList.contains('active');
    if (!isGroup) return; // Cannot modify passenger count in Individual mode
    const curr = Number(passengerInput?.value || 2);
    setPassengerCount(curr - 1, true);
  });

  incBtn?.addEventListener('click', () => {
    const isGroup = toggleGrpBtn?.classList.contains('active');
    if (!isGroup) return; // Cannot modify passenger count in Individual mode
    const curr = Number(passengerInput?.value || 2);
    setPassengerCount(curr + 1, true);
  });

  // Individual vs Group Toggle
  toggleIndBtn?.addEventListener('click', () => {
    setBookingMode(false);
  });

  toggleGrpBtn?.addEventListener('click', () => {
    setBookingMode(true);
  });

  // Initialize strictly in Individual mode (passenger counter hidden, count = 1)
  setBookingMode(false);

  // Vehicle Selection Tiles
  tileCab?.addEventListener('click', () => {
    tileCab.classList.add('active');
    tileAuto?.classList.remove('active');
    const radio = tileCab.querySelector('input[type="radio"]');
    if (radio) radio.checked = true;
    updatePickupArrivalAnalyticsCard(pickupInput?.value || '', 'cab');
  });

  tileAuto?.addEventListener('click', () => {
    tileAuto.classList.add('active');
    tileCab?.classList.remove('active');
    const radio = tileAuto.querySelector('input[type="radio"]');
    if (radio) radio.checked = true;

    // Auto max capacity is 3
    const isGroup = toggleGrpBtn?.classList.contains('active');
    if (isGroup) {
      const curr = Number(passengerInput?.value || 1);
      if (curr > 3) {
        setPassengerCount(3, true);
      }
    }
    updatePickupArrivalAnalyticsCard(pickupInput?.value || '', 'auto');
  });

  // Location Preset Chips
  document.querySelectorAll('.preset-chips-row').forEach((group) => {
    const targetId = group.dataset.target;
    const input = document.getElementById(targetId);
    group.querySelectorAll('.preset-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        if (input) {
          input.value = chip.dataset.value || '';
          if (targetId === 'pickup-input') {
            updatePickupArrivalAnalyticsCard(input.value, getSelectedVehicle());
          }
        }
      });
    });
  });

  // Autocomplete / Dropdown with Arrival Analytics for Pickup Location
  function renderSuggestions(query = '') {
    if (!suggestionsDropdown) return;
    const clean = query.trim().toLowerCase();
    const matches = POPULAR_LOCATIONS.filter((loc) =>
      loc.label.toLowerCase().includes(clean) || loc.area.toLowerCase().includes(clean)
    );

    if (matches.length === 0) {
      suggestionsDropdown.classList.add('hidden');
      suggestionsDropdown.innerHTML = '';
      return;
    }

    const state = getState();
    const areas = state.traffic?.areasAnalytics || {};

    suggestionsDropdown.innerHTML = matches.map((loc) => {
      const areaData = areas[loc.area];
      const avg = areaData ? areaData.averageArrivalMinutes : 8;
      return `
        <div class="location-suggestion-item" data-value="${loc.label}">
          <span>${loc.label}</span>
          <span class="suggestion-area-badge">~${avg}m avg</span>
        </div>
      `;
    }).join('');

    suggestionsDropdown.querySelectorAll('.location-suggestion-item').forEach((item) => {
      item.addEventListener('click', () => {
        if (pickupInput) {
          pickupInput.value = item.dataset.value;
          updatePickupArrivalAnalyticsCard(pickupInput.value, getSelectedVehicle());
        }
        suggestionsDropdown.classList.add('hidden');
      });
    });

    suggestionsDropdown.classList.remove('hidden');
  }

  pickupInput?.addEventListener('input', () => {
    updatePickupArrivalAnalyticsCard(pickupInput.value, getSelectedVehicle());
    renderSuggestions(pickupInput.value);
  });

  pickupInput?.addEventListener('focus', () => {
    renderSuggestions(pickupInput.value);
  });

  document.addEventListener('click', (e) => {
    if (suggestionsDropdown && !suggestionsDropdown.contains(e.target) && e.target !== pickupInput) {
      suggestionsDropdown.classList.add('hidden');
    }
  });

  // Subscribe to state updates to keep pickup analytics card updated
  subscribe((_state, changeType) => {
    if (changeType === 'analytics:updated' || changeType === 'data:loaded') {
      updatePickupArrivalAnalyticsCard(pickupInput?.value || '', getSelectedVehicle());
    }
  });

  // Initial update
  updatePickupArrivalAnalyticsCard(pickupInput?.value || 'Cubbon Park Metro', 'cab');

  // Form Submit
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const pickupLabel = document.getElementById('pickup-input')?.value.trim();
    const destLabel = document.getElementById('destination-input')?.value.trim();
    const vehicleType = getSelectedVehicle();
    const passengerCount = Number(passengerInput?.value || 1);
    const category = document.getElementById('passenger-category')?.value || 'regular';

    if (!pickupLabel || !destLabel) {
      showFeedback(feedbackEl, 'Please provide both pickup and destination locations.', true);
      return;
    }

    if (vehicleType === 'auto' && passengerCount > 3) {
      showFeedback(feedbackEl, 'Auto supports at most 3 passengers. Switch to Cab for larger groups.', true);
      return;
    }

    if (passengerCount < 1 || passengerCount > 6) {
      showFeedback(feedbackEl, 'Passenger count must be between 1 and 6.', true);
      return;
    }

    const [pickupLat, pickupLng] = LOCATION_COORDS[pickupLabel] || [12.9716, 77.5946];
    const [destLat, destLng] = LOCATION_COORDS[destLabel] || [12.9784, 77.6408];

    if (submitBtn) submitBtn.disabled = true;
    showFeedback(feedbackEl, 'Submitting ride request to allocation engine...');

    try {
      const created = await createBooking({
        category,
        vehicleType,
        passengerCount,
        pickup: { lat: pickupLat, lng: pickupLng, label: pickupLabel },
        destination: { lat: destLat, lng: destLng, label: destLabel }
      });

      const assignedText = created.vehicle && created.vehicle !== 'Pending'
        ? `Assigned to ${created.vehicle}`
        : 'Added to Active Requests. Click "Assign Cabs" when ready.';
      showFeedback(feedbackEl, `Ride ${created.id} requested! ${assignedText}`);
    } catch (err) {
      showFeedback(feedbackEl, err.message || 'Failed to create booking.', true);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}
