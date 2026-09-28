/**
 * test-shutdown.js — Phase 15 (graceful shutdown)
 *
 * Windows cannot deliver SIGINT/SIGTERM to a child process, so the drain logic
 * lives in utils/graceful.js and is proven here in-process:
 *   * a real http server with a slow route — shutdown must wait for the
 *     in-flight request, not cut it,
 *   * a parked idle TCP connection — must be dropped at the grace stage, not
 *     held until the force deadline,
 *   * the full shutdown sequence with injected seams (dbClose, exit) and its
 *     double-invocation guard,
 *   * the crash path exits non-zero,
 *   * server.js wires the real signals to the util.
 *
 * Run:  npm run verify   (or: node tests/test-shutdown.js)
 */

const fs = require('fs');
const http = require('http');
const net = require('net');

const ROOT = require('path').resolve(__dirname, '..') + '/';
// NOTE: portable — resolves to the project root relative to this file.
const read = (p) => fs.readFileSync(ROOT + p, 'utf8');

let fail = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail && !cond ? '  -> ' + detail : ''}`);
  if (!cond) fail++;
};

const { closeWithDrain, shutdown, fatal, _reset } = require(ROOT + 'utils/graceful');

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function portOf(server) {
  return server.address().port;
}

(async () => {
  console.log('  Phase 15 — real server drain:');
  {
    const server = await listen((req, res) => {
      setTimeout(() => { res.writeHead(200); res.end('slow-done'); }, 260);
    });
    const port = portOf(server);
    const url = `http://127.0.0.1:${port}/slow`;

    const begun = Date.now();
    const pending = fetch(url);
    const responseTime = Date.now() - begun;

    await new Promise((r) => setTimeout(r, 30)); // request is now in flight
    const injected = closeWithDrain(server, { graceMs: 400, forceMs: 900 });
    const res = await pending;
    const resBody = await res.text();
    check('in-flight request completes during shutdown', res.status === 200 && resBody === 'slow-done');
    const forced = await injected;
    const drainTime = Date.now() - begun;
    check('drain did not require force-closing (idle keep-alive case yet)', forced === false, 'forced=' + forced);

    const refused = await new Promise((r) => {
      const probe = net.connect(port);
      probe.once('connect', () => { probe.end(); r(false); });
      probe.once('error', () => r(true));
    });
    check('server stopped accepting new connections', refused === true);

    const order = resBody && forced === false && drainTime > responseTime;
    check('request finished before the drain resolved', order, `drain=${drainTime}ms resp=${responseTime}ms`);
  }

  console.log('  Phase 15 — idle keep-alive socket dropped at grace:');
  {
    const server = await listen((req, res) => { res.writeHead(200); res.end('ok'); });
    const port = portOf(server);
    // Serve one real request through a keep-alive agent, then park the pooled
    // socket: that parked connection is the classic shutdown pin.
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    await new Promise((resolve) => {
      http.get({ host: '127.0.0.1', port, agent }, (res) => { res.resume(); res.once('end', resolve); });
    });

    const t0 = Date.now();
    const forced = await closeWithDrain(server, { graceMs: 150, forceMs: 2000 });
    const elapsed = Date.now() - t0;
    check('idle keep-alive did not pin us to the force deadline', forced === false && elapsed < 1500, `forced=${forced} in ${elapsed}ms`);
    agent.destroy();
  }

  console.log('  Phase 15 — shutdown sequencing (injected seams):');
  {
    const events = [];
    const fakeServer = { close: (cb) => setTimeout(cb, 10) };
    const dbClose = async () => { events.push('db'); };
    const exitSpy = (code) => events.push('exit:' + code);
    const log = (m) => events.push(m.includes('Closed cleanly') ? 'closed' : 'started');

    check('shutdown returns true (started)', shutdown({ reason: 'SIGTERM', server: fakeServer, dbClose, exit: exitSpy, log, graceMs: 40, forceMs: 80 }) === true);
    await new Promise((r) => setTimeout(r, 120));
    check('sequence: started -> db -> closed -> exit', JSON.stringify(events) === JSON.stringify(['started', 'db', 'closed', 'exit:0']), JSON.stringify(events));
    check('double invocation is refused', shutdown({ reason: 'SIGINT', server: fakeServer, exit: exitSpy, log }) === false);
    await new Promise((r) => setTimeout(r, 20));
    check('exit called exactly once', events.filter((e) => e.startsWith('exit:')).length === 1, JSON.stringify(events));

    _reset();
    const fatalEvents = [];
    fatal('uncaught exception', {
      server: { close: (c) => c() },
      dbClose,
      exit: (code) => fatalEvents.push('exit:' + code),
      log: () => fatalEvents.push('log'),
    });
    await new Promise((r) => setTimeout(r, 30));
    check('fatal path exits non-zero', fatalEvents.includes('exit:1'), JSON.stringify(fatalEvents));
    check('fatal path still drains first', fatalEvents.indexOf('log') === 0 && fatalEvents.indexOf('exit:1') > 0, JSON.stringify(fatalEvents));
    _reset();
  }

  console.log('  Phase 15 — server.js wiring:');
  {
    const src = read('server.js');
    check('SIGINT and SIGTERM handled', /process\.on\('SIGINT'/.test(src) && /process\.on\('SIGTERM'/.test(src));
    check('signals route through graceful util', /graceful\.shutdown\(\{ reason, exitCode, server, dbClose: disconnectDB \}\)/.test(src));
    check('uncaught exception now winds down (not just logs)', /uncaughtException[\s\S]*?fatal\('uncaught exception'\)/.test(src));
    check('unhandled rejection also winds down', /unhandledRejection[\s\S]*?fatal\('unhandled rejection'\)/.test(src));
    check('crash path funnels through util fatal', /const fatal = \(reason\) => graceful\.fatal/.test(src));
  }

  console.log(`\n  ${fail ? fail + ' SHUTDOWN BROKEN CHECK(S)' : 'SHUTDOWN INTACT'}`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error('  FATAL harness error:', err);
  process.exit(1);
});