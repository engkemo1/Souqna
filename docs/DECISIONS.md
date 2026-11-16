# Architecture & Engineering Decisions (`DECISIONS.md`)

This document records autonomous engineering decisions made while hardening Twist Store (`souqna`) for production.

## ADR-001: Preserve Existing Working Tree Changes on `prod-hardening`
- **Context:** When starting Phase 0, the repository had uncommitted improvements to the Moda/Twila stylist engine (`server/src/lib/moda/*`, `server/tests/s28..s34`) and `web/src/App.jsx`.
- **Decision:** Branch `prod-hardening` directly from the working state without discarding any existing work, and isolate production-hardening commits cleanly by concern.

## ADR-002: Session Revocation via `token_version` + Dual Auth Transport (Cookie + Bearer)
- **Context:** The owner dashboard and offline-capable POS (`/pos`) currently store the JWT in `localStorage` and send `Authorization: Bearer <token>`. Switching exclusively to cookies without Bearer support could break offline POS sync or mobile PWA flows.
- **Decision:**
  1. Add `token_version INTEGER NOT NULL DEFAULT 1` to both `users` and `buyers` tables.
  2. Embed `tv` (`token_version`) in every signed JWT and verify `user.token_version === payload.tv` on every authenticated request. Incrementing `token_version` on password change, account disable, or `POST /api/auth/logout-all` revokes all active tokens immediately.
  3. Set an `HttpOnly; Secure; SameSite=Lax` cookie on login/refresh **and** continue accepting `Authorization: Bearer` so existing SPA and offline POS clients work seamlessly with zero regression.

## ADR-003: SQLite-Backed Rate Limiting
- **Context:** Rate limiting was scattered across multiple in-memory `Map` instances that reset on restart and counted successful logins.
- **Decision:** Implement a unified, zero-external-dependency SQLite-backed sliding-window rate limiter (`rate_limits` table in `server/src/lib/rate-limit.js`) with automatic periodic cleanup of expired windows, avoiding Redis infrastructure overhead while persisting across restarts.

## ADR-004: Canonical Deployment Target — Docker Compose + Caddy + Litestream R2
- **Context:** The repo contained conflicting references to Render Free (`render.yaml`), Railway, and a VPS (`/opt/sewqna`). Render Free sleeps and has an ephemeral filesystem unsuitable for SQLite.
- **Decision:** Standardize on the single-container Docker image running under `docker-compose.yml` (compatible with any Linux VPS or Railway container) fronted by Caddy for automatic HTTPS/HSTS/compression, with Litestream streaming SQLite WAL to a private Cloudflare R2 bucket. Mark `render.yaml` clearly as non-production/deprecated.
