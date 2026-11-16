# Twist Store (`souqna`) — Phase 0 Baseline Report

Recorded on branch `prod-hardening` before production-hardening changes.

## Environment
- **Node.js:** `v24.15.0` (engine requirement `>=22.9`)
- **npm:** `11.12.1`
- **OS:** Windows (`win32`)

## Test Suite Baseline (Before & After Baseline Drift Alignment)

| Workspace / Suite | Command | Initial Result | Post-Alignment Result | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `web` | `npm test -w web` | **15 pass / 0 fail** | **15 pass / 0 fail** | POS offline engine unit tests (`web/test/pos-engine.test.js`). |
| `server` (`test:stylist`) | `npm run test:stylist -w server` | **14 pass / 0 fail** | **14 pass / 0 fail** | Stylist ranking unit tests. |
| `server` (`test:promotions`) | `npm run test:promotions -w server` | **32 pass / 0 fail** | **32 pass / 0 fail** | Promotions engine + checkout integration tests. |
| `server` (`test:cashier`) | `npm run test:cashier -w server` | **58 pass / 0 fail** | **58 pass / 0 fail** | Cashier sync, product codes, POS, POS fixes, POS remote scanner. |
| `server` (`test:images`) | `npm run test:images -w server` | **33 pass / 0 fail** | **33 pass / 0 fail** | Image library, AI generation batching, and catalog v3 migrations. |
| `server` (`test:comments`) | `npm run test:comments -w server` | **4 pass / 0 fail** | **4 pass / 0 fail** | Single-store and multi-store order comments. |
| `server` (`test:media`) | `npm run test:media -w server` | **2 pass / 0 fail** | **2 pass / 0 fail** | Local-to-R2 media migration. |
| `server` (`test:buyer-chats`) | `npm run test:buyer-chats -w server` | **1 pass / 0 fail** | **1 pass / 0 fail** | Buyer Twila/Moda chat persistence & privacy. |
| `server` (`test:ci`) | `npm run test:ci -w server` | 31 pass / 1 fail | **32 pass / 0 fail** | `featured-ads.test.js` expected `fg_shape`, `fg_y`, `fg_out` (already used in `web/src/pages/admin/FeaturedAds.jsx`); added missing columns/fields in `server/src/lib/featured.js`. |
| `server` (`test:search`) | `npm run test:search -w server` | 2 pass / 1 fail | **3 pass / 0 fail** | `search-upgrade.test.js` tested legacy `'denim'` department slug; restored `'denim'`/`'sports'` as fallback hints in `inferDepartment` (`server/src/lib/departments.js`). |
| `server` (`test:moda-core`) | `npm run test:moda-core -w server` | 87 pass / 1 fail | **88 pass / 0 fail** | `stylist-log.test.js` failed with `table products has no column named care_ar`; added additive `material_ar` and `care_ar` column migration in `server/src/db/index.js`. |
| `server` (`test:visual`) | `npm run test:visual -w server` | 46 pass / 2 fail | **48 pass / 0 fail** | `visual-multi.test.js` selected `clip` when only `color-v1` vectors were indexed; updated `searchByImage` in `server/src/lib/visual.js` to fall back to `color-v1` when `clip` has zero vectors indexed. |
| `server` (`test:market-cart`) | `npm run test:market-cart -w server` | 0 pass / 1 fail | **1 pass / 0 fail** | `marketplace-cart.test.js` used generic `'Banha'` (removed by `importPaperRates`); updated test to use `'وسط البلد'` neighbourhood and `extra_fee` per-zone pricing. |

**Total Verified Baseline:** **331 tests passing, 0 failing.**

## Build Baseline (`npm run build`)
- `vite build` succeeds in ~55s (`3102 modules transformed`).
- Notable large chunks identified for Phase 5 optimization:
  - `BanhaRunner` (`960.87 kB` / `271.17 kB` gzip — Three.js 3D runner game)
  - `index` (`458.30 kB` / `118.43 kB` gzip)
  - `charts` (`393.67 kB` / `108.40 kB` gzip — Recharts)
  - `react` (`239.51 kB` / `78.64 kB` gzip)
  - `leaflet-src` (`150.05 kB` / `43.59 kB` gzip)
  - `motion` (`118.40 kB` / `39.57 kB` gzip)
  - 9 `@fontsource/*` families bundled in `dist/assets/`.
