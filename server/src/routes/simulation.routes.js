const express = require('express');
const {
  getState,
  start,
  pause,
  resume,
  setSpeed,
  reset
} = require('../controllers/simulation.controller');

const router = express.Router();

router.get('/state', getState);
router.post('/start', start);
router.post('/pause', pause);
router.post('/resume', resume);
router.post('/speed', setSpeed);
router.post('/reset', reset);

module.exports = router;

