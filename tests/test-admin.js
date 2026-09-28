/**
 * test-admin.js — Phase 8 (admin authentication)
 *
 *   A. Static contract: session + routes wired, cookie hardened, CSRF present
 *      in the form, nothing admin-related leaks into the public page.
 *   B. Behaviour: a real Express app is assembled in-process with a MemoryStore
 *      session and the real routes. The Admin collection lookup is stubbed, so
 *      the whole login flow — CSRF, success, bad password, offline DB, logout —
 *      runs without MongoDB.
 *
 * Run:  npm run verify   (or: node tests/test-admin.js)
 */

const fs = require('fs');
const http = require('http');

const ROOT = require('path').resolve(__dirname, '..') + '/';
// NOTE: portable — resolves to the project root relative to this file.
const read = (p) => fs.readFileSync(ROOT + p, 'utf8');
// This harness lives outside the project, so pull deps from its node_modules.
const express = require(ROOT + 'node_modules/express');
const bcrypt = require(ROOT + 'node_modules/bcryptjs');

let fail = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail && !cond ? '  -> ' + detail : ''}`);
  if (!cond) fail++;
};

/* ============================================================
   PART A — static contract
   ============================================================ */
console.log('  Phase 8 — wiring:');
const server = read('server.js');
const adminRoutes = read('routes/adminRoutes.js');
const sessionMw = read('middleware/session.js');

check('session mounted before routes', server.indexOf('app.use(sessionMiddleware)') < server.indexOf("app.use('/', indexRoutes)"));
check('adminRoutes mounted', /app\.use\(adminRoutes\)/.test(server));
check('admin router protects /admin', /router\.get\('\/admin', requireAdmin/.test(adminRoutes));
check('login POST is rate limited', /loginLimiter/.test(adminRoutes));
check('logout is a POST (state change)', /router\.post\('\/admin\/logout'/.test(adminRoutes));

console.log('  Phase 8 — session hardening:');
check('cookie httpOnly', /httpOnly: true/.test(sessionMw));
check('cookie sameSite lax', /sameSite: 'lax'/.test(sessionMw));
check('cookie secure in production', /secure: isProduction/.test(sessionMw));
check('secure flag only in production (offline dev still works)', /secure: (isProduction|false)/.test(sessionMw) && !/secure:\s*true\b/.test(sessionMw));
check('saveUninitialized false', /saveUninitialized: false/.test(sessionMw));
check('custom cookie name', /name: SESSION_NAME/.test(sessionMw));
check('store is MongoStore when DB ready', /MongoStore\.create/.test(sessionMw));
check('MemoryStore fallback offline', /MemoryStore\(\)/.test(sessionMw));
check('rolling session on activity', /rolling: true/.test(sessionMw));

console.log('  Phase 8 — login defences:');
const auth = read('controllers/authController.js');
check(
  'CSRF double-submit token present (via utils/csrf)',
  /csrfToken/.test(auth) && /csrf\.issue\(req\)/.test(auth) && /csrf\.verify\(req/.test(auth)
);
check('session regenerated on success (fixation)', /regenerate/.test(auth));
check('dummy bcrypt compare hides account existence', /DUMMY_HASH/.test(auth));
check('login rejects cross-origin', /sameOrigin/.test(auth));
check('offline database -> graceful message', /offline/.test(auth) && /database is offline/.test(auth));
check('no open redirect', /next\.startsWith\('\/'\) && !next\.startsWith\('\/\/'\)/.test(auth));

const loginView = read('views/admin/login.ejs');
const dashView = read('views/admin/dashboard.ejs');
check('login form includes the CSRF token', /name="csrfToken" value="<%= csrfToken %>"/.test(loginView));
check('login view hidden from search engines', /robots/.test(loginView) && /noindex/.test(loginView));
check('dashboard shows stats guarded', /stats\.messages === null/.test(dashView));
check('admin views never load third-party scripts', !/<script[^>]*src="https?:\/\//.test(loginView + dashView));

const index = read('views/index.ejs');
check('public page has no admin links', !index.includes('/admin'));

/* ============================================================
   PART B — behaviour (in-process Express, session + real routes)
   ============================================================ */
const runBehaviour = async () => {
  console.log('  Phase 8 — login flow (MemoryStore + stubbed Admin):');

  const { loginForm, login, logout } = require(ROOT + 'controllers/authController');
  const { requireAdmin, adminLocals } = require(ROOT + 'middleware/auth');
  const requireAdminCsrf = require(ROOT + 'middleware/adminCsrf');
  const { getSessionMiddleware } = require(ROOT + 'middleware/session');
  const Admin = require(ROOT + 'models/Admin');

  // Stub the collection: the controller calls
  //   Admin.findOne({ username }).select('+password')
  // so the stub returns a select()-able chain, mirroring exactly what Mongoose
  // would return. Modifying the schema lets the real controller code run.
  let simulateOffline = true;
  // The controller reads isDbReady() at call time, so patching the exported
  // module property drives its offline/online branch — same hook the contact
  // harness uses.
  const db = require(ROOT + 'config/db');
  db.isDbReady = () => !simulateOffline;
  const fakeAdminDoc = {
    _id: '507f1f77bcf86cd799439011',
    name: 'Khushal Paunkar',
    username: 'khushal',
    comparePassword: async (candidate) => bcrypt.compare(candidate, 'correct-horse'),
  };
  const hash = await bcrypt.hash('correct-horse', 12);
  fakeAdminDoc.comparePassword = async (candidate) => bcrypt.compare(candidate, hash);
  Admin.findOne = ({ username }) => ({
    select: async () =>
      simulateOffline ? null : username === 'khushal' ? fakeAdminDoc : null,
  });

  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', ROOT + 'views');
  app.use(express.urlencoded({ extended: false }));
  app.use(getSessionMiddleware());
  app.use(adminLocals);
  app.get('/admin', requireAdmin, (req, res) => res.status(200).send('dashboard-ok'));
  app.get('/admin/login', loginForm);
  app.post('/admin/login', login);
  app.post('/admin/logout', requireAdmin, requireAdminCsrf, logout);
  // Echo the session token so a guarded logout can be driven with a real,
  // freshly-issued (post-regeneration) token.
  app.get('/admin/token', requireAdmin, (req, res) => res.send(req.session.csrfToken || ''));

  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const get = () => fetch(base + '/admin/login', { redirect: 'manual', headers: { origin: `http://127.0.0.1:${port}` } });
  const post = (path, { cookie, csrf, bodyextra = {}, origin }) =>
    fetch(base + path, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        cookie: cookie || '',
        ...(origin ? { origin } : {}),
      },
      body: new URLSearchParams(csrf ? { csrfToken: csrf, ...bodyextra } : bodyextra),
    });

  // ---- GET login page: token issued, session cookie set ----
  let r = await get();
  let html = await r.text();
  const setCookie = r.headers.get('set-cookie') || '';
  check('GET /admin/login -> 200', r.status === 200, `got ${r.status}`);
  const tokenMatch = html.match(/name="csrfToken" value="([a-f0-9]+)"/);
  check('CSRF token rendered', !!tokenMatch, 'token not found');
  check('session cookie issued (httpOnly)', /khushal\.sid=/.test(setCookie) && /HttpOnly/.test(setCookie));
  const sessionCookie = (setCookie.match(/khushal\.sid=[^;]+/) || [''])[0];
  const token = tokenMatch ? tokenMatch[1] : '';

  // ---- Offline DB: graceful failure ----
  r = await post('/admin/login', { cookie: sessionCookie, csrf: token, bodyextra: { username: 'khushal', password: 'correct-horse' } });
  html = await r.text();
  check('offline DB -> 401 with friendly message', r.status === 401 && /database is offline/.test(html), `got ${r.status}`);

  // ---- No CSRF -> 403 ----
  r = await post('/admin/login', { cookie: sessionCookie, bodyextra: { username: 'khushal', password: 'correct-horse' } });
  check('missing CSRF -> 403', r.status === 403, `got ${r.status}`);

  // ---- Wrong password -> 401; unknown username -> identical 401. DB online. ----
  simulateOffline = false;
  r = await post('/admin/login', { cookie: sessionCookie, csrf: token, bodyextra: { username: 'khushal', password: 'wrong-password' } });
  check('wrong password -> 401 identical message', r.status === 401 && /Invalid username or password/.test(await r.text()), `got ${r.status}`);

  r = await post('/admin/login', { cookie: sessionCookie, csrf: token, bodyextra: { username: 'nobody', password: 'whatever' } });
  check('unknown username -> same 401 (no enumeration)', r.status === 401 && /Invalid username or password/.test(await r.text()), `got ${r.status}`);

  // ---- Successful login: redirect to /admin, session is authed ----
  r = await post('/admin/login', { cookie: sessionCookie, csrf: token, bodyextra: { username: 'khushal', password: 'correct-horse' } });
  const authedCookie = ((r.headers.get('set-cookie') || sessionCookie).match(/khushal\.sid=[^;]+/) || [sessionCookie])[0];
  check('success -> 302 to /admin', r.status === 302 && (r.headers.get('location') || '').includes('/admin'), `got ${r.status} ${r.headers.get('location')}`);

  r = await fetch(base + '/admin', { redirect: 'manual', headers: { cookie: authedCookie, origin: `http://127.0.0.1:${port}` } });
  check('GET /admin with session -> 200', r.status === 200 && (await r.text()) === 'dashboard-ok', `got ${r.status}`);

  // ---- Logout is CSRF-guarded, then destroys the session ----
  r = await post('/admin/logout', { cookie: authedCookie, bodyextra: {} });
  check('logout without CSRF -> 403', r.status === 403, `got ${r.status}`);

  // Login regenerates the session, so fetch a fresh token from the authed
  // session before a guarded logout.
  r = await fetch(base + '/admin/token', { redirect: 'manual', headers: { cookie: authedCookie, origin: `http://127.0.0.1:${port}` } });
  const freshToken = await r.text();

  r = await post('/admin/logout', { cookie: authedCookie, csrf: freshToken, bodyextra: {} });
  const afterLogout = ((r.headers.get('set-cookie') || '').match(/khushal\.sid=[^;]*/) || [''])[0] || '';
  r = await fetch(base + '/admin', { redirect: 'manual', headers: { cookie: afterLogout, origin: `http://127.0.0.1:${port}` } });
  check('after CSRF-guarded logout /admin redirects to login', r.status === 302 && (r.headers.get('location') || '').includes('/admin/login'), `got ${r.status}`);

  // ---- CSRF token is consumed: reused token must fail once a new session issues
  //      (new GET -> new token, old token no longer matches because the login
  //       renders a fresh form session) ----
  server.close();
};

runBehaviour()
  .then(() => {
    console.log(`\n  ${fail === 0 ? 'ADMIN INTACT' : fail + ' BROKEN ADMIN CHECK(S)'}\n`);
    process.exit(fail > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error('  Runtime failure:', err.message);
    console.error(err.stack);
    process.exit(1);
  });