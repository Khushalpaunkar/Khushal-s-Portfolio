/**
 * controllers/settingsController.js
 * Admin: edit the site-wide contact/social settings (the one Settings doc).
 */

const SiteSettings = require('../models/SiteSettings');
const settingsService = require('../services/settingsService');
const db = require('../config/db');

function trimString(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function readValues(req) {
  return {
    contactEmail: trimString(req.body.contactEmail),
    githubUrl: trimString(req.body.githubUrl),
    linkedinUrl: trimString(req.body.linkedinUrl),
    instagramUrl: trimString(req.body.instagramUrl),
    resumeUrl: trimString(req.body.resumeUrl),
  };
}

function renderForm(res, values, errors) {
  return res.status(errors ? 400 : 200).render('admin/settings', {
    title: 'Settings',
    values,
    errors,
    status: errors ? 400 : 200,
  });
}

/* ---------- GET /admin/settings ---------- */

async function settingsForm(req, res) {
  const settings = await settingsService.getSettings();
  return renderForm(res, settings, null);
}

/* ---------- POST /admin/settings ---------- */

async function saveSettings(req, res) {
  const values = readValues(req);

  if (!db.isDbReady()) {
    return renderForm(res, values, { _form: 'Settings are unavailable right now — the database is offline.' });
  }

  // Run the real schema validators (no database needed for validation). Field
  // errors map back to their inputs so the form can explain exactly what is
  // wrong — the same pattern project CRUD uses.
  const draft = new SiteSettings(values);
  let validationError = null;
  try {
    await draft.validate();
  } catch (error) {
    validationError = error;
  }

  if (validationError) {
    const errors = {};
    for (const [key, error] of Object.entries(validationError.errors || {})) {
      errors[key] = error.message;
    }
    return renderForm(res, values, errors);
  }

  try {
    await SiteSettings.findOneAndUpdate({}, values, { upsert: true, new: true });
  } catch (error) {
    console.error('[settings] Save failed:', error.message);
    return renderForm(res, values, { _form: 'Settings could not be saved. Please try again.' });
  }

  req.session.flash = { type: 'ok', message: 'Settings saved. The public site now uses them.' };
  return res.redirect('/admin/settings');
}

module.exports = { settingsForm, saveSettings };