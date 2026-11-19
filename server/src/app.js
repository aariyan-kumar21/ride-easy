const path = require('path');
const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const healthRoutes = require('./routes/health.routes');
const vehicleRoutes = require('./routes/vehicle.routes');
const bookingRoutes = require('./routes/booking.routes');
const adminRoutes = require('./routes/admin.routes');
const simulationRoutes = require('./routes/simulation.routes');
const trafficRoutes = require('./routes/traffic.routes');
const analyticsRoutes = require('./routes/analytics.routes');
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
      // Allow requests with no origin (like mobile apps, curl, or same-origin static assets)
      // or known local development origins, or any deployed domain (e.g. *.onrender.com)
      if (
        !origin ||
        allowedOrigins.has(origin) ||
        origin.endsWith('.onrender.com') ||
        env.nodeEnv === 'production'
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true
  })
);

app.use(express.json());

// API routes
app.use('/api/health', healthRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/simulation', simulationRoutes);
app.use('/api/traffic', trafficRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api', adminRoutes);

// Explicitly return 204 No Content for favicon requests
app.get('/favicon.ico', (req, res) => res.status(204).end());

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
