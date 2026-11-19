const analyticsService = require('../services/analytics.service');
const simulationService = require('../services/simulation.service');

async function getAllArrivalTimes(req, res, next) {
  try {
    const vehicleType = req.query.vehicleType || 'cab';
    const data = analyticsService.getAllAreasAnalytics(vehicleType);
    const simTime = simulationService.getSimulationTime();
    const periodInfo = analyticsService.getTimePeriod(simTime);

    return res.status(200).json({
      success: true,
      currentSimulationTime: simTime.toISOString(),
      periodInfo,
      isPeakRushHour: periodInfo.isPeakHour,
      ...data
    });
  } catch (err) {
    next(err);
  }
}

async function getAreaArrivalTime(req, res, next) {
  try {
    const { area } = req.params;
    const vehicleType = req.query.vehicleType || 'cab';
    const data = analyticsService.getAreaAnalytics(area, vehicleType);
    const simTime = simulationService.getSimulationTime();
    const periodInfo = analyticsService.getTimePeriod(simTime);

    return res.status(200).json({
      success: true,
      currentSimulationTime: simTime.toISOString(),
      periodInfo,
      isPeakRushHour: periodInfo.isPeakHour,
      ...data
    });
  } catch (err) {
    next(err);
  }
}

async function resetAnalytics(req, res, next) {
  try {
    analyticsService.resetAnalytics();
    return res.status(200).json({
      success: true,
      message: 'Analytics data reset successfully'
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllArrivalTimes,
  getAreaArrivalTime,
  resetAnalytics
};
