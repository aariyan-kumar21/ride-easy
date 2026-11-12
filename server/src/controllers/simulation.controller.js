const simulationService = require('../services/simulation.service');
const socketHandler = require('../sockets/socket.handler');

function getState(req, res) {
  res.status(200).json(simulationService.getSimulationState());
}

async function start(req, res, next) {
  try {
    const state = await simulationService.startSimulation();
    socketHandler.emitSimulationState(state);
    res.status(200).json(state);
  } catch (err) {
    next(err);
  }
}

function pause(req, res) {
  const state = simulationService.pauseSimulation();
  socketHandler.emitSimulationState(state);
  res.status(200).json(state);
}

async function resume(req, res, next) {
  try {
    const state = await simulationService.resumeSimulation();
    socketHandler.emitSimulationState(state);
    res.status(200).json(state);
  } catch (err) {
    next(err);
  }
}

function setSpeed(req, res, next) {
  try {
    const state = simulationService.setSimulationSpeed(req.body?.speed);
    socketHandler.emitSimulationState(state);
    res.status(200).json(state);
  } catch (err) {
    next(err);
  }
}

async function reset(req, res, next) {
  try {
    const state = await simulationService.resetSimulation();
    socketHandler.emitSimulationState(state);
    const io = socketHandler.getIO();
    if (io) {
      const sockets = await io.fetchSockets();
      await Promise.all(sockets.map((s) => socketHandler.sendFullSync(s)));
    }
    res.status(200).json(state);
  } catch (err) {
    next(err);
  }
}

module.exports = { getState, start, pause, resume, setSpeed, reset };

