# MASTER PROMPT — Fix all QA findings (Gemini · Antigravity · workspace `souqna`)

Paste everything below the line into a NEW conversation (model: Gemini 4 Argon). Make sure the open workspace is `souqna`.

---

## ROLE
You are a senior full-stack engineer + QA fixer working autonomously in this repo (Twist Store: Express + node:sqlite + React/Vite, Arabic RTL, live at twistegy.com). Report to me in **Egyptian Arabic**; code, commits and docs in English.

## SOURCE OF TRUTH
Read `docs/QA_REPORT_AND_FIX_PROMPT.md` (items QA-01 … QA-17) and `docs/PRODUCTION_READINESS.md` first. For each QA item: **reproduce/confirm it with evidence (command output or a failing test) before fixing**; if refuted, say so with proof. Never write "Done" without a passing test or pasted output.

## OWNER OVERRIDES (highest priority)
1. **QA-01 (admin key-only login / `ADMIN_TOTP_OPTIONAL`) is DEFERRED. Do not touch admin authentication, `ADMIN_TOTP_OPTIONAL`, admin IP rules or the Caddy admin matcher in this round.** I'll choose a different approach later. You may only add a one-line note in `docs/PRODUCTION_READINESS.md` marking it "deferred by owner".
2. Everything else in the QA report is in scope, in the order below.

## HARD RULES
- Work on branch `qa-fixes` created from `prod-hardening` (run `git branch --show-current` before every commit). If `main` has diverged, merge `main` first and resolve conflicts carefully (social sign-in code touches auth/buyers).
- Production data is sacred: additive, idempotent, transactional migrations only; test on a COPY of the DB; no destructive deletes. Never read `.env`; never print secrets.
- One concern per commit (Conventional Commits). Run `npm test && npm run lint && npm run build` before each commit and paste real exit codes. No force-push, no history rewrite (propose only).
- Don't weaken any earlier hardening (token_version, rate limits, CSP report endpoint, WA signature check, fail-fast env validation).
- If something is blocked by a secret/DNS/provider action, list it under "ما محتاج مني أعمله يدوي" and continue.

## ORDER OF WORK

### Round 1 — customer-facing bugs (do first, ship-able on their own)
**A. QA-17 Cross-store link bounce (P0, reproduced live).** Clicking a product card from another store (e.g. the Moda "طقم كامل" box on `/s/ghost/p/جاكيت-ماركات` → `كوتش جوتشي` of `special-mandy`) lands on `/s/ghost/p/كوتش-جوتشي` "page not found". The card `href` is correct. Cause: the canonical-slug redirect effect in `web/src/pages/store/StoreLayout.jsx` (~lines 23–29) runs against STALE store data because `useApi` (`web/src/lib/hooks.js`) keeps the previous path's `state.data` for one render after `path` changes. Fix `useApi` so data is bound to the path it was fetched for (also in the initial state), run the redirect only for data that belongs to the current URL slug, keep the old-slug alias redirect working, and add: a unit test for `useApi` path switching + a Playwright e2e that clicks cross-store links from SmartLookCard, LookSet, LookCarousel, search results, StoreCard, SimilarViewed/RecentlyViewed, and a push-notification URL — URL must stay on the target store and the product must render with no "not found" flash. Audit every other place that builds `/s/${store.slug}/p/${slug}` from the CURRENT store instead of the product's own store.
**B. QA-16 Dead product links.** Determine (read-only, on a COPY of prod DB/Litestream restore) why "كوتش-جوتشي" was missing under `ghost` (it actually belongs to `special-mandy`, so this was mostly QA-17) and check no products were lost after the hardening deploy (compare counts/newest timestamps, look for a Litestream restore in boot logs). Then: make `server/src/index.js` `/s/:slug/p/:pslug` return 404/410 + `noindex` for non-active products (no soft-404), add a proper "المنتج مش متاح حالياً" state plus search/best-sellers suggestions in `Product.jsx`, archive instead of hard-delete, add `slug_redirects`, log 404s on `/s/*/p/*` to a table shown in the admin System page, and make `EmptyState` respect `prefers-reduced-motion` (no 0-opacity fade for error/empty screens).

### Round 2 — security & session correctness (everything except QA-01)
**C. QA-02 Sessions:** (a) reject owner/buyer JWTs that lack `tv` (old 365-day tokens must stop working; one forced re-login is fine); (b) decide and document in `docs/DECISIONS.md` how the client stores tokens: stop keeping the owner token in `localStorage` for dashboard use (HttpOnly cookie + CSRF/Origin check), keep Bearer only where the offline POS truly needs it; (c) JWT is 1 h but `web/src/lib/auth.jsx` renews only on mount → add silent refresh (≈50 % of lifetime + on focus) and verify the **offline POS** never loses queued sales when the token expires (queue, re-auth prompt, flush; add a test); (d) handle `403 password_change_required` in the web app with a forced change-password screen (+ test).
**D. QA-05 CSP:** put CSP in report-only mode by default on prod via env, replace `'unsafe-inline'` in `script-src` with nonces/hashes for the server-injected inline scripts (JSON-LD, SEO shell), use `config.siteUrl` and the exact R2 origin instead of `https://twistegy.com` / `*.r2.dev`, and document how to read `[csp-report]` logs before enforcing.
**E. QA-04 Resilience:** `server/src/lib/http-client.js` has zero importers and 12 raw `fetch(` calls remain (e.g. `lib/wa.js`). Route every outbound call through it (timeouts everywhere; retries only for idempotent calls; circuit breaker for WhatsApp/Google/Cloudflare/Anthropic/IndexNow/R2); notification failures must never fail an order. Add tests with a fake `fetchImpl`.
**F. QA-06 Rate limiter:** keep SQLite-backed buckets only for auth-critical flows (login, OTP, change-password, forgot); use an in-memory token bucket for general public endpoints; add an index on `(bucket, ts)`; prune to the longest window used; cap rows per bucket.
**G. QA-07 Password hashing:** replace pure-JS `bcryptjs` with a native implementation (or argon2id in a worker), keep rehash-on-login, avoid doubling cost on the trimmed-password retry, and load-test 50 concurrent logins (p95 recorded in the docs).
**H. QA-10 Info disclosure & versioning:** public `/api/ready` returns only `{ok:true}` (details for admin/internal); `/api/version` exposes no `env`/Node version publicly; wire `GIT_SHA`/`APP_VERSION` through `ARG` in the Dockerfile and CI so the commit is real.

### Round 3 — infra, tests, hygiene
**I. QA-03 docker-compose/Caddy (without touching the admin rules):** `DB_FILE` must live on the mounted volume (`/app/server/data/db/souqna.db`), pre-create + `chown node` the mount points in the Dockerfile, Caddy logs to stdout, remove `preload` from HSTS unless all subdomains are HTTPS, move the ACME email to env, and prove with a documented test that `docker compose down && up` keeps data (Litestream restore AND volume).
**J. QA-08 Tests & tooling:** replace hand-written test lists with `node --test test/` (+ an explicit exclusion file with reasons for slow/optional suites) so the ~20 orphaned test files run (promotions-*, moda-no-wrong-picks, moda-audit, moda-screens, sale-expiry, hours, store-rating, store-design, admin-products, catalog-cleanup, look-*, palette-logo…) and fix whatever then fails; add a nightly workflow for the excluded ones and `tests/run_all.mjs`; remove the duplicate `test:twila` key; install real ESLint + Prettier as devDependencies (or delete the dead configs); in CI add Docker layer cache, a container start + `/api/ready` smoke test, and a Playwright journey (browse → cart → checkout → owner sees order); make every row in `docs/PRODUCTION_READINESS.md` link to a concrete test name (P2-04 currently cites `images.test.js`, which doesn't exist) and re-open rows that were wrongly marked Done (QA-04, QA-08).
**K. QA-09 Repo hygiene:** `git rm -r --cached server/_gemini_backup` and every tracked file that matches `.gitignore` (videos, `docs/ad-video-*`, `docs/video-review`, scratch, TM-ad, tall, `*.db`); remove `docs/bugs/` (it belongs to another project); check `git count-objects -vH` and only PROPOSE a `git filter-repo` plan.
**L. QA-11/12 Config:** fix `render.yaml` (demo seeding needs `ALLOW_PROD_SEED=1` or drop the file), keep one production path in `docs/RUNBOOK.md`, sync `.env.example` with `env.js` (CI fails on drift), and print explicit WARN lines at startup + a pre-deploy checklist for: missing `GOOGLE_CLIENT_ID` in production (Google sign-in disappears), missing `INDEXNOW_KEY` (pings turn off), `WA_ENABLED=1` without `WA_APP_SECRET` (process now throws at boot).
**M. QA-13 payments.js:** mark it experimental (move to `lib/experimental/`, `createIntent` throws) or implement real webhook dedupe (`payment_events` unique `(gateway,event_id)`) + amount/currency re-verification + tests; never wire it to a route yet.

### Round 4 — growth & observability
**N. QA-14 SEO:** server-render a real crawlable `<nav>`/list inside `#root` for `/`, `/stores`, `/c/:slug` (departments, active stores, first N products with links) so non-JS crawlers see content; validate with View Source and Rich Results; add owner-invite text to `/join` OG description.
**O. QA-15:** Lighthouse mobile budgets (LCP < 2.5 s, CLS < 0.1, INP < 200 ms) on home/store/product/checkout/dashboard/POS, axe pass on RTL flows, external uptime monitor on `/api/ready`, error tracking (Sentry or equivalent) on server + web, scheduled restore-drill with alerting on replication lag/backup age, and a realistic load test against a staging copy.

## ACCEPTANCE
- [ ] QA-17 reproduction (click cross-store card) passes in Playwright against a local production build; same for the other link sources.
- [ ] No change to admin authentication in this round (QA-01 untouched, marked deferred).
- [ ] `npm ci && npm test && npm run lint && npm run build && npm audit --omit=dev --audit-level=high` pasted with exit codes; all test files are discovered or explicitly excluded with a reason.
- [ ] Old tokens without `tv` are rejected; POS offline queue survives token expiry (tests).
- [ ] `git ls-files` has no `_gemini_backup`, videos, `.db`, or scratch files.
- [ ] `docs/PRODUCTION_READINESS.md` updated with evidence per row; "ما محتاج مني أعمله يدوي" list at the end of every report.

## OUTPUT
First message (Arabic, ≤ 15 lines): which QA items you confirmed/refuted with file:line and the plan. Then work Round 1 → 4, and after each round send: done / tests run with counts / risks left / manual actions for me. Stop and ask only for secrets, DNS, provider actions, or destructive operations.
