/**
 * Handle unmatched API routes with a structured 404 JSON response.
 */
function notFoundHandler(req, res, next) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.method} ${req.originalUrl} does not exist`
    });
  }
  return next();
}

/**
 * Global Express error-handling middleware.
 */
function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: err.name || 'InternalServerError',
    message: err.message || 'An unexpected error occurred'
  });
}

module.exports = { notFoundHandler, errorHandler };

