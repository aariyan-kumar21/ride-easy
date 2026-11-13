const simulationService = require('../services/simulation.service');
const scenarioService = require('../services/scenario.service');
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

async function complete(req, res, next) {
  try {
    const state = await simulationService.completeSimulation();
    res.status(200).json(state);
  } catch (err) {
    next(err);
  }
}

async function clear(req, res, next) {
  try {
    const state = await simulationService.clearSimulation();
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

function getScenarios(req, res) {
  res.status(200).json({ scenarios: scenarioService.listScenarios() });
}

async function generateScenario(req, res, next) {
  try {
    const { name } = req.params;
    const result = await scenarioService.generateScenario(name);

    const notice = result.cancellationEvent
      ? `Scenario "${name}" loaded: ${result.cancellationEvent.cancelledVehicleId} cancelled -> ${result.cancellationEvent.affectedBookingId} reassigned to ${result.cancellationEvent.reallocatedTo}`
      : `Scenario "${name}" loaded (${result.simulatedTimeLabel})`;

    const simState = simulationService.setSimulationContext({
      scenarioId: name,
      simulatedTime: result.simulatedTime,
      timeLabel: result.simulatedTimeLabel,
      notice
    });

    socketHandler.emitSimulationState(simState);
    const io = socketHandler.getIO();
    if (io) {
      const sockets = await io.fetchSockets();
      await Promise.all(sockets.map((s) => socketHandler.sendFullSync(s)));
    }

    res.status(200).json({ ...result, simulation: simState });
  } catch (err) {
    next(err);
  }
}

module.exports = { getState, start, pause, resume, setSpeed, reset, complete, clear, getScenarios, generateScenario };

