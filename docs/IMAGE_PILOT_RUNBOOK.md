# Category image generation — controlled pilot (3 main sections)

Do NOT run a 141-section batch until every step below is checked off.

## 0. Before deploying
- `cd server && node --test --no-warnings test/*.test.js` (all green) and `npm run test:moda`, `test:visual`, `test:search`.
- `cd web && npx vite build`.
- Take a database backup (admin → السيرفر والنسخ) and note the current image URL of the 3 pilot sections (admin → مكتبة صور الأقسام, tab الأقسام).

## 1. Server settings (names only — never paste values into chat or logs)
- `CF_AI_TOKEN` — API token with **Workers AI – Read** and **Workers AI – Edit** (dashboard template "Create a Workers AI API Token").
- `CF_ACCOUNT_ID` (or `R2_ACCOUNT_ID`).
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` (public/custom domain that serves the bucket).
- Optional: `IMAGE_GEN_DAILY_LIMIT` (set `6` for the pilot), `IMAGE_GEN_STEPS` (1–8, default 4).
- Deploy, then open the review tab: the checklist must show no "ناقص" for the first four items.

## 2. Pilot generation (admin clicks only)
1. Review tab → scope «الأقسام الرئيسية فقط», batch size **3** → start. One provider call per section, nothing else.
2. Confirm: 3 candidates appear; the daily counter shows 3/6; nothing is on R2 yet (candidates are temporary).
3. Approve ONE image first. Verify:
   - the section shows «له صورة» and the library has 1 asset;
   - `curl -I <image url>` returns 200 with `content-type: image/webp` and `cache-control: public, max-age=31536000, immutable`;
   - the customer site shows the image on the home/category pages (hard refresh);
   - the R2 bucket has `category-images/<hash>/thumb.webp, card.webp, hero.webp, original.*`.
4. Reject one, regenerate it (costs 1 more call — counter 4/6), approve the other.
5. Rollback test: on a pilot section that had an old image, press the trash icon → the old image is restored; then «من المكتبة» → pick the generated one again.
6. Duplicate test: start another «main» batch of 3 — sections that now have an image or a pending candidate must NOT be regenerated (daily counter must not increase for them).
7. Billing: Cloudflare dashboard → Workers AI → usage. Expected ≈ 4–6 images; at the documented rates that is well under the 10,000 free neurons/day.

## 3. Go / no-go
Go only if: real images were generated, uploaded to R2 with immutable caching, displayed on the site, rollback worked, and billing matches. Then ask for approval before generating the rest in batches of ≤ 30.
