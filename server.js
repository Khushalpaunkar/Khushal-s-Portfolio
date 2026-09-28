/**
 * server.js
 * Express application entry point for the Khushal Paunkar portfolio.
 *
 * Layering:
 *   routes/       -> URL -> controller
 *   controllers/  -> HTTP logic
 *   models/       -> database (added Phase 3)
 *   middleware/   -> cross-cutting concerns
 *   views/        -> EJS templates
 *   public/       -> static assets (served at the web root)
 *
 * NOTE: this file is the server. The browser-side JavaScript lives in
 * public/js/ and was moved there during Phase 1 so the two never collide.
 */

// 1. Environment variables must load before anything reads them.
require('dotenv').config({ quiet: true });

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');

const { connectDB, disconnectDB, isDbReady } = require('./config/db');
const graceful = require('./utils/graceful');
const indexRoutes = require('./routes/indexRoutes');
const contactRoutes = require('./routes/contactRoutes');
const adminRoutes = require('./routes/adminRoutes');
const metaRoutes = require('./routes/metaRoutes');
const sessionMiddleware = require('./middleware/session');
const cacheControl = require('./middleware/cacheControl');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();

const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

/* ------------------------------------------------------------------
   Security headers
   The Content-Security-Policy is written out explicitly rather than left
   on defaults. With EmailJS gone there is no third-party script at all:
   Font Awesome is the only off-site dependency, and it is CSS/fonts only,
   so the JavaScript policy allows exactly self and the per-request nonce.
   ------------------------------------------------------------------ */

/* A fresh nonce per request lets the theme bootstrap in head.ejs run
   inline without weakening script-src to 'unsafe-inline'. */
app.use(function assignCspNonce(req, res, next) {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          // Resolved per request so it matches res.locals.cspNonce.
          (req, res) => `'nonce-${res.locals.cspNonce}'`,
        ],
        // 'unsafe-inline' for styles is required because the contact form and
        // scroll elements set styles from JavaScript (toast, indicator, progress
        // bar). The script policy never allows it.
        styleSrc: ["'self'", 'https://cdnjs.cloudflare.com', "'unsafe-inline'"],
        fontSrc: ["'self'", 'https://cdnjs.cloudflare.com', 'data:'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        // Must stay off in development: it would rewrite http://localhost
        // asset requests to https and break local previewing.
        upgradeInsecureRequests: isProduction ? [] : null,
      },
    },
    // Off because the third-party CDNs do not send CORP headers.
    crossOriginEmbedderPolicy: false,
  })
);

// Correct client IPs / protocol behind a reverse proxy (Render, Railway, etc).
if (isProduction) app.set('trust proxy', 1);

app.disable('x-powered-by');

/* ------------------------------------------------------------------
   Compression — gzip text responses before anything is sent.
   ------------------------------------------------------------------ */
app.use(compression());

/* ------------------------------------------------------------------
   Request parsing — small hard limits so a large body cannot be abused
   ------------------------------------------------------------------ */
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));

/* ------------------------------------------------------------------
   Static files — public/ is the web root, so public/css/main.css is
   served at /css/main.css
   ------------------------------------------------------------------ */
app.use(
  express.static(path.join(__dirname, 'public'), {
    index: false,
    dotfiles: 'ignore',
    etag: true,
    maxAge: isProduction ? '30d' : 0,
  })
);

/* ------------------------------------------------------------------
   View engine
   ------------------------------------------------------------------ */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

/* -------- Caching policy for dynamic responses -------------------- */
app.use(cacheControl);

/* -------- Session (admin area) — after static, before routes ----------- */
app.use(sessionMiddleware);

/* -------- Site settings for every page render ---------------------------
   Puts the effective contact/social settings on res.locals so the home page,
   nav and footer never hardcode them (admin can edit them in /admin/settings).
   Static assets and the health probe skip the lookup. */
const settingsService = require('./services/settingsService');
const NON_PAGE_PATH = /^\/(asset|css|js|health|robots|favicon)/;
app.use(async (req, res, next) => {
  res.locals.siteSettings = {};
  if (NON_PAGE_PATH.test(req.path)) return next();
  try {
    res.locals.siteSettings = await settingsService.getSettings();
  } catch (error) {
    console.error('[settings] Middleware lookup failed, using defaults:', error.message);
    res.locals.siteSettings = {};
  }
  next();
});

/* ------------------------------------------------------------------
   Minimal request logger (development only, so production stays quiet)
   ------------------------------------------------------------------ */
if (!isProduction) {
  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`);
    });
    next();
  });
}

/* ------------------------------------------------------------------
   Routes
   ------------------------------------------------------------------ */
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    db: isDbReady() ? 'connected' : 'offline',
    uptime: process.uptime(),
  });
});

app.use('/', indexRoutes);
app.use(contactRoutes);
app.use(adminRoutes);
app.use(metaRoutes);

/* ------------------------------------------------------------------
   404 then centralised error handling must be registered last
   ------------------------------------------------------------------ */
app.use(notFound);
app.use(errorHandler);

/* ------------------------------------------------------------------
   Boot
   ------------------------------------------------------------------ */
async function start() {
  await connectDB();

  const server = app.listen(PORT, () => {
    console.log('─────────────────────────────────────────────');
    console.log('  Khushal Paunkar — Portfolio V2');
    console.log(`  Mode : ${isProduction ? 'production' : 'development'}`);
    console.log(`  URL  : http://localhost:${PORT}`);
    console.log(`  DB   : ${isDbReady() ? 'connected' : 'offline (using seed data)'}`);
    console.log('─────────────────────────────────────────────');
  });

  // Drain in-flight requests, close the database, then exit. The sequence and
  // its connection stages live in utils/graceful.js so it stays testable.
  const shutdown = (reason, exitCode = 0) =>
    graceful.shutdown({ reason, exitCode, server, dbClose: disconnectDB });
  const fatal = (reason) => graceful.fatal(reason, { server, dbClose: disconnectDB });

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // A rejected promise left running is a half-known state — log it and wind
  // down non-zero rather than silently continuing.
  process.on('unhandledRejection', (reason) => {
    console.error('[server] Unhandled promise rejection:', reason);
    fatal('unhandled rejection');
  });

  process.on('uncaughtException', (error) => {
    console.error('[server] Uncaught exception:', error);
    fatal('uncaught exception');
  });
}

start();

module.exports = app;
