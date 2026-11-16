# Twist Store — Operations Runbook

This runbook covers the most common operational tasks for **Twist Store** running on `twistegy.com`.

> [!IMPORTANT]
> All destructive operations (password resets, store disables, manual DB edits) must be logged in the `admin_audit` table automatically by the application, or manually in the team's incident log.

---

## Table of Contents

1. [First Deployment](#1-first-deployment)
2. [Routine Deployment (redeploy)](#2-routine-deployment-redeploy)
3. [Rollback](#3-rollback)
4. [Database Restore Drill](#4-database-restore-drill)
5. [Secret Rotation](#5-secret-rotation)
6. [Store Disable / Enable](#6-store-disable--enable)
7. [Incident Response](#7-incident-response)
8. [Health & Monitoring](#8-health--monitoring)

---

## 1. First Deployment

### Prerequisites

- Docker + Docker Compose v2 installed on the server.
- DNS A record for `twistegy.com` and `www.twistegy.com` pointing to the server IP.
- Ports 80, 443, and 443/UDP (HTTP/3) open on the firewall.
- Two Cloudflare R2 buckets:
  - **Public** bucket (e.g. `banha-media`) for product photos.
  - **Private** bucket (e.g. `banha-backups`) for Litestream database replication.

### Steps

```bash
# 1. Clone the repository and check out the prod-hardening branch.
git clone https://github.com/your-org/souqna.git
cd souqna
git checkout prod-hardening

# 2. Copy the env template and fill in all required values.
cp .env.example .env
# Edit .env — set at minimum:
#   JWT_SECRET, ADMIN_KEY, ADMIN_TOTP_SECRET,
#   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL,
#   BACKUP_R2_BUCKET, NODE_ENV=production, ALLOW_EMPTY_DB=1 (first boot only)

# 3. Generate ADMIN_TOTP_SECRET if you have not yet.
#    (Run against a local test DB; the script only reads/writes app_settings)
npm run admin-totp -w server
# → Copy the printed ADMIN_TOTP_SECRET= line into .env
# → Scan the QR code with your authenticator app

# 4. Build the image.
docker compose build

# 5. Start the stack. Caddy will obtain a TLS certificate automatically.
docker compose up -d

# 6. Verify health.
curl https://twistegy.com/api/health    # → {"ok":true,"status":"alive"}
curl https://twistegy.com/api/ready     # → {"ok":true,"status":"ready","db":true}

# 7. After the first boot with Litestream running, verify R2 replication:
#    Open the Cloudflare R2 console → banha-backups → litestream/souqna/
#    You should see WAL segment files appear within a minute.
#    Once confirmed, remove ALLOW_EMPTY_DB=1 from .env and redeploy.
```

---

## 2. Routine Deployment (redeploy)

```bash
# Pull the latest code.
git pull origin prod-hardening

# Rebuild and restart with zero downtime (Caddy keeps accepting traffic
# until the new container passes its health check).
docker compose build app
docker compose up -d --no-deps app

# Verify.
curl https://twistegy.com/api/ready
docker compose logs --tail=50 app
```

---

## 3. Rollback

```bash
# Roll back to the previous Docker image tag.
docker compose stop app
docker compose run --rm app sh -c "docker tag twist-store:previous twist-store:latest"
docker compose up -d --no-deps app
```

Or roll back the git tag and rebuild:

```bash
git checkout <previous-commit>
docker compose build app
docker compose up -d --no-deps app
```

---

## 4. Database Restore Drill

Run this drill **at least monthly** to verify the Litestream replica is restorable.

```bash
# 1. Run the automated drill (creates a temp copy, checks integrity, removes it).
npm run restore:drill -w server

# Expected output:
# [restore-drill] SUCCESS: { "ok": true, "integrity": "ok", "counts": { ... } }

# 2. Manual drill (restores into /tmp and opens with sqlite3).
litestream restore \
  -config /etc/litestream.yml \
  -if-replica-exists \
  /tmp/souqna-drill.db
sqlite3 /tmp/souqna-drill.db "PRAGMA integrity_check; SELECT COUNT(*) FROM stores;"
rm /tmp/souqna-drill.db
```

---

## 5. Secret Rotation

### JWT_SECRET

Rotating `JWT_SECRET` **immediately invalidates all owner sessions** (they will be asked to log in again).

```bash
# Generate a new secret.
openssl rand -hex 32   # copy the output

# Update .env:  JWT_SECRET=<new-value>

# Redeploy.
docker compose up -d --no-deps app
```

### ADMIN_KEY

```bash
# Generate a new key.
openssl rand -hex 24   # copy the output

# Update .env:  ADMIN_KEY=<new-value>

# Redeploy.
docker compose up -d --no-deps app
```

### ADMIN_TOTP_SECRET

Rotating TOTP requires you to re-enrol your authenticator app.

```bash
npm run admin-totp -w server   # generates a new secret + QR code
# Update .env:  ADMIN_TOTP_SECRET=<new-value>
# Scan the new QR code with your authenticator app.
# Redeploy.
docker compose up -d --no-deps app
```

### Store Owner Password Reset

```bash
# Reset to a new random password (printed once; forces must_change_password).
npm run set-password -w server -- <owner-email@example.com>

# Or set a specific password.
npm run set-password -w server -- <owner-email@example.com> --password "NewP@ssw0rd!"
```

---

## 6. Store Disable / Enable

Disabling a store hides it from the marketplace and prevents new orders.  
Use the admin dashboard at `https://twistegy.com/admin` or the API:

```bash
# Disable store (replace <slug> and <ADMIN_KEY>).
curl -X PATCH https://twistegy.com/api/admin/stores/<slug> \
  -H "x-admin-key: <ADMIN_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"is_active": false}'

# Re-enable store.
curl -X PATCH https://twistegy.com/api/admin/stores/<slug> \
  -H "x-admin-key: <ADMIN_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"is_active": true}'
```

---

## 7. Incident Response

### App not responding

```bash
# Check container status.
docker compose ps
docker compose logs --tail=100 app

# Check health endpoints.
curl -v http://localhost:10000/api/health
curl -v http://localhost:10000/api/ready

# Restart.
docker compose restart app
```

### Database corruption

```bash
# 1. Stop the app immediately.
docker compose stop app

# 2. Check integrity on the live database.
sqlite3 /path/to/souqna.db "PRAGMA integrity_check;"

# 3. If corrupted, restore from Litestream.
litestream restore -config /etc/litestream.yml /tmp/souqna-restored.db
sqlite3 /tmp/souqna-restored.db "PRAGMA integrity_check;"
# If OK, replace the live DB.
mv /path/to/souqna.db /path/to/souqna.db.corrupt-$(date +%Y%m%d%H%M%S)
cp /tmp/souqna-restored.db /path/to/souqna.db

# 4. Restart.
docker compose start app
```

### Disk full

```bash
# Check disk usage.
df -h
du -sh /path/to/data/*

# Purge orphan media (unattached uploads older than 24 h).
curl -X POST https://twistegy.com/api/admin/media/purge-orphans \
  -H "x-admin-key: <ADMIN_KEY>"

# Purge old daily backups beyond BACKUP_KEEP_DAYS.
# (Handled automatically by the backup job, but can be forced manually.)
find /path/to/backups -name "*.sql.gz" -mtime +14 -delete
```

---

## 8. Health & Monitoring

| Endpoint | Auth | Description |
|---|---|---|
| `GET /api/health` | None | Liveness probe — always returns `200` if the process is alive. |
| `GET /api/ready` | None | Readiness probe — `200` when DB is open and migrations applied; `503` during startup or DB failure. |
| `GET /api/version` | None | Build info: name, version, commit SHA, Node version. |
| `GET /api/admin/metrics` | `x-admin-key` | JSON metrics: request counts, latency p95, DB size, job statuses. |
| `GET /api/admin/metrics?format=prometheus` | `x-admin-key` | Prometheus text exposition for scraping. |
| `GET /api/admin/status` | `x-admin-key` | Platform health checks: JWT strength, backup recency, offsite replication, TOTP, demo passwords. |

### Prometheus scrape config

```yaml
scrape_configs:
  - job_name: twist_store
    static_configs:
      - targets: ['twistegy.com']
    metrics_path: /api/admin/metrics
    params:
      format: [prometheus]
    bearer_token: '<ADMIN_KEY>'
    scheme: https
    scrape_interval: 60s
```
