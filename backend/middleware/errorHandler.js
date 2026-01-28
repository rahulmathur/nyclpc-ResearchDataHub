/**
 * Centralized error handling middleware
 * Provides consistent error responses across all controllers
 */

/**
 * Wraps an async controller function with try/catch error handling
 * Logs errors with request method and path
 * Returns proper error response with message
 * In non-production environments, includes stack trace
 *
 * @param {Function} handlerFn - Async controller function to wrap
 * @returns {Function} Express middleware function with error handling
 *
 * @example
 * app.get('/api/projects', createControllerHandler(async (req, res) => {
 *   const result = await getPool().query('SELECT * FROM hub_projects');
 *   res.json({ success: true, data: result.rows });
 * }));
 */
function createControllerHandler(handlerFn) {
  return async (req, res, next) => {
    try {
      await handlerFn(req, res, next);
    } catch (error) {
      console.error(`${req.method} ${req.path} error:`, error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Internal server error',
        ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
      });
    }
  };
}

module.exports = { createControllerHandler };
