const https = require('https');
const http = require('http');
const env = require('../config/env');

// Transparent 1x1 PNG for fallback when API key is missing or upstream fails
const TRANSPARENT_1X1_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

// In-memory tile cache with 3-minute TTL
const tileCache = new Map();
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes
const MAX_CACHE_ENTRIES = 500;

/**
 * Fetch remote image buffer from TomTom Orbis Traffic API
 * Passes TomTom-Api-Key strictly via HTTP header without exposing it in URL or logs
 */
function fetchBuffer(url, headers = {}, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers, timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        const err = new Error(`TomTom upstream returned HTTP ${res.statusCode}`);
        err.statusCode = res.statusCode;
        return reject(err);
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: res.headers['content-type'] || 'image/png'
        })
      );
      res.on('error', reject);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('TomTom upstream request timed out'));
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

  // TomTom Orbis Traffic Flow Raster Tiles API v2 endpoint
  const orbisUrl = `https://api.tomtom.com/maps/orbis/traffic/flow/raster/tile/${z}/${x}/${y}?apiVersion=2&style=light`;
  const headers = {
    'TomTom-Api-Key': apiKey,
    'Accept': 'image/png'
  };

  try {
    const result = await fetchBuffer(orbisUrl, headers, 4500);
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
  } catch (err) {
    // Log clearly in the backend terminal without exposing the API key
    console.error(`[TomTom Proxy Error] Failed fetching tile z=${z}, x=${x}, y=${y}: ${err.message}`);

    // Fallback cleanly to transparent 1x1 PNG so map and simulation remain fully operational
    return {
      buffer: TRANSPARENT_1X1_PNG,
      contentType: 'image/png',
      isFallback: true,
      reason: 'upstream_fetch_failed'
    };
  }
}

function getTrafficStatus() {
  const apiKey = env.tomtomApiKey && env.tomtomApiKey.trim();
  const configured = Boolean(apiKey && apiKey !== 'your_tomtom_api_key_here');
  return {
    configured,
    provider: 'TomTom',
    endpoint: 'https://api.tomtom.com/maps/orbis/traffic/flow/raster/tile/{z}/{x}/{y}?apiVersion=2&style=light',
    authMethod: 'TomTom-Api-Key header',
    style: 'light',
    refreshMinutes: 3,
    cachedTiles: tileCache.size,
    message: configured
      ? 'TomTom Orbis Traffic Flow Raster Tiles proxy is active'
      : 'TOMTOM_API_KEY is not configured. Add TOMTOM_API_KEY to .env to enable.'
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
