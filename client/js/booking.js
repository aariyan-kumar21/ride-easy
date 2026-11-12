import { createBooking } from './state.js';

const LOCATION_COORDS = {
  'MG Road Metro Station': [12.9756, 77.6066],
  'Indiranagar 100ft Rd': [12.9784, 77.6408],
  'Koramangala 4th Block': [12.9389, 77.6211],
  'Kempegowda Bus Station (Majestic)': [12.9767, 77.5713],
  'Whitefield ITPL': [12.9855, 77.7362],
  'Jayanagar 4th Block': [12.9304, 77.5830]
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
  const submitBtn = form?.querySelector('button[type="submit"]');

  document.querySelectorAll('.preset-chips').forEach((group) => {
    const targetId = group.dataset.target;
    const input = document.getElementById(targetId);
    group.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        if (input) input.value = chip.dataset.value || '';
      });
    });
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const pickupLabel = document.getElementById('pickup-input')?.value.trim();
    const destLabel = document.getElementById('destination-input')?.value.trim();
    const vehicleType = form.querySelector('input[name="vehicleType"]:checked')?.value || 'cab';
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
    showFeedback(feedbackEl, 'Submitting booking request...');

    try {
      const created = await createBooking({
        category,
        vehicleType,
        passengerCount,
        pickup: { lat: pickupLat, lng: pickupLng, label: pickupLabel },
        destination: { lat: destLat, lng: destLng, label: destLabel }
      });

      showFeedback(
        feedbackEl,
        `Booking ${created.id} created with status "${created.status}" (pending allocation).`
      );
    } catch (err) {
      showFeedback(feedbackEl, err.message || 'Failed to create booking.', true);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}
