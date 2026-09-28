const fs = require('fs');
const ROOT = require('path').resolve(__dirname, '..') + '/';
// NOTE: portable — resolves to the project root relative to this file.
const css = fs.readFileSync(ROOT + 'public/css/main.css', 'utf8');
const nav = fs.readFileSync(ROOT + 'views/partials/nav.ejs', 'utf8');
const page = fs.readFileSync(ROOT + 'views/index.ejs', 'utf8');

let fail = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail && !cond ? '  -> ' + detail : ''}`);
  if (!cond) fail++;
};

// Helper: does a CSS rule mention both classes in the same selector?
const rule = (...parts) => {
  // strip comments, then look for "a" followed later by "b" inside one selector
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return src.split('}').some((block) => {
    const sel = block.split('{')[0];
    if (!sel) return false;
    return parts.every((p) => sel.includes(p));
  });
};

console.log('  JS <-> CSS state contract:');

// Navigation
check('body.nav-open exists in CSS', /body\.nav-open/.test(css));
check('.nav__menu.is-open styled', rule('.nav__menu', '.is-open'));
check('.nav__link.is-active styled', rule('.nav__link', '.is-active'));
check('.nav__indicator.is-on styled', rule('.nav__indicator', '.is-on'));
check('#navul is the sliding .nav__menu panel', /<nav[^>]*class="nav__menu"[^>]*id="navul"|<nav class="nav__menu" id="navul"/.test(nav),
  'aria-controls="navul" must target the element that receives is-open');
check('#nav-indicator lives inside #navul', nav.indexOf('id="nav-indicator"') > nav.indexOf('id="navul"') &&
  nav.indexOf('id="nav-indicator"') < nav.indexOf('id="navul"') + 200);

// Back to top
check('.back-to-top.is-visible styled', rule('.back-to-top', '.is-visible'));
check('back-to-top id in page', page.includes('id="back-to-top"'));

// Toast
check('.toast.is-on styled', rule('.toast', '.is-on'));
check('.toast--ok styled', /\.toast--ok/.test(css));
check('.toast--err styled', /\.toast--err/.test(css));
check('toast id in page', page.includes('id="toast"'));

// Form validation + status
check('.field__error.is-on styled', rule('.field__error', '.is-on'));
check('.form__status.is-on styled', rule('.form__status', '.is-on'));
check('.form__status--ok styled', /\.form__status--ok/.test(css));
check('.form__status--err styled', /\.form__status--err/.test(css));
check('aria-invalid styled', /\[aria-invalid=['"]true['"]\]/.test(css));

// Theme
check('[data-theme="light"] tokens defined', /\[data-theme=['"]light['"]\]/.test(css));
check('theme toggle sets data-theme on <html>', /documentElement/.test(fs.readFileSync(ROOT + 'public/js/theme.js', 'utf8')));

// Indicator needs a positioned ancestor
check('.nav__menu is position:relative', /\.nav__menu\s*\{[^}]*position:\s*relative/.test(css));

console.log('  Phase 5 motion:');
const bgPartial = fs.readFileSync(ROOT + 'views/partials/background.ejs', 'utf8');
const head = fs.readFileSync(ROOT + 'views/partials/head.ejs', 'utf8');
const motion = fs.readFileSync(ROOT + 'public/js/motion.js', 'utf8');

// Reveal gate
check('reveal base rule gated behind .js', /\.js \[data-reveal\]/.test(css));
check('reveal completion uses .is-in', /\.js \[data-reveal\]\.is-in/.test(css));
check('motion.js adds .is-in', motion.includes("classList.add('is-in')"));
check('gate set in head before paint', /classList\.add\('js'\)/.test(head));
check('gate feature-detects IntersectionObserver', /'IntersectionObserver' in window/.test(head));

// The design invariant: reveals must not touch `transform`, because cards
// use it for hover lift and flipping.
const revealBlock = (css.match(/\.js \[data-reveal\][^{]*\{[^}]*\}/g) || []).join('\n');
check('reveal never uses transform', !/transform\s*:/.test(revealBlock),
  'must animate the standalone `translate` property so it composes with .pf:hover');

// Nothing may be able to leave a revealed element invisible.
const reducedBlock = (css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/g) || []).join('\n');
check('reduced motion forces [data-reveal] visible', /\.js \[data-reveal\]\s*\{[^}]*opacity:\s*1\s*!important/.test(reducedBlock));
check('reduced motion stops ambient loops', /\.bg__orb,\s*\.bg__grid\s*\{\s*animation:\s*none/.test(reducedBlock));
check('reduced motion hides the canvas', /\.bg__particles,\s*\.bg__glow\s*\{[^}]*display:\s*none/.test(reducedBlock));

// Background layers
check('#bg-glow present in markup', bgPartial.includes('id="bg-glow"'));
check('#bg-particles canvas present in markup', /<canvas[^>]*id="bg-particles"/.test(bgPartial));
check('.bg__particles styled', /\.bg__particles/.test(css));
check('.bg__glow styled', /\.bg__glow/.test(css));
check('glow hidden on coarse pointers', /@media \(hover: none\), \(pointer: coarse\)/.test(css));
check('all three orbs animated', ['drift-a', 'drift-b', 'drift-c'].every((k) => css.includes('@keyframes ' + k)));
check('grid pan keyframe defined', /@keyframes grid-pan/.test(css));
check('hero-in keyframe defined', /@keyframes hero-in/.test(css));
check('grid overscan prevents edge reveal', /\.bg__grid\s*\{[^}]*inset:\s*-70px/.test(css));
check('canvas overscan for parallax', /\.bg__particles\s*\{[^}]*inset:\s*-8%/.test(css));

// Performance guards in the script itself
check('particles capped', /Math\.max\(18, Math\.min\(70/.test(motion));
check('device pixel ratio capped at 2', /Math\.min\(window\.devicePixelRatio \|\| 1, 2\)/.test(motion));
check('loop stops when tab hidden', /visibilitychange/.test(motion) && /document\.hidden/.test(motion));
check('loop stops on reduced motion', /reduceMotion\.matches\) stop\(\)/.test(motion));
check('honours Save-Data', /saveData/.test(motion));
check('reveal observer unobserves after firing', /observer\.unobserve/.test(motion));
check('scroll listener is passive where possible', /passive: true/.test(motion));
check('motion.js loaded by the page', page.includes('/js/motion.js'));

console.log('  Phase 5 failsafes:');
check('inits wrapped so a throw cannot blank the page', /safely\('reveal'/.test(motion) && /safely\('particles'/.test(motion));
check('failure path force-reveals everything', /catch \(error\)[\s\S]{0,400}revealAll\(\)/.test(motion));
check('straggler sweep on load', /addEventListener\('load', revealStragglers\)/.test(motion));
check('straggler sweep after a delay too', /setTimeout\(revealStragglers/.test(motion));

console.log('  Phase 6 data layer:');
const index = fs.readFileSync(ROOT + 'views/index.ejs', 'utf8');
const featured = fs.readFileSync(ROOT + 'views/partials/project-featured.ejs', 'utf8');
const card = fs.readFileSync(ROOT + 'views/partials/project-card.ejs', 'utf8');
const data = fs.readFileSync(ROOT + 'data/projects.js', 'utf8');
const service = fs.readFileSync(ROOT + 'services/projectService.js', 'utf8');
const seedScript = fs.readFileSync(ROOT + 'scripts/seed-projects.js', 'utf8');

// The page must not hardcode project content any more.
for (const title of ['KisaanMitra', 'ResumeCraft', 'Lost &amp; Found', 'Random Joke Generator']) {
  check(`index.ejs no longer hardcodes "${title}"`, !index.includes(title));
}
check('index.ejs loops the featured projects', /projects\.featured\.forEach/.test(index));
check('index.ejs loops the other projects', /projects\.others\.forEach/.test(index));
check('index.ejs includes both card partials',
  /include\('partials\/project-featured'/.test(index) && /include\('partials\/project-card'/.test(index));
check('index.ejs passes the icon helpers into includes',
  /placeholderIcon: placeholderIcon/.test(index));

// The link policy must live in the data and the partials, never in the page.
// The link policy must live in the data and the partials, never in the page.
// The GitHub *profile* link is page chrome (hero + contact), so it is allowed
// here; what must not appear is a hardcoded project repository.
const indexGithub = [...index.matchAll(/github\.com\/([\w.-]+)/g)].map((m) => m[1]);
check('only the GitHub profile is hardcoded in index.ejs',
  indexGithub.length > 0 && indexGithub.every((u) => u === 'Khushalpaunkar'),
  [...new Set(indexGithub)].join(', '));
check('no github.com URL in the card partials',
  !/github\.com\/(?!chaitanyakamdi|Khushalpaunkar)/.test(featured + card) &&
  !/href="https:\/\/github/.test(featured + card));
check('card renders no anchor when URLs are empty', /links\.length/.test(card) && /links\.length/.test(featured));
check('card renders a placeholder when image is empty', /hasImage/.test(card) && /hasImage/.test(featured));
check('seed file documents the empty-URL policy', /EMPTY STRINGS/.test(data));
check('seed file stores no icon classes', !/fa[srb]? fa-[a-z-]+/.test(data));

// Service behaviour.
check('service falls back when the collection is empty', /if \(!docs\.length\)/.test(service));
check('service falls back on a read error', /catch \(error\)[\s\S]{0,300}fromSeed\(\)/.test(service));
check('service never throws', !/throw /.test(service));
check('service derives a slug offline', /Project\.slugify\(project\.title\)/.test(service));
check('service normalises imageAlt', /imageAlt: project\.imageAlt \|\| project\.title/.test(service));

// Seed script safety.
check('seed script upserts (idempotent)', /upsert: true/.test(seedScript));
check('seed script deletes nothing by default', /deleteMany/.test(seedScript) && /--replace/.test(seedScript));
check('seed script exits non-zero without a URI', /process\.exit\(1\)/.test(seedScript));
check('seed script disconnects cleanly', /mongoose\.disconnect\(\)/.test(seedScript));

console.log(`\n  ${fail === 0 ? 'CONTRACT INTACT' : fail + ' BROKEN CONTRACT(S)'}\n`);
process.exit(fail > 0 ? 1 : 0);
