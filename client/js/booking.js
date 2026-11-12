const CATEGORY_LABELS = {
  senior: 'Senior Citizen',
  woman: 'Woman',
  regular: 'Regular'
};

function showFeedback(el, message) {
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
}

export function initBookingPanel({ onMockBookingCreated }) {
  const form = document.getElementById('booking-form');
  const feedbackEl = document.getElementById('booking-feedback');
  const passengerInput = document.getElementById('passenger-count');

  // Wire preset location chips
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

    const newBooking = {
      id: `BK-${Math.floor(1046 + Math.random() * 900)}`,
      category: CATEGORY_LABELS[categoryKey] || 'Regular',
      vehicle: vehicleType === 'cab' ? 'CAB-101' : 'AUTO-201',
      status: 'assigned',
      estPickup: '4 min'
    };

    onMockBookingCreated?.(newBooking);
    showFeedback(
      feedbackEl,
      `Mock request ${newBooking.id} submitted (${newBooking.category}, ${vehicleType.toUpperCase()}, ${passengerCount} pax).`
    );
  });
}
