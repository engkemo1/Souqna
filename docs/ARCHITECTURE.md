# Twist Store — Architecture Overview

Twist Store (`twistegy.com`) is a localized, multi-store fashion marketplace platform tailored for fashion, apparel, and lifestyle merchants in Banha, Egypt.

---

## 1. High-Level Architecture Diagram

```
                 [ Shoppers / Mobile Browsers / Desktop ]
                                    │
                              HTTPS (Caddy)
                  ┌─────────────────┴─────────────────┐
                  ▼                                   ▼
          Static Web Assets                   Express 4 Backend
         (React 18 / Vite 6)                  (Node 22.9, ESM)
                  │                                   │
                  │                            ┌──────┴──────┐
                  │                            ▼             ▼
                  │                      SQLite (WAL)    Local / R2 Media
                  │                            │
                  │                            ▼
                  │                 Litestream Replication
                  │                            │
                  │                            ▼
                  └──────────────────► Private Cloudflare R2
```

---

## 2. Technology Stack & Workspace Structure

- **Workspaces (`npm workspaces`):**
  - `server/`: Node.js ≥ 22.9, Express 4, `node:sqlite` (synchronous, in-process engine), Zod validation, Sharp, bcryptjs, JWT authentication, Web-push.
  - `web/`: React 18, Vite 6, TailwindCSS 3, Framer Motion, React Router v7, Leaflet, Recharts.
  - `shared/`: Shared department taxonomies, brand configuration constants (`BRAND`), layout/palette engines.

---

## 3. Data & Storage Model

### In-Process SQLite (`node:sqlite`)
- All transactional data resides in a single, zero-latency local SQLite database (`souqna.db`).
- Configured with `PRAGMA journal_mode = WAL`, `PRAGMA synchronous = NORMAL`, and `PRAGMA foreign_keys = ON`.
- Managed using transactional migrations (`schema_migrations` tracking table).
- Concurrency handled via `BEGIN IMMEDIATE` and nested `SAVEPOINT` transactions.

### Replication & Disaster Recovery
- **Litestream:** Background streaming replication pushes WAL frames to a private Cloudflare R2 bucket (`BACKUP_R2_BUCKET`) every 5 seconds.
- **Restore drill:** Automated snapshot integrity drill (`npm run restore:drill -w server`) runs `PRAGMA integrity_check` on isolated temp databases.

### Media & Assets
- **Original & Renditions:** Processed using Sharp into responsive WebP/JPG sizes.
- **Object Storage:** Synced to Cloudflare R2 public bucket for fast CDN caching.
- **Garbage Collection:** Background jobs periodically sweep and purge unattached orphan media rows and files.

---

## 4. Key Subsystems

### Moda (مودة) Stylist Chat
- Hybrid AI rules engine + optional LLM brain (via Cloudflare Workers AI / Anthropic Claude).
- Handles style guidance, occasion intent clarification, and localized budget queries.

### Visual Search & Computer Vision
- CLIP embeddings model executed locally via ONNX Runtime / HuggingFace Transformers, falling back gracefully to colour-histogram ranking when models are offline.

### Point of Sale (POS) & Cashier Sync
- Offline-capable cashier interface utilizing client-side IndexedDB (`twist-pos`).
- Sync queue pushes sales to the `/api/cashier/v1` API with optimistic local inventory reduction and JSON export for disaster recovery.

---

## 5. Security & Isolation Controls

1. **Strict Store Isolation (Multi-Tenancy):**
   - Every query mutating products, orders, categories, or cashier sync is explicitly scoped by authenticated `store_id`.
2. **Revocable Sessions:**
   - Both merchant `users` and consumer `buyers` maintain a `token_version` checked on each request. Changing passwords or logging out increments `token_version` to immediately invalidate all existing JWTs.
3. **Admin Surface Hardening:**
   - Platform admin requires `ADMIN_KEY` + 2FA TOTP in production, strict IP allowlisting, and anti-replay protection.
4. **Resilient HTTP Client:**
   - External webhook and provider calls use `fetchWithRetry` with exponential backoff, jitter, timeouts, and per-service circuit breakers.
