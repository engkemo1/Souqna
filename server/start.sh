#!/bin/sh
# Container entrypoint. Keeps the database in Cloudflare R2 so a redeploy never loses data:
#   1) disk empty -> restore the latest replica from R2 (abort on any error; never fall back to demo data silently)
#   2) verify database exists or ALLOW_EMPTY_DB=1 is explicitly set in production
#   3) run the app under Litestream, which streams every change to R2 within seconds
set -eu

export DB_FILE="${DB_FILE:-/app/server/data/souqna.db}"
export LS_KEY_ID="${BACKUP_R2_ACCESS_KEY_ID:-${R2_ACCESS_KEY_ID:-}}"
export LS_SECRET="${BACKUP_R2_SECRET_ACCESS_KEY:-${R2_SECRET_ACCESS_KEY:-}}"
CMD="npm run boot -w server"

run_catalog() {
  [ "${CATALOG_MIGRATE:-}" = "yes" ] || return 0
  [ -f "$DB_FILE" ] || { echo "[catalog] no database yet - nothing to migrate"; return 0; }
  echo "[catalog] CATALOG_MIGRATE=yes - rehearsing on a copy first"
  if npm run catalog -w server -- test --db "$DB_FILE" && CONFIRM_CATALOG_MIGRATION=yes npm run catalog -w server -- apply --db "$DB_FILE" --approved-by "${CATALOG_APPROVED_BY:-owner}"; then
    echo "[catalog] migration applied and verified"
  else
    echo "[catalog] migration did NOT run or was rolled back - the database is unchanged; starting on the existing sections"
  fi
}

if [ -n "${BACKUP_R2_BUCKET:-}" ] && [ -n "${R2_ACCOUNT_ID:-}" ] && [ -n "$LS_KEY_ID" ] && [ -n "$LS_SECRET" ] && [ "$BACKUP_R2_BUCKET" != "${R2_BUCKET:-}" ]; then
  if [ ! -f "$DB_FILE" ]; then
    echo "[start] no local database - restoring from R2 (if a replica exists)…"
    litestream restore -if-replica-exists -config /etc/litestream.yml "$DB_FILE"
  fi
  if [ ! -f "$DB_FILE" ] && [ "${NODE_ENV:-}" = "production" ] && [ "${ALLOW_EMPTY_DB:-0}" != "1" ]; then
    echo "[start] FATAL: Restore completed but $DB_FILE does not exist. Set ALLOW_EMPTY_DB=1 only on the very first production deployment." >&2
    exit 1
  fi
  run_catalog
  echo "[start] replicating $DB_FILE to R2 bucket $BACKUP_R2_BUCKET"
  exec litestream replicate -config /etc/litestream.yml -exec "$CMD"
fi

if [ ! -f "$DB_FILE" ] && [ "${NODE_ENV:-}" = "production" ] && [ "${ALLOW_EMPTY_DB:-0}" != "1" ]; then
  echo "[start] FATAL: R2 replication is not configured and $DB_FILE does not exist in production (set ALLOW_EMPTY_DB=1 if intentional)." >&2
  exit 1
fi

echo "[start] WARNING: R2 replication is NOT configured (set BACKUP_R2_BUCKET + R2_* keys). Data on this disk is lost on redeploy unless it is a persistent volume."
run_catalog
exec $CMD
