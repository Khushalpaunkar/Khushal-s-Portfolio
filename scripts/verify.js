/**
 * scripts/verify.js — the one-command quality gate.
 *
 * Runs everything the project's test suites cover without needing MongoDB:
 *   * syntax check every server-side JS file
 *   * every harness in tests/test-*.js (in-process, offline)
 *   * the orphan-script scan (every public/js file must be referenced)
 *
 * The live HTTP checks (headers, routes, gzip, cache policy) stay in
 * scripts/smoke.js because they need a running server — start it with
 * `npm start` and run `npm run smoke` separately.
 *
 * Usage:  npm run verify          (or: node scripts/verify.js)
 *         node scripts/verify.js --verbose   (show each suite's full output)
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const testsDir = path.join(ROOT, 'tests');
const verbose = process.argv.includes('--verbose');

const results = [];
let failures = 0;

function done(name, ok, note, lines) {
  results.push({ name, ok, note });
  if (!ok && !verbose) lines.forEach((l) => console.log('    ' + l));
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok && note ? '  (' + note + ')' : ''}`);
  if (!ok && note) console.log(`        -> ${note}`);
}

function lastNonEmpty(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (String(lines[i]).trim()) return String(lines[i]).trim();
  }
  return '';
}

/* ---- 1. Syntax sweep over server-side JS ---- */
console.log('\nStep 1 — server-side syntax:\n');
const jsFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js') && !full.includes(path.sep + 'public' + path.sep)) jsFiles.push(full);
  }
})(ROOT);

const bad = [];
for (const file of jsFiles) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) bad.push(path.relative(ROOT, file) + '  ' + (r.stderr || '').trim().split('\n')[0]);
}
done('syntax ' + jsFiles.length + ' files', bad.length === 0, bad.length ? bad.join(' | ') : 'clean', bad);

/* ---- 2. Harnesses ---- */
console.log('\nStep 2 — test suites (in-process, MongoDB not required):\n');
const harnesses = fs
  .readdirSync(testsDir)
  .filter((f) => f.startsWith('test-') && f.endsWith('.js'))
  .sort();

for (const h of harnesses) {
  const r = spawnSync(process.execPath, [path.join(testsDir, h)], { encoding: 'utf8' });
  const lines = (r.stdout || '').split('\n').map((l) => l.replace(/\r$/, ''));
  const ok = r.status === 0;
  done(
    h.replace(/^test-/, '').replace(/\.js$/, ''),
    ok,
    lastNonEmpty(lines),
    lines
  );
  if (verbose) lines.forEach((l) => console.log('    ' + l));
}

/* ---- 3. Orphan scripts ---- */
console.log('\nStep 3 — orphan browser scripts:\n');
const referenced = [
  'server.js',
  'views/index.ejs',
  'views/404.ejs',
  'views/admin/dashboard.ejs',
  'views/admin/login.ejs',
]
  .map((p) => fs.readFileSync(path.join(ROOT, p), 'utf8'))
  .join('\n');
const orphans = fs
  .readdirSync(path.join(ROOT, 'public', 'js'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => f.replace(/\.js$/, ''))
  .filter((n) => !referenced.includes(n + '.js') && !referenced.includes(n + "'"));
done('orphan scripts', orphans.length === 0, orphans.length ? orphans.join(', ') : 'none', []);

/* ---- Summary ---- */
console.log('\n───────────────────────────────────────────────');
const maxName = Math.max(...results.map((r) => r.name.length));
for (const r of results) {
  console.log(`  ${r.ok ? '●' : '✖'}  ${r.name.padEnd(maxName)}  ${r.ok ? 'ok' : 'BROKEN'}`);
}
console.log('───────────────────────────────────────────────');
if (failures > 0) {
  console.log(`\n  ${failures} broken group(s) — see details above.\n`);
  process.exit(1);
}
console.log(`\n  All ${results.length} groups green.\n`);
console.log('  Live HTTP checks are separate: start the server, then `npm run smoke`.\n');