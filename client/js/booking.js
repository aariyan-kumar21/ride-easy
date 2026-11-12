import { addBooking, getState } from './state.js';

const CATEGORY_LABELS = {
  senior: 'Senior Citizen',
  woman: 'Woman',
  regular: 'Regular'
};

const LOCATION_COORDS = {
  'MG Road Metro Station': [12.9756, 77.6066],
  'Indiranagar 100ft Rd': [12.9784, 77.6408],
  'Koramangala 4th Block': [12.9389, 77.6211],
  'Kempegowda Bus Station (Majestic)': [12.9767, 77.5713],
  'Whitefield ITPL': [12.9855, 77.7362],
  'Jayanagar 4th Block': [12.9304, 77.5830]
};

function showFeedback(el, message) {
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
}

export function initBookingPanel() {
  const form = document.getElementById('booking-form');
  const feedbackEl = document.getElementById('booking-feedback');
  const passengerInput = document.getElementById('passenger-count');

  document.querySelectorAll('.preset-chips').forEach((group) => {
    const targetId = group.dataset.target;
    const input = document.getElementById(targetId);
    group.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        if (input) input.value = chip.dataset.value || '';
      });
    });
  });

  form?.addEventListener('submit', (event) => {
    event.preventDefault();

    const pickup = document.getElementById('pickup-input')?.value.trim();
    const destination = document.getElementById('destination-input')?.value.trim();
    const vehicleType = form.querySelector('input[name="vehicleType"]:checked')?.value || 'cab';
    const passengerCount = Number(passengerInput?.value || 1);
    const categoryKey = document.getElementById('passenger-category')?.value || 'regular';

    if (!pickup || !destination) {
      showFeedback(feedbackEl, 'Please provide both pickup and destination locations.');
      return;
    }

    if (vehicleType === 'auto' && passengerCount > 3) {
      showFeedback(feedbackEl, 'Auto supports at most 3 passengers. Switch to Cab for larger groups.');
      return;
    }

    if (passengerCount < 1 || passengerCount > 6) {
      showFeedback(feedbackEl, 'Passenger count must be between 1 and 6.');
      return;
    }

    const { vehicles } = getState();
    const availableMatch = vehicles.find(
      (v) =>
        v.status === 'available' &&
        v.vehicleType.toLowerCase() === vehicleType &&
        v.capacity >= passengerCount
    );

    const newBooking = {
      id: `BK-${Math.floor(1046 + Math.random() * 900)}`,
      category: CATEGORY_LABELS[categoryKey] || 'Regular',
      vehicle: availableMatch ? availableMatch.id : 'Pending',
      status: availableMatch ? 'assigned' : 'queued',
      estPickup: availableMatch ? '4 min' : '—',
      pickup: LOCATION_COORDS[pickup] || [12.9716, 77.5946],
      destination: LOCATION_COORDS[destination] || [12.9784, 77.6408]
    };

    addBooking(newBooking);
    showFeedback(
      feedbackEl,
      `Mock request ${newBooking.id} added (${newBooking.category}, ${vehicleType.toUpperCase()}, ${passengerCount} pax).`
    );
  });
}
