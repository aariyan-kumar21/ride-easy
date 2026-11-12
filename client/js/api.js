const API_BASE = window.location.port === '5500' ? 'http://localhost:5000' : '';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `Request failed (${response.status})`);
  }
  return data;
}

export const api = {
  getHealth: () => request('/api/health'),
  getVehicles: () => request('/api/vehicles'),
  updateVehicleStatus: (vehicleId, status) =>
    request(`/api/vehicles/${encodeURIComponent(vehicleId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    }),
  getBookings: () => request('/api/bookings'),
  getBooking: (bookingId) => request(`/api/bookings/${encodeURIComponent(bookingId)}`),
  createBooking: (payload) =>
    request('/api/bookings', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  cancelBooking: (bookingId) =>
    request(`/api/bookings/${encodeURIComponent(bookingId)}/cancel`, {
      method: 'POST'
    }),
  getQueue: () => request('/api/queue'),
  getAdminStats: () => request('/api/admin/stats')
};

