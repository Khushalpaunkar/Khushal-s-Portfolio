/**
 * controllers/contactController.js
 *
 * POST /api/contact
 *
 * Handles the contact form end-to-end. Design rules:
 *
 *   * Spam: an invisible honeypot field silently swallows bots. The response
 *     is a fake success so they never learn to clear the field. Real requests
 *     have a cross-origin check (cheap CSRF defence) and are rate limited by
 *     the route middleware.
 *   * Validation: the Mongoose schema is the single source of truth. The
 *     request body is run through it, so field rules exist in exactly one
 *     place and can never drift from the database.
 *   * Privacy: nothing except what the visitor typed is stored. No IP address,
 *     no user agent, no referrer.
 *   * Offline honesty: if the database is unreachable the API says so with a
 *     503 instead of silently eating a message.
 */

const Contact = require('../models/Contact');
// Read at call time (not destructured) so tests can swap isDbReady.
const db = require('../config/db');
const validation = require('../utils/validation');

const stringField = validation.stringField;
const mapValidationErrors = validation.mapValidationErrors;

/**
 * Checks the Origin header against the Host when present. A cross-origin
 * script could otherwise drive the form like an open relay; the check is
 * deliberately bypassed when no Origin is sent, because non-browser clients
 * (curl, native apps) omit it entirely and blocking them helps no one.
 * The rate limiter still applies to those.
 */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.get('host');
  } catch {
    return false;
  }
}

/* Shapes a Mongoose ValidationError into a per-field errors map (utils/validation.js). */

async function contactController(req, res) {
  const body = req.body || {};

  /* --- Honeypot: humans never see or touch this field. --- */
  const honeypot = stringField(body.website);
  if (honeypot) {
    // Fake success, no quota spent on the user's behalf, nothing stored.
    return res.status(200).json({ ok: true, message: 'Message sent successfully.' });
  }

  /* --- Cross-origin check. --- */
  if (!sameOrigin(req)) {
    return res.status(403).json({ ok: false, message: 'Request origin was rejected.' });
  }

  /* --- Validation via the schema. --- */
  const message = new Contact({
    name: stringField(body.name),
    email: stringField(body.email),
    subject: stringField(body.subject),
    message: stringField(body.message),
  });

  try {
    await message.validate();
  } catch (error) {
    return res.status(400).json({
      ok: false,
      message: 'Please fix the highlighted fields.',
      errors: mapValidationErrors(error),
    });
  }

  /* --- Offline honesty. --- */
  if (!db.isDbReady()) {
    console.warn('[contact] MongoDB is unreachable — message deferred with a 503.');
    return res.status(503).json({
      ok: false,
      message: 'The message service is temporarily unavailable. Please try again later.',
    });
  }

  /* --- Persist. --- */
  try {
    await message.save();
    console.log(`[contact] New message from ${message.email}`);
    return res.status(201).json({ ok: true, message: 'Message sent successfully.' });
  } catch (error) {
    console.error('[contact] Failed to save message:', error.message);
    return res.status(500).json({
      ok: false,
      message: 'Something went wrong saving your message. Please try again.',
    });
  }
}

module.exports = contactController;
module.exports.stringField = stringField;
module.exports.mapValidationErrors = mapValidationErrors;