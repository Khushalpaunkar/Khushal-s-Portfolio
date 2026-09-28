/**
 * services/settingsService.js
 *
 * Reader for the single site-settings document.
 *
 * Same philosophy as projectService: callers never know whether MongoDB is up,
 * and the result is ALWAYS a fully-resolved settings object. A present document
 * is merged over the built-in defaults; a missing document or an offline
 * database yields the defaults outright. Public pages therefore never see
 * undefined contact details, and the site renders identically offline.
 */

const SiteSettings = require('../models/SiteSettings');
const db = require('../config/db');

const FIELDS = ['contactEmail', 'githubUrl', 'linkedinUrl', 'instagramUrl', 'resumeUrl'];

function fallbackDefaults() {
  const copy = {};
  for (const key of FIELDS) copy[key] = SiteSettings.defaults[key];
  return copy;
}

/**
 * Resolves the effective settings and never rejects.
 * @returns {Promise<object>} all five fields, always set.
 */
async function getSettings() {
  if (!db.isDbReady()) return fallbackDefaults();

  try {
    const doc = await SiteSettings.findOne().lean();
    if (!doc) return fallbackDefaults();

    // The owner's choices win per field — including an explicit "" meaning
    // "hide this link". Only fields absent from the document (e.g. added by a
    // later deployment) inherit the bundled default.
    const resolved = fallbackDefaults();
    for (const key of FIELDS) {
      if (Object.prototype.hasOwnProperty.call(doc, key) && typeof doc[key] === 'string') {
        resolved[key] = doc[key];
      }
    }
    return resolved;
  } catch (error) {
    console.error('[settings] Read failed, using defaults:', error.message);
    return fallbackDefaults();
  }
}

module.exports = { getSettings, FIELDS };