/**
 * middleware/errorHandler.js
 * Centralised error handling.
 *
 * - Always logs the real error server-side.
 * - Sends a friendly page (or JSON) to the client.
 * - Never leaks a stack trace or database URI in production.
 */

const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';

module.exports = function errorHandler(err, req, res, next) {
  // If headers are already sent, hand back to Express to close the connection.
  if (res.headersSent) return next(err);

  const status = err.status || err.statusCode || 500;
  const logMessage = `[error] ${req.method} ${req.originalUrl} -> ${status}: ${err.message}`;

  if (!isProduction) console.error(logMessage);
  else console.error(logMessage);

  const wantsJson =
    req.xhr ||
    req.path.startsWith('/api') ||
    (req.headers.accept || '').includes('application/json');

  if (wantsJson) {
    return res.status(status).json({
      success: false,
      // Generic message in production so internals are never exposed.
      message: isProduction ? 'Something went wrong.' : err.message,
    });
  }

  res.status(status).render(path.join('error'), {
    title: `${status} — Server Error`,
    status,
    // Stack traces are a development aid only.
    detail: isProduction ? null : err.message,
    stack: isProduction ? null : err.stack,
  });
};
