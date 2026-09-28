/**
 * models/Contact.js
 *
 * A message submitted through the contact form.
 *
 * Privacy note: no IP address or user agent is stored. Only what the visitor
 * typed themselves is persisted, so a compromised database does not leak
 * anyone's browsing history.
 */

const mongoose = require('mongoose');

/** Deliberately permissive: the goal is to catch typos, not to enforce RFC 5322. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const contactSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [80, 'Name cannot exceed 80 characters'],
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      maxlength: [160, 'Email cannot exceed 160 characters'],
      validate: {
        validator: (value) => EMAIL_PATTERN.test(value),
        message: 'Please provide a valid email address',
      },
    },

    subject: {
      type: String,
      trim: true,
      maxlength: [140, 'Subject cannot exceed 140 characters'],
      default: '',
    },

    message: {
      type: String,
      required: [true, 'Message is required'],
      trim: true,
      minlength: [10, 'Message must be at least 10 characters'],
      maxlength: [2000, 'Message cannot exceed 2000 characters'],
    },

    status: {
      type: String,
      enum: {
        values: ['new', 'read', 'archived'],
        message: 'Status must be one of: new, read, archived',
      },
      default: 'new',
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Admin inbox: newest first.
contactSchema.index({ createdAt: -1 });
contactSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Contact', contactSchema);
