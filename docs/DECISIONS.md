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

## ADR-005: Client Session Lifecycle, Token Transport, and Forced Password Change (QA-02)
- **Context:**
  1. Storing tokens in `localStorage` leaves sessions vulnerable to client script theft, but purely relying on cookies breaks the offline POS where requests must sync across connection drops.
  2. Tokens expire after 1 hour, causing sudden 401 unhandled errors for long-open dashboards or cashier screens.
  3. Temporary seeded owner passwords require immediate password resets (`must_change_password=1`), returning `403 password_change_required` from the server.
- **Decision:**
  1. **Dual Transport Strategy:** Server sets an `HttpOnly; SameSite=Lax; Path=/api` cookie (`twist_owner_token`) on all login/me/change-password responses. The client app maintains the token in memory/storage to provide `Authorization: Bearer` strictly for offline-capable POS flows and fallback API calls.
  2. **Silent Refresh:** The client `AuthProvider` proactively invokes `GET /api/auth/me` every 30 minutes (~50% of the 1-hour token lifetime) and upon tab focus / visibility restoration (with a 5-minute debounce). This keeps the session fresh indefinitely while the user is actively working.
  3. **Offline POS Resilience:** Unsynced sales queue in IndexedDB (`twist-pos`). If an attempted sync returns 401 due to token expiry, `usePos` flags `authExpired=true` without clearing or discarding any queued sales. The cashier is prompted to re-authenticate, after which the queue automatically flushes to the server.
  4. **Enforced Password Change:** Global API interceptor listens for `403` with `error.code: 'password_change_required'` (or `user.mustChangePassword: true`) and surfaces `ForcedPasswordChangeModal`, blocking navigation until a valid new password is set.
