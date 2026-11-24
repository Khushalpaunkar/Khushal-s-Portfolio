/**
 * middleware/session.js
 *
 * Session middleware for the admin area.
 *
 * Production requires both a stable session secret and a live MongoDB-backed
 * store. Offline admin requests are rejected while the public site remains
 * available; the store is selected again after the database recovers.
 */

const crypto = require('crypto');
const session = require('express-session');
// connect-mongo@6 ships a namespace object, so the class must be pulled out of
// it — the bare module has no static create().
const { MongoStore } = require('connect-mongo');
const mongoose = require('mongoose');
const db = require('../config/db');

const isProduction = process.env.NODE_ENV === 'production';

const SESSION_NAME = 'khushal.sid';
const MAX_AGE_MS = Number(process.env.SESSION_MAX_AGE_MS) || 8 * 60 * 60 * 1000; // 8h

let sessionMiddleware = null;
let sessionStoreMode = null;
let warnedAboutSecret = false;
let fallbackSecret = null;

function assertSessionConfig() {
  if (isProduction && !(process.env.SESSION_SECRET || '').trim()) {
    throw new Error('[session] SESSION_SECRET is required in production.');
  }
}

function chooseStore(databaseReady) {
  if (!databaseReady) {
    if (isProduction) {
      throw new Error('[session] MongoDB must be connected before creating production sessions.');
    }
    console.warn('[session] MongoDB offline — using an in-memory session store.');
    return new session.MemoryStore();
  }

  return MongoStore.create({
    // connect-mongo@6 dropped the old `mongooseConnection` option and wants a
    // real MongoClient — asPromise() resolves to the Mongoose connection, not
    // the client, so use getClient(). This reuses the existing pool instead of
    // opening a second one. Safe here: this only runs once isDbReady() is true.
    client: mongoose.connection.getClient(),
    touchAfter: 24 * 3600, // seconds — avoids a write per request
  });
}

function getSessionMiddleware() {
  assertSessionConfig();
  const databaseReady = db.isDbReady();
  const storeMode = databaseReady ? 'mongo' : 'memory';
  if (sessionMiddleware && sessionStoreMode === storeMode) return sessionMiddleware;

  const secret = process.env.SESSION_SECRET;
  if (!secret && !warnedAboutSecret) {
    warnedAboutSecret = true;
    console.warn(
      '[session] SESSION_SECRET is not set — using a per-boot random secret. ' +
        'Sessions will not survive a restart. Set it in production.'
    );
  }
  if (!secret && !fallbackSecret) fallbackSecret = crypto.randomBytes(32).toString('hex');

  sessionMiddleware = session({
    name: SESSION_NAME,
    secret: secret || fallbackSecret,
    store: chooseStore(databaseReady),
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
  sessionStoreMode = storeMode;

  return sessionMiddleware;
}

/**
 * The middleware itself. Delegates to a lazily-built instance so the session
 * store selection happens against a settled database state.
 */
function sessionMiddlewareHandler(req, res, next) {
  if (isProduction && !db.isDbReady()) {
    return res
      .status(503)
      .set('Retry-After', '5')
      .send('Admin sessions are temporarily unavailable while the database reconnects.');
  }
  getSessionMiddleware()(req, res, next);
}

module.exports = sessionMiddlewareHandler;
module.exports.getSessionMiddleware = getSessionMiddleware;
module.exports.assertSessionConfig = assertSessionConfig;
module.exports.SESSION_NAME = SESSION_NAME;
module.exports.MAX_AGE_MS = MAX_AGE_MS;