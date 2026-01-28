/**
 * Database connection middleware
 * Ensures database connection is available before processing requests
 */

const { getPool } = require('../db');

/**
 * Middleware that checks if the database connection pool is available
 * Returns 500 error if not connected
 * Skips /health endpoint so health checks work without DB
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function requireDatabaseConnection(req, res, next) {
  // Skip health check endpoint - it reports DB status, doesn't require it
  if (req.path === '/health') {
    return next();
  }
  if (!getPool()) {
    return res.status(500).json({ error: 'Database not connected' });
  }
  next();
}

module.exports = { requireDatabaseConnection };
