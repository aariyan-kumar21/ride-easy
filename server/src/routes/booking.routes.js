const express = require('express');
const {
  listBookings,
  getBookingById,
  createBooking,
  cancelBooking,
  startTrip
} = require('../controllers/booking.controller');

const router = express.Router();

router.get('/', listBookings);
router.post('/', createBooking);
router.get('/:id', getBookingById);
router.post('/:id/cancel', cancelBooking);
router.post('/:id/start', startTrip);

module.exports = router;

