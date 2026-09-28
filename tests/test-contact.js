/**
 * test-contact.js — Phase 7 (contact form -> /api/contact)
 *
 * Two halves:
 *   A. Static contract: the whole site must be free of EmailJS, the CSP must
 *      have shrunk to self + nonce, and the form/API must agree on fields.
 *   B. Behaviour: schema validation, controller paths (honeypot, cross-origin,
 *      400, and the 503 offline gate) and a deterministic rate-limit test.
 *
 * Run:  npm run verify   (or: node tests/test-contact.js)
 */

const fs = require('fs');
const http = require('http');

const ROOT = require('path').resolve(__dirname, '..') + '/';
// NOTE: portable — resolves to the project root relative to this file.
const read = (p) => fs.readFileSync(ROOT + p, 'utf8');

let fail = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail && !cond ? '  -> ' + detail : ''}`);
  if (!cond) fail++;
};

/* ============================================================
   PART A — static contract
   ============================================================ */
console.log('  Phase 7 — EmailJS fully removed:');
const server = read('server.js');
const index = read('views/index.ejs');
const contactJs = read('public/js/contact.js');

check('no jsdelivr anywhere in server.js', !/jsdelivr/.test(server));
check('no api.emailjs.com in connect-src', !/api\.emailjs\.com/.test(server));
check('no emailjs-com script tag in index.ejs', !/emailjs-com/.test(index));
check('contact.js has no emailjs reference', !/emailjs/i.test(contactJs));
check('no external <script src> remains in views', !/script src="https?:\/\//.test(index + read('views/partials/head.ejs')));

console.log('  Phase 7 — hardened CSP:');
// Extract only the script-src array. styleSrc keeps the Font Awesome CDN,
// so grabbing a wider slice would falsely flag it.
const scriptBlock = (server.match(/scriptSrc: \[([\s\S]*?)\],/) || [])[1] || '';
check('script-src has no third-party host', !/https?:\/\//.test(scriptBlock), scriptBlock.slice(0, 80));
check('script-src still allows the nonce', /'nonce-\$/.test(scriptBlock), 'nonce template literal not found');
check('script-src has no unsafe-inline', !/unsafe-inline/.test(scriptBlock));
check('connect-src allows only self', /connectSrc: \["'self'"\]/.test(server));

console.log('  Phase 7 — form and API agree on fields:');
check('honeypot input named website', /name="website"/.test(index) && /tabindex="-1"/.test(index));
check('honeypot marked aria-hidden', /aria-hidden="true"/.test(index) && index.indexOf('aria-hidden="true"') < index.indexOf('name="website"'));
const fieldNames = ['name="name"', 'name="email"', 'name="subject"', 'name="message"'];
fieldNames.forEach((n) => check('field uses ' + n, index.includes(n)));
check('honeypot styled off-screen', /\.hp-field/.test(read('public/css/main.css')) && !/\.hp-field\s*\{[^}]*display:\s*none/.test(read('public/css/main.css')));

console.log('  Phase 7 — client posts to the API:');
check('contact.js fetches /api/contact', /fetch\('\/api\/contact'/.test(contactJs));
check('contact.js sends POST', /method: 'POST'/.test(contactJs));
check('contact.js sends JSON', /Content-Type': 'application\/json'/.test(contactJs) && /JSON\.stringify/.test(contactJs));
check('contact.js renders server field errors', /cf-name-err/.test(contactJs) && /cf-message-err/.test(contactJs));
check('contact.js handles 429', /429:/.test(contactJs));
check('contact.js handles 503', /503:/.test(contactJs));
check('contact.js handles 413', /413:/.test(contactJs));

console.log('  Phase 7 — server wiring:');
const routes = read('routes/contactRoutes.js');
check('limiter scoped to the contact route only', /router\.post\('\/api\/contact', contactLimiter, contactController\)/.test(routes));
check('contactRoutes mounted in server.js', /app\.use\(contactRoutes\)/.test(server));
const controller = read('controllers/contactController.js');
check('controller uses call-time isDbReady (testable)', /const db = require\('\.\.\/config\/db'\);/.test(controller) && /db\.isDbReady\(\)/.test(controller));
check('controller never stores IP or user-agent', !/req\.ip|user-agent|headers\.referer/.test(controller));

/* ============================================================
   PART B — behaviour
   ============================================================ */
const runtime = async () => {
  console.log('  Phase 7 — schema validation:');
  const Contact = require(ROOT + 'models/Contact');
  const con = require(ROOT + 'controllers/contactController');
  const db = require(ROOT + 'config/db');
  const { createContactLimiter } = require(ROOT + 'middleware/contactLimiter');

  const valid = () => new Contact({ name: 'Khush', email: 'K@Example.com ', subject: 'Hi', message: 'Article way street drop claim.' });
  const r1 = valid(); await r1.validate();
  check('valid message passes', true, 'validate threw for a good doc');
  check('email is trimmed + lowercased', r1.email === 'k@example.com', r1.email);

  const bad = [
    ['short name', { name: 'K', email: 'a@b.co', message: 'Good enough message ten chars' }, 'name'],
    ['bad email', { name: 'Khush', email: 'not-an-email', message: 'Good enough message ten chars' }, 'email'],
    ['short message', { name: 'Khush', email: 'a@b.co', message: 'short' }, 'message'],
    ['missing subject fine (optional)', { name: 'Khush', email: 'a@b.co', message: 'Good enough message ten chars' }, null],
  ];
  for (const [label, payload, failKey] of bad) {
    const doc = new Contact(payload);
    let threw = null;
    try { await doc.validate(); } catch (e) { threw = e; }
    if (failKey) {
      check(label + ' — rejected with "' + failKey + '"', threw && !!threw.errors[failKey]);
    } else {
      check(label, !threw, 'optional subject must not be required');
    }
  }

  console.log('  Phase 7 — value sanitation:');
  check('stringField collapses inner whitespace', con.stringField('  a   b\n c  ') === 'a b c');
  check('stringField trims', con.stringField('  hi  ') === 'hi');
  check('stringField empties non-strings', con.stringField(null) === '' && con.stringField(42) === '' && con.stringField({ x: 1 }) === '' && con.stringField(['a']) === '');

  console.log('  Phase 7 — controller paths (DB stubbed):');
  const makeReq = (patch = {}) => {
    const headers = Object.assign({ host: 'localhost:3000' }, patch.headers || {});
    const req = Object.assign({ headers, body: {} }, patch);
    req.get = (h) => headers[h.toLowerCase()] || headers[h];
    return req;
  };
  const makeRes = () => {
    const res = { statusCode: 0, body: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
  };
  const VALID = { name: 'Khush', email: 'khush@example.com', subject: '', message: 'Good enough message ten chars' };

  let hp = makeRes();
  await con(makeReq({ body: { ...VALID, website: 'http://spam.example' } }), hp);
  check('honeypot filled -> fake 200 ok', hp.statusCode === 200 && hp.body.ok === true, `got ${hp.statusCode}`);

  let co = makeRes();
  await con(makeReq({ headers: { origin: 'http://evil.example' }, body: VALID }), co);
  check('cross-origin -> 403 rejected', co.statusCode === 403 && co.body.ok === false, `got ${co.statusCode}`);

  let same = makeRes();
  await con(makeReq({ headers: { origin: 'http://localhost:3000' }, body: VALID }), same);
  check('same-origin passes the origin gate', same.statusCode === 503, `got ${same.statusCode} (expect 503 offline gate)`);

  let inv = makeRes();
  await con(makeReq({ body: { name: 'K', email: 'x', message: 'short' } }), inv);
  check('invalid -> 400 with errors map', inv.statusCode === 400 && inv.body.errors && inv.body.errors.name && !inv.body.errors.website);

  let off = makeRes();
  await con(makeReq({ body: VALID }), off);
  check('valid + DB offline -> honest 503', off.statusCode === 503 && off.body.ok === false && /temporarily unavailable/.test(off.body.message), `got ${off.statusCode}`);

  // Prove the success path is not skipped when the DB is present: stub it.
  const realIsDbReady = db.isDbReady;
  db.isDbReady = () => true;
  let okDoc = makeRes();
  // Document.prototype.save would attempt a network call; shadow it to prove the
  // controller reaches the save step and reports 201.
  const origSave = require(ROOT + 'models/Contact').prototype.save;
  require(ROOT + 'models/Contact').prototype.save = async function () { return this; };
  await con(makeReq({ body: VALID }), okDoc);
  check('valid + DB present -> 201 saved', okDoc.statusCode === 201 && okDoc.body.ok === true, `got ${okDoc.statusCode}`);
  require(ROOT + 'models/Contact').prototype.save = origSave;
  db.isDbReady = realIsDbReady;

  console.log('  Phase 7 — rate limiting (fresh limiter):');
  const limiter = createContactLimiter();
  const server = http.createServer((req, res) => {
    // Raw node lacks the request fields express normally provides.
    req.ip = '203.0.113.1';
    req.socket.remoteAddress = req.ip;
    req.app = { get: () => false };
    // And express-only res methods used by the limiter's own 429 handler.
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (obj) => {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(res.statusCode);
      res.end(JSON.stringify(obj));
    };
    limiter(req, res, (err) => {
      if (err) { res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end(`ERR ${err.code || err.message}`); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const statuses = [];
  const bodies = [];
  let rateLimitHeader = null;
  let allHeaders = null;
  for (let i = 0; i < 6; i++) {
    const res = await fetch(`http://127.0.0.1:${port}/`, { method: 'POST' });
    if (i === 0) { rateLimitHeader = res.headers.get('ratelimit'); allHeaders = Object.fromEntries(res.headers.entries()); }
    statuses.push(res.status);
    bodies.push(await res.text());
  }
  check('5 allowed then 6th throttled', JSON.stringify(statuses) === JSON.stringify([200, 200, 200, 200, 200, 429]), statuses.join(',') + ' | ' + bodies[5]);
  check('RateLimit headers emitted (draft-7)', (rateLimitHeader || '').startsWith('limit=5, remaining=4'), `got ${rateLimitHeader}`);
  server.close();
};

runtime()
  .then(() => {
    console.log(`\n  ${fail === 0 ? 'CONTACT INTACT' : fail + ' BROKEN CONTACT(S)'}\n`);
    process.exit(fail > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error('  Runtime failure:', err.message);
    process.exit(1);
  });