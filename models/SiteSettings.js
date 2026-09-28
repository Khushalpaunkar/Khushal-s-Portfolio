/**
 * models/SiteSettings.js
 *
 * The single site-wide settings document (contact details, social profiles,
 * resume link) that the owner edits from the dashboard instead of in code.
 *
 * There is exactly one document. `defaults` below are the values the site has
 * always shipped with — they are the *current real content*, not placeholders
 * — and they back the public site whenever the document is absent or MongoDB
 * is offline, mirroring the project-seed philosophy.
 *
 * Validation rules shut the door on the same "no invented content" rule that
 * guards the seed: a URL is either a real absolute http(s) address, the site's
 * own absolute path (resume), or empty. Anything else is rejected rather than
 * rendered into a dead or malicious link.
 */

const mongoose = require('mongoose');

/** The values the site has always shipped with (kept current by the owner). */
const defaults = Object.freeze({
  contactEmail: 'khushalpaunkar79@gmail.com',
  githubUrl: 'https://github.com/Khushalpaunkar',
  linkedinUrl: 'https://www.linkedin.com/in/khushalpaunkar',
  instagramUrl: 'https://www.instagram.com/_khushal.089',
  resumeUrl: '/asset/khushal-resume.pdf',
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ABSOLUTE_URL_RE = /^https?:\/\/[^\s]+$/i;
/** Site-local absolute path: starts with '/' but never '//' (no protocol-relative). */
const LOCAL_PATH_RE = /^\/(?!\/)/;

function emailValidator(value) {
  return value === '' || EMAIL_RE.test(value);
}

function absoluteUrlValidator(value) {
  return value === '' || ABSOLUTE_URL_RE.test(value);
}

function resumeUrlValidator(value) {
  return value === '' || ABSOLUTE_URL_RE.test(value) || LOCAL_PATH_RE.test(value);
}

const settingsSchema = new mongoose.Schema(
  {
    contactEmail: {
      type: String,
      default: defaults.contactEmail,
      trim: true,
      lowercase: true,
      maxlength: [160, 'Email cannot exceed 160 characters'],
      validate: [emailValidator, 'Enter a valid email address or leave it empty'],
    },

    githubUrl: {
      type: String,
      default: defaults.githubUrl,
      trim: true,
      maxlength: [200, 'URL cannot exceed 200 characters'],
      validate: [absoluteUrlValidator, 'Enter an absolute http(s) URL or leave it empty'],
    },

    linkedinUrl: {
      type: String,
      default: defaults.linkedinUrl,
      trim: true,
      maxlength: [200, 'URL cannot exceed 200 characters'],
      validate: [absoluteUrlValidator, 'Enter an absolute http(s) URL or leave it empty'],
    },

    instagramUrl: {
      type: String,
      default: defaults.instagramUrl,
      trim: true,
      maxlength: [200, 'URL cannot exceed 200 characters'],
      validate: [absoluteUrlValidator, 'Enter an absolute http(s) URL or leave it empty'],
    },

    resumeUrl: {
      type: String,
      default: defaults.resumeUrl,
      trim: true,
      maxlength: [200, 'URL cannot exceed 200 characters'],
      validate: [resumeUrlValidator, 'Enter an http(s) URL, a site path like /asset/..., or leave it empty'],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const SiteSettings = mongoose.model('SiteSettings', settingsSchema);

module.exports = SiteSettings;
module.exports.defaults = defaults;