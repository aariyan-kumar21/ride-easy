const express = require('express');
const { getQueue, getAdminStats } = require('../controllers/admin.controller');

const router = express.Router();

router.get('/queue', getQueue);
router.get('/admin/stats', getAdminStats);

module.exports = router;

