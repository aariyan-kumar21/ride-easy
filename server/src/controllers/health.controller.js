/**
 * Health check controller for verifying backend availability and in-memory storage.
 */
function getHealth(req, res) {
  res.status(200).json({
    status: 'ok',
    service: 'smart-cab-allocation-backend',
    storage: 'in-memory',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime())
  });
}

module.exports = { getHealth };
