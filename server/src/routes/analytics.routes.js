const express = require('express');
const analyticsController = require('../controllers/analytics.controller');

const router = express.Router();

router.get('/arrival-times', analyticsController.getAllArrivalTimes);
router.get('/arrival-times/:area', analyticsController.getAreaArrivalTime);
router.post('/reset', analyticsController.resetAnalytics);

module.exports = router;
