/**
 * test-ops.js — Phase 10 (metadata, performance, dashboard hand-off)
 *
 * Static contract checks only — the live HTTP behaviour (gzip, cache headers,
 * robots/sitemap status) is covered by scripts/smoke.js against a running
 * server. This file confirms the wiring and that nothing leaks state.
 *
 * Run:  npm run verify   (or: node tests/test-ops.js)
 */

const fs = require('fs');

const ROOT = require('path').resolve(__dirname, '..') + '/';
// NOTE: portable — resolves to the project root relative to this file.
const read = (p) => fs.readFileSync(ROOT + p, 'utf8');

let fail = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail && !cond ? '  -> ' + detail : ''}`);
  if (!cond) fail++;
};

console.log('  Phase 10 — compression + cache wiring:');
const server = read('server.js');
const idxCompression = server.indexOf('app.use(compression())');
const idxStatic = server.indexOf('express.static');
const idxCache = server.indexOf('app.use(cacheControl)');
const idxRoutes = server.indexOf('app.use(adminRoutes)');
check('compression is a dependency of the server', /require\('compression'\)/.test(server));
check('compression mounted before static + routes', idxCompression > -1 && idxCompression < idxStatic && idxCompression < idxRoutes, `order ${idxCompression}/${idxStatic}/${idxRoutes}`);
const cache = read('middleware/cacheControl.js');
check('cache policy module exists', /module\.exports = cacheControl/.test(cache));
check('static assets keep their own long cache header', /res\.get\('Cache-Control'\)/.test(cache));
check('admin + api + health are never cached', /no-store/.test(cache));
check('HTML pages revalidate (no-cache)', /no-cache/.test(cache));
check('cache middleware mounted before routes/session', idxCache > -1 && idxCache < idxRoutes, `order ${idxCache}/${idxRoutes}`);

console.log('  Phase 10 — robots.txt + sitemap.xml:');
const meta = read('routes/metaRoutes.js');
check('metaRoutes exposes /robots.txt', /router\.get\('\/robots\.txt'/.test(meta));
check('metaRoutes exposes /sitemap.xml', /router\.get\('\/sitemap\.xml'/.test(meta));
check('sitemap line only appears when SITE_URL is set', /if \(url\) lines\.push\(`Sitemap:/.test(meta), 'sitemap push sits behind the url guard');
check('sitemap is 404 while SITE_URL is blank (no empty map)', /if \(!url\) \{[\s\S]*res\.status\(404\)/.test(meta));
check('robots.txt is served as text/plain', /res\.type\('text\/plain'\)/.test(meta));
check('robots never lists admin paths', !/admin/.test(meta));
check('sitemap only lists the real pages', /urls = \['\/'\]/.test(meta) && !/sitemap\.xml[^\n]*admin/.test(meta));

function urlGuard(src) {
  // The Sitemap line must sit behind the siteUrl() guard and only after the
  // Allow line — never near the blank-sited 404 path.
  const idxAllow = src.indexOf("lines = ['User-agent: *", '(');
  const idxSitemap = src.indexOf('Sitemap:');
  return idxAllow > -1 && idxSitemap > idxAllow;
}

console.log('  Phase 10 — admin dashboard hand-off:');
const dashView = read('views/admin/dashboard.ejs');
const adminCtl = read('controllers/adminController.js');
check('dashboard no longer promises \"later phases\"', !/later phases/.test(dashView));
check('dashboard links to the inbox', /href="\/admin\/messages/.test(dashView) && !!/\/admin\/messages\?filter=new/.test(dashView));
check('dashboard links to the project editor', /href="\/admin\/projects/.test(dashView));
check('dashboard shows a recent-messages list', /Recent messages/.test(dashView) && /recent\.forEach/.test(dashView));
check('dashboard stays noindex', /noindex, nofollow/.test(dashView));
check('controller fetches per-status counts', /Contact\.countDocuments\(\{ status: 'new' \}\)/.test(adminCtl) && /\{ status: 'read' \}/.test(adminCtl) && /\{ status: 'archived' \}/.test(adminCtl));
check('controller fetches the five most recent messages', /\.find\(\)\.sort\(\{ createdAt: -1 \}\)\.limit\(5\)/.test(adminCtl));
check('stats stay “—” when MongoDB is offline', /stats\.messages === null \? '—'/.test(dashView));
check('recent messages deep-link into the inbox', /\/admin\/messages\/<%= m\._id %>/.test(dashView));

console.log('  Phase 10 — admin favicon (no 404 favicon requests):');
const adminHead = read('views/admin/partials/head.ejs');
check('admin head links an inline SVG favicon', /rel="icon" href="data:image\/svg\+xml/.test(adminHead));
check('no /favicon.ico dependency', !/favicon\.ico/.test(adminHead));

console.log(`\n  ${fail === 0 ? 'OPS POLISH INTACT' : fail + ' BROKEN OPS CHECK(S)'}\n`);
process.exit(fail > 0 ? 1 : 0);