const simulationService = require('../services/simulation.service');

function getState(req, res) {
  res.status(200).json(simulationService.getSimulationState());
}

async function start(req, res, next) {
  try {
    const state = await simulationService.startSimulation();
    res.status(200).json(state);
  } catch (err) {
    next(err);
  }
}

function pause(req, res) {
  const state = simulationService.pauseSimulation();
  res.status(200).json(state);
}

async function resume(req, res, next) {
  try {
    const state = await simulationService.resumeSimulation();
    res.status(200).json(state);
  } catch (err) {
    next(err);
  }
}

function setSpeed(req, res, next) {
  try {
    const state = simulationService.setSimulationSpeed(req.body?.speed);
    res.status(200).json(state);
  } catch (err) {
    next(err);
  }
}

async function reset(req, res, next) {
  try {
    const state = await simulationService.resetSimulation();
    res.status(200).json(state);
  } catch (err) {
    next(err);
  }
}

module.exports = { getState, start, pause, resume, setSpeed, reset };

