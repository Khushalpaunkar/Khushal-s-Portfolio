/**
 * test-security.js — Phase 11 (security hardening pass)
 *
 *   A. Response hardening: CSP directives, x-powered-by off, and a view-wide
 *      scan proving no raw-output EJS tag (`<%-`) is ever pointed at
 *      user/database content — only `include(...)` compositions.
 *   B. Escaping proof: the REAL EJS templates are rendered in-process against
 *      malicious input (script, svg-onload, payloads in attributes) and the
 *      output is asserted to contain no raw executable tags.
 *   C. Input fuzzing: array/over-length/control-character/non-string bodies
 *      and prototype-pollution keys (`__proto__`, `constructor`) hit the real
 *      controllers and must fail cleanly without polluting anything.
 *   D. Origin handling: cross-origin and `Origin: null` are rejected while
 *      header-less clients still pass (rate limiter + CSRF remain the gate).
 *   E. Logout is CSRF-guarded and admin logout forms carry the token.
 *
 * Run:  npm run verify   (or: node tests/test-security.js)
 */

const fs = require('fs');
const path = require('path');

const ROOT = require('path').resolve(__dirname, '..') + '/';
// NOTE: portable — resolves to the project root relative to this file.
const read = (p) => fs.readFileSync(ROOT + p, 'utf8');
const ejs = require(ROOT + 'node_modules/ejs');

let fail = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail && !cond ? '  -> ' + detail : ''}`);
  if (!cond) fail++;
};

console.log('  Phase 11 — response hardening:');
const server = read('server.js');
check('helmet mounted', /app\.use\(\s*helmet\(/.test(server));
check('CSP frame-ancestors is none (clickjacking)', /frameAncestors: \["'none'"\]/.test(server));
check('CSP object-src is none', /objectSrc: \["'none'"\]/.test(server));
check('CSP form-action is self-only', /formAction: \["'self'"\]/.test(server));
check('CSP connect-src is self-only', /connectSrc: \["'self'"\]/.test(server));
check('x-powered-by disabled', /app\.disable\('x-powered-by'\)/.test(server));

console.log('  Phase 11 — no raw output of dynamic data in any view:');
let rawDump = [];
const viewDir = ROOT + 'views';
for (const rel of walkViews(viewDir)) {
  const src = read('views/' + rel);
  // Allowed: `<%- include(...) %>` (static composition of partials). Any other
  // raw-output tag would render a value unescaped.
  const matches = [...src.matchAll(/<%-(?![ \t]*include\()([\s\S]{0,30})/g)];
  matches.forEach((m) => rawDump.push(`${rel}: ${JSON.stringify(m[0])}`));
}
check('zero raw-output tags across views (only include())', rawDump.length === 0, rawDump.slice(0, 2).join(' | '));

console.log('  Phase 11 — escaping proof (real EJS render of admin views):');
const PWN = {
  script: '<scr' + 'ipt>alert(1)</scr' + 'ipt>',
  svgOnload: '<svg/onload=alert(4)>',
  img: '<img src=x onerror=alert(2)>',
  quote: '" onfocus="alert(3)" autofocus',
  bold: '<b>name</b>',
  italic: '<i>msg</i>',
};

async function renderEscaping() {
  const kinds = Object.keys(require(ROOT + 'utils/icons').PLACEHOLDER_ICONS);
  const evilMessage = {
    _id: 'aaaaaaaaaaaaaaaaaaaa0001',
    name: PWN.bold + PWN.script,
    email: 'no-good@nowhere>' + PWN.svgOnload,
    subject: PWN.img,
    message: PWN.quote + PWN.italic,
    status: 'new',
    createdAt: new Date(),
  };
  const html = await ejs.renderFile(ROOT + 'views/admin/message.ejs', {
    title: 'x', message: evilMessage, csrfToken: 'ab'.repeat(24), flash: null,
  });
  check('message view: no raw <script>', !html.includes('<scri'), 'raw script tag');
  check('message view: no raw <img> payloads', !html.includes('<img'), 'raw img');
  check('message view: payload svg escaped (not <svg/onload)', !html.includes('<svg/onload') && html.includes('&lt;svg'), 'raw svg');
  check('message view: no raw <b>/<i> in DB strings', !html.includes('<b>') && !html.includes('<i>'), 'unescaped emphasis');
  check('message view: no attribute breakout (raw quotes)', !html.includes(' onfocus="'), 'raw quote attribute');
  check('message view: escaped entities present', html.includes('&lt;script') && html.includes('&lt;img'), '&lt; escaping');

  const projects = [{ _id: PWN.script, title: PWN.img, category: PWN.bold, year: 2026, featured: false, order: 0 }];
  const listHtml = await ejs.renderFile(ROOT + 'views/admin/projects.ejs', {
    title: 'x', projects, source: 'database', csrfToken: 'ab'.repeat(24), flash: null,
  });
  check('project list: injected ids escaped in hrefs', !listHtml.includes('/admin/projects/<') && listHtml.includes('&lt;script'), 'raw _id in href');
  check('project list: no raw tags in cells', !listHtml.includes('<img') && !listHtml.includes('<b>'), 'raw cell tag');

  const formHtml = await ejs.renderFile(ROOT + 'views/admin/project-form.ejs', {
    title: 'x', project: { _id: 'aaaaaaaaaaaaaaaaaaaa0002', title: PWN.quote + PWN.img, description: PWN.script, features: ['a'], technologies: [], tags: [], placeholderIcon: 'code', year: '', order: 0, featured: false },
    errors: { title: 'example & error' }, kinds, csrfToken: 'ab'.repeat(24), flash: null,
  });
  check('project form: injected title is escaped', !formHtml.includes('<img') && formHtml.includes('&lt;img'), 'raw title tag');
  check('project form: textarea body escapes scripts', !formHtml.includes('<script') && formHtml.includes('&lt;script'), 'raw textarea script');

  const detailHtml = await ejs.renderFile(ROOT + 'views/project.ejs', {
    title: 'x', siteUrl: '', cspNonce: 'TESTNONCE',
    project: { title: PWN.img, slug: 'p', shortDescription: PWN.quote, description: PWN.script, problem: PWN.bold, solution: '', features: [PWN.italic, 'ok'], technologies: [PWN.bold], tags: [PWN.img], year: 2026, category: 'x', image: '', placeholderIcon: 'code', githubUrl: '', liveUrl: '' },
    pageUrl: 'projects/p', pageDescription: PWN.script,
    siteSettings: require(ROOT + 'models/SiteSettings').defaults,
    techIcon: () => 'fa-x', placeholderIcon: () => 'fa-x',
  });
  check('project detail: injected payloads never appear raw',
    !detailHtml.includes('<img src=x') &&
    !detailHtml.includes('<svg/onload') &&
    !detailHtml.includes('<scr' + 'ipt>alert(1)') &&
    !detailHtml.includes(' onfocus="') &&
    !detailHtml.includes('<b>name</b>'), 'raw payload leaked');
  check('project detail: meta description escaped', detailHtml.includes('&lt;scr' + 'ipt'), 'raw description');

  console.log('  Phase 11 — input fuzzing (real controllers):');
  const db = require(ROOT + 'config/db');
  const realIsDbReady = db.isDbReady;
  db.isDbReady = () => false;

  const mockRes = () => ({
    statusCode: 200, jsonBody: null, status(c) { this.statusCode = c; return this; }, json(b) { this.jsonBody = b; return this; },
  });
  const mockReq = (over = {}) =>
    Object.assign({
      headers: {}, params: {}, query: {}, body: {}, session: {}, method: 'GET',
      get(h) { return this.headers[h.toLowerCase()] || this.headers[h]; },
    }, over);

  const contact = require(ROOT + 'controllers/contactController');
  const VALID = { name: 'NN', email: 'x@y.co', message: 'ok-body here' };

  let r = mockRes();
  await contact(mockReq({ body: { ...VALID, name: ['a', 'b'] } }), r);
  check('array name -> 400 (no crash)', r.statusCode === 400, `got ${r.statusCode}`);

  r = mockRes();
  await contact(mockReq({ body: { ...VALID, message: 'long'.repeat(1000) } }), r);
  check('over-length message -> 400 + errors.message', r.statusCode === 400 && !!(r.jsonBody && r.jsonBody.errors && r.jsonBody.errors.message), `got ${r.statusCode}`);

  r = mockRes();
  await contact(mockReq({ body: { ...VALID, subject: '\u202Eevil\u0000bidi' } }), r);
  check('control-char subject -> stored path (no crash, no 400)', r.statusCode === 503, `got ${r.statusCode}`);

  r = mockRes();
  await contact(mockReq({ body: JSON.parse('{"name":"NN","email":"x@y.co","message":"ok-body here","__proto__":{"save":"pwn"},"constructor":{"prototype":{"pwned":true}}}') }), r);
  check('prototype keys ignored -> 503 not 400/500', r.statusCode === 503, `got ${r.statusCode} ${JSON.stringify(r.jsonBody || {})}`);
  check('no global prototype pollution from contact', !({}).pwned && !({}).save, 'Object.prototype polluted');

  console.log('  Phase 11 — origin handling:');
  r = mockRes();
  await contact(mockReq({ headers: { origin: 'http://evil.example', host: 'localhost:34567' }, body: VALID }), r);
  check('cross-origin -> 403', r.statusCode === 403, `got ${r.statusCode}`);
  r = mockRes();
  await contact(mockReq({ headers: { origin: 'null', host: 'localhost:34567' }, body: VALID }), r);
  check('Origin: null -> 403', r.statusCode === 403, `got ${r.statusCode}`);
  r = mockRes();
  await contact(mockReq({ headers: {}, body: VALID }), r);
  check('no Origin header -> still passes (rate limiter guards)', r.statusCode === 503, `got ${r.statusCode}`);
  r = mockRes();
  await contact(mockReq({ headers: { origin: 'http://evil.example', host: 'localhost:34567' }, body: { website: 'http://spam.example' } }), r);
  check('honeypot wins even cross-origin (fake ok)', r.statusCode === 200 && r.jsonBody && r.jsonBody.ok === true, `got ${r.statusCode}`);

  console.log('  Phase 11 — project payload poisoning:');
  const project = require(ROOT + 'controllers/projectController');
  const ownKeys = Object.keys(project.buildPayload(JSON.parse('{"title":"T","__proto__":{"featured":true},"constructor":{"prototype":{"polluted":1}}}')));
  check('__proto__/constructor never enter payload', !ownKeys.includes('__proto__') && !ownKeys.includes('constructor'), ownKeys.join(','));
  check('no Object.prototype damage from payload', !({}).polluted, 'Object.prototype.polluted set');
  check('featured not flipped by proto key', project.buildPayload(JSON.parse('{"__proto__":{"featured":true}}')).featured === false, `featured flipped`);
  check('year coerced: bad -> null', project.buildPayload(JSON.parse('{"year":"abc"}')).year === null);
  check('year coerced: good -> number', project.buildPayload(JSON.parse('{"year":"2026"}')).year === 2026);
  check('order coerced: junk -> 0', project.buildPayload(JSON.parse('{"order":"abc"}')).order === 0);
  check('order coerced: numeric string -> number', project.buildPayload(JSON.parse('{"order":"5"}')).order === 5);

  console.log('  Phase 11 — logout CSRF double-check:');
  const routes = read('routes/adminRoutes.js');
  const topbar = read('views/admin/partials/topbar.ejs');
  const dashView = read('views/admin/dashboard.ejs');
  check('/admin/logout guarded by requireAdminCsrf', /router\.post\('\/admin\/logout', requireAdmin, requireAdminCsrf/.test(routes));
  check('topbar logout form carries csrfToken', /name="csrfToken" value="<%= csrfToken %>/.test(topbar) && /\/admin\/logout/.test(topbar));
  check('dashboard logout form carries csrfToken', /name="csrfToken" value="<%= csrfToken %>/.test(dashView) && /\/admin\/logout/.test(dashView));

  db.isDbReady = realIsDbReady;
}

function walkViews(dir, base = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkViews(full, path.join(base, entry.name)));
    else if (entry.name.endsWith('.ejs')) out.push(path.join(base, entry.name).replaceAll('\\', '/'));
  }
  return out;
}

renderEscaping()
  .then(() => {
    console.log(`\n  ${fail === 0 ? 'SECURITY PASS INTACT' : fail + ' BROKEN SECURITY CHECK(S)'}\n`);
    process.exit(fail > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error('  Runtime failure:', err.message);
    console.error(err.stack);
    process.exit(1);
  });