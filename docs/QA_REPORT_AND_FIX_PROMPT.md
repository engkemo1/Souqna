# Twist Store — QA Report #1 + Fix Prompt (paste into Gemini, new conversation, workspace `souqna`)

> QA scope: static review of the code currently on disk (hardened build) + public checks of https://twistegy.com (`/`, `/stores`, `/robots.txt`, `/api/ready`). I could NOT run the test suite, measure performance, or see the rendered UI. Every item below cites a file; **re-verify each before fixing** and mark it confirmed / refuted in `docs/PRODUCTION_READINESS.md` with evidence (command + output), not just "Done".

## What the live site shows
- Production already runs the hardened build: `GET /api/ready` → `{"ok":true,"status":"ready","db":true,"migrations":3,"workerRole":"all","r2Configured":true}`.
- SEO shell is good (title, description, canonical, OG/Twitter, robots, sitemap). `/` and `/stores` return only a visually-hidden `<h1>` + 1–2 links to crawlers: the real content is client-rendered.

## ROLE & RULES
Act as a strict QA + fix engineer. Same rules as before: branch `prod-hardening` (or a new `qa-fixes` branch from it), additive DB migrations only, never read `.env`, one concern per commit, no item is "Done" without a passing test or a pasted command output. Report to me in Egyptian Arabic.

---

## P0 — fix first

**QA-01 [DEFERRED BY OWNER — DO NOT TOUCH ADMIN AUTH NOW; skip this item entirely, do not remove `ADMIN_TOTP_OPTIONAL`, do not add IP rules; owner will decide a different approach later]** Admin can be key-only in production. `server/src/routes/admin.js:84` allows production without TOTP when `ADMIN_TOTP_OPTIONAL=1` (added by commit "Admin: allow key-only login when ADMIN_TOTP_OPTIONAL=1"); `POST /login` then returns `{session:null,twoStep:false}`. `ADMIN_ALLOWED_IPS` is unset by default and `Caddyfile` header comment claims "Admin API only reachable from internal network" but no rule implements it. → Remove `ADMIN_TOTP_OPTIONAL` entirely (or make it throw in production), make TOTP mandatory, add a Caddy `@admin path /api/admin/* /admin*` matcher with `remote_ip` allow-list (env-driven) or at least an extra basic-auth layer, add a test that production without `ADMIN_TOTP_SECRET` returns 503. I (owner) will run `npm run admin-totp -w server` and set the secret.

**QA-02 Session design is only half-implemented.**
- (a) `server/src/lib/auth.js` `requireOwner`: `if (payload.tv !== undefined && …)` → tokens issued before the upgrade (365-day, no `tv`) are still accepted and can never be revoked. Require `tv`; reject tokens without it (one forced re-login is acceptable). Same check for buyer tokens in `lib/buyers.js`.
- (b) `web/src/lib/api.js` still stores the owner token in `localStorage` (`souqna.token`) and sends it as `Bearer`; the HttpOnly cookie therefore adds no XSS protection. Decide: cookie-only for dashboard/admin (with an Origin/`Sec-Fetch-Site` CSRF check on state-changing requests) and keep Bearer only where the offline POS needs it; document in `docs/DECISIONS.md`.
- (c) JWT is now 1 h but `web/src/lib/auth.jsx` calls `/auth/me` (which renews) only on mount. An owner or cashier with the app open > 1 h gets 401. Add silent refresh (renew at ~50% of lifetime and on tab focus) and verify the **offline POS**: sales queued offline whose sync returns 401 after reconnect must not be lost or require re-login mid-shift (queue them, prompt re-auth, then flush). Add a test.
- (d) `must_change_password`: server returns `403 password_change_required` for owner writes, but nothing in `web/src` handles this code. Add a forced "change password" screen/redirect and a test.

**QA-03 `docker-compose.yml` does not persist what it says it persists.** `DB_FILE=/app/server/data/souqna.db` but the mounted volume is `db_data:/app/server/data/db` → the DB lives on the container layer, not on a volume. Also the named volumes mount root-owned while the image runs as `USER node` (EACCES on uploads/db). Fix: `DB_FILE=/app/server/data/db/souqna.db`, pre-create and `chown node` the mount points in the Dockerfile, and add a compose-level test/doc proving a `docker compose down && up` keeps data (via Litestream restore AND via the volume). Also: Caddy `log { output file /var/log/caddy/access.log }` writes to a path not backed by a volume — use `output stdout`; remove `preload` from HSTS unless all subdomains are HTTPS and you accept the commitment; replace placeholder `email admin@twistegy.com` with an env value.

**QA-04 Resilience layer exists but is unused.** `server/src/lib/http-client.js` (`fetchWithRetry`, circuit breaker) has **zero importers**; there are still 12 raw `fetch(` calls in `server/src` (e.g., `lib/wa.js` `post()`, `downloadMedia`, Google token verify, Cloudflare AI, Anthropic, IndexNow, R2) with no timeout. A hung Meta/Google call can hold a request open indefinitely. Route every outbound call through the helper (idempotent calls get retries; non-idempotent like sending WhatsApp get timeout + circuit breaker only), add tests with a fake `fetchImpl`, and never let notification failures fail an order.

**QA-05 CSP is enforced, still allows inline scripts, and may have broken things.** `server/src/index.js` `scriptSrc` keeps `'unsafe-inline'` (so XSS protection is weak) while `imgSrc/connectSrc/fontSrc` were narrowed and `CSP_REPORT_ONLY` defaults to `0` (enforcing on prod). Risks: legitimately-used external images/videos/fonts blocked; wildcard `https://*.r2.dev` allows any attacker bucket; `https://twistegy.com` hard-coded in `imgSrc`. → Switch to report-only for one week on prod, read `[csp-report]` logs, then enforce with nonces/hashes for the inline scripts the server injects (JSON-LD, SEO shell) and drop `'unsafe-inline'` from `script-src`. Use `config.siteUrl` and the exact R2 public origin only.

## P1

**QA-06 Rate limiter writes to SQLite on every request.** `server/src/lib/rate-limit.js` does DELETE + SELECT COUNT + INSERT per call, and `rateLimitMiddleware` is applied to hot public endpoints. On a Litestream-replicated, single-writer DB this inflates the WAL/replication traffic and risks `SQLITE_BUSY`. Keep SQLite for auth-critical buckets (login, OTP, admin), use an in-memory token bucket for general API/search, add an index `(bucket, ts)` (verify in migrations), prune retention to the longest window actually used (not 24 h), and cap rows per bucket.

**QA-07 Password hashing still burns the main thread.** `bcryptjs` is pure JS; cost 12 + the "trimmed password" second compare doubles the work on wrong passwords. Use a native implementation (`bcrypt`/`@node-rs/bcrypt`) or argon2id in a worker; keep rehash-on-login; load-test 50 concurrent logins and record p95.

**QA-08 Tests: coverage claims don't match reality.**
- `npm test` (server) runs 16 sub-scripts / ~49 files; ~20+ test files exist but run nowhere, e.g. `promotions-audit/display/hardening/returns/templates`, `moda-no-wrong-picks`, `moda-audit`, `moda-screens`, `sale-expiry`, `hours`, `store-rating`, `store-design`, `admin-products`, `catalog-cleanup`, `look-*`, `palette-logo`; also `test:twila` (`tests/run_all.mjs`) and `moda-brain`. Replace hand-written file lists with `node --test test/` (+ explicit exclusions file for slow/optional suites) so new tests can't be orphaned; run the excluded ones in a nightly workflow.
- `docs/PRODUCTION_READINESS.md` P2-04 cites `server/test/images.test.js`, which does not exist; P0-01…P0-13 all point to one file (`security-p0.test.js`). Make each row link to a specific test name and include the last passing run output.
- `eslint.config.js` and `.prettierrc.json` exist but ESLint/Prettier are **not in any package.json**; `npm run lint` runs a custom `server/src/scripts/lint.js`. Install real ESLint + Prettier as devDependencies (warnings first), or delete the dead configs.
- `server/package.json` defines `test:twila` twice (duplicate key).
- CI (`.github/workflows/ci.yml`) has an `npm audit --audit-level=high` gate: confirm it passes on a clean clone and paste the result; add Docker layer cache, a container start+`/api/ready` smoke test, and a Playwright journey (browse → cart → checkout → owner sees order).

**QA-09 Repo hygiene.** The merge commit `819ddfb` brought `server/_gemini_backup/**` (≈9.7k lines) into history; `.gitignore` does not untrack files already committed. Run `git rm -r --cached server/_gemini_backup` and do the same for anything in `git ls-files` that matches the ignore list (`*.mp4`, `docs/ad-video-*`, `docs/video-review`, `scratch`, `TM-ad`, `tall`, `*.db`). `docs/bugs/` still exists (the JAiME bug file belongs to another project). Check `git count-objects -vH`; if history is bloated by the videos, propose (don't execute) a `git filter-repo` plan.

**QA-10 Info disclosure & versioning.** `GET /api/ready` is public and returns `workerRole`, `migrations`, `r2Configured`; `/api/version` returns `env` and Node version. Return only `{ok:true}` publicly (details behind admin or an internal token). `GIT_SHA`/`APP_VERSION` are never set (no `ARG` in the Dockerfile, nothing in CI), so `/api/version` always says `commit: "dev"` — pass `--build-arg GIT_SHA` in CI and expose it as an image label.

**QA-11 Deployment manifests inconsistent.** `render.yaml` sets `SEED_DEMO=1` + `ALLOW_EMPTY_DB=1` but not `ALLOW_PROD_SEED=1`, so `boot.js` will start the demo env with an **empty** database. Either add the flag (demo only) or drop the file. README/docs still mention Railway and Render free as deployment paths: keep one production path in `docs/RUNBOOK.md` and label the rest demo-only. Add `.env.example` entries for every new variable (`ADMIN_ALLOWED_IPS`, `CSP_REPORT_ONLY`, `WORKER_ROLE`, `JWT_EXPIRES_IN`, `BCRYPT_ROUNDS`, `SEED_DEMO`, `ALLOW_PROD_SEED`, `ALLOW_EMPTY_DB`, `ADMIN_TOTP_OPTIONAL` removal, etc.) and make CI fail if `env.js` and `.env.example` drift.

**QA-12 Silent behavior changes after hardening — verify on production env before the next deploy** (these are config traps, not bugs): `GOOGLE_CLIENT_ID` no longer has a production default (Google sign-in disappears if unset); `INDEXNOW_KEY` unset in production now means `'off'` (search-engine pings stop); `WA_ENABLED=1` without `WA_APP_SECRET` now makes the process **throw at boot in every environment**, and WhatsApp OTP/webhook are disabled when the secret is missing. Add these to the startup summary as explicit WARN lines and to `docs/RUNBOOK.md` "pre-deploy checklist".

## P2

**QA-13 `lib/payments.js` is an inert scaffold that reads like a feature.** `createIntent()` returns fake `status:'pending'` objects; `handlePaymentWebhook` claims "deduplication" but has none; nothing imports it. Either mark it `experimental` with a throwing `createIntent` and move it to `server/src/lib/experimental/`, or implement dedupe (`payment_events` table with unique `(gateway, event_id)`), amount/currency re-verification against the order, and tests. Do not wire it to any route until a real gateway account is tested.

**QA-14 SEO: crawler HTML is thin.** `/stores` and `/` expose only a hidden `<h1>` and 1–2 links to non-JS crawlers. Server-render, in the SEO shell, a real `<nav>`/list: top departments, active stores (name + link), and for `/c/:slug` the first N product names/links; keep it inside `#root` so React replaces it. Validate with "View source" and Google Rich Results / URL Inspection. Also add `og:description` parity for the owner-invite text on `/join`.

**QA-15 Not yet covered by the earlier phases** (do after P0/P1): Lighthouse mobile run on home / store / product / checkout / dashboard / POS with budgets (LCP < 2.5 s, CLS < 0.1, INP < 200 ms); accessibility pass (axe) on RTL flows; real external uptime monitor + alert (UptimeRobot/BetterStack) on `/api/ready`; error tracking (Sentry or equivalent) on server and web; backup/replication-lag alerting (the restore drill script exists, but nothing schedules or alerts on it); a load test against a staging copy, not the in-process `load.test.js`.

---

## ACCEPTANCE (for this QA round)
- [ ] QA-01…QA-05 closed with tests; no `ADMIN_TOTP_OPTIONAL` anywhere in the repo.
- [ ] `npm ci && npm test && npm run lint && npm run build && npm audit --omit=dev --audit-level=high` pasted with real exit codes.
- [ ] All test files are discovered by `npm test` or explicitly listed as excluded with a reason.
- [ ] `git ls-files` contains no `_gemini_backup`, videos, `.db`, or scratch files.
- [ ] `docker compose up` on a clean machine → app ready → restart → data preserved (log attached).
- [ ] `docs/PRODUCTION_READINESS.md` rows link to concrete tests and evidence; items found false (QA-04, QA-08) are re-opened.

## OUTPUT
First message: Arabic, ≤ 15 lines — which QA items you confirmed/refuted (with file:line), then work in order QA-01 → QA-15, reporting after each P-level. Ask me only for secrets/DNS/provider actions and list them under "ما محتاج مني أعمله يدوي".

---

## ADDENDUM (found on the live site) — dead product links

**QA-16 Shared product link answers 404.** Reported URL: `/s/ghost/p/كوتش-جوتشي`. Evidence: the HTML route and `GET /api/stores/ghost/products/<slug>` both answer 4xx; `/s/ghost` loads (store active, indexable); `/api/stores/ghost/products` lists only 2 active products (جاكيت جينز, جاكيت ماركات) and none matches كوتش/جوتشي. So it is a real "no such product" answer from the server, not a React routing bug. Tasks:
1. **Find out why the product is gone** (do not guess): query a COPY of the production DB / Litestream restore for `products` WHERE `store_id=(ghost)` AND (`name_ar LIKE '%جوتشي%'` OR `slug` LIKE '%جوتشي%') across ALL statuses; check `product-moderation.js`, `catalog-cleanup`, `purge-stores.mjs`, `restructure-departments` and any admin "delete"/"Smart Fix" paths for hard deletes; compare the product count and the newest `products.created_at`/`updated_at` with what the owner expects, and check the boot logs for a Litestream restore (`[start] no local database - restoring from R2`) to rule out a stale-replica restore after the hardening deploy. Report findings before changing code.
2. **Soft-404 bug:** `server/src/index.js` SEO route `/s/:slug/p/:pslug` only 404s when NO row exists (the `exists` query ignores `p.status`), so draft/archived products return HTTP 200 + a client-side "not found" screen. Return 404 (or 410 for archived/deleted) with `noindex` for non-active products, and make the SPA show an explicit "المنتج ده مش متاح حالياً" state for archived/out-of-catalog items instead of the generic "الصفحة دي مش موجودة".
3. **Recovery UX in `web/src/pages/store/Product.jsx`:** on 404, show a search box prefilled with the slug words, the store's best sellers, and a link to the marketplace search, not just one "تسوّق الكل" button.
4. **No hard deletes of products that were ever public:** archive instead (`status='archived'`), keep the slug reserved, and add a `slug_redirects` table so renamed/merged products 301 to the new URL.
5. **Observability:** log every 404 on `/s/*/p/*` (path, referrer, UA) into a small table and show "most hit broken links" in the admin System page — ads/WhatsApp/Meta catalog links that point to dead products will show up there.
6. **EmptyState flash:** `components/ui/States.jsx` fades in from opacity 0 for 0.4 s; honor `prefers-reduced-motion` and render error/empty states without the fade so a screenshot or slow device never shows a ghosted, unreadable message.


---

## ADDENDUM 2 — customer-facing bug reproduced on the live site

**QA-17 (P0) Cross-store links bounce back to the current store and show "page not found".**
Repro (verified on https://twistegy.com): open `/s/ghost/p/جاكيت-ماركات`, click the "كوتش جوتشي" card in the Moda "طقم كامل" box. Its `href` is correct (`/s/special-mandy/p/كوتش-جوتشي`), but the browser ends on `/s/ghost/p/كوتش-جوتشي` showing "الصفحة دي مش موجودة" (path is already `ghost` ~250 ms after the click). The product exists and `/api/product-owner/<slug>` returns `{"store":"special-mandy"}`.
Root cause (confirm with a test first): `web/src/pages/store/StoreLayout.jsx` lines ~23–29 has an effect that redirects to the canonical store slug when `apiData.store.slug !== slug` (meant for renamed-store aliases). `useApi` in `web/src/lib/hooks.js` keeps the previous store's `state.data` during the first render after `path` changes (the `keepPrevious:false` reset only happens inside the effect, one render too late), so the redirect effect compares the NEW url slug with the OLD store's data and navigates back (`replace`) to the old store. Then `Product.jsx` asks the old store for the new store's product → 404.
Fix: make `useApi` remember which `path` each `data` belongs to and never return data for a different path when `keepPrevious` is false (also in the initial `useState`); additionally only run the canonical-slug redirect when the data's own requested slug equals the current URL slug (server can echo `requestedSlug`), and consider `key={slug}` on the store subtree. Regression tests: (a) unit test for `useApi` path switching; (b) Playwright e2e: from store A product page click a cross-store item in the SmartLook box, LookSet/LookCarousel, search results, StoreCard, SimilarViewed/RecentlyViewed and push-notification URLs → URL stays on store B, product renders, no not-found flash. Also keep the existing alias redirect working (old store slug → new slug).
