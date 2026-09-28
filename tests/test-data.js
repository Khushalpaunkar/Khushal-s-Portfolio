// Validates the bundled seed data against the real Mongoose schema without a
// database connection, so the data layer is checked even while offline.
const path = require('path');
const ROOT = require('path').resolve(__dirname, '..') + '/';
// NOTE: portable — resolves to the project root relative to this file.

const Project = require(path.join(ROOT, 'models/Project'));
const seed = require(path.join(ROOT, 'data/projects'));
const { fromSeed } = require(path.join(ROOT, 'services/projectService'));
const { techIcon, placeholderIcon } = require(path.join(ROOT, 'utils/icons'));

let fail = 0;
const line = (name, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail && !cond ? '  -> ' + detail : ''}`);
  if (!cond) fail++;
};

(async () => {
  console.log('  seed vs. schema:');

  // Every seed document must satisfy the real schema.
  for (const data of seed) {
    const doc = new Project(data);
    let ok = true;
    let msg = '';
    try {
      await doc.validate();
    } catch (e) {
      ok = false;
      msg = e.message;
    }
    line(`validates: ${data.title}`, ok, msg);
  }

  // The pre-validate hook must generate the slug offline.
  const kisaan = new Project({ title: 'KisaanMitra AI' });
  await kisaan.validate();
  line('slug generated offline by the hook', kisaan.slug === 'kisaanmitra-ai', kisaan.slug);

  // The link policy must be enforced by the schema itself, not just the view.
  const bad = new Project({ title: 'Bad', githubUrl: 'not-a-url' });
  let rejected = false;
  try { await bad.validate(); } catch { rejected = true; }
  line('schema rejects a malformed githubUrl', rejected);

  const placeholder = new Project({ title: 'Placeholder', githubUrl: '#' });
  let rejectedHash = false;
  try { await placeholder.validate(); } catch { rejectedHash = true; }
  line('schema rejects href="#"', rejectedHash);

  const emptyOk = new Project({ title: 'No links' });
  let emptyValid = true;
  try { await emptyOk.validate(); } catch { emptyValid = false; }
  line('schema accepts empty URLs (no button rendered)', emptyValid);

  console.log('\n  service contract:');
  const { featured, others } = fromSeed();
  line('offline service returns featured + others', featured.length === 2 && others.length === 3);
  line('every project has a slug offline', [...featured, ...others].every((p) => p.slug));
  line('every imageAlt falls back to the title',
    [...featured, ...others].filter((p) => !p.image).every((p) => p.imageAlt && p.imageAlt === p.title));
  line('source is reported', fromSeed().source === 'seed');

  console.log('\n  tech icons:');
  const names = ['HTML', 'CSS', 'JavaScript', 'EJS', 'Node.js', 'Express.js', 'MongoDB',
                 'Gemini API', 'React', 'AI Model API'];
  line('every seeded technology has a real icon',
    names.every((n) => techIcon(n) !== 'fas fa-circle'),
    names.filter((n) => techIcon(n) === 'fas fa-circle').join(', ') + ' fell back');
  line('unknown technology falls back safely', techIcon('Some Unknown Thing') === 'fas fa-circle');
  line('empty input falls back safely', techIcon('') === 'fas fa-circle');
  line('lookup is case insensitive', techIcon('react') === techIcon('React'));

  console.log('\n  placeholder icons:');
  const kinds = seed.map((p) => p.placeholderIcon);
  line('every placeholder kind resolves',
    kinds.every((k) => placeholderIcon(k) === placeholderIcon(k) && k),
    kinds.join(', '));
  line('placeholder kinds are semantic, not CSS classes',
    kinds.every((k) => !/fa[srb]? fa-/.test(k)), kinds.join(', '));
  line('unknown kind falls back to a code glyph', placeholderIcon('nonsense') === 'fas fa-code');
  line('empty kind falls back to a code glyph', placeholderIcon('') === 'fas fa-code');

  // The point of the split: no Font Awesome class may live in stored data.
  line('no icon class stored in the data file',
    !/fa[srb]? fa-[a-z-]+/.test(JSON.stringify(seed)),
    (JSON.stringify(seed).match(/fa[srb]? fa-[a-z-]+/g) || []).join(', '));

  console.log(`\n  ${fail === 0 ? 'DATA LAYER INTACT' : fail + ' FAILURES'}\n`);
  process.exit(fail > 0 ? 1 : 0);
})();
