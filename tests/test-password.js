/**
 * test-password.js — Phase 19 (admin can change their own password)
 *
 * Closes the credential-management story: create-admin -> login -> rotate the
 * password in the UI. The old session id is discarded on success (regenerate),
 * which signs out every other session at once.
 *
 *   A. Routing + topbar surface.
 *   B. View: three labelled password fields, CSRF hidden input, no inline
 *      handlers, one h1, minlength=8 echoed in the markup.
 *   C. Controller: field-level failures, offline DB, wrong current password,
 *      missing account, and a happy path that rehashes, regenerates the
 *      session, and redirects to the dashboard with a flash.
 *
 * Run:  npm run verify   (or: node tests/test-password.js)
 */

const fs = require('fs');

const ROOT = require('path').resolve(__dirname, '..') + '/';
const read = (p) => fs.readFileSync(ROOT + p, 'utf8');

const db = require(ROOT + 'config/db');
const Admin = require(ROOT + 'models/Admin');
const auth = require(ROOT + 'controllers/authController');

let fail = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail && !cond ? '  -> ' + detail : ''}`);
  if (!cond) fail++;
};

console.log('  Phase 19 — routing + surface:');
const routes = read('routes/adminRoutes.js');
check('GET /admin/password guarded', /router\.get\('\/admin\/password',\s*requireAdmin,/.test(routes), 'route missing');
check('POST /admin/password is CSRF-guarded', /router\.post\('\/admin\/password',\s*requireAdmin,\s*requireAdminCsrf,/.test(routes), 'not CSRF-guarded');
const topbar = read('views/admin/partials/topbar.ejs');
check('topbar links to the password page', /href="\/admin\/password">Password<\/a>/.test(topbar), 'no topbar link');

console.log('  Phase 19 — view:');
const view = read('views/admin/password.ejs');
check('form posts to /admin/password with CSRF', view.includes('action="/admin/password"') && view.includes('name="csrfToken"'), 'missing form/csrf');
check('all three fields present with correct ids',
  view.includes('id="pw-current"') && view.includes('id="pw-new"') && view.includes('id="pw-confirm"'), 'missing field');
check('labels target the right inputs',
  view.includes('for="pw-current"') && view.includes('for="pw-new"') && view.includes('for="pw-confirm"'), 'label mismatch');
check('minlength 8 echoed in the markup', /name="newPassword"[\s\S]*minlength="8"/.test(view), 'no minlength');
check('exactly one <h1>', (view.match(/<h1/g) || []).length === 1, 'h1 count');
check('no inline handlers', !/on(click|change|load)\s*=/.test(view), 'inline handler');
check('explains the other-session sign-out', /signs out every other session/.test(view), 'no explanation');
check('explains the min length', /At least 8 characters/.test(view), 'no length hint');

console.log('  Phase 19 — controller behaviour:');
const realIsReady = db.isDbReady;
const realFindById = Admin.findById;

const mockRes = () => {
  const r = { statusCode: 200, view: null, locals: null, redirectUrl: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.render = (v, l) => { r.view = v; r.locals = l; return r; };
  r.redirect = (u) => { r.redirectUrl = u; return r; };
  return r;
};
const mockSession = (admin) => {
  const s = { admin: admin || null, flash: null };
  let regenerations = 0;
  s.regenerate = (cb) => { s.admin = null; s.flash = null; regenerations++; cb(null); };
  s.regenerationCount = () => regenerations;
  s.destroy = (cb) => { s.admin = null; if (cb) cb(); };
  s.save = (cb) => { if (cb) cb(); };
  return s;
};
const mockReq = (session, body) => ({ session, body, headers: {} });

const body = (over = {}) => Object.assign(
  { currentPassword: 'correct-horse', newPassword: 'new-pass-123', confirmPassword: 'new-pass-123' },
  over
);

(async () => {
  const session = mockSession({ id: 'adminId1', name: 'Khushal', username: 'khushal' });
  db.isDbReady = () => true;
  let r = mockRes();
  await auth.changePassword(mockReq(session, body({ currentPassword: '' })), r);
  check('missing current password -> 400 + field error', r.statusCode === 400 && r.locals.errors && r.locals.errors.currentPassword, `got ${r.statusCode}`);

  r = mockRes();
  await auth.changePassword(mockReq(mockSession({ id: 'a' }), body({ newPassword: '7chars!' })), r);
  check('shorter than 8 chars -> 400', r.statusCode === 400 && r.locals.errors && r.locals.errors.newPassword, `got ${r.statusCode}`);

  r = mockRes();
  await auth.changePassword(mockReq(mockSession({ id: 'a' }), body({ newPassword: 'same-password' , currentPassword: 'same-password' })), r);
  check('new equals current -> 400', r.statusCode === 400 && r.locals.errors && r.locals.errors.newPassword, `got ${r.statusCode}`);

  r = mockRes();
  await auth.changePassword(mockReq(mockSession({ id: 'a' }), body({ confirmPassword: 'different' })), r);
  check('confirmation mismatch -> 400', r.statusCode === 400 && r.locals.errors && r.locals.errors.confirmPassword, `got ${r.statusCode}`);

  r = mockRes();
  db.isDbReady = () => false;
  await auth.changePassword(mockReq(mockSession({ id: 'a' }), body()), r);
  check('offline DB -> graceful 400, not a crash', r.statusCode === 400 && r.locals.errors && r.locals.errors._form, `got ${r.statusCode} ${r.view}`);
  db.isDbReady = () => true;

  const wrongPwAdmin = { _id: 'adminId1', name: 'Khushal', username: 'khushal', password: '', comparePassword: async () => false, save: async () => {} };
  Admin.findById = () => ({ select: () => Promise.resolve(wrongPwAdmin) });
  r = mockRes();
  await auth.changePassword(mockReq(mockSession({ id: 'adminId1', name: 'Khushal', username: 'khushal' }), body()), r);
  check('wrong current password -> 400', r.statusCode === 400 && r.locals.errors && r.locals.errors.currentPassword, `got ${r.statusCode}`);

  Admin.findById = () => ({ select: () => Promise.resolve(null) });
  let destroyedSession = mockSession({ id: 'gone', name: 'X', username: 'x' });
  r = mockRes();
  await auth.changePassword(mockReq(destroyedSession, body()), r);
  check('vanished account -> session destroyed, off to login', r.redirectUrl === '/admin/login' && !destroyedSession.admin, `${r.redirectUrl}`);

  let saved = false;
  const goodAdmin = { _id: 'adminId1', name: 'Khushal', username: 'khushal', password: '$2b$12$hash', comparePassword: async () => true, save: async () => { saved = true; } };
  Admin.findById = () => ({ select: () => Promise.resolve(goodAdmin) });
  const happySession = mockSession({ id: 'adminId1', name: 'Khushal', username: 'khushal' });
  r = mockRes();
  await auth.changePassword(mockReq(happySession, body()), r);
  check('happy path: account is saved (new hash)', saved === true, 'save not called');
  check('happy path: session regenerated (other sessions die)', happySession.regenerationCount() === 1, 'no regenerate');
  check('happy path: still signed in on this device', happySession.admin && happySession.admin.username === 'khushal', JSON.stringify(happySession.admin));
  check('happy path: success flash set', happySession.flash && happySession.flash.type === 'ok', JSON.stringify(happySession.flash));
  check('happy path: redirected to dashboard', r.redirectUrl === '/admin', String(r.redirectUrl));

  r = mockRes();
  await auth.changePassword(mockReq(mockSession(null), body()), r);
  check('anonymous request -> login redirect', r.redirectUrl === '/admin/login', String(r.redirectUrl));

  Admin.findById = realFindById;
  db.isDbReady = realIsReady;

  console.log(`\n  ${fail === 0 ? 'PASSWORD FLOW INTACT' : fail + ' BROKEN PASSWORD CHECK(S)'}\n`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((error) => {
  console.error('  Runtime failure:', error.message);
  console.error(error.stack);
  process.exit(1);
});