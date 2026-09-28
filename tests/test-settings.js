/**
 * test-settings.js — Phase 20 (site settings editor)
 *
 *   A. Static contract: /admin/settings routes are wired, POST is CSRF-guarded,
 *      the settings middleware feeds res.locals.siteSettings on page routes,
 *      admin/nav views carry no inline handlers, and the bundled defaults are
 *      exactly the real contact details the site has always shipped with.
 *   B. Behaviour: the model validators, the service resolution rules (offline
 *      → defaults, present doc → owner's values verbatim so "" hides a link),
 *      and the controller's save/validate/offline paths driven with mocks.
 *   C. Rendering: the public views resolve settings two ways — no locals at
 *      all (harness/offline) and the real defaults — and must produce the same
 *      HTML; cleared fields hide their links; the admin form keeps values and
 *      per-field errors without breaking the CSP nonce discipline.
 *
 * Run:  npm run verify   (or: node tests/test-settings.js)
 */

const fs = require('fs');
const path = require('path');

const ROOT = require('path').resolve(__dirname, '..') + '/';
const read = (p) => fs.readFileSync(ROOT + p, 'utf8');
const ejs = require(ROOT + 'node_modules/ejs');

let fail = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail && !cond ? '  -> ' + detail : ''}`);
  if (!cond) fail++;
};

/* ============================================================
   PART A — static contract
   ============================================================ */
console.log('  Phase 20 — routes & middleware wiring:');
const routes = read('routes/adminRoutes.js');
const server = read('server.js');
const ctl = read('controllers/settingsController.js');

check("route GET /admin/settings present", routes.includes("router.get('/admin/settings'"));
check('route POST /admin/settings present', routes.includes("router.post('/admin/settings'"));
check('POST /admin/settings is CSRF-guarded', /router\.post\('\/admin\/settings', requireAdmin, requireAdminCsrf/.test(routes));
check('settingsController wired on GET', routes.includes('settingsController.settingsForm'));
check('settingsController wired on POST', routes.includes('settingsController.saveSettings'));
check('public middleware sets res.locals.siteSettings', /res\.locals\.siteSettings = await settingsService\.getSettings\(\)/.test(server));
check('settings middleware resolves before routes', server.indexOf('res.locals.siteSettings') < server.indexOf("app.use('/', indexRoutes)"));
const nonPage = new RegExp(server.match(/NON_PAGE_PATH = \/(.+)\/;/)[1]);
check('static/health paths skip the lookup',
  ['/asset/img.png', '/css/main.css', '/js/main.js', '/health', '/robots.txt', '/favicon.ico'].every((p) => nonPage.test(p)) &&
  !['/', '/projects/kisaan-mitra-ai', '/admin'].some((p) => nonPage.test(p)), String(nonPage));

console.log('  Phase 20 — settingsService requires db singleton', read('services/settingsService.js').includes("require('../config/db')"));

console.log('  Phase 20 — defaults are the real content (no invented links):');
const D = require(ROOT + 'models/SiteSettings').defaults;
check('email is the real address', D.contactEmail === 'khushalpaunkar79@gmail.com', D.contactEmail);
check('github is the real profile', D.githubUrl === 'https://github.com/Khushalpaunkar', D.githubUrl);
check('linkedin is the real profile', D.linkedinUrl === 'https://www.linkedin.com/in/khushalpaunkar', D.linkedinUrl);
check("instagram is the real profile", D.instagramUrl === 'https://www.instagram.com/_khushal.089', D.instagramUrl);
check('resume points at the real asset', D.resumeUrl === '/asset/khushal-resume.pdf', D.resumeUrl);
check('defaults object is frozen (never mutated)', Object.isFrozen(D));

console.log('  Phase 20 — views honour the CSP (no inline handlers):');
['views/admin/settings.ejs', 'views/index.ejs', 'views/partials/footer.ejs', 'views/partials/nav.ejs'].forEach((v) => {
  const html = read(v);
  check(v + ' has no inline event handlers', !/\son[a-z]+="[^"]+"/i.test(html), 'found inline handler');
});

/* ============================================================
   PART B — model, service and controller behaviour
   ============================================================ */
console.log('  Phase 20 — model validation:');
const SiteSettings = require(ROOT + 'models/SiteSettings');
const svc = require(ROOT + 'services/settingsService');
const ctlMod = require(ROOT + 'controllers/settingsController');
const db = require(ROOT + 'config/db');

async function invalid(doc) {
  try { await doc.validate(); return null; }
  catch (e) { return e; }
}
const accepts = async (v) => (await invalid(new SiteSettings(v))) === null;

(async () => {
  check('accepts the real defaults', await accepts(D), 'defaults valid');
  check('accepts a full cleared form (hide everything)', await accepts({ contactEmail: '', githubUrl: '', linkedinUrl: '', instagramUrl: '', resumeUrl: '' }));
  check('rejects plain-http-ish garbage email', !(await accepts({ contactEmail: 'not-an-email' })));
  check('rejects javascript: githubUrl', !(await accepts({ githubUrl: 'javascript:alert(1)' })));
  check('rejects data: linkedinUrl', !(await accepts({ linkedinUrl: 'data:text/html,x' })));
  check('rejects ftp: instagramUrl', !(await accepts({ instagramUrl: 'ftp://x.com' })));
  check('rejects relative resume path', !(await accepts({ resumeUrl: 'resume.pdf' })));
  check('accepts absolute site resume path', await accepts({ resumeUrl: '/asset/khushal-resume.pdf' }));
  check('accepts http resume URL', await accepts({ resumeUrl: 'https://example.com/me.pdf' }));
  check('rejects over-long instagramUrl', !(await accepts({ instagramUrl: 'https://x.com/' + Array(220).fill('a').join('') })));

  console.log('  Phase 20 — settingsService resolution:');
  const realFindOne = SiteSettings.findOne;
  const realReady = db.isDbReady;

  db.isDbReady = () => false;
  let got = await svc.getSettings();
  check('offline returns the bundled defaults', JSON.stringify(got) === JSON.stringify(D), JSON.stringify(got));

  db.isDbReady = () => true;
  SiteSettings.findOne = () => ({ lean: async () => null });
  got = await svc.getSettings();
  check('online, no document -> defaults', got.contactEmail === D.contactEmail && got.resumeUrl === D.resumeUrl);

  SiteSettings.findOne = () => ({
    lean: async () => ({
      contactEmail: 'new@example.com',
      githubUrl: 'https://github.com/NewUser',
      linkedinUrl: '',
      instagramUrl: '',
      resumeUrl: '',
    }),
  });
  got = await svc.getSettings();
  check('owner values win (email + github updated)', got.contactEmail === 'new@example.com' && got.githubUrl === 'https://github.com/NewUser');
  check("explicit '' is passed through (cleared = hidden)", got.linkedinUrl === '' && got.instagramUrl === '' && got.resumeUrl === '');

  SiteSettings.findOne = () => ({ lean: async () => { throw new Error('db connexion lost'); } });
  got = await svc.getSettings();
  check('read error falls back to defaults (never rejects)', got.contactEmail === D.contactEmail);
  SiteSettings.findOne = realFindOne;

  console.log('  Phase 20 — settingsController (mock req/res):');
  const mockReq = (over = {}) => Object.assign({ params: {}, query: {}, body: {}, session: {}, headers: {} }, over);
  const mockRes = () => ({
    statusCode: 200, view: null, locals: null, redirectUrl: null,
    status(c) { this.statusCode = c; return this; },
    render(v, l) { this.view = v; this.locals = l; return this; },
    redirect(u) { this.redirectUrl = u; return this; },
  });

  let r = mockRes();
  db.isDbReady = () => false;
  await ctlMod.settingsForm(mockReq(), r);
  check('form GET offline renders with default values', r.view === 'admin/settings' && r.locals.values.contactEmail === D.contactEmail && r.statusCode === 200);

  r = mockRes();
  await ctlMod.saveSettings(mockReq({ body: { contactEmail: 'x@y.com', githubUrl: 'https://g.com/x', linkedinUrl: '', instagramUrl: '', resumeUrl: '' } }), r);
  check('POST offline re-renders form with honest 400', r.statusCode === 400 && r.view === 'admin/settings' && /offline/.test(r.locals.errors._form));

  db.isDbReady = () => true;
  r = mockRes();
  await ctlMod.saveSettings(mockReq({ body: { contactEmail: 'bad', githubUrl: 'https://g.com/x', linkedinUrl: '', instagramUrl: '', resumeUrl: '' } }), r);
  check('validation error maps to field with 400', r.statusCode === 400 && r.locals.errors.contactEmail && !r.locals.errors.githubUrl);

  const realFindOneAndUpdate = SiteSettings.findOneAndUpdate;
  SiteSettings.findOneAndUpdate = async () => ({ contactEmail: 'new@example.com' });
  r = mockRes();
  await ctlMod.saveSettings(mockReq({ body: { contactEmail: '  new@example.com  ', githubUrl: 'https://github.com/NewUser', linkedinUrl: '', instagramUrl: '', resumeUrl: '/asset/k.pdf' }, session: {} }), r);
  check('valid save trims and redirects (no re-render)', r.redirectUrl === '/admin/settings' && r.view === null && r.locals === null);
  const savedBody = mockReq({ body: { contactEmail: '  new@example.com  ', githubUrl: 'https://github.com/NewUser', linkedinUrl: '', instagramUrl: '', resumeUrl: '/asset/k.pdf' }, session: {} });
  await ctlMod.saveSettings(savedBody, r);
  check('flash confirmation set on session', savedBody.session.flash && /saved/i.test(savedBody.session.flash.message));
  SiteSettings.findOneAndUpdate = async () => { throw new Error('boom'); };
  r = mockRes();
  await ctlMod.saveSettings(mockReq({ body: { contactEmail: 'new@example.com', githubUrl: 'https://github.com/NewUser', linkedinUrl: '', instagramUrl: '', resumeUrl: '' } }), r);
  check('db save error re-renders form with apology', r.statusCode === 400 && /could not be saved/i.test(r.locals.errors._form));
  SiteSettings.findOneAndUpdate = realFindOneAndUpdate;
  db.isDbReady = realReady;

  /* ============================================================
     PART C — rendering behaviour
     ============================================================ */
  console.log('  Phase 20 — admin form rendering:');
  const formLocals = {
    title: 'Settings', errors: { contactEmail: 'Enter a valid email address or leave it empty' },
    values: { contactEmail: 'bad', githubUrl: 'https://github.com/Khushalpaunkar', linkedinUrl: '', instagramUrl: '', resumeUrl: '' },
    csrfToken: 'ab'.repeat(24), flash: null,
  };
  const formHtml = await ejs.renderFile(ROOT + 'views/admin/settings.ejs', formLocals);
  check('form keeps the offending value', formHtml.includes('value="bad"'), 'value preserved');
  check('form surfaces the field error', formHtml.includes('Enter a valid email address'), 'error block');
  check('form carries the CSRF token', formHtml.includes('name="csrfToken" value="abababab'));
  check('form has all five fields', ['s-email', 's-github', 's-linkedin', 's-instagram', 's-resume'].every((id) => formHtml.includes('id="' + id + '"')));
  check('empty hidden values render as empty (no undefined)', !formHtml.includes('undefined'));
  check('settings page has no raw inline handler', !/onclick="/.test(formHtml));

  console.log('  Phase 20 — public pages resolve settings (defaults === no-locals parity):');
  const { fromSeed } = require(ROOT + 'services/projectService');
  const icons = require(ROOT + 'utils/icons');
  const detail = {
    siteUrl: '',
    projects: fromSeed(),
    cspNonce: 'TESTNONCE',
    title: 't',
    techIcon: icons.techIcon,
    placeholderIcon: icons.placeholderIcon,
  };
  const renderIndex = (locals) => ejs.renderFile(ROOT + 'views/index.ejs', Object.assign({}, detail, locals));
  const renderFooter = (locals) => ejs.renderFile(ROOT + 'views/partials/footer.ejs', Object.assign({}, detail, locals));
  const renderNav = (locals) => ejs.renderFile(ROOT + 'views/partials/nav.ejs', Object.assign({}, detail, locals));

  const noLocalsIndex = await renderIndex({});
  const defaultsIndex = await renderIndex({ siteSettings: D });
  check('index renders identical with defaults vs no locals', noLocalsIndex === defaultsIndex);
  check('index keeps the real email + profiles by default', noLocalsIndex.includes('mailto:khushalpaunkar79@gmail.com') && noLocalsIndex.includes('https://github.com/Khushalpaunkar') && noLocalsIndex.includes('in/khushalpaunkar'));
  const clearedIndex = await renderIndex({ siteSettings: { contactEmail: '', githubUrl: '', linkedinUrl: '', instagramUrl: '', resumeUrl: '' } });
  check('cleared socials hide every contact link', !clearedIndex.includes('link-row') && !clearedIndex.includes('mailto:') && !clearedIndex.includes('fa-file-arrow-down'));
  const partialIndex = await renderIndex({ siteSettings: Object.assign({}, D, { githubUrl: 'https://github.com/ghost', instagramUrl: '' }) });
  check('edited github shows without dead instagram', partialIndex.includes('https://github.com/ghost') && !partialIndex.includes('instagram'));

  const noLocalsFooter = await renderFooter({});
  const defaultsFooter = await renderFooter({ siteSettings: D });
  check('footer identical with defaults vs no locals', noLocalsFooter === defaultsFooter);
  const clearedFooter = await renderFooter({ siteSettings: Object.assign({}, D, { githubUrl: '', linkedinUrl: '', instagramUrl: '' }) });
  check('cleared footer keeps mail + resume only', clearedFooter.includes('mailto:khushalpaunkar79@gmail.com') && clearedFooter.includes('file-arrow-down') && !clearedFooter.includes('fa-github') && !clearedFooter.includes('fa-instagram'));

  const noLocalsNav = await renderNav({});
  const defaultsNav = await renderNav({ siteSettings: D });
  check('nav resume identical with defaults vs no locals', noLocalsNav === defaultsNav);
  const clearedNav = await renderNav({ siteSettings: { resumeUrl: '' } });
  check('cleared resume hides the nav button', !clearedNav.includes('file-arrow-down') && !clearedNav.includes('Download'));

  console.log('\n  ' + fail + ' failed');
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('settings test crashed:', e); process.exit(1); });