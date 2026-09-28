/**
 * models/Admin.js
 *
 * The single dashboard account.
 *
 * Security rules enforced here:
 *   - `password` is stored only as a bcrypt hash and is `select: false`, so it
 *     is never returned by an ordinary query by accident.
 *   - A pre-save hook hashes the password whenever it is set or changed.
 *   - Plain-text passwords are never written, logged, or serialised.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;

const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [80, 'Name cannot exceed 80 characters'],
    },

    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      lowercase: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [40, 'Username cannot exceed 40 characters'],
      match: [/^[a-z0-9._-]+$/, 'Username may only contain letters, numbers, dots, dashes and underscores'],
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: [160, 'Email cannot exceed 160 characters'],
    },

    password: {
      type: String,
      required: [true, 'Password is required'],
      select: false, // never included unless explicitly asked for with .select('+password')
      minlength: [MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`],
    },

    role: {
      type: String,
      enum: { values: ['admin'], message: 'Role must be: admin' },
      default: 'admin',
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/**
 * Hashes the password with bcrypt whenever it is new or modified.
 * A plain-text password never reaches the database.
 */
adminSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

/**
 * Constant-time comparison against the stored hash.
 * @param {string} candidate - plain-text password to test
 * @returns {Promise<boolean>}
 */
adminSchema.methods.comparePassword = function comparePassword(candidate) {
  if (!this.password || typeof candidate !== 'string') return Promise.resolve(false);
  return bcrypt.compare(candidate, this.password);
};

/** Confirms the stored value really is a bcrypt hash, not plain text. */
adminSchema.methods.hasHashedPassword = function hasHashedPassword() {
  return typeof this.password === 'string' && /^\$2[aby]\$\d{2}\$/.test(this.password);
};

module.exports = mongoose.model('Admin', adminSchema);
module.exports.SALT_ROUNDS = SALT_ROUNDS;
module.exports.MIN_PASSWORD_LENGTH = MIN_PASSWORD_LENGTH;
