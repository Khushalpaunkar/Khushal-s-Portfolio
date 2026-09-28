/**
 * scripts/create-admin.js
 *
 * Creates the dashboard account from environment variables.
 * Safe to re-run: an existing username or email is reported, never overwritten.
 *
 *   npm run create-admin
 *
 * Reads ADMIN_NAME / ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_PASSWORD from .env.
 * The password is never printed, logged, or committed.
 */

require('dotenv').config({ quiet: true });

const { connectDB, disconnectDB, isDbReady } = require('../config/db');
const Admin = require('../models/Admin');

function fail(message) {
  console.error(`\n[create-admin] ERROR: ${message}\n`);
  process.exit(1);
}

async function main() {
  const name = (process.env.ADMIN_NAME || '').trim();
  const username = (process.env.ADMIN_USERNAME || '').trim().toLowerCase();
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';

  if (!name) fail('ADMIN_NAME is not set. Add it to your .env file.');
  if (!username) fail('ADMIN_USERNAME is not set. Add it to your .env file.');
  if (!email) fail('ADMIN_EMAIL is not set. Add it to your .env file.');
  if (!password) fail('ADMIN_PASSWORD is not set. Add it to your .env file.');

  if (password.length < Admin.MIN_PASSWORD_LENGTH) {
    fail(`ADMIN_PASSWORD must be at least ${Admin.MIN_PASSWORD_LENGTH} characters.`);
  }

  console.log('\n[create-admin] Connecting to MongoDB…');
  const connected = await connectDB();

  if (!connected || !isDbReady()) {
    fail(
      'Could not connect to MongoDB.\n' +
        '  - Is MONGODB_URI set correctly in .env?\n' +
        '  - For Atlas: add your current IP to the cluster IP Access List.\n' +
        '  - For local MongoDB: is the service running?'
    );
  }

  const existing = await Admin.findOne({
    $or: [{ username }, { email }],
  }).exec();

  if (existing) {
    console.log('\n[create-admin] An admin already exists for that username or email.');
    console.log(`             username: ${existing.username}`);
    console.log('             Nothing was changed.\n');
    await disconnectDB();
    process.exit(0);
  }

  // The pre-save hook replaces this with a bcrypt hash before it is written.
  const admin = new Admin({ name, username, email, password });

  await admin.save();

  console.log('\n[create-admin] Admin created successfully.');
  console.log(`             name     : ${admin.name}`);
  console.log(`             username : ${admin.username}`);
  console.log(`             email    : ${admin.email}`);
  console.log('             password : stored as a bcrypt hash (not shown)\n');
  console.log('  You can now log in at /admin/login\n');

  await disconnectDB();
  process.exit(0);
}

main().catch(async (error) => {
  console.error('\n[create-admin] Unexpected failure:', error.message);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
