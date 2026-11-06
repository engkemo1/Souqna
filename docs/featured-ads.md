# Featured Ads & Offers (الإعلانات والعروض المميزة)

Platform-admin controlled campaigns shown in the marketplace and on storefronts. Admin page: `/admin/featured`.

## Workflow
1. **New campaign** → 6 steps: type · content · design · placements & targeting · schedule · preview & publish.
2. *Custom ad*: AR/EN title, subtitle, CTA, badge, destination (internal path or https), desktop/mobile image, colours.
3. *Store offer*: pick a store, then one of its **live** offers (from the promotion engine). The campaign stays linked to the offer; pricing and eligibility always come from the promotion engine. If the offer is paused/expired/deleted the campaign disappears from the storefront by itself and the admin list shows a warning.
4. **Save as draft** or **Publish**. Draft/paused/archived/expired/out-of-window campaigns are never public.
5. Actions: edit, duplicate (copy is a draft), pause/resume, archive/restore, delete (permanent).

## Placements and limits (max live campaigns per slot)
market_top 2 · market_hero 3 · market_strip 6 · market_grid 4 · store_hero 2 · store_offers 4 · store_ticker 5 · market_bottom 3 · search_slot 2.
Publishing into a full slot (overlapping dates) returns 409 `placement_full`.
Each placement has order, priority, desktop/mobile visibility. Targeting: audience (all/marketplace/store), stores (store placements), categories (search_slot only, together with `store`). Product/category on a campaign are *destinations*, not targeting.

## Schedule
Times are Cairo wall-clock `YYYY-MM-DDTHH:MM`. Activation and expiry are computed on read, no cron.

Duration shortcuts (wizard step 4): 1 day / 3 days / 1 week / 2 weeks / 1 month fill `ends_at` from `starts_at` (or from now, Cairo time, if no start). The list shows "باقي X" / "هتبدأ بعد X" / "خلصت من X" per campaign. No end date = runs until paused.

## Recurring schedule
`repeat` on a campaign: `{ days: [0..6], windows: [{from:'HH:MM', to:'HH:MM'}] }` (0 = Sunday; empty days = every day; empty windows = all day; max 4 windows; a window with `to` before `from` runs past midnight). It narrows the `starts_at..ends_at` range, in Cairo time. Outside the schedule the derived state is `resting` ("خارج مواعيدها") and the ad is not served; admin shows "هتشتغل تاني بعد X" (`repeatNextInMin`). Slot capacity counts two campaigns as overlapping only if their date ranges **and** their weekly schedules overlap, so a Friday ad and a Saturday ad can share a full slot. Computed on read, no cron. Tests: `test/featured-repeat.test.js`.

## Outside advertisers (معلن خارجي)
For a business that has no shop on the platform. Admin → «المعلنون الخارجيون» (`/admin/advertisers`) holds its profile (name, logo, cover, up to 6 photos, address, hours, WhatsApp / phone / map, Instagram / Facebook, optional "say this word" offer). A campaign created as «معلن خارجي» (custom campaign with `advertiser_id`; a shop and an advertiser cannot both be set) opens the public page `/a/:slug`.
- Needs the admin's "advertiser consented" switch; hiding the advertiser or removing consent makes the page 404 and hides its ads (`health: advertiser_hidden`).
- Public: `GET /api/advertiser/:slug`, `POST /api/advertiser/:slug/event` (`view|whatsapp|call|map|offer|social`, de-duplicated per visitor, counted per day, no visitor ids stored).
- Admin: `/api/admin/featured/advertisers` CRUD, `/:id/report?days=7` returns a ready-to-send Arabic WhatsApp text. An advertiser with campaigns cannot be deleted (hide it instead).
- Egyptian numbers are normalised (`01x…` → `20…`) for `wa.me`; links must be https. Optional structured hours (days + one daily window) drive the "مفتوح دلوقتي" badge in Cairo time. The page is labelled "إعلان".
- Each of the 6 photos may carry an optional name and price (whole EGP), set by the platform admin — the advertiser has no login. A photo with a name or price shows them and an «اطلبها على واتساب» button (pre-filled message, counted as the `order` event); without them it is display-only. No cart or online payment: an advertiser that wants that must have a real shop (then the normal shop / offer campaign applies).
- **Optional «البيع بسلة Twist»** (`twist_orders`, needs at least one photo with name + price): the advertiser gets a hidden *shadow shop* (`stores.hidden=1`, `delivery_mode='platform'`, owned by the internal user `advertisers@twist.internal`, slug `adv-<slug>`); every sellable photo becomes a normal product (`track_stock=0`, image imported from our own stored file, never fetched from foreign URLs). The public page then shows «أضف للسلة»; the basket, checkout, delivery pricing and admin Orders work unchanged and Twist delivers (pickup address = the advertiser's). The shop never appears in search / directory / home (they filter `hidden=0`). Items that stop being sellable, a hidden advertiser or turning the option off set products to `draft` (kept for old orders). An advertiser whose shop has orders cannot be deleted. Code: `lib/advertiser-shop.js`. No stock tracking — the admin must confirm availability with the advertiser.
- Tests: `test/advertiser.test.js`, `test/advertiser-shop.test.js`.

## Images
`POST /api/admin/featured/image?kind=bg|fg` (`server/src/lib/adImage.js`): re-encodes to WebP, shrinks to max 2000px (bg) / 1200px (fg), **never crops** (zoom/focal controls crop in CSS), keeps transparency for fg. Returns `{image, bytes, originalBytes}`; the admin shows the saving.

## Database
`featured_campaigns` (campaign + placements_json + targeting_json) and `featured_stats` (day, campaign, placement, event → count). Created automatically; existing tables untouched (`homepage_ads` keeps working).

## API
Admin (`x-admin-key`, plus session if TOTP is on), prefix `/api/admin/featured`:
`GET /meta` · `GET /campaigns?state&type&store&placement&q&sort` · `GET|PUT /campaigns/:id` · `POST /campaigns` (`publish:true` to publish) · `POST /campaigns/:id/{pause|resume|archive|restore|duplicate}` · `DELETE /campaigns/:id` · `POST /preview` · `GET /stores/:id/offers` · `GET /stores/:id/targets` · `GET /analytics?days` · `GET /campaigns/:id/analytics` · `POST /image`.

Public: `GET /api/featured?placement=&store=&category=&device=` · `POST /api/featured/:id/impression` · `POST /api/featured/:id/click` (body `{placement}`).

## Validation / security
Server-side: tags and control chars stripped, URLs limited to internal paths or https, hex colours only, dates checked, end after start, references verified. Tracking is live-only, slot-aware, one impression per visitor/slot/30 min, clicks throttled.

## Tests
`npm run test:featured` (server): permissions, validation, lifecycle, scheduling, placement filtering, slot capacity, offer linking, store targeting, analytics, preview.

## Look and layout controls (design step)
Background image (desktop/mobile) with zoom 100–300% and focal point; optional second (foreground) image with size and side; background colour/gradient and text colour via picker; text alignment; image overlay 0–80%; button style. Banner layout on the page: width (page width / full screen / narrow centred), height (short/medium/tall) and, for narrow, its side. A live preview updates while editing, a contrast warning appears when the text may be hard to read, and the last step shows the banner inside a simplified copy of the real page (desktop / phone frame).
