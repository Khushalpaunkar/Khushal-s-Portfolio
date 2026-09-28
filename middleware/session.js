/**
 * middleware/session.js
 *
 * Session middleware for the admin area.
 *
 * Two deliberate design decisions:
 *
 *   * The store is chosen lazily on the first request. The database connection
 *     is established inside server.js's start() (before listen), so by the time
 *     any request arrives a live Mongoose connection either exists or never
 *     will. MongoStore is only ever constructed against a connected client;
 *     otherwise a MemoryStore keeps the admin routes functional offline — and
 *     since login requires the Admin collection anyway, an offline login is
 *     rejected gracefully rather than crashing.
 *
 *   * A missing SESSION_SECRET does not prevent the server from booting. A
 *     per-boot random secret is used instead, with a loud warning: sessions
 *     then simply do not survive a restart. This mirrors the non-fatal
 *     database philosophy — but production must set a real secret.
 */

const crypto = require('crypto');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const db = require('../config/db');

const isProduction = process.env.NODE_ENV === 'production';

const SESSION_NAME = 'khushal.sid';
const MAX_AGE_MS = Number(process.env.SESSION_MAX_AGE_MS) || 8 * 60 * 60 * 1000; // 8h

let sessionMiddleware = null;
let warnedAboutSecret = false;

function chooseStore() {
  if (!db.isDbReady()) {
    console.warn('[session] MongoDB offline — using an in-memory session store.');
    return new session.MemoryStore();
  }

  return MongoStore.create({
    mongooseConnection: mongoose.connection,
    touchAfter: 24 * 3600, // seconds — avoids a write per request
  });
}

function getSessionMiddleware() {
  if (sessionMiddleware) return sessionMiddleware;

  const secret = process.env.SESSION_SECRET;
  if (!secret && !warnedAboutSecret) {
    warnedAboutSecret = true;
    console.warn(
      '[session] SESSION_SECRET is not set — using a per-boot random secret. ' +
        'Sessions will not survive a restart. Set it in production.'
    );
  }

  sessionMiddleware = session({
    name: SESSION_NAME,
    secret: secret || crypto.randomBytes(32).toString('hex'),
    store: chooseStore(),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: MAX_AGE_MS,
    },
  });

  return sessionMiddleware;
}

/**
 * The middleware itself. Delegates to a lazily-built instance so the session
 * store selection happens against a settled database state.
 */
function sessionMiddlewareHandler(req, res, next) {
  getSessionMiddleware()(req, res, next);
}

module.exports = sessionMiddlewareHandler;
module.exports.getSessionMiddleware = getSessionMiddleware;
module.exports.SESSION_NAME = SESSION_NAME;
module.exports.MAX_AGE_MS = MAX_AGE_MS;