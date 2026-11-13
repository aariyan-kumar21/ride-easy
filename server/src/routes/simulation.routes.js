const express = require('express');
const {
  getState,
  start,
  pause,
  resume,
  setSpeed,
  reset,
  complete,
  clear,
  getScenarios,
  generateScenario
} = require('../controllers/simulation.controller');

const router = express.Router();

router.get('/state', getState);
router.post('/start', start);
router.post('/pause', pause);
router.post('/resume', resume);
router.post('/speed', setSpeed);
router.post('/reset', reset);
router.post('/complete', complete);
router.post('/clear', clear);
router.get('/scenarios', getScenarios);
router.post('/scenarios/:name/generate', generateScenario);

module.exports = router;

