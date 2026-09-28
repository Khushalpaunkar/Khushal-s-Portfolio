/**
 * middleware/contactLimiter.js
 *
 * Rate limiting for the contact endpoint, backed by express-rate-limit.
 *
 * IPs are held in memory and never persisted, which keeps the contact data's
 * privacy promise intact: the database stores only what a visitor typed.
 * The limit is intentionally low because a student portfolio should receive a
 * handful of messages, and it is far tighter than any human workflow needs.
 *
 * In production this requires the trust-proxy setting in server.js, which is
 * already applied when NODE_ENV === 'production'.
 *
 * The factory exists so tests can build a fresh limiter with an empty pool;
 * the default instance below is what the route uses.
 */

const rateLimit = require('express-rate-limit');

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LIMIT = 5;
const HANDLER_MESSAGE =
  'Too many messages from this address. Please try again in a few minutes.';

function createContactLimiter(overrides = {}) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit: LIMIT,
    standardHeaders: 'draft-7',
    legacyHeaders: false,

    // Honeypot submissions are still counted: the fake success tells the bot
    // nothing, while the limiter quietly shuts it up for the window.
    handler: (req, res) => {
      res.status(429).json({
        ok: false,
        message: HANDLER_MESSAGE,
      });
    },

    ...overrides,
  });
}

module.exports = createContactLimiter();
module.exports.createContactLimiter = createContactLimiter;
module.exports.CONTACT_LIMIT = LIMIT;
module.exports.CONTACT_WINDOW_MS = WINDOW_MS;