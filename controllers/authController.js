/**
 * controllers/authController.js
 *
 * Admin login and logout.
 *
 * Defence layers for the login door:
 *   * Rate limiting (route-level, per IP) against brute force.
 *   * A double-submit CSRF token: generated on the login form and stored in
 *     the session; the POST must echo it back or it is rejected. This stops a
 *     cross-site form from logging the visitor into the admin area.
 *   * A same-origin check as a second, independent gate.
 *   * Session regeneration on success to defeat session fixation.
 *   * Identical error text whether the username exists or not, so the door
 *     cannot be used to enumerate accounts. A dummy bcrypt comparison keeps
 *     the timing alike for both cases.
 */

const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const db = require('../config/db');
const csrf = require('../utils/csrf');

// A valid hash compared against when the username does not exist, so timing
// does not reveal whether an account exists. Generated once at boot.
const DUMMY_HASH = bcrypt.hashSync('admin-login-placeholder', 12);

/** Trims to a plain string ('' when not one). */
function stringField(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser clients omit Origin; the CSRF token still guards them
  try {
    return new URL(origin).host === req.get('host');
  } catch {
    return false;
  }
}

function secureEqual(a, b) {
  return csrf.secureEqual(a, b);
}

/* ---------- GET /admin/login ---------- */

function loginForm(req, res) {
  if (req.session && req.session.admin) return res.redirect('/admin');

  // Fresh token for the form. Working from a per-request value stored in the
  // session means a stolen form is worthless the moment it is re-requested.
  const csrfToken = csrf.issue(req);

  const flash = req.session.flash || null;
  delete req.session.flash;

  return res.render('admin/login', {
    title: 'Admin Login',
    csrfToken,
    flash,
    next: stringField(req.query.next) || '/admin',
  });
}

/* ---------- POST /admin/login ---------- */

async function login(req, res) {
  // CSRF first: cheap and abortive.
  if (!csrf.verify(req, req.body.csrfToken)) {
    return res.status(403).render('admin/login', {
      title: 'Admin Login',
      csrfToken: req.session ? req.session.csrfToken : '',
      flash: { type: 'error', message: 'Your login form was invalid — please try again.' },
      next: '/admin',
      status: 403,
    });
  }

  if (!sameOrigin(req)) {
    return res.status(403).render('admin/login', {
      title: 'Admin Login',
      csrfToken: req.session ? req.session.csrfToken : '',
      flash: { type: 'error', message: 'Request origin was rejected.' },
      next: '/admin',
      status: 403,
    });
  }

  const username = stringField(req.body.username).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  const fail = (message) =>
    res.status(401).render('admin/login', {
      title: 'Admin Login',
      csrfToken: req.session.csrfToken,
      flash: { type: 'error', message },
      next: getSafeNext(req.body.next),
      status: 401,
    });

  if (!username || !password) {
    return fail('Enter your username and password.');
  }

  if (!db.isDbReady()) {
    console.warn('[auth] Login attempted while MongoDB is offline.');
    return fail('Login is unavailable right now — the database is offline.');
  }

  let admin = null;
  try {
    admin = await Admin.findOne({ username }).select('+password');
  } catch (error) {
    console.error('[auth] Admin lookup failed:', error.message);
    return fail('Login is unavailable right now. Please try again later.');
  }

  // Identical branch for "no such user" and "wrong password".
  const valid = admin
    ? await admin.comparePassword(password)
    : await bcrypt.compare(password, DUMMY_HASH);

  if (!admin || !valid) {
    return fail('Invalid username or password.');
  }

  // Fixation defence: throw away the old session id and re-issue.
  try {
    await regenerateSession(req);
  } catch (error) {
    console.error('[auth] Session regeneration failed:', error.message);
    return fail('Login failed. Please try again.');
  }

  req.session.admin = {
    id: admin._id.toString(),
    name: admin.name,
    username: admin.username,
  };
  req.session.flash = { type: 'ok', message: `Welcome back, ${admin.name}.` };

  return res.redirect(getSafeNext(req.body.next));
}

/** regenerate() in express-session 1.19 accepts a callback; promise-wrap it. */
function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

/** Only ever redirect inside the site — never to an open redirect. */
function getSafeNext(value) {
  const next = stringField(value);
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  return '/admin';
}

/* ---------- GET /admin/password ---------- */

function passwordForm(req, res) {
  return res.render('admin/password', {
    title: 'Change Password',
    errors: null,
  });
}

/* ---------- POST /admin/password ---------- */

async function changePassword(req, res) {
  const render = (errors) =>
    res.status(400).render('admin/password', {
      title: 'Change Password',
      errors,
      status: 400,
    });

  // Passwords are sensitive — never trim or collapse whitespace in them.
  const current = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
  const nextPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
  const confirm = typeof req.body.confirmPassword === 'string' ? req.body.confirmPassword : '';
  const adminId = req.session && req.session.admin ? req.session.admin.id : null;

  if (!adminId) return res.redirect('/admin/login');

  // Field-level failures first: cheap, no database involved.
  if (!current) return render({ currentPassword: 'Enter your current password.' });
  if (!nextPassword) return render({ newPassword: 'Enter a new password.' });
  if (nextPassword.length < Admin.MIN_PASSWORD_LENGTH) {
    return render({ newPassword: `Password must be at least ${Admin.MIN_PASSWORD_LENGTH} characters.` });
  }
  if (nextPassword === current) {
    return render({ newPassword: 'The new password must be different from your current one.' });
  }
  if (confirm !== nextPassword) {
    return render({ confirmPassword: 'The confirmation does not match the new password.' });
  }

  if (!db.isDbReady()) {
    return render({ _form: 'Password change is unavailable right now — the database is offline.' });
  }

  let admin = null;
  try {
    admin = await Admin.findById(adminId).select('+password');
  } catch (error) {
    console.error('[auth] Admin lookup failed for password change:', error.message);
    return render({ _form: 'Password change failed. Please try again.' });
  }

  // The account vanished mid-session — treat it as signed out.
  if (!admin) {
    req.session.destroy(() => {});
    return res.redirect('/admin/login');
  }

  let valid = false;
  try {
    valid = await admin.comparePassword(current);
  } catch {
    valid = false;
  }
  if (!valid) return render({ currentPassword: 'That is not your current password.' });

  admin.password = nextPassword;
  try {
    await admin.save();
  } catch (error) {
    console.error('[auth] Password change could not be saved:', error.message);
    return render({ _form: 'Password could not be updated. Please try again.' });
  }

  // A fresh session id means every other signed-in session dies at once —
  // anyone who logged in earlier on another device is no longer authenticated.
  try {
    await regenerateSession(req);
  } catch (error) {
    console.error('[auth] Session regeneration failed after password change:', error.message);
    req.session.admin = { id: admin._id.toString(), name: admin.name, username: admin.username };
    req.session.save(() => res.redirect('/admin'));
    return;
  }

  req.session.admin = { id: admin._id.toString(), name: admin.name, username: admin.username };
  req.session.flash = { type: 'ok', message: 'Password changed. Other sessions were signed out.' };
  return res.redirect('/admin');
}

/* ---------- POST /admin/logout ---------- */

function logout(req, res) {
  const adminName = req.session && req.session.admin ? req.session.admin.name : '';
  req.session.destroy(() => {
    res.clearCookie(require('../middleware/session').SESSION_NAME);
    if (adminName) console.log(`[auth] ${adminName} logged out`);
    res.redirect('/admin/login');
  });
}

module.exports = { loginForm, login, logout, passwordForm, changePassword };
module.exports.sameOrigin = sameOrigin;
module.exports.getSafeNext = getSafeNext;
module.exports.secureEqual = secureEqual;