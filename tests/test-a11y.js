/**
 * test-a11y.js — Phase 14 (accessibility audit)
 *
 * Static, offline checks over the templates and stylesheet:
 *   * focus visibility exists (public + admin share main.css)
 *   * every page: lang="en", one <h1>, headings start at h1, a <main id="main">
 *     landmark, and a skip-link whenever <header>/<nav> precedes that main
 *   * every form control is labelled (label[for]/wrapped, or aria-label)
 *   * every <img> carries an alt attribute
 *   * the contact form exposes an aria-live status region and hides its
 *     honeypot from assistive tech
 *
 * Run:  npm run verify   (or: node tests/test-a11y.js)
 */

const fs = require('fs');
const path = require('path');

const ROOT = require('path').resolve(__dirname, '..') + '/';
// NOTE: portable — resolves to the project root relative to this file.
const read = (p) => fs.readFileSync(ROOT + p, 'utf8');

let fail = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail && !cond ? '  -> ' + detail : ''}`);
  if (!cond) fail++;
};

const css = read('public/css/main.css');

console.log('  Phase 14 — focus visibility:');
check(':focus-visible styled in main.css', /:focus-visible\s*\{[^}]*outline/.test(css));
check('text inputs show a focus glow, not a dead outline', /\.input:focus\s*\{[^}]*box-shadow/.test(css));

/* -------- template discovery -------- */
const viewsDir = ROOT + 'views';
const allEjs = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.name.endsWith('.ejs')) allEjs.push(full);
  }
})(viewsDir);
const rel = (p) => p.replace(/\\/g, '/').replace(ROOT.replace(/\\/g, '/'), '');
// "Pages" are templates that open their own <html>; ./partials/** are fragments.
const isPage = (p) => !rel(p).includes('/partials/');
const pages = allEjs.filter(isPage);

/* -------- global: labels, images (scan fragments too) -------- */
console.log('  Phase 14 — labelled controls:');
const unlabelled = [];
for (const file of allEjs) {
  const src = read(rel(file));
  const labelIds = new Set([...(src.matchAll(/<label[^>]*for="([^"]+)"/g) || [])].map((m) => m[1]));
  for (const m of src.matchAll(/<(input|select|textarea)\b[^>]*>/g)) {
    const tag = m[0];
    if (/type="hidden"/.test(tag) || /\bdisabled\b/.test(tag)) continue;
    const id = (tag.match(/\bid="([^"]+)"/) || [])[1];
    const labelled =
      (id && labelIds.has(id)) ||
      /aria-label=/.test(tag) ||
      /aria-labelledby=/.test(tag) ||
      (src.slice(Math.max(0, m.index - 100), m.index).includes('<label') &&
        !src.slice(Math.max(0, m.index - 100), m.index).includes('</label>'));
    if (!labelled) unlabelled.push(rel(file) + ': ' + tag.replace(/\s{2,}/g, ' ').slice(0, 60));
  }
}
check('every visible control is labelled', unlabelled.length === 0, unlabelled.join(' | '));

console.log('  Phase 14 — images carry alt:');
const unaltered = [];
for (const file of allEjs) {
  const src = read(rel(file));
  let i = src.indexOf('<img');
  while (i >= 0) {
    let k = i;
    while (k < src.length) {
      if (src[k] === '<' && src[k + 1] === '%') {
        k += 2;
        while (k < src.length && !(src[k] === '%' && src[k + 1] === '>')) k++;
        k += 2;
      } else if (src[k] === '>') {
        break;
      } else {
        k++;
      }
    }
    const tag = src.slice(i, k + 1);
    if (!/\balt=/.test(tag)) unaltered.push(rel(file) + ': ' + tag.replace(/\s{2,}/g, ' ').slice(0, 70));
    i = src.indexOf('<img', k);
  }
}
check('every <img> declares alt', unaltered.length === 0, unaltered.join(' | '));

console.log('  Phase 14 — page structure:');
for (const page of pages) {
  const src = read(rel(page));
  const name = rel(page);
  if (!/<html lang="en"/.test(src)) check(name + ' declares lang="en"', false);
  const h1 = (src.match(/<h1/g) || []).length;
  if (h1 !== 1) check(name + ' has exactly one <h1>', false, h1 + ' found');
  const firstHeading = (src.match(/<(h[1-6])\b/) || [])[1];
  if (firstHeading !== 'h1') check(name + ' starts its headings at h1', false, 'first is ' + firstHeading);
  if (!/<main[^>]*id="main"/.test(src)) check(name + ' has a <main id="main"> landmark', false);
  const beforeMain = src.slice(0, src.indexOf('<main'));
  if (/<(header|nav)/.test(beforeMain) && !/class="skip-link"/.test(src)) {
    check(name + ' shows a skip-link before its repeated header', false);
  }
}
check('all ' + pages.length + ' pages pass the structure rules', !fail);

console.log('  Phase 14 — contact form affordances:');
const index = read('views/index.ejs');
check('anonymous honeypot hidden from screen readers', /cf-website[\s\S]{0,200}(aria-hidden|hidden|display:\s*none|type="hidden")/.test(index));
check('aria-live status region for submit feedback', /aria-live="polite"/.test(index) || /role="status"/.test(index));

console.log(`\n  ${fail ? fail + ' A11Y BROKEN CHECK(S)' : 'A11Y PASS INTACT'}`);
process.exit(fail ? 1 : 0);