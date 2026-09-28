/**
 * utils/graceful.js
 * Orderly process wind-down, factored so the sequencing is testable in-process
 * (Windows cannot deliver SIGINT/SIGTERM to child processes, so server.js keeps
 * only the thin `process.on` wiring and all the real logic lives here).
 *
 *   closeWithDrain(server, opts) -> Promise<boolean>
 *     Stops accepting new connections, lets in-flight requests finish, then in
 *     two further stages drops idle keep-alive sockets and finally force-closes
 *     anything left. Resolves true when the port is free, false if the hard
 *     deadline fired.
 *
 *   shutdown({ reason, server, dbClose, exit, log, error, graceMs, forceMs })
 *     The full sequence — drain, close the database, exit with the chosen code.
 *     Guarded so a second signal (or a crash mid-shutdown) cannot start twice.
 *
 *   fatal(reason, opts)
 *     Same sequence but exits non-zero: an uncaught exception or unhandled
 *     rejection means the process state is suspect, so continuing would only
 *     hide the failure.
 */

let shuttingDown = false;

/** Resolve cb() after ms — unref'd so it never blocks process exit elsewhere. */
function later(cb, ms) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(cb()), ms);
    if (typeof t.unref === 'function') t.unref();
  });
}

/**
 * Drain semantics for a listening server:
 *   1. stop accepting (server.close waits for active requests),
 *   2. after graceMs drop idle keep-alive sockets,
 *   3. after forceMs close anything left and resolve with `forced`.
 */
function closeWithDrain(server, opts = {}) {
  const graceMs = opts.graceMs ?? 3000;
  const forceMs = opts.forceMs ?? 5000;

  return new Promise((resolve) => {
    let done = false;
    const finish = (forced) => {
      if (done) return;
      done = true;
      resolve(forced);
    };

    server.close(() => finish(false));

    later(() => {
      if (done) return;
      if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
    }, graceMs).then(() =>
      later(() => {
        if (done) return;
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
        finish(true);
      }, forceMs)
    );
  });
}

/**
 * One-shot orderly shutdown. Options:
 *   reason       human label for logs (e.g. 'SIGINT', 'uncaught exception')
 *   exitCode     0 for a controlled signal, 1 for a crash path
 *   server       something with close(cb) — usually the http.Server
 *   dbClose      optional async thunk that closes the database connection
 *   exit, log, error  injected seams so harnesses can observe the sequence
 */
function shutdown(opts = {}) {
  const {
    reason,
    exitCode = 0,
    server,
    dbClose,
    exit = (code) => process.exit(code),
    log = (msg) => console.log(msg),
    error = (msg) => console.error(msg),
    graceMs,
    forceMs,
  } = opts;

  if (shuttingDown) return false;
  shuttingDown = true;

  log(`\n[server] ${reason} received — shutting down.`);

  const close =
    server && typeof server.close === 'function'
      ? closeWithDrain(server, { graceMs, forceMs, log })
      : Promise.resolve();

  close
    .then(() => (dbClose ? dbClose() : null))
    .then(() => {
      log('[server] Closed cleanly.');
      exit(exitCode);
    })
    .catch((err) => {
      error(`[server] Shutdown error: ${err.message || err}`);
      exit(1);
    });
  return true;
}

/** Crash path — same wind-down, but exit non-zero. */
function fatal(reason, opts) {
  return shutdown(Object.assign({}, opts, { reason, exitCode: 1 }));
}

module.exports = { closeWithDrain, shutdown, fatal };

/** Test-visible reset so harnesses can exercise double-invocation. */
module.exports._reset = () => {
  shuttingDown = false;
};
module.exports._isShuttingDown = () => shuttingDown;