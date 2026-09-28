/**
 * test-noscript.js — Phase 18 (graceful degradation without JavaScript)
 *
 * The site already gates scroll-reveal behind a `.js` class, so content can
 * never be stuck invisible. This phase closes the remaining JS-only gaps:
 *
 *   A. Mobile menu: on small screens everything but the burger is hidden until
 *      navigation.js toggles `.is-open` — so without JS at <=900px the links
 *      were unreachable. A `html:not(.js)` CSS fallback now renders the menu
 *      as an always-visible dropdown instead.
 *   B. Anchor offsets: section targets clear the fixed nav even when no script
 *      is there to reposition them.
 *   C. Contact form: the submit path is fetch-driven, so a <noscript> note
 *      offers the real email instead of a silently dead form.
 *
 * Run:  npm run verify   (or: node tests/test-noscript.js)
 */

const fs = require('fs');
const path = require('path');

const ROOT = require('path').resolve(__dirname, '..') + '/';
const read = (p) => fs.readFileSync(ROOT + p, 'utf8');

let fail = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail && !cond ? '  -> ' + detail : ''}`);
  if (!cond) fail++;
};

console.log('  Phase 18 — no-JS fallback (mobile menu):');
const css = read('public/css/main.css');
check('a html:not(.js) menu fallback exists', /html:not\(\.js\) \.nav__menu/.test(css), 'selector missing');
check('fallback overrides the off-canvas default', /html:not\(\.js\) \.nav__menu\s*\{[^}]*transform:\s*none;[^}]*visibility:\s*visible;/.test(css), 'still hidden off-screen');
check('burger is hidden when no script can toggle it', /html:not\(\.js\) \.nav__burger\s*\{\s*display:\s*none;/.test(css), 'burger not hidden');
check('indicator hidden in fallback mode', /html:not\(\.js\) \.nav__indicator\s*\{\s*display:\s*none;/.test(css), 'indicator not hidden');
check('JS path still uses the burger', /\.nav__burger \{ display: flex; \}/.test(css), 'js burger removed');
check('fallback styled as a dropdown of the fixed bar', /html:not\(\.js\) \.nav__menu\s*\{[^}]*position:\s*absolute;/.test(css), 'not a dropdown');

console.log('  Phase 18 — anchor targets clear the fixed nav:');
for (const id of ['home', 'about', 'skills', 'projects', 'education', 'contact']) {
  check(`#${id} has scroll-margin-top`, new RegExp(`#${id}[^{]*\\{[^}]*scroll-margin-top`).test(css), 'missing');
}

console.log('  Phase 18 — contact form noscript:');
const index = read('views/index.ejs');
const formRegion = index.split('<form class="form" id="contact-form"')[1] || '';
check('noscript block lives inside the contact form', /<noscript>[\s\S]*<\/form>/.test(formRegion), 'not in form');
check('noscript mailto is settings-driven', formRegion.includes('mailto:<%= sEmail %>'), 'no mailto');
check('noscript default email is the real address', index.includes("'khushalpaunkar79@gmail.com'"), 'default missing');
check('noscript states JS is required', /JavaScript is off, so this form can.t submit/.test(formRegion), 'missing explanation');
check('form__noscript class has styles', /\.form__noscript\s*\{/.test(css), 'unstyled class');

console.log('  Phase 18 — nav stays listener-free:');
const nav = read('views/partials/nav.ejs');
check('no inline handlers in nav', !/on(click|change|load)\s*=/.test(nav), 'inline handler found');

// Every class referenced by the noscript region exists in the stylesheet.
const noscriptClasses = [...formRegion.matchAll(/class="([^"]+)"/g)]
  .flatMap((m) => m[1].split(/\s+/))
  .filter((c) => c && !c.startsWith('fa') && c !== 'is-on');
const unstyled = noscriptClasses.filter((c) => !new RegExp('\\.' + c + '(?![\\w-])').test(css));
check('all classes in the form region are styled', unstyled.length === 0, unstyled.join(', '));

console.log(`\n  ${fail === 0 ? 'NO-JS DEGRADATION INTACT' : fail + ' BROKEN NO-JS CHECK(S)'}\n`);
process.exit(fail > 0 ? 1 : 0);