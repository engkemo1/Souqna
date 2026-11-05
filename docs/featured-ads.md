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
