/**
 * utils/csrf.js
 *
 * Shared CSRF defence for the admin area.
 *
 * One random token per session, issued the first time a form is rendered and
 * echoed back by every admin POST. The comparison is timing-safe. Because the
 * token lives in the server-side session (never in a plain cookie) a stolen
 * form is useless, and because the admin area is the only place it is handed
 * out, an attacker cannot obtain it to build a forged request.
 */

const crypto = require('crypto');

function secureEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/** Returns the session's token, creating it on first use. */
function issue(req) {
  if (req.session && req.session.csrfToken) return req.session.csrfToken;
  const token = crypto.randomBytes(24).toString('hex');
  if (req.session) req.session.csrfToken = token;
  return token;
}

/** True when the posted token matches the stored one. */
function verify(req, token) {
  return !!(req.session && req.session.csrfToken && secureEqual(token, req.session.csrfToken));
}

module.exports = { issue, verify, secureEqual };