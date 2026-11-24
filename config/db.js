/**
 * config/db.js
 * Mongoose connection with a non-fatal failure mode.
 *
 * Design rule: the public portfolio must never render blank. If MongoDB is
 * unreachable or MONGODB_URI is missing, the server still boots and serves
 * pages; `isDbReady()` simply reports false and controllers fall back to
 * bundled seed data.
 */

const mongoose = require('mongoose');

const isProduction = process.env.NODE_ENV === 'production';

let dbReady = false;
let connectionAttempt = null;
let reconnectTimer = null;
let retryAttempt = 0;

const RETRY_BASE_MS = 5000;
const RETRY_MAX_MS = 60000;

function clearReconnectTimer() {
  if (!reconnectTimer) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function describeError(error) {
  const name =
    error && typeof error.name === 'string'
      ? error.name.replace(/[^a-zA-Z0-9_$.-]/g, '').slice(0, 80)
      : 'UnknownError';
  const rawCode = error && (error.code || (error.cause && error.cause.code));
  const code =
    typeof rawCode === 'number' && Number.isFinite(rawCode)
      ? String(rawCode)
      : typeof rawCode === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(rawCode)
        ? rawCode
        : '';
  return code ? `${name}, code=${code}` : name;
}

function scheduleReconnect() {
  if (!process.env.MONGODB_URI || reconnectTimer || isDbReady()) return;
  const delay = Math.min(RETRY_BASE_MS * 2 ** retryAttempt, RETRY_MAX_MS);
  retryAttempt += 1;
  console.warn(`[db] Retrying MongoDB connection in ${Math.round(delay / 1000)}s.`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectDB();
  }, delay);
  if (typeof reconnectTimer.unref === 'function') reconnectTimer.unref();
}

/** True when the process holds a live, connected Mongoose connection. */
function isDbReady() {
  return dbReady && mongoose.connection.readyState === 1;
}

/**
 * Attempts a connection. Retries continue in the background after a failure,
 * while callers can keep serving pages and accurately report the DB as offline.
 */
async function connectDB() {
  if (isDbReady()) return true;
  if (connectionAttempt) return connectionAttempt;

  connectionAttempt = connectOnce();
  try {
    return await connectionAttempt;
  } finally {
    connectionAttempt = null;
  }
}

async function connectOnce() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.warn(
      '[db] MONGODB_URI is not set — starting in offline mode. ' +
        'Content will be served from bundled seed data.'
    );
    return false;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: 10,
      autoIndex: !isProduction,
    });

    clearReconnectTimer();
    retryAttempt = 0;
    dbReady = true;
    console.log(`[db] Connected to MongoDB (${mongoose.connection.name})`);
    return true;
  } catch (error) {
    dbReady = false;
    console.error(
      `[db] Connection attempt failed (${describeError(error)}). ` +
        'Check MONGODB_URI formatting and database network/access settings.'
    );
    scheduleReconnect();
    return false;
  }
}

/** Closes the connection cleanly during graceful shutdown. */
async function disconnectDB() {
  clearReconnectTimer();
  if (mongoose.connection.readyState === 0) return;
  await mongoose.connection.close();
  dbReady = false;
}

/**
 * Logs connection lifecycle changes once, so unexpected drops are visible in
 * the terminal without spamming request logs.
 */
mongoose.connection.on('disconnected', () => {
  if (dbReady) console.warn('[db] Disconnected — serving from fallback data.');
  dbReady = false;
});

mongoose.connection.on('reconnected', () => {
  clearReconnectTimer();
  retryAttempt = 0;
  dbReady = true;
  console.log('[db] Reconnected to MongoDB');
});

module.exports = { connectDB, disconnectDB, isDbReady };
