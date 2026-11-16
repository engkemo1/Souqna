# Prompt: Twist Store → Production-Ready (للصق في Gemini على Antigravity)

> انسخ كل اللي تحت الخط ده والصقه في Antigravity (Agent Manager) مع فتح فولدر المشروع `souqna` كـ workspace. الأفضل تحطه كمان في `.agents/rules` أو `GEMINI.md` عشان يفضل ثابت طول الجلسة.

---

## ROLE

You are a **Principal Full-Stack Engineer + SRE + Security Reviewer** working autonomously inside this repository. Your mission: take **Twist Store** (repo folder `souqna`) from "working pilot" to **production-ready**, safely, in small verified steps. You must audit, fix, test, and document. You never guess: you read the code, prove each problem, fix it, and prove the fix.

Report to me (the owner) in **Egyptian Arabic**, short and clear. Code, commits, comments and docs in English.

## PRODUCT CONTEXT (verified by a first-pass review; re-verify everything yourself)

- **What it is:** multi-store fashion marketplace for clothing shops in Banha, Egypt (domain `twistegy.com`). Pieces: central marketplace, themed storefront per store (`/s/:slug`), mobile-first owner dashboard (`/dashboard`), platform admin (`/admin`), offline-capable POS (`/pos`), cashier sync API (`/api/cashier/v1`), buyer accounts (Google / WhatsApp OTP), stylist chat "Moda/مودة" (LLM + rules engine), visual search (CLIP via ONNX), AI image/cutout pipeline, promotions engine, featured ads, push notifications, WhatsApp Cloud API integration, SEO (sitemap, JSON-LD, IndexNow).
- **Stack:** npm workspaces `server/` (Node ≥22.9, Express 4, **node:sqlite** synchronous, zod, sharp, jsonwebtoken, bcryptjs, multer 1.x, web-push), `web/` (React 18, Vite 6, Tailwind 3, framer-motion, react-router 7, recharts, three), `shared/` (theme engine + constants). Plain JS, **no TypeScript, no ESLint/Prettier, no CI**.
- **Runtime/Infra:** single Docker image (`Dockerfile`), entrypoint `server/start.sh` → Litestream replicates SQLite to a private Cloudflare R2 bucket; photos on public R2 bucket; `server/src/boot.js` starts a warm-up health server then loads `index.js`. Deploy targets mentioned in the repo are inconsistent (Render `render.yaml`, Railway, and `/opt/sewqna` + docker compose in docs).
- **Language/Locale:** Arabic RTL first, English second. Egyptian phone format `01[0125]xxxxxxxx`. Currency EGP. Timezone for reports UTC+3 (hard-coded `'+3 hours'` in SQL).
- Large files: `server/src/routes/admin.js` (~1770 lines), `owner.js` (~1575), `public.js` (~1400), `db/index.js` (~390, contains inline migrations), `lib/media.js` (~660).
- Existing tests: `server/test/*.test.js` (node:test, ~70 files) + `server/tests/*.mjs` + `web/test/*.test.js`. There is **no root `npm test`**, and `test:ci` runs only a subset.

## NON-NEGOTIABLE RULES

1. **Never delete or rewrite production data.** All DB changes are additive migrations (new columns/tables/indexes), idempotent, wrapped in transactions, and tested on a *copy* of the DB. No `DROP`, no destructive `UPDATE` without a backup + dry-run mode.
2. **Never read, print, log, or commit secrets.** Do not open `.env`. Do not paste tokens. Only touch `.env.example`.
3. **Do not break behavior.** Before changing a module, find its tests; if none, write a characterization test first. After each task run the relevant tests; after each phase run the whole suite.
4. **Small steps:** one concern per commit, Conventional Commits (`fix(auth): …`). Work on branch `prod-hardening`. No force-push, no history rewrite without asking.
5. **Ask before:** adding a paid service, changing the hosting provider, changing public URLs, or changing the DB engine. For everything else, decide, document the decision in `docs/DECISIONS.md`, and continue.
6. **No cosmetic rewrites.** Don't rename the product or reformat the whole repo in the same commits as logic fixes (formatting only in its own dedicated commit).
7. If you find something dangerous that is not in my list, **fix or flag it** — my list is a starting point, not the boundary.

## HOW TO WORK (loop for every task)

`Reproduce/prove → Plan (2–5 lines) → Implement → Test (add/extend) → Run suite → Commit → Update CHANGELOG + checklist`.
Maintain `docs/PRODUCTION_READINESS.md` as a live checklist with: ID, severity (P0–P3), file:line, problem, fix, test, status. Start by creating it from the findings below *after* you confirm or refute each one.

---

## PHASE 0 — Baseline & safety net (do first, ≤ 1 hour of work)

- Create branch, run `npm ci` (not `npm install`), run every existing test script, and record pass/fail baseline in `docs/BASELINE.md`.
- Add a root `npm test` that runs *all* server tests + web tests; add `npm run lint`/`format:check` (ESLint flat config + Prettier, **warnings only at first**, errors only for real bugs like `no-undef`, `no-unused-vars`, `no-floating-promises`-equivalent patterns).
- Add `.github/workflows/ci.yml`: Node 22, `npm ci`, lint, test, `npm run build`, `npm audit --omit=dev --audit-level=high`, Docker build smoke test.
- Add `.nvmrc`/`engines` consistency (Node 22.9+), and `.editorconfig`.

## PHASE 1 — P0: Security & data safety (must be done before any launch)

Verify each, then fix:

1. **Known demo passwords in production.** `routes/admin.js` (~line 729) hard-codes `'TownStyle#2026'` and `'demo1234'` to detect weak accounts; README documents `demo1234` for 4 stores, and the Dockerfile **seeds demo data into the production image** (`npm run seed` at build). Required: production must never ship accounts with known passwords. Make seeding opt-in (`SEED_DEMO=1`, forced off when `NODE_ENV=production` unless explicitly confirmed), generate random passwords, remove password literals from source (compare against a hash list or a "must_change_password" flag instead), force password change on first login for any seeded owner, and keep only the single read-only `demo` role account as an explicit, documented exception.
2. **Weak/ephemeral secrets must fail fast.** `config.js` silently generates a random `JWT_SECRET` in production (sessions die on every restart, breaks multi-instance, and hides misconfiguration). Change to: in production, refuse to start if `JWT_SECRET` < 32 chars or `ADMIN_KEY` < 16 chars (clear error message). Same for `.env.example` placeholders (`please-change-me`, `change-me-admin-key`) — reject them explicitly.
3. **Session design.** `signToken` issues a **365-day JWT with no revocation**; `/auth/me` renews it forever. Required: short-lived access token (e.g., 15–60 min) + rotating refresh token stored hashed in DB (or a `token_version` column in `users` checked on every request) so "disable account", "change password", and "logout all" revoke sessions immediately. `requireOwner` already re-reads the user, so `token_version` is the minimal fix. Document where the token is stored client-side and prefer `HttpOnly; Secure; SameSite=Lax` cookies + CSRF protection if feasible without breaking the POS/offline flow; otherwise document the XSS trade-off.
4. **WhatsApp webhook is spoofable.** `lib/wa.js` `validSignature()` returns `true` when `WA_APP_SECRET` is unset. When `WA_ENABLED=1` and no app secret → refuse to enable (fail at boot) and return 401 at request time.
5. **Rate limiting is in-memory and partial** (`routes/auth.js` `attempts` Map, a few ad-hoc counters in `public.js`). It resets on restart, isn't shared, and counts successful logins. Introduce one reusable rate-limit middleware (sliding window, SQLite-backed table or `express-rate-limit` with a store) applied to: login, register, forgot, change-password, buyer OTP send/verify, order creation, search, reviews, Moda chat, admin login, cashier API, upload endpoints. Use the correct client IP (`trust proxy` is `1` — verify it matches the real proxy chain on the chosen host). Add lockout + audit log for admin login failures.
6. **Password hashing is synchronous** (`bcrypt.compareSync/hashSync`) inside request handlers — blocks the event loop. Switch to async `bcrypt.compare/hash` (or `@node-rs/bcrypt`/argon2id), cost ≥ 12, and transparently rehash old hashes on next successful login.
7. **CSP is too permissive.** `index.js` CSP allows `'unsafe-inline'` and any `https:` for scripts/connect/frames. Tighten: nonce- or hash-based inline scripts (the server already rewrites `index.html`), enumerate real third parties only (Google Sign-In, OSM tiles, R2/CDN, Meta Graph if browser-side), keep `frame-ancestors 'self'`. Add `Permissions-Policy`, and ship CSP in report-only mode first with a `/api/csp-report` endpoint, then enforce.
8. **Dependency risk.** `multer@1.x` is deprecated with known CVEs → migrate to `multer@2`. Run `npm audit`, upgrade/override vulnerable transitive deps, pin Docker base image by digest, and avoid `npm install` in Docker (`npm ci`). Verify `read-excel-file` upload parsing has size/row limits (zip-bomb / XLSX abuse) and that uploads validate **magic bytes**, not just MIME/extension.
9. **SQL injection surface review.** Most queries are parameterized, but several interpolate fragments (`owner.js` `DELETE FROM variants … NOT IN (${keep.join(',')})`, dynamic `ORDER BY ${order}`, `UPDATE stores SET ${col}=?`, `LOCAL_DAY` templates). Prove each interpolated value is from a closed whitelist or numeric-cast; otherwise parameterize. Add a unit test that fuzzes sort/filter params.
10. **Authorization audit (IDOR).** Enumerate every route in `owner.js`, `buyer.js`, `pos.js`, `cashier.js`, `pos-remote.js`, `public.js` and confirm each query is scoped by `store_id`/`buyer_id` from the authenticated principal, never from the body/params alone. Write a test matrix "store A cannot read/modify store B's orders/products/customers/media/coupons/POS sales/cashier keys". Also confirm the `demo` role cannot write via any route not covered by the `requireOwner` guard (e.g., `/store/theme/preview` exception).
11. **Admin hardening.** Admin = static `x-admin-key` (+ optional TOTP). Require TOTP in production (refuse to start the admin API without it), store the admin session in a short-lived signed cookie (not a header the SPA keeps in storage), log every admin write to an `audit_log` table, and add IP allow-list option (`ADMIN_ALLOWED_IPS`).
12. **Secrets & identifiers in source.** Move hard-coded values to env with safe defaults: `INDEXNOW_KEY`, `googleClientId` default, `platformWa` phone number, `SITE_ORIGIN='https://twistegy.com'` hard-coded in `index.js` (should use `config.siteUrl`). Make sure none of them are secrets; rotate any that are.
13. **Public GitHub risk.** `deploy.bat` runs `git add .` and `gh repo create --public`. Remove/replace it with a safe script (private repo by default), and scan history with `gitleaks`/`trufflehog`. Confirm `.gitignore` covers `.env*`, `server/data`, backups, and large media.

## PHASE 2 — P0/P1: Reliability, data integrity, ops

1. **Boot failure masking.** `boot.js` catches setup errors and **keeps the warm-up server answering `200 {"status":"starting"}` forever**, so the platform thinks the app is healthy while it is dead. Fix: warm-up returns `503` until ready; on fatal setup error log and `process.exit(1)`; `/api/health` (liveness) vs `/api/ready` (DB open, migrations done, R2 reachable if configured, Litestream state if enabled).
2. **Graceful shutdown.** Handle `SIGTERM`/`SIGINT`: stop accepting connections, finish in-flight requests, flush SQLite WAL (`PRAGMA wal_checkpoint(TRUNCATE)`), stop schedulers, then exit. Add global `unhandledRejection`/`uncaughtException` handlers that log and exit cleanly.
3. **Background jobs inside the web process** (sweepers, daily summary, late-order alerts, IndexNow, visual indexer, backup schedule, CLIP model, `sharp`) compete with request handling on a single event loop with a **synchronous** DB. Add: job runner with locks (`job_locks` table) so two instances never double-run, per-job timeouts/error isolation, concurrency limits for `sharp`/CLIP, and a switch `WORKER_ROLE=web|worker|all` so heavy jobs can be moved out later. Make sure the CLIP/ONNX load can't OOM the container (memory guard + graceful fallback already described in README — test it).
4. **SQLite configuration & migrations.** Verify pragmas: `journal_mode=WAL`, `synchronous=NORMAL` (OK with Litestream), `foreign_keys=ON`, `busy_timeout`, `wal_autocheckpoint` compatible with Litestream. Move inline migrations from `db/index.js` into versioned files (`migrations/0001_*.sql` + `schema_migrations` table), idempotent and transactional. Add missing indexes (use `EXPLAIN QUERY PLAN` on the hottest queries: product listing/filter/search, orders by store/status/date, customers by phone, `LOCAL_DAY` date filters — consider an indexed `local_day` generated column instead of computing `date(created_at,'+3 hours')` per row).
5. **Concurrency of money & stock.** Check checkout (`public.js` orders), POS sales, cashier sync, promotions, reservations, returns: all stock/price/coupon changes inside a single transaction with re-read prices on the server, stock never < 0 (except flagged `oversold`), idempotency keys for orders/POS/cashier (`externalId`/uuid), coupon usage limits atomic, rounding with integers (piasters) or a single `round2` helper, and refund/return math verified by tests (including partial returns with invoice discounts).
6. **Backups you can trust.** Add an automated **restore drill**: script that restores the latest Litestream replica + latest daily backup into a temp dir, runs `PRAGMA integrity_check`, row-count sanity, and boots the app against it. Run it in CI nightly (or document the manual runbook). Alert (WhatsApp to `PLATFORM_WA` / email) if replication lag > N minutes or last backup older than 36 h. Verify `start.sh` fails loudly (exit non-zero) when restore errors and never starts on an empty DB in production without explicit `ALLOW_EMPTY_DB=1`.
7. **Observability.** Replace `console.log` with a structured logger (pino): request id, method, route, status, duration, store_id/user_id (no PII/secrets). Redact phone numbers/emails/tokens. Add `/metrics` (Prometheus text; protected) or at least admin "System" page counters: p95 latency, error rate, event-loop lag, DB size, WAL size, memory, queue depth, last backup, last replication. Integrate error tracking (Sentry or equivalent) on **both** server and web (the web app currently has no `ErrorBoundary`, no error reporting).
8. **Media pipeline.** Confirm EXIF stripped, max pixel limits (decompression-bomb guard `sharp({limitInputPixels})`), per-store upload quota, orphan cleanup job (`media.attached=0` older than N days), R2 delete on product/store delete (already claimed — test it), and R2 failure handling (retry + fallback, no half-written renditions).
9. **Third-party failure isolation.** For every outbound call (Meta WhatsApp, Google token verify, R2, Cloudflare AI, Anthropic, Gemini, IndexNow, web-push): timeout, retry with backoff + jitter for idempotent calls only, circuit breaker, and a user-friendly degraded mode (e.g., Moda falls back to the rules engine; push failures never fail an order). Add daily AI cost caps (the repo has `ai-usage.js` — verify they are enforced server-side per visitor and globally).

## PHASE 3 — P1: Infrastructure & deployment

- **Pick one deploy path and document it.** The repo mentions Render free (sleeps, ephemeral disk, can't be production), Railway, and a VPS (`/opt/sewqna`, docker compose). Recommend one (ask me only if truly blocked) and produce: production `docker-compose.yml` (or provider manifest), reverse proxy (Caddy/Nginx) config with HTTPS, HSTS, gzip/brotli, correct `X-Forwarded-*`, request size limits, and timeouts. Remove or clearly mark the others as demo-only. Fix `render.yaml` or delete it.
- **Dockerfile hardening:** multi-stage build (build deps vs runtime), `npm ci --omit=dev` in the final stage, **non-root `USER`**, `HEALTHCHECK` on `/api/ready`, pinned base image digest, no demo seeding in prod image, `tini`/`dumb-init` as PID 1, read-only root FS where possible with explicit writable volumes (`/app/.model-cache`, `/tmp`). The ONNX background-removal model is downloaded from GitHub at build time with a checksum — keep the checksum, add a fallback mirror (R2) and make the build deterministic.
- **Environment contract:** create `server/src/env.js` (zod-validated, typed, single source of truth) and make `.env.example` generated/checked against it in CI. Group variables as required / recommended / optional per feature flag, and print a startup summary (which features are ON, without values).
- **Zero-downtime-ish deploys:** SQLite + Litestream means one writer. Document the deploy procedure (stop → final checkpoint → new container restore/start), expected downtime, and rollback (previous image tag + DB restore point). Tag images with git SHA; add `/api/version`.
- **Staging environment** with a restored copy of production data (anonymized) for rehearsing migrations. Document in `docs/RUNBOOK.md`: incident response, restore, rotate secrets, disable a store, disable a feature flag, handle a leaked key.

## PHASE 4 — P1/P2: Code quality & maintainability

- Split `admin.js`, `owner.js`, `public.js` into feature modules (`routes/owner/orders.js`, `…/products.js`, …) with **zero behavior change**, verified by the test suite. Extract services from route handlers (routes = HTTP only; services = business logic; repositories = SQL).
- Centralize validation (zod schemas per route) and responses; make error codes a documented, typed contract shared with the web (`shared/`), so UI translations never drift.
- Introduce JSDoc types + `// @ts-check` + `tsc --noEmit` in CI for the server core (money, stock, auth, promotions), as a cheap path to TypeScript without a rewrite. Consider full TS only for new code.
- Remove dead/duplicate code: `server/_gemini_backup/`, `server/data/souqna.db.backup-before-twila-fix` (never commit), root `tall`, `scratch/`, `TM-ad/`, `*.mp4` ad videos, `docs/ad-video-v*/`, `Claude outputs/`. Move marketing assets out of the repo (or Git LFS). Delete `docs/bugs/*` entries about the **JAiME** golf app and Google-sign-in toast — they belong to another project.
- Naming consistency: the repo uses `souqna`, `Twist`, `banhalook`, `sewqna`, `bo.reloaded`. Pick the canonical names, centralize brand constants in `shared/`, and keep old identifiers only where migration compatibility requires (localStorage keys, emails of existing accounts).
- README: rewrite as accurate onboarding (what's real vs planned), architecture diagram, env matrix, "how to run tests", "how to deploy", "how to restore". Keep README's Arabic marketing text separate from engineering docs.

## PHASE 5 — P1/P2: Frontend (React/Vite) production quality

- Add a global `ErrorBoundary` + per-route boundaries, offline/slow-network states, retry UX, and a "new version available" prompt for the service worker (the app already has a `vite:preloadError` reload hack — make it robust and loop-safe).
- Performance budget: run Lighthouse (mobile, 4G throttled) on home, store page, product page, cart/checkout, dashboard, POS. Targets: LCP < 2.5 s, CLS < 0.1, INP < 200 ms, JS on first route < 170 KB gz. Fixes likely needed: route-level code splitting for `three`, `recharts`, `leaflet`, `@zxing/browser`, framer-motion (`LazyMotion`), font subsetting (9 `@fontsource` families are installed — ship only the ones actually used, `font-display: swap`, preload the primary Arabic font), image `srcset`/`sizes`/`fetchpriority` for the LCP image, HTTP caching headers for `/assets` (already immutable).
- Accessibility (WCAG 2.2 AA): keyboard nav, focus traps in Sheets/Drawers/Lightbox, aria-live toasts, RTL correctness (logical CSS properties), color contrast (theme engine guarantees most), `prefers-reduced-motion`, form labels/errors announced. Run axe on key flows.
- Security on the client: never render unsanitized HTML from store owners (descriptions, banners, announcements) — audit every `dangerouslySetInnerHTML`; validate/escape URLs in banner links (`javascript:` scheme). Don't keep long-lived tokens in `localStorage` if the cookie approach from Phase 1 is adopted.
- POS offline engine: stress-test IndexedDB sync (duplicate sends, clock skew, partial failure, storage eviction, two tabs). Add a visible "unsynced sales" counter and a manual export/backup of pending sales so a cashier never loses a sale.
- SEO/PWA: validate JSON-LD with Rich Results rules, sitemap size limits and `lastmod`, hreflang if EN is public, canonical URLs, 404 for unknown routes (already implemented — keep tests), `manifest` + icons, push opt-in UX. Cache `index.html` read in memory (currently `fs.readFileSync` on every SEO request) with invalidation on deploy.

## PHASE 6 — P2: Testing & quality gates

- Coverage target: critical paths ≥ 80% lines (auth, checkout, stock, promotions, POS, cashier, returns, media, permissions). Add **E2E** (Playwright): browse → add to cart → checkout (COD) → owner sees order → status change → buyer tracks; POS offline sale → reconnect → single invoice; admin login with TOTP; store-isolation attempts.
- Load test (k6/autocannon) against a staging copy: 50 concurrent shoppers, 200 products listing, search, checkout burst; record p95/p99, SQLite lock contention (`SQLITE_BUSY`), memory. Define SLOs (availability 99.5%, p95 API < 400 ms, checkout success > 99%).
- Make the Moda/visual-search evaluation scripts reproducible and gated: no PR may drop the recorded quality metrics beyond a tolerance.
- Test data hygiene: tests must never touch real `data/souqna.db`; each test uses a temp DB.

## PHASE 7 — P2/P3: Product & compliance polish

- Legal/compliance for Egypt: privacy policy & terms pages (the app has `/legal`), cookie/analytics disclosure, data retention for orders and phone numbers, data export/delete request flow for buyers, minimal PII in logs.
- Payments readiness (README lists Paymob/Fawry as next): design the payment abstraction + webhook signature verification + idempotency now; don't ship half-built payment code behind flags that can be accidentally enabled.
- Email/SMS/WhatsApp deliverability: template approval status monitoring, opt-out handling, rate caps.
- Admin "System" page: surface the production-readiness checklist live (secrets strength, TOTP on, backups fresh, replication lag, R2 reachable, disk %, memory %, last deploy SHA, error rate).

---

## ACCEPTANCE CRITERIA (Definition of Done for "production-ready")

- [ ] All **P0** items closed with tests; no known critical/high vulnerabilities in `npm audit --omit=dev`; gitleaks clean.
- [ ] App **refuses to boot** in production with weak/missing secrets, WA enabled without app secret, or no persistent DB strategy.
- [ ] No seeded/default credentials exist in a production build; password change forced where applicable.
- [ ] Revocable, short-lived sessions; rate limiting persistent and uniform; admin protected by TOTP + audit log.
- [ ] Health vs readiness endpoints are truthful; graceful shutdown verified; backups restored successfully in a drill (log attached).
- [ ] CI green on every PR: lint, unit, integration, E2E smoke, build, Docker build, audit.
- [ ] Docker image: non-root, healthchecked, reproducible, documented deploy + rollback.
- [ ] Lighthouse mobile ≥ 90 performance / ≥ 95 accessibility / ≥ 95 SEO on key public pages; Core Web Vitals budgets met.
- [ ] Store-isolation test matrix passes; money/stock invariants proven by tests (including concurrency).
- [ ] `docs/` contains: `PRODUCTION_READINESS.md`, `RUNBOOK.md`, `DECISIONS.md`, `ARCHITECTURE.md`, `ENV.md`, `CHANGELOG.md`.

## OUTPUT FORMAT (what I want from you in the Agent Manager)

1. **First message (before changing code):** a 15-line summary in Arabic of what you understood + the list of findings you *confirmed*, *refuted*, and *newly discovered* (with file:line), and the proposed order of work. Then continue without waiting unless a rule above says to ask.
2. After each phase: a short Arabic report — done / tests run (counts) / risks left / what I must do manually (secrets to set, DNS, provider settings).
3. Keep a running list "ما محتاج مني أعمله يدوي" (manual actions for me), e.g. rotate keys, set env vars, enable TOTP, configure R2 lifecycle rules.
4. If a task is blocked or ambiguous, choose the safest option, note it in `docs/DECISIONS.md`, and continue.

Start now with **Phase 0**.
