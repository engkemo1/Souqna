# Environment Variables Reference

All variables for **Twist Store** (`twistegy.com`).  
Copy `.env.example` to `.env` and fill every required value before deploying.

> [!IMPORTANT]
> Never commit a real `.env` file. The `.gitignore` excludes it.  
> Never print or log secret values. The `redactPii()` logger strips phone numbers and Bearer tokens automatically.

---

## Required in Production

| Variable | Example | Description |
|---|---|---|
| `NODE_ENV` | `production` | Must be `production`. Enables all security checks. |
| `JWT_SECRET` | *(32+ random chars)* | Signs owner session JWTs. Generate: `openssl rand -hex 32`. **Minimum 32 chars; placeholder values are rejected at boot.** |
| `ADMIN_KEY` | *(16+ random chars)* | Static key for the platform admin API (`/api/admin/*`). **Minimum 16 chars.** |
| `ADMIN_TOTP_SECRET` | *(base32 string)* | TOTP secret for 2-step admin login. Generate: `npm run admin-totp -w server`. **Required in production.** |
| `DB_FILE` | `/app/server/data/souqna.db` | Absolute path to the SQLite database file. |
| `MEDIA_DIR` | `/app/server/data/media` | Directory for uploaded product photos. Must be on a persistent volume. |

---

## Cloudflare R2 (Photo Storage)

Upload photos to a **public** R2 bucket instead of local disk.  
All five variables must be set together; if any is missing, local disk is used.

| Variable | Description |
|---|---|
| `R2_ACCOUNT_ID` | Cloudflare account ID (also used for Workers AI). |
| `R2_ACCESS_KEY_ID` | R2 S3-compatible API access key. |
| `R2_SECRET_ACCESS_KEY` | R2 S3-compatible API secret key. |
| `R2_BUCKET` | **Public** R2 bucket name (e.g. `banha-media`). |
| `R2_PUBLIC_URL` | Public base URL for the bucket (e.g. `https://pub-xxx.r2.dev`). |

---

## Database Replication (Litestream → R2)

Streams every SQLite WAL frame to a **private** R2 bucket so a fresh container restores the database automatically. Without this, all data is lost on each redeploy.

| Variable | Description |
|---|---|
| `BACKUP_R2_BUCKET` | **Private** R2 bucket for Litestream replication (e.g. `banha-backups`). Must differ from `R2_BUCKET`. |
| `BACKUP_R2_ACCESS_KEY_ID` | (Optional) Dedicated S3 key for the backup bucket. Falls back to `R2_ACCESS_KEY_ID`. |
| `BACKUP_R2_SECRET_ACCESS_KEY` | (Optional) Dedicated S3 secret for the backup bucket. Falls back to `R2_SECRET_ACCESS_KEY`. |

---

## Local Backups

| Variable | Default | Description |
|---|---|---|
| `BACKUP_DIR` | *(none)* | Local directory for daily SQL dumps. Mount a persistent volume here. |
| `BACKUP_KEEP_DAYS` | `14` | How many daily dumps to keep. |

---

## WhatsApp Cloud API (Meta)

Required only when stores use WhatsApp order notifications or buyer sign-in codes.

| Variable | Description |
|---|---|
| `WA_ENABLED` | `1` to enable WhatsApp features. **Requires `WA_APP_SECRET`.** |
| `WA_TOKEN` | Meta WhatsApp Business API permanent token. |
| `WA_PHONE_ID` | WhatsApp phone number ID from Meta dashboard. |
| `WA_APP_SECRET` | Meta App → Settings → Basic → App secret. Required when `WA_ENABLED=1`. |
| `WA_VERIFY_TOKEN` | Verify token typed into Meta → WhatsApp → Configuration. |
| `WA_TEMPLATE` | Approved template name for order notifications (default: `new_order`). |
| `WA_TEMPLATE_LANG` | Template language code (default: `ar`). |
| `WA_AUTH_TEMPLATE` | Approved template name for sign-in codes (default: `login_code`). |
| `WA_AUTH_LANG` | Auth template language code (default: `ar`). |
| `PLATFORM_WA` | Twist team WhatsApp number for platform-level alerts (e.g. `201206928670`). |

---

## Security & Access Control

| Variable | Default | Description |
|---|---|---|
| `ADMIN_ALLOWED_IPS` | *(none — all IPs allowed)* | Comma-separated CIDR ranges that may access `/api/admin/*` (e.g. `1.2.3.4/32,10.0.0.0/8`). |
| `ALLOW_REGISTER` | `0` | Set to `1` to allow public store owner registration. Keep `0` in production. |
| `ALLOW_EMPTY_DB` | `0` | Set to `1` on the **very first** production deployment when no Litestream replica exists yet. Remove immediately after. |
| `BCRYPT_ROUNDS` | `12` | bcrypt work factor. Do not lower below `12` in production. |
| `JWT_EXPIRES_IN` | `1h` | Owner access-token lifetime. Keep short. |

---

## Demo Seeding (Never use in production without explicit opt-in)

| Variable | Default | Description |
|---|---|---|
| `SEED_DEMO` | `0` | Set to `1` to seed demo stores on first boot. Blocked in `production` unless `ALLOW_PROD_SEED=1` is also set. |
| `ALLOW_PROD_SEED` | `0` | Safety override — required alongside `SEED_DEMO=1` in production. Use only for a fresh demo environment. |
| `TOWNSTYLE_PASSWORD` | *(random)* | Seed password for the Town Style demo owner account. Random if unset; printed to stdout once. |

---

## AI / ML Features

| Variable | Description |
|---|---|
| `VISUAL_MODEL` | `clip` to enable CLIP-based visual search; unset = colour model (no RAM cost). |
| `VISUAL_CLIP_MODEL` | HuggingFace model ID (default: `Xenova/clip-vit-base-patch32`). |
| `MODEL_CACHE_DIR` | Temp directory for ONNX model files (default: `/app/.model-cache`). |
| `CF_ACCOUNT_ID` | Cloudflare account ID for Workers AI (visual search + stylist). |
| `CF_AI_TOKEN` | Cloudflare API token with Workers AI Read+Edit permission. |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude-based stylist chat (مودة). |
| `STYLIST_MODEL` | Claude model ID (default: `claude-haiku-4-5`). |
| `MODA_BRAIN` | `0` to disable the LLM brain (rules engine only). |
| `MODA_BRAIN_DAILY` | Max brain calls per visitor per day (default: `40`). |
| `GEMINI_API_KEY` | Gemini API key for cutout review (checks AI-removed backgrounds). |
| `CUTOUT_REVIEW` | `1` to review every AI background removal via Gemini. |
| `JINA_API_KEY` | Jina.ai API key for hosted CLIP visual search (alternative to local CLIP). |

---

## Push Notifications (VAPID)

Auto-generated and stored in the DB on first boot. Set manually only to pin keys across deployments.

| Variable | Description |
|---|---|
| `VAPID_PUBLIC_KEY` | VAPID public key (base64url). |
| `VAPID_PRIVATE_KEY` | VAPID private key (base64url). |
| `VAPID_SUBJECT` | Contact URI (e.g. `mailto:admin@twistegy.com`). |

---

## SEO & Site Identity

| Variable | Default | Description |
|---|---|---|
| `SITE_URL` | `https://twistegy.com` | Canonical site origin used in CSP, sitemaps, and JSON-LD. |
| `GOOGLE_CLIENT_ID` | *(none)* | Google OAuth client ID for buyer "Sign in with Google". |
| `INDEX_NOW_KEY` | *(none)* | IndexNow key for instant Bing/Yandex URL submission. |

---

## Deployment

| Variable | Default | Description |
|---|---|---|
| `PORT` | `10000` | HTTP port the Express server listens on. |
| `WORKER_ROLE` | `all` | `web` (no background jobs), `worker` (jobs only), `all` (default). |
| `APP_VERSION` | `1.0.0` | Reported by `/api/version`. Set during CI build (e.g. the Git tag). |
| `GIT_SHA` | `dev` | Git commit SHA reported by `/api/version`. Set during CI build. |
