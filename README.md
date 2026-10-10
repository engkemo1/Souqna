# بنها أوتفيت · Banha Outfit

**منصة متاجر متعددة لمحلات بنها (ملابس، كوتشيات، شنط، أطفال، طرح وعبايات وجلاليب، ملابس داخلية، فساتين وبدل أفراح) — كل محل يختار أقسامه** — سوق مركزي، متجر أونلاين لكل محل بألوانه، ولوحة تحكم احترافية تشتغل من الموبايل.

A multi-store fashion e-commerce platform built for clothing stores in Banha: a central marketplace, a themed storefront per store, and a mobile-first owner dashboard. Arabic (RTL) + English, full-stack, production-minded.

---

## التشغيل بسرعة · Quick start

Requirements: **Node.js 22.9+** (uses the built-in `node:sqlite` — no database server to install).

```bash
npm run setup     # install → seed demo data (≈3 min, processes ~630 real photos) → build
npm start         # http://localhost:4000
```

During development (hot reload on both sides):

```bash
npm run dev       # API on :4000, web on :5173 (proxied)
```

### Demo accounts (password `demo1234`)

| Store | Login | Storefront |
|---|---|---|
| أحمد فاشون · Ahmed Fashion (menswear) | `ahmed@banhalook.app` | `/s/ahmed-fashion` |
| لمار بوتيك · Lamar Boutique (womenswear) | `lamar@banhalook.app` | `/s/lamar-boutique` |
| سبورت زون · Sport Zone (sportswear) | `sport@banhalook.app` | `/s/sport-zone` |
| دنيم هاوس · Denim House (denim & tees) | `denim@banhalook.app` | `/s/denim-house` |

The login page has a one-tap **“Use demo account”** button, and `/login?demo=1` signs straight into Ahmed Fashion — handy when showing the dashboard to a store owner.

---

## What’s inside

```
souqna/
├─ shared/            Theme Engine (contrast-safe colour tokens) + shared constants
├─ server/            Express API · node:sqlite · sharp media pipeline · seed
│  ├─ src/routes/     public.js (marketplace/storefront/checkout) · owner.js (dashboard) · auth.js
│  ├─ src/lib/        media.js · cart.js · serialize.js · errors.js · auth.js
│  ├─ src/db/         schema.sql · seed.js
│  └─ seed-assets/    real product photography + banner composites used by the seed
├─ web/               React 18 + Vite + Tailwind + Framer Motion + Recharts
│  └─ src/
│     ├─ components/ui      design-system primitives (Button, Field, Sheet, Toast, SmartImage, Skeleton…)
│     ├─ components/store   ProductCard, Gallery+Lightbox, HeroSlider, CartDrawer, QuickAdd…
│     ├─ components/dash    KPI cards, charts, MediaUploader, order cards/tables…
│     └─ pages/             market/ · store/ · dashboard/ · auth/
└─ scripts/prepare_assets.py   builds seed-assets from the open-source photo sets
```

### Customer experience
- **Marketplace** — editorial hero, featured stores, trending products across Banha, store search/filter/sort, premium store cards (cover, logo, rating, offer badge, hover zoom + CTA).
- **Storefront per store** — themed with the store’s colours; announcement bar, hero slider (autoplay, pause, swipe, progress dots, separate mobile art, RTL mirroring), category tiles, rails, coupon band, trust strip.
- **Product cards** — 4:5 imagery, secondary image on hover, discount / new / low-stock badges, favourite with pop animation, colour dots, quick-add (hover bar on desktop, bag button on touch).
- **Product page** — swipe gallery on mobile, thumbnails + hover zoom on desktop, fullscreen lightbox (keyboard, swipe, double-tap zoom & pan), colour/size picker with per-variant stock, low-stock pulse, sticky mobile purchase bar, add-to-cart fly animation + badge bump.
- **Shop** — category chips, sort, filters (size/colour/price/sale) in a bottom sheet on mobile and a sidebar on desktop, infinite loading, removable filter chips.
- **Cart & checkout** — drawer on desktop, page on mobile, free-delivery meter, undo on remove, server-side re-pricing, coupons, Egyptian phone validation, cash on delivery, animated success page.
- **Mobile navigation** — one-handed bottom nav (Home · Categories · Search · Favorites · Cart), header that hides on scroll.

### Store owner dashboard
- **Overview** — greeting, today’s sales, pending-orders alert, KPIs with animated counters and deltas, sales chart vs previous period, order-status breakdown, recent orders, top products, low-stock alerts, quick actions.
- **Orders** — status tabs with counts, search, sort, table on desktop / cards on mobile, pull-to-refresh; order detail with progress stepper, one-tap next status, cancel with reason (stock auto-returned), call / WhatsApp the customer, timeline.
- **Products** — tabs (active, draft, low, out), list/grid views, quick-edit sheet (price, compare-at, status, stock per variant), delete/archive.
- **Product editor** — organised sections on desktop, guided 6-step flow on mobile for new products, collapsible sections when editing; media uploader (multi-file, drag & drop, gallery/camera on phones, on-device compression, progress, drag-to-reorder, primary image), colour/size matrix, margin calculator, SEO preview, unsaved-changes guard.
- **Offers** (coupons), **Banners** (with live desktop/mobile + AR/EN preview), **Categories** (reorderable), **Customers** (VIP, history), **Analytics** (revenue, categories, areas, order times, weekdays, funnel, top products), **Settings**, **Theme Engine**.
- Layout: full sidebar ≥1024px, icon rail on tablets, top bar + bottom nav with a centre “Add product” button on phones.

---

## Storefront Theme Engine — `shared/theme.js`

Store owners choose **8 colours** (primary, secondary, accent, background, text, buttons, header, footer). The engine turns them into ~25 design tokens and **guarantees readability**:

- Text on background ≥ 7:1; button labels, badges, header & footer ≥ 4.5:1 (WCAG AA).
- If a colour fails, its lightness is nudged (hue and saturation kept) until it passes — e.g. a pale-pink primary becomes a deeper rose *when used as text*, while a bright yellow button keeps its yellow and gets black text.
- Muted text, borders, surfaces, sale/success colours and focus rings are derived automatically.
- Every adjustment is reported back so the owner sees *what* changed and *why* (Theme screen → Readability check).

Only colour is customisable. Spacing, typography, radii, shadows, grid, breakpoints and motion stay locked in `web/tailwind.config.js`, so no store can “break” the design. Tokens are CSS variables (`--c-*`) consumed by Tailwind classes such as `bg-btn text-on-btn`, so the same components render every store.

## Product Media System — `server/src/lib/media.js`

Every upload is processed once with **sharp**:

| Rendition | Width | Used for |
|---|---|---|
| `thumb` | 160 | dashboard lists, cart lines, thumbnails |
| `sm` | 400 | mobile product cards |
| `md` | 800 | desktop cards, mobile gallery |
| `lg` | 1400 | desktop gallery & zoom |
| `xl` | 2000 | hero banners |
| `original` | ≤2400 | EXIF-rotated, metadata stripped |

Each rendition is written as **WebP + JPEG**. A 24-px blurred LQIP and the dominant colour are stored for placeholders. `<SmartImage>` reserves the aspect ratio (no layout shift), shows the blur-up, serves `srcset`/`sizes` so the browser picks the right file, lazy-loads below the fold, fades in and falls back gracefully on error. Phones also downscale large photos *before* uploading.

Files live under `MEDIA_DIR/<store>/<hash>/` and are served with `Cache-Control: immutable`. To use a CDN, sync that folder to S3/R2 and set `MEDIA_BASE_URL` — the API emits URLs relative to it.

## API overview

Public: `GET /api/marketplace`, `GET /api/stores/:slug`, `/home`, `/products` (filters, facets, pagination), `/products/:pslug`, `POST /quote`, `POST /orders`, `GET /orders/:number`.
Owner (Bearer token): `/api/owner/overview`, `/analytics`, `/orders` (+ `PATCH /:id/status`), `/products` (CRUD + quick `PATCH`), `/variants/:id`, `/media` (multipart), `/categories`, `/offers`, `/banners`, `/customers`, `/store`, `/store/theme`, `/store/logo|cover`.

Errors are always friendly and typed (`{ error: { code, message, fields } }`); SQL errors and stack traces never reach the client. Prices are always re-read on the server at checkout.

## Production notes
- Set a strong `JWT_SECRET` (see `.env.example`).
- `npm run build && npm start` serves the API and the built web app from one port; put it behind Nginx/Caddy with HTTPS.
- SQLite (WAL) is plenty for a city-scale marketplace; the data layer is plain SQL and can move to Postgres later.
- Next steps worth adding: online payments (Paymob / Fawry), SMS/WhatsApp order notifications, delivery-company integration, per-store custom domains.

## Credits
Demo photography: Magento 2 sample data (Luma, AFL-3.0) and Sylius fixtures (MIT), composited into banners by `scripts/prepare_assets.py`. Fonts: IBM Plex Sans Arabic, Playfair Display (OFL). Icons: Lucide.

## Free deployment (Render, ~10 minutes)
1. Push this folder to a new GitHub repository.
2. On [render.com](https://render.com) → **New → Blueprint** → pick the repo. `render.yaml` + `Dockerfile` do the rest (free plan).
3. First boot seeds the demo stores (~3 min). Your links will be:
   - Marketplace: `https://<your-app>.onrender.com/`
   - Stores: `/s/ahmed-fashion`, `/s/lamar-boutique`, `/s/sport-zone`, `/s/denim-house`
   - Owner dashboard: `/login?demo=1` (or `ahmed@banhalook.app` / `demo1234`)

Free instances sleep after inactivity and reset their disk on redeploy (the demo data re-seeds automatically). For real stores, add a persistent disk and set `DB_FILE`/`MEDIA_DIR` to it.

## Sales contact
Owners who want to join: **01067378110** (WhatsApp `201067378110`). Edit `web/src/config/contact.js` to change it.

## Demo account
`ahmed@banhalook.app` is promoted to a **read-only `demo` role** at server start (`DEMO_EMAIL` env to change): it can browse the whole dashboard but every write returns `demo_readonly`.

## Store departments
Each store picks one or many departments (women, men, kids, shoes, bags, hijab, abaya, jalabiya, underwear, wedding dresses, wedding suits, sports, denim, accessories) in Settings. The marketplace filter chips are built from them.

## Pre-launch security & operations

1. **Secrets**: set `JWT_SECRET` (32+ random chars), `ADMIN_KEY` (16+ chars) and `NODE_ENV=production`. The admin “النظام” page shows a live checklist.
2. **Admin two-step confirmation**: run `npm run admin-totp -w server`, put the printed `ADMIN_TOTP_SECRET` in the host’s env, and add the same secret to an authenticator app (Google/Microsoft Authenticator). After that, admin sign-in = key + 6-digit code (12-hour session; codes can’t be replayed; wrong codes are rate-limited).
3. **Backups**: set `BACKUP_DIR` to a folder on a persistent disk. The server then snapshots the database (consistent `VACUUM INTO`) and mirrors new photos every 24 h and keeps `BACKUP_KEEP_DAYS` daily DB copies. Run on demand with `npm run backup -w server`. The admin “النظام” page can also download the database. Keep an off-server copy as well. Restore: stop the server, copy `db/souqna-DATE.db` over `DB_FILE` and `media/` over `MEDIA_DIR`.
4. **Demo passwords**: the seed now generates a random Town Style password (printed at the end of the seed). On an existing database run `npm run set-password -w server -- townstyle@banhalook.app` (prints a new random password). Set the store’s real phone from the admin Stores page.
5. **Push notifications** need HTTPS (the PWA service worker does too). VAPID keys are created automatically on first run.
