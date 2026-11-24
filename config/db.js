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

function safeLabel(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return '';
  return value.replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 128);
}

function describeError(error) {
  const details = {
    type: safeLabel(error && error.name) || 'UnknownError',
  };
  let cause = error;
  for (let depth = 0; cause && depth < 3; depth += 1) {
    const code = safeLabel(cause.code);
    if (code) {
      details.code = code;
      break;
    }
    cause = cause.cause;
  }

  const topology = error && error.reason;
  if (topology && typeof topology.type === 'string') {
    details.topology = safeLabel(topology.type);
  }
  if (topology && topology.servers && typeof topology.servers[Symbol.iterator] === 'function') {
    details.servers = Array.from(topology.servers.entries())
      .slice(0, 10)
      .map(([address, server]) => {
        const serverDetails = {
          address: safeLabel(address),
          type: safeLabel(server && server.type) || 'Unknown',
        };
        if (server && server.error) {
          serverDetails.error = {
            type: safeLabel(server.error.name) || 'UnknownError',
          };
          let serverCause = server.error;
          for (let depth = 0; serverCause && depth < 3; depth += 1) {
            const code = safeLabel(serverCause.code);
            if (code) {
              serverDetails.error.code = code;
              break;
            }
            serverCause = serverCause.cause;
          }
        }
        return serverDetails;
      });
  }
  return details;
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
    console.error('[db] Connection attempt failed:', JSON.stringify(describeError(error)));
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
