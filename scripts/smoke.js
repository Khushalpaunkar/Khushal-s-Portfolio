/**
 * scripts/smoke.js
 * Dependency-free health check for a running server.
 *
 * Usage:
 *   npm run dev            (in one terminal)
 *   npm run smoke          (in another)
 *
 * Grows in later phases as more routes come online.
 */

const BASE = `http://localhost:${process.env.PORT || 3000}`;

const checks = [
  { name: 'GET /            -> 200 html', path: '/', expect: 200, type: 'html' },
  { name: 'GET /health      -> 200 json', path: '/health', expect: 200, type: 'json' },
  { name: 'GET /nope        -> 404', path: '/definitely-not-here', expect: 404, type: 'html' },
  {
    name: 'GET /projects/kisaanmitra-ai -> 200 detail page',
    path: '/projects/kisaanmitra-ai',
    expect: 200,
    type: 'html',
    assertBody: 'AI-Powered Farming Assistant',
  },
  { name: 'GET /projects/unknown-slug -> 404', path: '/projects/not-a-real-project', expect: 404, type: 'html' },
  { name: 'GET /css/main.css -> 200 css', path: '/css/main.css', expect: 200, type: 'css' },
  { name: 'GET /js/main.js  -> 200 js', path: '/js/main.js', expect: 200, type: 'js' },
  {
    name: 'GET /asset/khushal-resume.pdf -> 200',
    path: '/asset/khushal-resume.pdf',
    expect: 200,
    type: 'pdf',
  },
  {
    name: 'GET /asset/images/khushalimg.jpg -> 200',
    path: '/asset/images/khushalimg.jpg',
    expect: 200,
    type: 'img',
  },
  {
    name: 'GET /admin/login -> 200 auth page',
    path: '/admin/login',
    expect: 200,
    type: 'html',
  },
  {
    // Anonymous visitors must never reach the dashboard.
    name: 'GET /admin (anon) -> 302 to login',
    path: '/admin',
    expect: 302,
    type: 'html',
    location: '/admin/login',
  },
  {
    name: 'GET /admin/messages (anon) -> 302',
    path: '/admin/messages',
    expect: 302,
    type: 'html',
    location: '/admin/login',
  },
  {
    name: 'GET /admin/projects (anon) -> 302',
    path: '/admin/projects',
    expect: 302,
    type: 'html',
    location: '/admin/login',
  },
  {
    name: 'GET /admin/password (anon) -> 302',
    path: '/admin/password',
    expect: 302,
    type: 'html',
    location: '/admin/login',
  },
  {
    name: 'GET /admin/settings (anon) -> 302',
    path: '/admin/settings',
    expect: 302,
    type: 'html',
    location: '/admin/login',
  },
  {
    name: 'GET / -> real settings resolve (email + resume present)',
    path: '/',
    expect: 200,
    type: 'html',
    assertBody: 'khushalpaunkar79@gmail.com',
  },
  {
    name: 'GET /sitemap.xml (SITE_URL unset) -> 404',
    path: '/sitemap.xml',
    expect: 404,
    type: 'text',
  },
  {
    name: 'GET /robots.txt -> 200 text/plain',
    path: '/robots.txt',
    expect: 200,
    type: 'text',
    assertHeader: { name: 'content-type', contains: 'text/plain' },
  },
  {
    name: 'GET /health -> cache-control no-store',
    path: '/health',
    expect: 200,
    type: 'json',
    assertHeader: { name: 'cache-control', contains: 'no-store' },
  },
  {
    name: 'GET /admin/login -> cache-control no-store',
    path: '/admin/login',
    expect: 200,
    type: 'html',
    assertHeader: { name: 'cache-control', contains: 'no-store' },
  },
  {
    name: 'GET / (html) -> cache-control no-cache',
    path: '/',
    expect: 200,
    type: 'html',
    assertHeader: { name: 'cache-control', contains: 'no-cache' },
  },
  {
    name: 'GET /css/main.css -> cache-control max-age',
    path: '/css/main.css',
    expect: 200,
    type: 'css',
    assertHeader: { name: 'cache-control', contains: 'max-age' },
  },
  {
    name: 'GET / -> nosniff',
    path: '/',
    expect: 200,
    type: 'html',
    assertHeader: { name: 'x-content-type-options', contains: 'nosniff' },
  },
  {
    name: 'GET / -> referrer-policy no-referrer',
    path: '/',
    expect: 200,
    type: 'html',
    assertHeader: { name: 'referrer-policy', contains: 'no-referrer' },
  },
  {
    name: 'GET / -> x-frame-options SAMEORIGIN',
    path: '/',
    expect: 200,
    type: 'html',
    assertHeader: { name: 'x-frame-options', contains: 'SAMEORIGIN' },
  },
  {
    name: 'GET / -> CSP frame-ancestors none',
    path: '/',
    expect: 200,
    type: 'html',
    assertHeader: { name: 'content-security-policy', contains: "frame-ancestors 'none'" },
  },
  {
    name: 'GET / -> no x-powered-by',
    path: '/',
    expect: 200,
    type: 'html',
    assertHeader: { name: 'x-powered-by', absent: true },
  },
];

/*
 * Contact API checks.
 *
 * Four POSTs per run, matching the intended public behaviour:
 *   honeypot    -> 200 fake success (never touches the DB)
 *   cross-origin-> 403 rejected
 *   invalid     -> 400 with a per-field errors map
 *   valid       -> 503 when MongoDB is offline (honest)
 *
 * Rate-limit note: the limiter allows 5 requests / 15 minutes per IP. A run
 * spends 4 of them, so repeated runs against the same server instance within
 * the window can hit 429s — that is the limiter doing its job. Restart the
 * dev server to reset the in-memory count.
 */
const postChecks = [
  {
    name: 'POST /api/contact (honeypot)     -> 200 fake ok',
    expect: 200,
    body: { name: 'Bot', email: 'bot@spam.example', message: 'Some spammy message here', website: 'http://spam.example' },
  },
  {
    name: 'POST /api/contact (foreign orig) -> 403',
    expect: 403,
    headers: { origin: 'http://evil.example' },
    body: { name: 'Khush', email: 'khush@example.com', message: 'Good enough message ten chars' },
  },
  {
    name: 'POST /api/contact (invalid)      -> 400 + errors',
    expect: 400,
    body: { name: 'K', email: 'nope', message: 'short' },
  },
  {
    name: 'POST /api/contact (valid, no db) -> 503 honest',
    expect: 503,
    body: { name: 'Khush', email: 'khush@example.com', message: 'Good enough message ten chars' },
  },
];

async function run() {
  console.log(`\nSmoke test -> ${BASE}\n`);

  let passed = 0;
  let failed = 0;

  for (const check of checks) {
    let bodyConsumed = false;

    try {
      const res = await fetch(BASE + check.path, { redirect: 'manual' });
      let ok = res.status === check.expect;

      if (check.location) {
        const loc = res.headers.get('location') || '';
        ok = ok && loc.includes(check.location);
      }

      if (check.assertHeader) {
        const value = res.headers.get(check.assertHeader.name) || '';
        ok = ok && (check.assertHeader.absent ? value === '' : value.includes(check.assertHeader.contains));
      }

      let bodyText = '';
      if (check.assertBody) {
        const buf = await res.arrayBuffer();
        bodyConsumed = true;
        bodyText = new TextDecoder().decode(buf);
        ok = ok && bodyText.includes(check.assertBody);
      }

      if (ok) {
        passed++;
        console.log(`  PASS  ${check.name}  (${res.status})`);
      } else {
        failed++;
        const loc = res.headers.get('location') || '';
        const header = check.assertHeader
          ? `, ${check.assertHeader.name}=${JSON.stringify(res.headers.get(check.assertHeader.name))}`
          : '';
        const wantBody = check.assertBody ? `, ${JSON.stringify(check.assertBody)}` : '';
        console.log(`  FAIL  ${check.name}  (got ${res.status}${loc ? ' -> ' + loc : ''}${header}, want ${check.expect}${check.location ? ' -> ' + check.location : ''}${wantBody})`);
      }

      if (check.type === 'json' && res.ok) {
        const body = await res.json();
        bodyConsumed = true;
        console.log(`        db=${body.db}  status=${body.status}`);
      }

      // Release the socket so the process can exit promptly — but only if the
      // body was not already consumed above.
      if (res.body && !bodyConsumed) await res.arrayBuffer();
    } catch (error) {
      failed++;
      console.log(`  FAIL  ${check.name}  -> ${error.message}`);
    }
  }

  for (const check of postChecks) {
    try {
      const res = await fetch(BASE + '/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(check.headers || {}),
        },
        body: JSON.stringify(check.body),
      });
      const body = await res.json();
      const ok = res.status === check.expect;

      if (ok) {
        passed++;
        console.log(`  PASS  ${check.name}  (${res.status})`);
      } else {
        failed++;
        console.log(`  FAIL  ${check.name}  (got ${res.status}, want ${check.expect})  -> ${body.message}`);
      }
    } catch (error) {
      failed++;
      console.log(`  FAIL  ${check.name}  -> ${error.message}`);
    }
  }

  // Compression probe. undici's fetch decodes gzip transparently and hides the
  // content-encoding header, so this uses a raw request to see the wire header.
  const gzipEncoding = await new Promise((resolve) => {
    const http = require('http');
    const u = new URL(BASE);
    const req = http.get(
      { hostname: u.hostname, port: u.port, path: '/', headers: { 'accept-encoding': 'gzip' } },
      (res) => {
        const enc = res.headers['content-encoding'] || '';
        res.resume();
        resolve(enc);
      }
    );
    req.on('error', () => resolve(''));
  });
  if (gzipEncoding === 'gzip') {
    passed++;
    console.log('  PASS  GET / -> gzip-compressed over the wire  (content-encoding: gzip)');
  } else {
    failed++;
    console.log(`  FAIL  GET / -> gzip-compressed over the wire  (got content-encoding=${JSON.stringify(gzipEncoding)}, want "gzip")`);
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.error('Is the server running? Start it with: npm run dev\n');
    process.exit(1);
  }
}

run();
