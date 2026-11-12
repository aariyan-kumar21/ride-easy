/**
 * Health check controller for verifying backend availability.
 */
function getHealth(req, res) {
  res.status(200).json({
    status: 'ok',
    service: 'smart-cab-allocation-backend',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime())
  });
}

module.exports = { getHealth };

