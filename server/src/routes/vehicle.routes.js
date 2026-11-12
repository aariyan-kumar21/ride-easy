const express = require('express');
const { getVehicles, updateVehicleStatus } = require('../controllers/vehicle.controller');

const router = express.Router();

router.get('/', getVehicles);
router.patch('/:id/status', updateVehicleStatus);

module.exports = router;

