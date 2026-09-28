// Verifies the CSP nonce in the response header matches the one in the HTML,
// which is the only thing that makes the inline theme script legal.
const ROOT = require('path').resolve(__dirname, '..') + '/';
// NOTE: portable — resolves to the project root relative to this file.
const { spawn } = require('child_process');

const srv = spawn('node', ['server.js'], { cwd: ROOT, stdio: 'ignore' });

const done = (code) => { srv.kill(); process.exit(code); };
setTimeout(async () => {
  try {
    const res = await fetch('http://localhost:3000/');
    const csp = res.headers.get('content-security-policy') || '';
    const html = await res.text();

    const headerNonce = (csp.match(/'nonce-([^']+)'/) || [])[1];
    const tagNonce = (html.match(/<script nonce="([^"]+)"/) || [])[1];

    console.log('  CSP header nonce : ' + (headerNonce ? headerNonce.slice(0, 12) + '...' : '*** MISSING ***'));
    console.log('  inline tag nonce : ' + (tagNonce ? tagNonce.slice(0, 12) + '...' : '*** MISSING ***'));
    console.log(`  ${headerNonce && headerNonce === tagNonce ? 'PASS' : 'FAIL'}  nonces match (inline script will execute)`);

    // A second request must get a different nonce.
    const res2 = await fetch('http://localhost:3000/');
    const n2 = ((res2.headers.get('content-security-policy') || '').match(/'nonce-([^']+)'/) || [])[1];
    console.log(`  ${n2 && n2 !== headerNonce ? 'PASS' : 'FAIL'}  nonce rotates per request`);

    console.log(`  ${/script-src[^;]*'unsafe-inline'/.test(csp) ? 'FAIL' : 'PASS'}  script-src has no 'unsafe-inline'`);
    console.log(`  ${/default-src 'self'/.test(csp) ? 'PASS' : 'FAIL'}  default-src 'self' present`);

    const ok = headerNonce && headerNonce === tagNonce && n2 !== headerNonce &&
      !/script-src[^;]*'unsafe-inline'/.test(csp);
    done(ok ? 0 : 1);
  } catch (e) {
    console.log('  FAIL  ' + e.message);
    done(1);
  }
}, 3500);
