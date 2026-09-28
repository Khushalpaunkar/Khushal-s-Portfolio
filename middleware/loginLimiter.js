/**
 * middleware/loginLimiter.js
 *
 * Brute-force protection for the admin login. Tighter than the public contact
 * limiter because this is a single-user credential door. Counted per IP in
 * memory only — nothing is persisted.
 *
 * The factory exists so tests can build fresh limiters with empty pools; the
 * default instance is what the route uses.
 */

const rateLimit = require('express-rate-limit');

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LIMIT = 10;
const HANDLER_MESSAGE = 'Too many login attempts. Please wait and try again later.';

function createLoginLimiter(overrides = {}) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit: LIMIT,
    standardHeaders: 'draft-7',
    legacyHeaders: false,

    handler: (req, res) => {
      res.status(429).json({
        ok: false,
        message: HANDLER_MESSAGE,
      });
    },

    ...overrides,
  });
}

module.exports = createLoginLimiter();
module.exports.createLoginLimiter = createLoginLimiter;
module.exports.LOGIN_LIMIT = LIMIT;
module.exports.LOGIN_WINDOW_MS = WINDOW_MS;