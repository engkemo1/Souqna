# Twist — category image pilot: deploy, configuration, rollback

Never paste secrets into chat, tickets or logs. Set them only in the server's environment (`/opt/sewqna/.env` or your host's secret store). The admin screen shows only "present / missing", never values.

## A. What the deploy changes in the database (additive only)
- `departments`: new nullable columns (`legacy_image`, `image_asset_id`, `seo_*`, `show_empty`, …). Existing `image` URLs are not rewritten.
- New tables: `image_assets`, `image_candidates`, `image_gen_batches`, `image_gen_jobs`.
- No DELETE/DROP/UPDATE of products, stores, orders or existing category images. Verified on a copy of an old database: product, department, user, variant and media rows were value-identical after boot (older, unrelated backfills of `orders.track_token`/`shipping_free` and `stores.delivery_mode` ran, as they do on every old database).
- Booting never generates, uploads or deletes images.

## B. Before deploying (backup)
1. Admin → السيرفر والنسخ → create a backup now (and confirm the last Litestream/R2 replication is recent: `docker logs sewqna-app-1 2>&1 | grep -iE "litestream|replicat" | tail`, typed by hand).
2. Write down the current `image` of the sections you will pilot (admin → مكتبة صور الأقسام → الأقسام).

## C. Cloudflare checklist (tick each; values stay on the server)
- [ ] `CF_AI_TOKEN` — API token with **Workers AI – Read** and **Workers AI – Edit** (dashboard: Workers AI → Use REST API → "Create a Workers AI API Token").
- [ ] `CF_ACCOUNT_ID` — your Cloudflare account id (R2_ACCOUNT_ID is used if this is missing).
- [ ] `R2_BUCKET` — bucket name; the bucket must serve public reads through the domain in `R2_PUBLIC_URL`.
- [ ] `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` — an R2 API token with **Object Read & Write** on that bucket.
- [ ] `R2_PUBLIC_URL` — public base URL (custom domain or r2.dev) with no trailing slash.
- [ ] `R2_ENDPOINT` — only if the bucket is in the EU jurisdiction (`https://<account>.eu.r2.cloudflarestorage.com`); otherwise leave unset.
- [ ] `IMAGE_GEN_DAILY_LIMIT=6` for the pilot (hard stop on provider calls per UTC day).
- [ ] Optional: `IMAGE_GEN_STEPS` (1–8, default 4).
- [ ] Redeploy, open admin → مكتبة صور الأقسام → التوليد والمراجعة: the "إعدادات ناقصة" box must be gone.

## D. Pilot order (admin clicks only)
1. ONE main section (batch size 1, scope الأقسام الرئيسية فقط) → inspect the preview → approve.
2. Verify: DB reference (section shows «له صورة»), `curl -I <public image url>` → 200, `content-type: image/webp`, `cache-control: public, max-age=31536000, immutable`; bucket contains `category-images/<hash>/{thumb,card,hero}.webp` + `original.*`; the image shows on the real site (hard refresh).
3. Only then up to 3 main sections total. Never start the full 141-section rollout without explicit approval.

## E. Rollback
- A section's image: trash icon → restores the previous (legacy) image; or «من المكتبة» → re-assign an earlier generated image. Approving a new image never deletes the previous one.
- A bad generated image: reject it (nothing is stored) or unassign it; library files stay until you delete them.
- Code: redeploy the previous commit (`git checkout <previous-sha> && docker compose build app && docker compose up -d app`). The added columns/tables are ignored by older code, so no schema rollback is needed.
- Data: if anything unexpected happens to the database, restore the pre-deploy backup from step B (Litestream restore or the admin backup). Do not run manual deletes in production.
