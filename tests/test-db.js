/**
 * test-db.js — MongoDB connection failure handling.
 *
 * Run: npm run verify (or: node tests/test-db.js)
 */

const mongoose = require('mongoose');
const db = require('../config/db');

const originalConnect = mongoose.connect;
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;
const originalUri = process.env.MONGODB_URI;
const originalReadyState = mongoose.connection.readyState;
const originalClose = mongoose.connection.close;
const originalSetTimeout = global.setTimeout;
const originalClearTimeout = global.clearTimeout;
const output = [];
const secret = 'do-not-log-this-secret';

async function run() {
  let failures = 0;
  const check = (name, condition) => {
    console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${name}`);
    if (!condition) failures += 1;
  };
  let retryCallback;
  let retryDelay;

  try {
    process.env.MONGODB_URI = `mongodb://user:${secret}@localhost:27017/test`;
    console.error = (...args) => output.push(args.join(' '));
    console.warn = (...args) => output.push(args.join(' '));
    global.setTimeout = (callback, delay) => {
      retryCallback = callback;
      retryDelay = delay;
      return { unref() {} };
    };
    global.clearTimeout = () => {};
    mongoose.connect = async () => {
      const error = new Error(`Failed to connect using ${process.env.MONGODB_URI}`);
      error.name = 'MongoServerSelectionError';
      error.code = 'ECONNREFUSED';
      const serverError = new Error(`Driver detail containing ${secret}`);
      serverError.name = 'MongoNetworkError';
      serverError.code = 'ENOTFOUND';
      error.reason = {
        type: 'ReplicaSetNoPrimary',
        servers: new Map([
          ['cluster.example.invalid:27017', { type: 'Unknown', error: serverError }],
        ]),
      };
      throw error;
    };

    check('failed connection leaves database offline', (await db.connectDB()) === false && !db.isDbReady());
    check(
      'connection logs expose error category but not URI credentials',
      output.some((line) => /MongoServerSelectionError/.test(line)) &&
        output.some((line) => /ECONNREFUSED/.test(line)) &&
        output.some((line) => /ReplicaSetNoPrimary/.test(line)) &&
        output.some((line) => /ENOTFOUND/.test(line)) &&
        !output.join('\n').includes(secret)
    );
    check(
      'failed connection schedules a retry',
      retryCallback && retryDelay === 5000 && output.some((line) => /Retrying MongoDB connection/.test(line))
    );

    mongoose.connect = async () => {
      mongoose.connection.readyState = 1;
      return mongoose;
    };
    mongoose.connection.close = async () => {
      mongoose.connection.readyState = 0;
    };
    console.log = () => {};
    retryCallback();
    await new Promise((resolve) => setImmediate(resolve));
    console.log = originalLog;
    check('scheduled retry restores the connected state', db.isDbReady());
  } finally {
    await db.disconnectDB();
    mongoose.connect = originalConnect;
    mongoose.connection.close = originalClose;
    mongoose.connection.readyState = originalReadyState;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    if (originalUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = originalUri;
  }

  console.log(`\n  ${failures === 0 ? 'DB CONNECTION HANDLING INTACT' : failures + ' DB CHECK(S) FAILED'}\n`);
  process.exitCode = failures > 0 ? 1 : 0;
}

run().catch((error) => {
  console.error('  DB test failure:', error.message);
  process.exitCode = 1;
});
