const path = require('path');
const fs = require('fs');
const ROOT = require('path').resolve(__dirname, '..') + '/';
// NOTE: portable — resolves to the project root relative to this file.
const ejs = require(path.join(ROOT, 'node_modules/ejs'));

// Use the real data layer, not a stub, so this test exercises the same path
// the running server takes when MongoDB is offline.
const { fromSeed } = require(path.join(ROOT, 'services/projectService'));
const { techIcon, placeholderIcon } = require(path.join(ROOT, 'utils/icons'));
const { defaults } = require(path.join(ROOT, 'models/SiteSettings'));

const baseData = () => ({
  title: "Khushal's Portfolio",
  attemptedPath: '/nope',
  status: 500,
  detail: 'test',
  stack: 'stack',
  cspNonce: 'TESTNONCE',
  siteUrl: '',
  projects: fromSeed(),
  siteSettings: defaults,
  techIcon,
  placeholderIcon,
});

(async () => {
  const views = ['views/index.ejs', 'views/404.ejs', 'views/error.ejs'];
  let fail = 0;

  for (const v of views) {
    try {
      const html = await ejs.renderFile(path.join(ROOT, v), baseData());
      const leftovers = (html.match(/<%/g) || []).length;
      console.log(`  OK   ${v}  (${html.length} bytes, ${leftovers} unresolved tags)`);
      if (leftovers > 0) { console.log('       *** RAW EJS TAGS ***'); fail++; }
    } catch (e) {
      console.log(`  FAIL ${v} -> ${e.message}`);
      fail++;
    }
  }

  // Structural assertions on the rendered homepage.
  const html = await ejs.renderFile(path.join(ROOT, 'views/index.ejs'), baseData());
  const need = [
    ['lang attribute', /<html lang="en"/],
    ['single h1', (h) => (h.match(/<h1/g) || []).length === 1],
    ['no h1 duplication', (h) => (h.match(/<h1/g) || []).length <= 1],
    ['theme bootstrap script', /data-theme/],
    ['theme toggle button', /id="theme-toggle"/],
    ['skip link', /class="skip-link"/],
    ['main landmark', /<main id="main">/],
    ['nav labelled', /aria-label="Primary"/],
    ['burger aria-controls', /aria-controls="navul"/],
    ['footer year rendered', (h) => new RegExp('(&copy;|©)\\s*' + new Date().getFullYear() + '\\s*Khushal Paunkar').test(h)],
  ];
  console.log('\n  structure:');
  for (const [name, test] of need) {
    const ok = typeof test === 'function' ? test(html) : test.test(html);
    console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${name}`);
    if (!ok) fail++;
  }

  // id uniqueness
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  console.log(`   ${dupes.length === 0 ? 'PASS' : 'FAIL'}  no duplicate ids${dupes.length ? ' -> ' + [...new Set(dupes)].join(', ') : ''}`);
  if (dupes.length) fail++;

  // every label points at a real input
  const fors = [...html.matchAll(/for="([^"]+)"/g)].map((m) => m[1]);
  const badFors = fors.filter((f) => !ids.includes(f));
  console.log(`   ${badFors.length === 0 ? 'PASS' : 'FAIL'}  every label has a target${badFors.length ? ' -> ' + badFors.join(', ') : ''}`);
  if (badFors.length) fail++;

  // ------------------------------------------------------------------
  // Phase 6: project data layer
  // ------------------------------------------------------------------
  console.log('\n  project data layer:');
  const seed = require(path.join(ROOT, 'data/projects'));
  const { featured, others } = fromSeed();
  const line = (name, cond, detail) => {
    console.log(`   ${cond ? 'PASS' : 'FAIL'}  ${name}${detail && !cond ? '  -> ' + detail : ''}`);
    if (!cond) fail++;
  };

  line('all 5 projects load offline', seed.length === 5, `got ${seed.length}`);
  line('2 featured, 3 others', featured.length === 2 && others.length === 3,
    `got ${featured.length}/${others.length}`);
  line('featured ordered by order', featured.map((p) => p.order).join(',') === '1,2');
  line('others ordered by order', others.map((p) => p.order).join(',') === '1,2,3');

  // Slugs are generated for seed data too, since the partials use them as ids.
  const { slugify } = require(path.join(ROOT, 'models/Project'));
  const slugs = seed.map((p) => slugify(p.title));
  line('slugs are unique', new Set(slugs).size === slugs.length, slugs.join(', '));
  line('slugs are URL-safe', slugs.every((s) => /^[a-z0-9-]+$/.test(s)), slugs.join(', '));
  line('every slug appears as a card id', slugs.every((s) => html.includes(`id="project-${s}"`)));

  // The link policy: a project with no URL must render no anchor at all.
  const noLinkProjects = seed.filter((p) => !p.githubUrl && !p.liveUrl);
  const linkBlock = (html.split('id="projects"')[1] || '').split('</section>')[0];
  line('no placeholder hrefs in projects', !/href="#"/.test(linkBlock) && !/javascript:void/.test(linkBlock));
  line('"coming soon" note for each link-less project',
    (linkBlock.match(/coming soon/g) || []).length >= noLinkProjects.length,
    `${(linkBlock.match(/coming soon/g) || []).length} notes, ${noLinkProjects.length} expected`);

  // Every project anchor must be a real, allow-listed URL.
  const allowedRepo = new Set([
    'https://github.com/Khushalpaunkar',
    'https://github.com/Khushalpaunkar/Random-joke-generator',
    'https://github.com/chaitanyakamdi/Project-4thSem',
  ]);
  const projectHrefs = [...new Set([...linkBlock.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]))];
  const rogue = projectHrefs.filter((u) => !allowedRepo.has(u));
  line('no invented project links', rogue.length === 0, rogue.join(', '));
  line('both known repos are linked',
    projectHrefs.includes('https://github.com/chaitanyakamdi/Project-4thSem') &&
    projectHrefs.includes('https://github.com/Khushalpaunkar/Random-joke-generator'));

  // Images: every referenced screenshot must exist, and projects without one
  // must render a placeholder rather than an empty <img>.
  const projImgs = [...new Set([...linkBlock.matchAll(/<img[^>]+src="(\/[^"]+)"/g)].map((m) => m[1]))];
  const missingImgs = projImgs.filter((i) => !fs.existsSync(path.join(ROOT, 'public', i.replace(/^\//, ''))));
  line(`all ${projImgs.length} project screenshots exist`, missingImgs.length === 0, missingImgs.join(', '));
  line('projects without a screenshot use a placeholder', /Screenshot coming soon/.test(linkBlock));

  // No empty alt text.
  const emptyAlt = [...html.matchAll(/<img[^>]+alt="([^"]*)"/g)].filter((m) => !m[1].trim());
  line('no images with empty alt', emptyAlt.length === 0, `${emptyAlt.length} empty`);

  // Content preservation: nothing from the previously hardcoded markup is lost.
  for (const phrase of ['KisaanMitra AI', 'ResumeCraft', 'Lost &amp; Found', 'Random Joke Generator',
                        'CodeOrigin', '4th Sem', 'Government scheme lookups',
                        'Natural-language prompt input']) {
    line(`content kept: "${phrase}"`, html.includes(phrase));
  }

  // local assets referenced must exist on disk (route links are exempt —
  // /projects/<slug> resolves through the router, not a static file)
  const refs = [...new Set([...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map((m) => m[1]))];
  const missing = refs.filter((r) => !r.startsWith('/projects/') && !fs.existsSync(path.join(ROOT, 'public', r.replace(/^\//, ''))));
  console.log(`   ${missing.length === 0 ? 'PASS' : 'FAIL'}  all ${refs.length} local assets exist${missing.length ? ' -> ' + missing.join(', ') : ''}`);
  if (missing.length) fail++;

  // no invented links: every external href must be a known real URL
  const external = [...new Set([...html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]))];
  const allowed = [
    'https://github.com/Khushalpaunkar',
    'https://github.com/Khushalpaunkar/Random-joke-generator',
    'https://github.com/chaitanyakamdi/Project-4thSem',
    'https://www.linkedin.com/in/khushalpaunkar',
    'https://www.instagram.com/_khushal.089',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/emailjs-com@3/dist/email.min.js',
  ];
  const invented = external.filter((u) => !allowed.includes(u));
  console.log(`   ${invented.length === 0 ? 'PASS' : 'FAIL'}  no invented links${invented.length ? ' -> ' + invented.join(', ') : ''}`);
  if (invented.length) fail++;

  // dead href="#" must be gone
  const hashes = [...html.matchAll(/href="#"/g)];
  console.log(`   ${hashes.length === 0 ? 'PASS' : 'FAIL'}  no dead href="#" links`);
  if (hashes.length) fail++;

  // Every class used in any view must exist in the stylesheet.
  // (Catches styles dropped when the CSS is rewritten.)
  const css = fs.readFileSync(path.join(ROOT, 'public/css/main.css'), 'utf8');
  const viewFiles = ['index.ejs', '404.ejs', 'error.ejs', 'partials/nav.ejs',
                     'partials/footer.ejs', 'partials/background.ejs', 'partials/head.ejs'];
  const used = new Set();
  for (const v of viewFiles) {
    const src = fs.readFileSync(path.join(ROOT, 'views', v), 'utf8');
    for (const m of src.matchAll(/class="([^"]+)"/g)) {
      // Dynamic classes (class="<%= item.icon %>") carry template placeholders,
      // not stylesheet names — skip those, keep the static classes.
      if (m[1].includes('<%=')) continue;
      m[1].split(/\s+/).filter(Boolean).forEach((c) => {
        if (!c.startsWith('fa') && c !== 'is-on') used.add(c);
      });
    }
  }
  const orphans = [...used].filter((c) => !new RegExp('\\.' + c + '(?![\\w-])').test(css));
  console.log(`   ${orphans.length === 0 ? 'PASS' : 'FAIL'}  no unstyled classes in views${orphans.length ? ' -> ' + orphans.join(', ') : ''}`);
  if (orphans.length) fail++;

  // Every JS hook must exist in the rendered page.
  const hooks = ['theme-toggle', 'navul', 'menu-btn', 'nav-indicator', 'contact-form',
                 'cf-name', 'cf-email', 'cf-message', 'cf-submit', 'toast',
                 'scroll-progress', 'back-to-top', 'role', 'bg', 'bg-glow', 'bg-particles'];
  const missingHooks = hooks.filter((h) => !html.includes(`id="${h}"`));
  console.log(`   ${missingHooks.length === 0 ? 'PASS' : 'FAIL'}  all JS hooks present${missingHooks.length ? ' -> ' + missingHooks.join(', ') : ''}`);
  if (missingHooks.length) fail++;

  console.log(`\n  ${fail === 0 ? 'ALL CHECKS PASSED' : fail + ' FAILURES'}\n`);
  process.exit(fail > 0 ? 1 : 0);
})();
