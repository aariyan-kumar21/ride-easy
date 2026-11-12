/**
 * Handle unmatched API routes with a structured 404 JSON response.
 */
function notFoundHandler(req, res, next) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      error: 'NotFound',
      message: `Route ${req.method} ${req.originalUrl} does not exist`
    });
  }
  return next();
}

/**
 * Global Express error-handling middleware.
 * Masks internal DB/driver errors so credentials or raw stack traces are never exposed.
 */
function errorHandler(err, req, res, _next) {
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'Request data failed schema validation'
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      error: 'InvalidIdentifier',
      message: 'Invalid identifier format'
    });
  }

  if (err.code === 11000) {
    return res.status(409).json({
      error: 'Conflict',
      message: 'A record with this identifier already exists'
    });
  }

  const statusCode = err.statusCode || 500;
  const safeMessage =
    statusCode >= 500 ? 'An unexpected server error occurred' : err.message || 'Request failed';

  if (statusCode >= 500) {
    console.error('Unhandled server error:', err.message);
  }

  return res.status(statusCode).json({
    error: statusCode >= 500 ? 'InternalServerError' : err.name || 'RequestError',
    message: safeMessage
  });
}

module.exports = { notFoundHandler, errorHandler };
