/**
 * middleware/auth.js
 * Guards for the admin area.
 */

const csrf = require('../utils/csrf');

/** Redirects unauthenticated visitors to the login form, preserving where
 *  they were headed so login can bounce them straight back. */
function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  const nextPath = encodeURIComponent(req.originalUrl);
  return res.redirect(`/admin/login?next=${nextPath}`);
}

/** Exposes the logged-in admin to every admin view (never the password), and
 *  the session's CSRF token so admin templates (e.g. the logout form) can
 *  carry it without every controller having to pass it along. */
function adminLocals(req, res, next) {
  res.locals.adminUser = req.session && req.session.admin ? req.session.admin : null;
  res.locals.csrfToken = csrf.issue(req);
  next();
}

module.exports = { requireAdmin, adminLocals };