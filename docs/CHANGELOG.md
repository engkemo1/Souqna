# Changelog

All notable changes for the production-readiness hardening of **Twist Store** (`souqna`) on branch `prod-hardening`.

## [Unreleased]

### Phase 5 — Frontend Production Quality
- Added top-level React `ErrorBoundary` (`web/src/components/ErrorBoundary.jsx`) wrapping `App.jsx` with Arabic recovery UI and reload trigger.
- Verified existing `vite:preloadError` handler in `web/src/main.jsx` to prevent stuck UI after chunk rotation.
- Added `exportUnsyncedSales` utility to `web/src/lib/pos/db.js` for JSON disaster recovery of unsynced offline POS sales, verified by test in `web/test/pos-engine.test.js`.
- Verified clean production Vite bundle build (`npm run build`).

### Phase 3 — Infrastructure & Deployment Hardening
- Multi-stage `Dockerfile`: `deps`, `litestream`, `bgmodel`, `builder`, and `runtime` stages.
- Production container runs as unprivileged `USER node` with non-root ownership.
- Added production `docker-compose.yml` with `app` + `caddy` services, healthchecks on `/api/ready`, dropped Linux capabilities, and read-only / tmpfs bounds.
- Added `Caddyfile` with automated TLS, HSTS, HTTP/3, gzip/zstd, 20MB body size cap, and proxy headers.
- Marked `render.yaml` clearly as demo/review-only environment.
- Documented full operational guidelines in `docs/ENV.md` and `docs/RUNBOOK.md`.

### Phase 2 — P0/P1 Reliability, Data Integrity & Ops

- Added `server/src/lib/logger.js`: structured JSON logging, PII redaction (phones, Bearer tokens), `X-Request-Id` middleware, event-loop lag histogram, Prometheus text formatter.
- Added `server/src/lib/job-runner.js`: SQLite `job_locks` table, `runJobWithLock` (mutual exclusion across holders, configurable TTL + timeout isolation), `scheduleManagedInterval`, `stopAllJobs`, `listJobStatuses`.
- Added `server/src/lib/http-client.js`: `fetchWithRetry` with `AbortController` timeout, exponential backoff + jitter on 5xx, per-service circuit breaker (5-failure threshold, 30s cooldown), `resetCircuits`.
- Added `server/src/db/migrations.js`: versioned, idempotent, transactional migration runner; `schema_migrations` tracking table; migrations `0001_production_indexes`, `0002_order_idempotency`, `0003_job_locks`.
- Updated `server/src/db/index.js`: `BEGIN IMMEDIATE` in `tx()`, nested `SAVEPOINT` for partial-rollback safe subtransactions, wired `runMigrations` on boot.
- Updated `server/src/routes/public.js` / `server/src/lib/cart.js`: atomic `WHERE stock>=?` stock deduction (throws `409 cart_changed`), atomic coupon `usage_count` guard (`WHERE usage_count < usage_limit`), `idempotencyKey` deduplication (returns `200` with `duplicate:true` on retry), collision-safe `nextOrderNumber` using `MAX(last_seq, count)+1`.
- Updated `server/src/boot.js`: `/api/health` returns `200 {ok:true,status:"starting"}` always; `/api/ready` returns `503 {ok:false,warming:true}` during warmup; `process.exit(1)` on fatal setup error; `ALLOW_EMPTY_DB` guard.
- Updated `server/src/index.js`: live `/api/health`, `/api/ready` (DB + migrations check), `/api/version`; `gracefulShutdown` on `SIGTERM`/`SIGINT`; `WORKER_ROLE` gate for background jobs; in-memory `index.html` cache.
- Added `server/src/routes/admin.js`: `/api/admin/metrics` (JSON + `?format=prometheus`), `purgeOrphanMedia` wired to scheduled job.
- Added `server/src/lib/media.js`: `purgeOrphanMedia` function (removes unattached media rows + files older than `maxAgeHours`).
- Added `server/src/scripts/restore-drill.js`: SQLite snapshot + `PRAGMA integrity_check` + `PRAGMA foreign_key_check` + row-count sanity; `npm run restore:drill -w server` script.
- Hardened `server/start.sh`: `ALLOW_EMPTY_DB` production guard.
- Added `server/test/reliability-p2.test.js`: 7 tests covering warmup/live health endpoints, migration idempotency + nested tx SAVEPOINT rollback, atomic stock/coupon/idempotency/order-sequence, job mutual exclusion + timeout, HTTP circuit breaker + retry, restore drill integrity, PII redaction + orphan GC + metrics.

### Phase 1 — P0 Security & Data Safety
- Added `server/src/env.js` and updated `server/src/config.js` to fail fast in production on missing/weak/placeholder `JWT_SECRET` (<32 chars) or `ADMIN_KEY` (<16 chars), or `WA_ENABLED=1` without `WA_APP_SECRET`.
- Hardened WhatsApp webhook signature validation (`server/src/lib/wa.js`) to fail closed (`false`) whenever `WA_APP_SECRET` is unset.
- Implemented revocable sessions via `token_version` on `users` and `buyers`, short-lived owner JWTs (`1h`), `HttpOnly` cookie + Bearer support, `/api/auth/logout-all`, and `/api/buyer/logout-all`.
- Switched password hashing to async `bcrypt` with cost 12 and automatic rehash of legacy cost-10 hashes on login.
- Removed hardcoded demo passwords from `admin.js` and `seed.js`, required `SEED_DEMO=1` (and `ALLOW_PROD_SEED=1` in production), and enforced `must_change_password` on seeded/reset owner accounts.
- Added SQLite-backed sliding-window rate limiter (`server/src/lib/rate-limit.js`) across auth, buyer OTP, orders, reviews, reservations, tracking, sourcing, admin, cashier, and media uploads.
- Hardened `/api/admin` to require `ADMIN_TOTP_SECRET` in production, persist TOTP `lastStep` in `app_settings`, support `ADMIN_ALLOWED_IPS`, issue `HttpOnly; SameSite=Strict` session cookies, and log failed auth attempts to `admin_audit`.
- Tightened CSP directives, added `Permissions-Policy` header and `/api/csp-report`, validated image magic bytes + `sharp` `limitInputPixels`, bounded XLSX/CSV rows/columns, parameterized variant `NOT IN` SQL, and replaced unsafe `deploy.bat`.

### Phase 0 — Baseline & Safety Net
- Initialized `docs/PRODUCTION_READINESS.md`, `docs/DECISIONS.md`, `docs/BASELINE.md`, and `docs/CHANGELOG.md`.
- Added `.nvmrc` (`22.9.0`) and `.editorconfig`.
- Added root `npm test`, `npm run lint`, and `npm run format:check` scripts.
- Added GitHub Actions CI workflow (`.github/workflows/ci.yml`).

