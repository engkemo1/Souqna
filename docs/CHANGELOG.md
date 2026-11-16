# Changelog

All notable changes for the production-readiness hardening of **Twist Store** (`souqna`) on branch `prod-hardening`.

## [Unreleased]

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
