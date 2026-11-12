const mongoose = require('mongoose');

/**
 * Health check controller for verifying backend and database availability.
 */
function getHealth(req, res) {
  const readyStateMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };

  const dbStatus = readyStateMap[mongoose.connection.readyState] || 'unknown';

  res.status(200).json({
    status: 'ok',
    service: 'smart-cab-allocation-backend',
    database: dbStatus,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime())
  });
}

module.exports = { getHealth };
