/**
 * middleware/adminCsrf.js
 * Composed guard for admin POST endpoints: authenticated AND carries a valid
 * CSRF token. Order matters — requireAdmin first keeps the token logic off
 * anonymous traffic.
 */

const csrf = require('../utils/csrf');

function requireAdminCsrf(req, res, next) {
  if (csrf.verify(req, req.body.csrfToken)) return next();

  return res.status(403).render('admin/error', {
    title: 'Forbidden',
    status: 403,
    message: 'That form was invalid or expired. Go back and try again.',
  });
}

module.exports = requireAdminCsrf;