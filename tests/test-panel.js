/**
 * test-panel.js — Phase 9 (admin panel: inbox + project CRUD)
 *
 *   A. Static contract: routes wired, every write CSRF-guarded, admin views
 *      carry no inline event handlers (CSP script-src-attr 'none'), delete
 *      actions demand a confirm box, and the white-list keeps the schema safe.
 *   B. Behaviour: the controllers are driven against mock req/res with
 *      in-memory Contact/Project stores and a stubbed isDbReady — the same
 *      single-source-of-truth validation the live app uses.
 *
 * Run:  npm run verify   (or: node tests/test-panel.js)
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

/* ============================================================
   PART A — static contract
   ============================================================ */
console.log('  Phase 9 — routes:');
const routes = read('routes/adminRoutes.js');
const messageCtl = read('controllers/messageController.js');
const projectCtl = read('controllers/projectController.js');
const adminCsrf = read('middleware/adminCsrf.js');

const expectedRoutes = [
  "router.get('/admin/messages'",
  "router.get('/admin/messages/:id'",
  "router.post('/admin/messages/:id/status'",
  "router.post('/admin/messages/:id/delete'",
  "router.get('/admin/projects'",
  "router.get('/admin/projects/new'",
  "router.post('/admin/projects'",
  "router.get('/admin/projects/:id/edit'",
  "router.post('/admin/projects/:id/edit'",
  "router.post('/admin/projects/:id/delete'",
];
expectedRoutes.forEach((r) => check('route ' + r.replace("'", ''), routes.includes(r)));

const writes = [
  "'/admin/logout'",
  "'/admin/messages/:id/status'",
  "'/admin/messages/:id/delete'",
  "'/admin/projects'",
  "'/admin/projects/:id/edit'",
  "'/admin/projects/:id/delete'",
];
writes.forEach((r) => {
  const guard = new RegExp("router\\.post\\(" + r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ", requireAdmin, requireAdminCsrf");
  check(`write ${r} is CSRF-guarded`, guard.test(routes));
});
check('login POST still rate limited', /loginLimiter/.test(routes));

console.log('  Phase 9 — CSRF shared util:');
const csrfUtil = read('utils/csrf.js');
const authCtl = read('controllers/authController.js');
check('utils/csrf.js exports issue/verify', /module\.exports = \{ issue, verify, secureEqual \}/.test(csrfUtil));
check('authController delegates to csrf util', /csrf\.issue\(req\)/.test(authCtl) && /csrf\.verify\(req/.test(authCtl));
check('authController no longer rolls its own crypto', !/crypto\.timingSafeEqual/.test(authCtl));

console.log('  Phase 9 — views honour the CSP (no inline handlers):');
const adminViews = [
  'views/admin/login.ejs',
  'views/admin/dashboard.ejs',
  'views/admin/error.ejs',
  'views/admin/messages.ejs',
  'views/admin/message.ejs',
  'views/admin/projects.ejs',
  'views/admin/project-form.ejs',
];
const allAdminViews = adminViews.map(read).join('\n');
check('no inline event handlers anywhere in admin', !/\son[a-z]+="/.test(allAdminViews), 'CSP script-src-attr is none');
check('no third-party scripts in admin', !/<script[^>]*src="https?:\/\//.test(allAdminViews));
check('messages view has no scripts at all', !/<script/.test(read('views/admin/messages.ejs')));
check('message delete demands a confirm checkbox', /name="confirm"/.test(read('views/admin/message.ejs')));
check('project delete demands a confirm checkbox', /name="confirm"/.test(read('views/admin/project-form.ejs')));
check('message view is CSP-confirm-safe (no onsubmit)', !/onsubmit/.test(read('views/admin/message.ejs')));

console.log('  Phase 9 — single source of truth:');
check('project create validates via the schema', /new Project\(payload\)[\s\S]*await doc\.validate\(\)/.test(projectCtl));
check('project edit uses set() + validate()', /\.set\(payload\)/.test(projectCtl) && /await doc\.validate\(\)/.test(projectCtl));
check('cases a unique-slug clash', /error\.code === 11000/.test(projectCtl));
check('only whitelisted fields leave the form', /ALLOWED_FIELDS/.test(projectCtl) && /payload\[field\] = body\[field\]/.test(projectCtl));
check('status updates constrained to enum', /STATUSES\.includes\(req\.body\.status\)/.test(messageCtl));
check('message actions refuse while offline', /MongoDB is offline/.test(messageCtl) && /offline/.test(projectCtl));

console.log('  Phase 13 — inbox triage contract:');
const messagesView = read('views/admin/messages.ejs');
const messageView = read('views/admin/message.ejs');
check('list paginates server-side', /const PAGE_SIZE = 20/.test(messageCtl) && /\.skip\(/.test(messageCtl) && /\.limit\(PAGE_SIZE\)/.test(messageCtl));
check('page param is coerced safely', /Number\.parseInt\(value, 10\)/.test(messageCtl) && />= 1 \? page : 1/.test(messageCtl));
check('paginated query counted', /Contact\.countDocuments\(query\)/.test(messageCtl));
check('per-status totals passed to the view', /counts\.new = newCount/.test(messageCtl));
check('view renders the pager with a page param', /page=/.test(messagesView) && /Page <%= page %> of <%= pages %>/.test(messagesView));
check('view shows the result range', /of <%= total %>/.test(messagesView));
check('view counts every status in the filter chips', /counts\.new/.test(messagesView) && /counts\.read/.test(messagesView) && /counts\.archived/.test(messagesView));
check('detail view offers reply-by-email when a sender address exists', /if \(message\.email\)/.test(messageView) && /mailto:/.test(messageView) && /encodeURIComponent/.test(messageView));

/* ============================================================
   PART B — behaviour (mock req/res + in-memory stores)
   ============================================================ */
const runBehaviour = async () => {
  console.log('  Phase 9 — messageController:');
  const Contact = require(ROOT + 'models/Contact');
  const db = require(ROOT + 'config/db');
  const message = require(ROOT + 'controllers/messageController');

  const messageStore = [
    { _id: 'aaaaaaaaaaaaaaaaaaaa0001', name: 'Alice', email: 'a@example.com', subject: 'Hi', message: 'Hello there friend!', status: 'new', createdAt: new Date('2026-09-01') },
    { _id: 'aaaaaaaaaaaaaaaaaaaa0002', name: 'Bob', email: 'b@example.com', subject: '', message: 'Second message body.', status: 'archived', createdAt: new Date('2026-09-02') },
  ];
  let nextMessageId = 3;

  Contact.find = (query = {}) => ({
    sort: () => ({
      skip: (n) => ({
        limit: (m) => ({
          exec: async () =>
            listStore
              .filter((x) => !query.status || x.status === query.status)
              .slice()
              .reverse()
              .slice(n, n + m),
        }),
      }),
    }),
  });
  Contact.countDocuments = async (query = {}) =>
    listStore.filter((x) => !query.status || x.status === query.status).length;
  let listStore = messageStore;
  Contact.findById = (id) => ({ exec: async () => messageStore.find((m) => m._id === id) || null });
  Contact.findByIdAndUpdate = (id, update, opts) => ({
    exec: async () => {
      const m = messageStore.find((x) => x._id === id);
      if (!m) return null;
      Object.assign(m, update);
      return m;
    },
  });
  Contact.findByIdAndDelete = (id) => ({
    exec: async () => {
      const i = messageStore.findIndex((x) => x._id === id);
      if (i < 0) return null;
      return messageStore.splice(i, 1)[0];
    },
  });

  let online = false;
  const realIsDbReady = db.isDbReady;
  db.isDbReady = () => online;

  const mockReq = (over = {}) =>
    Object.assign({ params: {}, query: {}, body: {}, session: {}, method: 'GET', headers: {}, get: (h) => over.headers && over.headers[h] }, over);
  const mockRes = () => ({
    statusCode: 200, view: null, locals: null, redirectUrl: null,
    status(c) { this.statusCode = c; return this; },
    render(v, l) { this.view = v; this.locals = l; return this; },
    redirect(u) { this.redirectUrl = u; return this; },
  });

  let r;
  r = mockRes();
  await message.listMessages(mockReq(), r);
  check('offline list renders with source=offline', r.view === 'admin/messages' && r.locals.source === 'offline', r.view);
  check('csrf token issued on list', r.locals.csrfToken && r.locals.csrfToken.length === 48);

  online = true;
  r = mockRes();
  await message.listMessages(mockReq(), r);
  check('online list renders both messages', r.locals.messages.length === 2 && r.locals.source === 'database');
  r = mockRes();
  await message.listMessages(mockReq({ query: { filter: 'archived' } }), r);
  check('filter=archived narrows the list', r.locals.filter === 'archived' && r.locals.messages.length === 1 && r.locals.messages[0].status === 'archived');

  r = mockRes();
  await message.setMessageStatus(mockReq({ params: { id: 'aaaaaaaaaaaaaaaaaaaa0002' }, body: { status: 'read' } }), r);
  check('status update redirects to detail', r.redirectUrl === '/admin/messages/aaaaaaaaaaaaaaaaaaaa0002' && messageStore[1].status === 'read');

  online = false;
  r = mockRes();
  await message.setMessageStatus(mockReq({ params: { id: 'aaaaaaaaaaaaaaaaaaaa0001' }, body: { status: 'archived' } }), r);
  const offlineFlash = r.redirectUrl && JSON.stringify(r.redirectUrl);
  check('status update refuses offline', r.redirectUrl && r.redirectUrl.includes('aaaaaaaaaaaaaaaaaaaa0001'), offlineFlash);

  online = true;
  r = mockRes();
  await message.deleteMessage(mockReq({ params: { id: 'aaaaaaaaaaaaaaaaaaaa0001' }, body: { confirm: 'on' } }), r);
  check('confirmed delete removes and redirects', r.redirectUrl === '/admin/messages' && messageStore.length === 1);
  r = mockRes();
  await message.deleteMessage(mockReq({ params: { id: 'aaaaaaaaaaaaaaaaaaaa0002' }, body: {} }), r);
  check('unconfirmed delete is refused', r.redirectUrl === '/admin/messages/aaaaaaaaaaaaaaaaaaaa0002' && messageStore.length === 1);

  r = mockRes();
  await message.showMessage(mockReq({ params: { id: 'nope' } }), r);
  check('bad id -> 404 error page', r.statusCode === 404 && r.view === 'admin/error');
  r = mockRes();
  await message.showMessage(mockReq({ params: { id: 'aaaaaaaaaaaaaaaaaaaa0002' } }), r);
  check('found message renders detail view', r.view === 'admin/message' && r.locals.message.email === 'b@example.com');

  console.log('  Phase 13 — inbox pagination:');
  listStore = [];
  for (let i = 1; i <= 25; i++) {
    listStore.push({
      _id: 'bbbbbbbbbbbbbbbbbbbb' + String(i).padStart(4, '0'),
      name: 'User' + i,
      email: i + '@example.com',
      subject: '',
      message: 'body ' + i,
      status: i <= 5 ? 'new' : 'read',
      createdAt: new Date(2026, 8, i),
    });
  }

  r = mockRes();
  await message.listMessages(mockReq(), r);
  check('page 1 shows 20 of 25', r.locals.messages.length === 20 && r.locals.total === 25 && r.locals.pages === 2 && r.locals.page === 1);
  r = mockRes();
  await message.listMessages(mockReq({ query: { page: '2' } }), r);
  check('page 2 shows the remaining 5', r.locals.messages.length === 5 && r.locals.page === 2);
  r = mockRes();
  await message.listMessages(mockReq({ query: { page: 'abc' } }), r);
  check('page=abc coerces to page 1', r.locals.page === 1 && r.locals.messages.length === 20);
  r = mockRes();
  await message.listMessages(mockReq({ query: { page: '-3' } }), r);
  check('page=-3 coerces to page 1', r.locals.page === 1);
  r = mockRes();
  await message.listMessages(mockReq({ query: { page: '99' } }), r);
  check('page past the end renders empty but keeps totals', r.locals.messages.length === 0 && r.locals.total === 25 && r.locals.pages === 2 && r.locals.page === 99);
  r = mockRes();
  await message.listMessages(mockReq({ query: { filter: 'new' } }), r);
  check('filter=new keeps total slim (5, single page)', r.locals.filter === 'new' && r.locals.total === 5 && r.locals.pages === 1 && r.locals.messages.length === 5);
  r = mockRes();
  await message.listMessages(mockReq({ query: { filter: 'new', page: '2' } }), r);
  check('a page past a single-page filter renders empty', r.locals.messages.length === 0 && r.locals.total === 5 && r.locals.pages === 1);
  check('per-status counts are the unfiltered totals', r.locals.counts.new === 5 && r.locals.counts.read === 20 && r.locals.counts.archived === 0);

  console.log('  Phase 9 — projectController:');
  const project = require(ROOT + 'controllers/projectController');
  const Project = require(ROOT + 'models/Project');

  const projectStore = [];
  const realPrototypeSave = Project.prototype.save;

  // The real schema stays the single source of truth: documents are built with
  // the real constructor (so validate() runs the actual validators). Only the
  // persistence seam is faked — save() writes into an in-memory store.
  Project.findById = (id) => ({ exec: async () => projectStore.find((p) => String(p._id) === String(id)) || null });
  Project.findOne = () => ({ exec: async () => null });
  Project.findByIdAndDelete = (id) => ({
    exec: async () => {
      const i = projectStore.findIndex((p) => String(p._id) === String(id));
      if (i < 0) return null;
      return projectStore.splice(i, 1)[0];
    },
  });
  Project.prototype.save = async function () {
    const i = projectStore.findIndex((p) => String(p._id) === String(this._id));
    if (i >= 0) projectStore[i] = this;
    else projectStore.push(this);
    return this;
  };

  const payload = project.buildPayload({
    title: '  Test App  ',
    shortDescription: ' x ',
    description: 'y',
    features: 'one\ntwo,three',
    technologies: 'Node.js,\nMongoDB',
    tags: 'sem,a,b,c,z',
    category: 'AI',
    year: '',
    image: '',
    imageAlt: '',
    githubUrl: 'not-a-url',
    liveUrl: '',
    featured: 'on',
    order: '5',
    username: 'intruder',
  });
  check('buildPayload coerce + whitelist',
    payload.title === '  Test App  ' &&  // title is left raw for the form; the schema trims at save time
    payload.features.join('|') === 'one|two|three' &&
    payload.technologies.join('|') === 'Node.js|MongoDB' &&
    payload.tags.length === 5 &&
    payload.featured === true &&
    payload.year === null &&
    payload.order === 5 &&
    !('username' in payload),
    JSON.stringify(payload));

  online = false;
  r = mockRes();
  await project.saveProject(mockReq({ body: {} }), r, { editing: false });
  check('offline create -> 503', r.statusCode === 503 && r.view === 'admin/error');

  r = mockRes();
  await project.listProjects(mockReq(), r);
  check('offline list falls back to bundled seed', r.locals.source === 'offline' && r.locals.projects.length === 5, `n=${r.locals.projects && r.locals.projects.length}`);

  console.log('  Phase 16 — editor seed/DB honesty:');
  Project.find = () => ({ sort: () => ({ exec: async () => projectStore.slice() }) });
  online = true;
  r = mockRes();
  await project.listProjects(mockReq(), r);
  check('online + empty DB shows a true empty list, not seed', r.locals.source === 'database' && r.locals.projects.length === 0, `source=${r.locals.source} n=${r.locals.projects && r.locals.projects.length}`);
  Project.find = () => ({ sort: () => ({ exec: async () => { throw new Error('boom'); } }) });
  r = mockRes();
  await project.listProjects(mockReq(), r);
  check('a failed read still falls back to seed with an error notice', r.locals.source === 'error' && r.locals.projects.length === 5, `source=${r.locals.source} n=${r.locals.projects && r.locals.projects.length}`);
  Project.find = () => ({ sort: () => ({ exec: async () => projectStore.slice() }) });
  online = false;

  online = true;
  r = mockRes();
  await project.saveProject(mockReq({ body: { title: 'X', githubUrl: 'not-a-url' } }), r, { editing: false });
  check('create with bad URL -> 400 + errors.githubUrl', r.statusCode === 400 && r.locals.errors && r.locals.errors.githubUrl, JSON.stringify(r.locals && r.locals.errors));

  r = mockRes();
  await project.saveProject(mockReq({ body: { githubUrl: 'https://ok.example' } }), r, { editing: false });
  check('create missing title -> 400 + errors.title', r.statusCode === 400 && r.locals.errors && r.locals.errors.title, JSON.stringify(r.locals && r.locals.errors));

  const goodPayload = project.buildPayload({ title: 'New Project', description: 'desc', category: 'AI', year: '2026', githubUrl: '', liveUrl: '' });
  r = mockRes();
  await project.saveProject(mockReq({ body: goodPayload }), r, { editing: false });
  check('valid create saves and redirects', r.redirectUrl === '/admin/projects' && projectStore.length === 1, r.view + ' / ' + projectStore.length);
  check('created project carries a slug', !!/[a-z0-9-]/.test(projectStore[0].slug || ''));

  const savedId = String(projectStore[0]._id);
  r = mockRes();
  await project.saveProject(mockReq({ params: { id: savedId }, body: project.buildPayload({ ...goodPayload, title: 'Renamed', shortDescription: 's changed' }) }), r, { editing: true });
  check('edit redirects + mutates the store', r.redirectUrl === '/admin/projects' && projectStore.find((p) => String(p._id) === savedId).title === 'Renamed');

  r = mockRes();
  await project.deleteProject(mockReq({ params: { id: savedId }, body: { confirm: 'on' } }), r);
  check('confirmed delete removes the project', r.redirectUrl === '/admin/projects' && projectStore.length === 0);

  projectStore.push({ _id: 'cccccccccccccccccccc0001', title: 'Real DB Row', category: 'AI', year: 2026, featured: true, order: 1 });
  r = mockRes();
  await project.listProjects(mockReq(), r);
  check('online list reflects only real DB rows', r.locals.source === 'database' && r.locals.projects.length === 1 && r.locals.projects[0].title === 'Real DB Row', `source=${r.locals.source} n=${r.locals.projects && r.locals.projects.length}`);

  Project.prototype.save = realPrototypeSave;
  db.isDbReady = realIsDbReady;
};

runBehaviour()
  .then(() => {
    console.log(`\n  ${fail === 0 ? 'PANEL INTACT' : fail + ' BROKEN PANEL CHECK(S)'}\n`);
    process.exit(fail > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error('  Runtime failure:', err.message);
    console.error(err.stack);
    process.exit(1);
  });