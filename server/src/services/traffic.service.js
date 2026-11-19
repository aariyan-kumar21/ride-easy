const https = require('https');
const http = require('http');
const env = require('../config/env');

// Transparent 1x1 PNG for fallback
const TRANSPARENT_1X1_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

// In-memory tile cache with 3-minute TTL
const tileCache = new Map();
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes
const MAX_CACHE_ENTRIES = 500;

function fetchBuffer(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Upstream returned HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] || 'image/png' }));
      res.on('error', reject);
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Upstream request timed out'));
    });
    req.on('error', reject);
  });
}

function getCacheKey(z, x, y) {
  return `${z}_${x}_${y}`;
}

function cleanCache() {
  const now = Date.now();
  for (const [key, entry] of tileCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      tileCache.delete(key);
    }
  }
  if (tileCache.size > MAX_CACHE_ENTRIES) {
    // Evict oldest entries
    const iter = tileCache.keys();
    while (tileCache.size > MAX_CACHE_ENTRIES) {
      tileCache.delete(iter.next().value);
    }
  }
}

async function getTrafficTile(z, x, y) {
  const apiKey = env.tomtomApiKey && env.tomtomApiKey.trim();
  if (!apiKey || apiKey === 'your_tomtom_api_key_here') {
    return {
      buffer: TRANSPARENT_1X1_PNG,
      contentType: 'image/png',
      isFallback: true,
      reason: 'api_key_not_configured'
    };
  }

  const cacheKey = getCacheKey(z, x, y);
  const cached = tileCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return {
      buffer: cached.buffer,
      contentType: cached.contentType,
      isFallback: false,
      fromCache: true
    };
  }

  // Try TomTom Orbis Traffic API first, then legacy relative0 API if needed
  const primaryUrl = `https://api.tomtom.com/maps/orbis/traffic/flow/tile/relative/${z}/${x}/${y}.png?key=${encodeURIComponent(apiKey)}`;
  const fallbackUrl = `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/${z}/${x}/${y}.png?key=${encodeURIComponent(apiKey)}`;

  try {
    const result = await fetchBuffer(primaryUrl, 4500);
    tileCache.set(cacheKey, {
      buffer: result.buffer,
      contentType: result.contentType,
      timestamp: Date.now()
    });
    cleanCache();
    return {
      buffer: result.buffer,
      contentType: result.contentType,
      isFallback: false
    };
  } catch (primaryErr) {
    // Attempt legacy TomTom traffic raster tile endpoint
    try {
      const result = await fetchBuffer(fallbackUrl, 4500);
      tileCache.set(cacheKey, {
        buffer: result.buffer,
        contentType: result.contentType,
        timestamp: Date.now()
      });
      cleanCache();
      return {
        buffer: result.buffer,
        contentType: result.contentType,
        isFallback: false
      };
    } catch (fallbackErr) {
      // Graceful fallback to transparent PNG so map never breaks
      return {
        buffer: TRANSPARENT_1X1_PNG,
        contentType: 'image/png',
        isFallback: true,
        reason: 'upstream_fetch_failed'
      };
    }
  }
}

function getTrafficStatus() {
  const apiKey = env.tomtomApiKey && env.tomtomApiKey.trim();
  const configured = Boolean(apiKey && apiKey !== 'your_tomtom_api_key_here');
  return {
    configured,
    provider: 'TomTom',
    style: 'relative',
    refreshMinutes: 3,
    cachedTiles: tileCache.size,
    message: configured
      ? 'TomTom Traffic Flow Raster Tiles proxy is active'
      : 'TOMTOM_API_KEY is not configured. Traffic heatmap layer disabled gracefully. Add TOMTOM_API_KEY to .env to enable.'
  };
}

function clearTileCache() {
  tileCache.clear();
}

module.exports = {
  getTrafficTile,
  getTrafficStatus,
  clearTileCache,
  TRANSPARENT_1X1_PNG
};
