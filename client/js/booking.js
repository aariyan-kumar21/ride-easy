import { createBooking } from './state.js';

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
  'Jayanagar 4th Block': [12.9304, 77.5830],
  'Malleshwaram 8th Cross': [12.9982, 77.5685],
  'Vidhana Soudha': [12.9796, 77.5907],
  'Richmond Circle': [12.9660, 77.5998]
};

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

  function getSelectedVehicle() {
    return form?.querySelector('input[name="vehicleType"]:checked')?.value || 'cab';
  }

  function setPassengerCount(val) {
    const veh = getSelectedVehicle();
    const maxVal = veh === 'auto' ? 3 : 6;
    const clamped = Math.max(1, Math.min(val, maxVal));

    if (passengerInput) passengerInput.value = String(clamped);
    if (passengerDisplay) passengerDisplay.textContent = String(clamped);

    // Update toggle mode visual if appropriate
    if (clamped >= 4) {
      toggleGrpBtn?.classList.add('active');
      toggleGrpBtn?.setAttribute('aria-selected', 'true');
      toggleIndBtn?.classList.remove('active');
      toggleIndBtn?.setAttribute('aria-selected', 'false');
    } else {
      toggleIndBtn?.classList.add('active');
      toggleIndBtn?.setAttribute('aria-selected', 'true');
      toggleGrpBtn?.classList.remove('active');
      toggleGrpBtn?.setAttribute('aria-selected', 'false');
    }
  }

  // Counter Step Buttons
  decBtn?.addEventListener('click', () => {
    const curr = Number(passengerInput?.value || 1);
    setPassengerCount(curr - 1);
  });

  incBtn?.addEventListener('click', () => {
    const curr = Number(passengerInput?.value || 1);
    setPassengerCount(curr + 1);
  });

  // Individual vs Group Toggle
  toggleIndBtn?.addEventListener('click', () => {
    toggleIndBtn.classList.add('active');
    toggleIndBtn.setAttribute('aria-selected', 'true');
    toggleGrpBtn?.classList.remove('active');
    toggleGrpBtn?.setAttribute('aria-selected', 'false');
    setPassengerCount(1);
  });

  toggleGrpBtn?.addEventListener('click', () => {
    toggleGrpBtn.classList.add('active');
    toggleGrpBtn.setAttribute('aria-selected', 'true');
    toggleIndBtn?.classList.remove('active');
    toggleIndBtn?.setAttribute('aria-selected', 'false');

    // Groups require a Cab (seats up to 6)
    if (tileCab) {
      tileCab.classList.add('active');
      const radio = tileCab.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    }
    if (tileAuto) tileAuto.classList.remove('active');

    setPassengerCount(4);
  });

  // Vehicle Selection Tiles
  tileCab?.addEventListener('click', () => {
    tileCab.classList.add('active');
    tileAuto?.classList.remove('active');
    const radio = tileCab.querySelector('input[type="radio"]');
    if (radio) radio.checked = true;
  });

  tileAuto?.addEventListener('click', () => {
    tileAuto.classList.add('active');
    tileCab?.classList.remove('active');
    const radio = tileAuto.querySelector('input[type="radio"]');
    if (radio) radio.checked = true;

    // Auto max capacity is 3
    const curr = Number(passengerInput?.value || 1);
    if (curr > 3) {
      setPassengerCount(3);
    }
  });

  // Location Preset Chips
  document.querySelectorAll('.preset-chips-row').forEach((group) => {
    const targetId = group.dataset.target;
    const input = document.getElementById(targetId);
    group.querySelectorAll('.preset-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        if (input) input.value = chip.dataset.value || '';
      });
    });
  });

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

      const assignedText = created.vehicle && created.vehicle !== 'Pending' ? `Assigned to ${created.vehicle}` : 'Queued for priority allocation';
      showFeedback(feedbackEl, `Ride ${created.id} requested! ${assignedText}.`);
    } catch (err) {
      showFeedback(feedbackEl, err.message || 'Failed to create booking.', true);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}
