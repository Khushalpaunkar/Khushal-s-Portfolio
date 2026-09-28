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

/** True when the process holds a live, connected Mongoose connection. */
function isDbReady() {
  return dbReady && mongoose.connection.readyState === 1;
}

/**
 * Attempts a single connection. Resolves to true on success, false on failure.
 * Never throws, and never rejects — callers treat the DB as optional.
 */
async function connectDB() {
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

    dbReady = true;
    console.log(`[db] Connected to MongoDB (${mongoose.connection.name})`);
    return true;
  } catch (error) {
    dbReady = false;
    console.error('[db] Connection failed:', error.message);
    console.error('[db] Starting in offline mode. The site will still serve pages.');
    return false;
  }
}

/** Closes the connection cleanly during graceful shutdown. */
async function disconnectDB() {
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
  dbReady = true;
  console.log('[db] Reconnected to MongoDB');
});

module.exports = { connectDB, disconnectDB, isDbReady };
