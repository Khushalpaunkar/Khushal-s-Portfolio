# Khushal Paunkar — Portfolio V2

Full-stack developer portfolio built with **Node.js, Express, EJS, MongoDB** and
vanilla CSS/JS. No frontend framework, no UI library.

## Requirements

- Node.js >= 18 (v22 recommended)
- MongoDB Atlas (optional — the site runs in offline mode without it)

## Setup

```bash
npm install
```

Create your local environment file (already gitignored):

```bash
cp .env.example .env
```

Then fill in `.env`:

| Variable | Required | Notes |
|---|---|---|
| `PORT` | no | Defaults to `3000` |
| `MONGODB_URI` | no | Blank = offline mode, site still renders |
| `SESSION_SECRET` | yes (prod) | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` — blank falls back to a per-boot random secret |
| `SESSION_MAX_AGE_MS` | no | Admin session lifetime, defaults to 8h |
| `ADMIN_*` | yes (Phase 3) | Used only by `npm run create-admin` |

## Data models

| Model | Notes |
|---|---|
| `Project` | `title`, `slug` (auto, unique), `shortDescription`, `description`, `problem`, `solution`, `features[]`, `technologies[]`, `category`, `year`, `image`, `githubUrl`, `liveUrl`, `featured`, `order`, timestamps |
| `Contact` | `name`, `email`, `subject`, `message`, `status` (`new`/`read`/`archived`), `createdAt` |
| `Admin` | `name`, `username`, `email`, `password` (bcrypt, `select:false`), `role` |

Rules enforced by the schemas:

- `githubUrl` / `liveUrl` are **optional** and must be `http(s)` or empty.
  `javascript:` and `data:` are rejected. An empty URL means the UI hides the
  button — links are never invented.
- Passwords are hashed with bcrypt (12 rounds) in a pre-save hook and are never
  returned by a query unless explicitly selected.
- The `Contact` model stores no IP address or user agent. The `/api/contact`
  endpoint is protected against spam with an invisible honeypot field, a
  cross-origin check, and a rate limit (5 messages / 15 minutes / IP).

## Creating the admin account

```bash
# fill in ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_PASSWORD in .env first
npm run create-admin
```

Re-running is safe: an existing username or email is reported, never overwritten.

## Admin area

Navigate to <http://localhost:3000/admin> (you will be redirected to
`/admin/login`). The login form carries a per-session CSRF token, login attempts
are rate limited per IP, and the session cookie is `httpOnly` + `SameSite=Lax`
with a 8h lifetime. The session store is Mongo (via `connect-mongo`) when the
database is connected, falling back to an in-memory store while offline —
an offline login is rejected with a clear message rather than crashing.

## Run

```bash
npm run dev     # nodemon, restarts on save
npm start       # plain node
```

Open <http://localhost:3000>

## Verify

```bash
npm run verify   # offline quality gate: syntax, all in-process suites, orphan scan
npm start        # then, in another terminal:
npm run smoke    # hits the running server and checks every route + security headers
```

The verification suites live in `tests/` and are portable — they resolve the
project root from their own location and never need MongoDB (they stub the
database layer in-process). `npm run verify --verbose` prints each suite's full
output.

## Project structure

```
server.js              Express entry point
config/db.js           Mongoose connection (non-fatal on failure)
controllers/           HTTP logic
routes/                URL -> controller
middleware/            404, centralised error handling, contact rate limiter
models/                Mongoose schemas
views/                 EJS templates
public/                static root: css/ js/ asset/
scripts/               create-admin.js, seed-projects.js, smoke.js
data/                  seed + offline fallback data
services/              data access (DB-or-seed)
utils/                 icon resolution
```

`public/` is served at the web root, so `public/css/main.css` is reached at
`/css/main.css`.

## Design notes

- `app.js` no longer exists — the original browser JavaScript was moved to
  `public/js/main.js` in Phase 1 so it could never be confused with server code.
- The server starts even when MongoDB is unreachable. `isDbReady()` reports the
  state and controllers fall back to bundled seed data, so the portfolio can
  never render blank. The contact API returns a clear 503 in that case rather
  than silently losing a message.
- `prefers-reduced-motion` is honoured (Phase 5): ambient motion and the
  particle canvas stop, and reveals force themselves visible.
- There is no third-party JavaScript on the page; the CSP allows only `'self'`
  and a per-request nonce in `script-src`.
- Text responses are gzip-compressed. `robots.txt` and `sitemap.xml` exist but
  only link a real sitemap once `SITE_URL` is configured — nothing is guessed
  while the domain is unknown.
- Every admin POST (including logout) requires a valid per-session CSRF token;
  all views render database content escaped, response headers are hardened
  (nosniff, no-referrer, frame-protection, no `x-powered-by`), and inputs are
  schema-validated against over-length/control-character/prototype-pollution
  payloads.

## Progress

| Phase | Status |
|---|---|
| 1 — Architecture | done |
| 2 — Backend foundation | done |
| 3 — Database models | done (writes need a live MongoDB) |
| 4 — UI redesign | done |
| 5 — Background & motion | done |
| 6 — Project data layer | done |
| 7 — Contact form → API | done (EmailJS removed, Express + MongoDB with honeypot + rate limit) |
| 8 — Admin authentication | done (session + Mongo store, CSRF token, login rate limit, bcrypt) |
| 9 — Admin panel | done (inbox with statuses, project CRUD, delete-confirm, DB-offline fallbacks) |
| 10 — Metadata & performance | done (gzip, cache policy, SITE_URL-gated robots.txt + sitemap.xml, admin favicon + dashboard hand-off) |
| 11 — Security hardening | done (CSRF-guarded logout, escaping proofs, input fuzzing, response headers) |
| 12 — Verification suite | done (own `tests/` + `npm run verify`; portable, offline, one-command gate) |
| 13 — Inbox triage | done (20/page pagination, filter-aware counts, range label, reply-by-email) |
| 14 — Accessibility pass | done (main landmarks, h1 hierarchy, admin skip-links, audited by test-a11y) |
| 15 — Graceful shutdown | done (drain in-flight requests, drop idle keep-alives, crash paths exit like a deploy expects) |
| 16 — Editor honesty | done (admin shows DB reality; seed fallback only while MongoDB is genuinely offline) |
| 17 — Project detail pages | done (GET /projects/:slug, canonical/OG per page, cards deep-link; rich fields like problem/solution/features now get a long-form home) |
| 18 — No-JS degradation | done (mobile menu renders CSS-only when JS is off, anchor targets clear the fixed nav, contact form offers the real email via <noscript>) |
| 19 — Admin password change | done (rotate the dashboard password in the UI; session regenerated so every other session signs out instantly) |