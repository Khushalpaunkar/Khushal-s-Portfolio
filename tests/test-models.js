const path = require('path');
const ROOT = require('path').resolve(__dirname, '..') + '/';
// NOTE: portable — resolves to the project root relative to this file.
const Project = require(path.join(ROOT, 'models/Project.js'));
const Contact = require(path.join(ROOT, 'models/Contact.js'));
const Admin = require(path.join(ROOT, 'models/Admin.js'));
const bcrypt = require(path.join(ROOT, 'node_modules/bcryptjs'));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

// validate() throws on failure; validateSync() is deprecated in Mongoose 9.
async function invalid(doc) {
  try { await doc.validate(); return null; }
  catch (e) { return e; }
}
const msgs = (e) => (e ? Object.values(e.errors || {}).map((x) => x.message).join(' | ') : '');
const rejects = async (doc) => !!(await invalid(doc));

(async () => {
  console.log('\n--- Project ---');
  check('rejects empty project', await rejects(new Project({})));

  const p1 = new Project({ title: 'KisaanMitra AI' });
  check('accepts valid project', (await invalid(p1)) === null, msgs(await invalid(p1)));
  check('auto-slug generated', p1.slug === 'kisaanmitra-ai', 'got: ' + p1.slug);

  const p2 = new Project({ title: '  ResumeCraft — AI Resume Builder!!  ' });
  await p2.validate();
  check('slug strips punctuation/spaces', p2.slug === 'resumecraft-ai-resume-builder', 'got: ' + p2.slug);

  check('rejects javascript: githubUrl', await rejects(new Project({ title: 'X', githubUrl: 'javascript:alert(1)' })));
  check('rejects malformed liveUrl', await rejects(new Project({ title: 'X', liveUrl: 'not a url' })));
  check('rejects data: liveUrl', await rejects(new Project({ title: 'X', liveUrl: 'data:text/html,<h1>x' })));
  check('accepts real github url', (await invalid(new Project({ title: 'X', githubUrl: 'https://github.com/Khushalpaunkar' }))) === null);
  check('empty url allowed (button hidden)', (await invalid(new Project({ title: 'X', githubUrl: '', liveUrl: '' }))) === null);
  check('rejects impossible year', await rejects(new Project({ title: 'X', year: 400 })));
  check('rejects over-long title', await rejects(new Project({ title: 'X'.repeat(200) })));
  check('caps features at 12', await rejects(new Project({ title: 'X', features: new Array(20).fill('a') })));
  check('accepts 6 features', (await invalid(new Project({ title: 'X', features: ['a','b','c','d','e','f'] }))) === null);

  const p3 = new Project({ title: 'KisaanMitra AI', slug: 'custom-slug' });
  await p3.validate();
  check('explicit slug is not overwritten', p3.slug === 'custom-slug', 'got: ' + p3.slug);
  check('has createdAt/updatedAt (timestamps)', !!Project.schema.path('createdAt') && !!Project.schema.path('updatedAt'));

  console.log('\n--- Contact ---');
  check('rejects empty contact', await rejects(new Contact({})));
  check('rejects <10 char message', await rejects(new Contact({ name: 'A', email: 'a@b.com', message: 'too short' })));
  check('rejects invalid email', await rejects(new Contact({ name: 'V', email: 'NOT-AN-EMAIL', message: 'Hello there friend' })));
  check('rejects email without TLD', await rejects(new Contact({ name: 'V', email: 'a@b', message: 'Hello there friend' })));
  const c = new Contact({ name: '  Visitor  ', email: 'VISITOR@Example.COM', message: 'Hello there friend' });
  check('accepts valid contact', (await invalid(c)) === null, msgs(await invalid(c)));
  check('trims name + lowercases email', c.name === 'Visitor' && c.email === 'visitor@example.com', c.name + ' / ' + c.email);
  check('status defaults to new', c.status === 'new');
  check('rejects invalid status enum', await rejects(new Contact({ name: 'V', email: 'v@e.com', message: 'Hello there friend', status: 'hacked' })));
  check('caps message at 2000', await rejects(new Contact({ name: 'V', email: 'v@e.com', message: 'x'.repeat(3000) })));
  check('rejects over-long name', await rejects(new Contact({ name: 'y'.repeat(100), email: 'v@e.com', message: 'Hello there friend' })));
  check('subject is optional', (await invalid(new Contact({ name: 'Visitor', email: 'v@e.com', message: 'Hello there friend' }))) === null);
  check('no IP/userAgent fields stored', !Contact.schema.path('ip') && !Contact.schema.path('userAgent'));

  console.log('\n--- Admin ---');
  check('rejects empty admin', await rejects(new Admin({})));
  check('rejects short username', await rejects(new Admin({ name: 'K', username: 'ab', email: 'a@b.com', password: 'longenough1' })));
  check('rejects username with symbols', await rejects(new Admin({ name: 'K', username: 'bad user!', email: 'a@b.com', password: 'longenough1' })));
  check('rejects password under 8 chars', await rejects(new Admin({ name: 'K', username: 'khushal', email: 'a@b.com', password: 'short' })));
  check('rejects non-admin role', await rejects(new Admin({ name: 'K', username: 'khushal', email: 'a@b.com', password: 'longenough1', role: 'superuser' })));
  check('accepts valid admin', (await invalid(new Admin({ name: 'Khushal Paunkar', username: 'khushal', email: 'a@b.com', password: 'longenough1' }))) === null);
  check('password is select:false', Admin.schema.path('password').options.select === false);
  check('username is unique', !!Admin.schema.path('username').options.unique);
  check('email is unique', !!Admin.schema.path('email').options.unique);
  check('pre-save hash hook registered', Admin.schema.s.hooks._pres.get('save').length > 0);

  const hash = await bcrypt.hash('longenough1', Admin.SALT_ROUNDS);
  const a = new Admin({ name: 'K', username: 'khushal', email: 'a@b.com', password: 'longenough1' });
  a.password = hash;
  check('hasHashedPassword() true for bcrypt', a.hasHashedPassword() === true, a.password);
  check('comparePassword() true for correct', (await a.comparePassword('longenough1')) === true);
  check('comparePassword() false for wrong', (await a.comparePassword('wrongpass')) === false);
  check('comparePassword() safe on undefined', (await new Admin({ name: 'K', username: 'k2', email: 'b@c.com', password: 'x' }).comparePassword('y')) === false);
  const plain = new Admin({ name: 'K', username: 'k3', email: 'c@d.com', password: 'plaintext123' });
  check('hasHashedPassword() false for plaintext', plain.hasHashedPassword() === false, plain.password);
  check('salt rounds >= 12', Admin.SALT_ROUNDS >= 12, String(Admin.SALT_ROUNDS));

  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail > 0 ? 1 : 0);
})();
