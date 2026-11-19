const express = require('express');
const trafficController = require('../controllers/traffic.controller');

const router = express.Router();

router.get('/status', trafficController.getStatus);
router.get('/tiles/:z/:x/:y.png', trafficController.getTile);

module.exports = router;
