const express = require('express');
const { getQueue, getAdminStats, triggerAllocation } = require('../controllers/admin.controller');

const router = express.Router();

router.get('/queue', getQueue);
router.get('/admin/stats', getAdminStats);
router.post('/allocate', triggerAllocation);

module.exports = router;

