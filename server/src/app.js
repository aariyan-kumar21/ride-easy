const path = require('path');
const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const healthRoutes = require('./routes/health.routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

const allowedOrigins = new Set([
  env.clientOrigin,
  `http://localhost:${env.port}`,
  `http://127.0.0.1:${env.port}`,
  'http://127.0.0.1:5500'
]);

app.use(
  cors({
    origin(origin, callback) {
      // Allow same-origin/non-browser requests (no Origin header) or configured local dev origins.
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true
  })
);

app.use(express.json());

// API routes
app.use('/api/health', healthRoutes);

// Serve static frontend files
const clientDir = path.resolve(__dirname, '../../client');
app.use(express.static(clientDir));

// Fallback to index.html for non-API GET routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  return res.sendFile(path.join(clientDir, 'index.html'));
});

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

