/**
 * middleware/notFound.js
 * Terminal middleware for unmatched routes. Renders the 404 view for browser
 * requests and returns JSON for API/AJAX clients.
 */

const path = require('path');

module.exports = function notFound(req, res) {
  const wantsJson =
    req.xhr ||
    req.path.startsWith('/api') ||
    (req.headers.accept || '').includes('application/json');

  if (wantsJson) {
    return res.status(404).json({ success: false, message: 'Resource not found' });
  }

  res.status(404).render(path.join('404'), {
    title: '404 — Page Not Found',
    attemptedPath: req.originalUrl,
  });
};
