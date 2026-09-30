/**
 * test-project-detail.js — Phase 17 (public project detail pages)
 *
 *   A. Routing: /projects/:slug is registered on the public router.
 *   B. Cards: featured + grid card titles deep-link to the detail page while
 *      external GitHub/live buttons remain gated on a real URL.
 *   C. Service: getBySlug resolves DB-first with the reader-fallback contract
 *      (offline/miss/error -> bundled seed, mirroring getProjects), never
 *      throws, and handles unknown/empty slugs.
 *   D. Controller: found -> renders project view; unknown slug -> 404 view;
 *      thrown error -> next(error).
 *   E. View: one h1, main landmark, skip-link, and zero inline handlers;
 *      buttons/features render only when content exists (no dead links).
 *
 * Run:  npm run verify   (or: node tests/test-project-detail.js)
 */

const fs = require('fs');

const ROOT = require('path').resolve(__dirname, '..') + '/';
const read = (p) => fs.readFileSync(ROOT + p, 'utf8');

const Project = require(ROOT + 'models/Project');
const db = require(ROOT + 'config/db');
const service = require(ROOT + 'services/projectService');
const controller = require(ROOT + 'controllers/projectViewController');
const { fromSeed } = service;

let fail = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail && !cond ? '  -> ' + detail : ''}`);
  if (!cond) fail++;
};

console.log('  Phase 17 — routing:');
const routes = read('routes/indexRoutes.js');
check('/projects/:slug registered', /router\.get\(\s*'\/projects\/:slug'/.test(routes), 'route missing');

console.log('  Phase 17 — card deep links:');
for (const [rel, label] of [['views/partials/project-card.ejs', 'grid card'], ['views/partials/project-featured.ejs', 'featured card']]) {
  const src = read(rel);
  check(`${label} title links to /projects/<slug>`, src.includes('href="/projects/<%= project.slug %>"'), 'no deep link');
  check(`${label} keeps GitHub/Live gated on real URLs`, /githubUrl \? \{ href:/.test(src), 'gating lost');
}

console.log('  Phase 17 — service (getBySlug):');
const realFindOne = Project.findOne;
const realIsReady = db.isDbReady;
const seed = fromSeed();
const flat = [...seed.featured, ...seed.others];
const known = flat[0];

(async () => {
  db.isDbReady = () => false;
  let project = await service.getBySlug(known.slug);
  check('offline: seed slug resolves', project && project.title === known.title, project && project.title);
  project = await service.getBySlug('no-such-project-anywhere');
  check('offline: unknown slug -> null', project === null, String(project));
  project = await service.getBySlug('');
  check('empty slug -> null', project === null, String(project));

  db.isDbReady = () => true;
  // The service calls .lean() before .exec(), so the stub has to be chainable.
  Project.findOne = () => ({ lean: () => ({ exec: async () => null }) });
  project = await service.getBySlug(known.slug);
  check('online miss falls back to seed (list never contradicts detail)', project && project.title === known.title, project && project.title);
  project = await service.getBySlug('no-such-project-anywhere');
  check('online miss + unknown -> null', project === null, String(project));

  let leanUsed = false;
  Project.findOne = () => ({
    lean: () => { leanUsed = true; return { exec: async () => ({ title: 'From DB', slug: 'from-db-tier' }) }; },
  });
  project = await service.getBySlug('from-db-tier');
  check('online hit returns DB document (normalised)', project && project.title === 'From DB' && project.slug === 'from-db-tier', JSON.stringify(project));
  // Regression guard. Without .lean() the service hands a hydrated Mongoose
  // Document to withDefaults(), whose spread copies nothing (schema fields sit
  // on the prototype) and every field silently falls back to its empty default.
  check('detail query asks for .lean(), not a hydrated Document', leanUsed === true, String(leanUsed));

  Project.findOne = () => ({ lean: () => ({ exec: async () => { throw new Error('db boom'); } }) });
  project = await service.getBySlug(known.slug);
  check('online read error still falls back to seed', project && project.title === known.title, project && project.title);

  Project.findOne = realFindOne;
  db.isDbReady = realIsReady;
  try { await service.getBySlug(known.slug); check('real stack unaffected after restore', true); } catch (error) { check('real stack unaffected after restore', false, error.message); }

  console.log('  Phase 17 — controller:');
  const realGetBySlug = service.getBySlug;
  const mockRes = () => { const r = { statusCode: 200, view: null, locals: null }; r.status = (c) => { r.statusCode = c; return r; }; r.render = (v, l) => { r.view = v; r.locals = l; return r; }; return r; };
  const mockReq = (over = {}) => Object.assign({ params: {}, headers: {} }, over);

  service.getBySlug = async () => ({ title: 'KisaanMitra AI', slug: 'kisaanmitra-ai', shortDescription: 'AI-Powered Farming Assistant', problem: '', solution: '', features: [], technologies: [], tags: [], image: '', year: 2026, category: 'AI' });
  let r = mockRes();
  await controller(mockReq({ params: { slug: 'kisaanmitra-ai' } }), r, () => {});
  check('found slug renders the project view', r.view === 'project' && r.statusCode === 200, `${r.view} / ${r.statusCode}`);
  check('view passes pageUrl for canonical/og', r.locals && r.locals.pageUrl === 'projects/kisaanmitra-ai', String(r.locals && r.locals.pageUrl));
  check('view passes a non-empty pageDescription', r.locals && typeof r.locals.pageDescription === 'string' && r.locals.pageDescription.length > 0, r.locals && r.locals.pageDescription);

  service.getBySlug = async () => null;
  r = mockRes();
  await controller(mockReq({ params: { slug: 'zombie' } }), r, () => {});
  check('unknown slug -> 404 view', r.statusCode === 404 && r.view === '404', `${r.view} / ${r.statusCode}`);

  service.getBySlug = async () => { throw new Error('kaboom'); };
  let nextCalled = null;
  r = mockRes();
  await controller(mockReq({ params: { slug: 'x' } }), r, (e) => { nextCalled = e; });
  check('handler errors forward to error middleware', nextCalled && nextCalled.message === 'kaboom', String(nextCalled && nextCalled.message));

  service.getBySlug = realGetBySlug;

  console.log('  Phase 17 — view structure:');
  const view = read('views/project.ejs');
  check('skip-link + main landmark', view.includes('class="skip-link" href="#main"') && view.includes('<main id="main">'), 'missing landmarks');
  check('exactly one <h1>', (view.match(/<h1/g) || []).length === 1, String((view.match(/<h1/g) || []).length));
  check('no inline handlers in the view', !/on(click|error|load|mouseover)\s*=/.test(view), 'inline handler found');
  check('no javascript: links', !/href="javascript:/i.test(view), 'javascript: href');
  check('GitHub button gated on real URL', /project\.githubUrl/.test(view), 'raw link');
  check('live-demo button gated on real URL', /project\.liveUrl/.test(view), 'raw link');
  check('features render only when present', /\(project\.features \|\| \[\]\)\.length/.test(view) && /project\.features\.forEach/.test(view), 'unguarded list');
  check('description section only when populated', /project\.description/.test(view), 'unguarded block');
  check('placeholder path handles missing image', view.includes('pf__placeholder'), 'no placeholder fallback');

  console.log(`\n  ${fail === 0 ? 'DETAIL PAGES INTACT' : fail + ' BROKEN DETAIL CHECK(S)'}\n`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((error) => {
  console.error('  Runtime failure:', error.message);
  console.error(error.stack);
  process.exit(1);
});