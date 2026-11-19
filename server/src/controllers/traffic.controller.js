const trafficService = require('../services/traffic.service');

async function getStatus(req, res, next) {
  try {
    const status = trafficService.getTrafficStatus();
    res.status(200).json(status);
  } catch (err) {
    next(err);
  }
}

async function getTile(req, res, next) {
  try {
    const z = parseInt(req.params.z, 10);
    const x = parseInt(req.params.x, 10);
    const y = parseInt(req.params.y, 10);

    if (isNaN(z) || isNaN(x) || isNaN(y) || z < 0 || z > 22 || x < 0 || y < 0) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Valid integer zoom (0-22) and tile coordinates (x, y) are required'
      });
    }

    const tile = await trafficService.getTrafficTile(z, x, y);

    res.set({
      'Content-Type': tile.contentType || 'image/png',
      'Cache-Control': 'public, max-age=180',
      'X-Traffic-Fallback': tile.isFallback ? 'true' : 'false'
    });

    return res.status(200).send(tile.buffer);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStatus,
  getTile
};
