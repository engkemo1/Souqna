/**
 * Hybrid rate limiter:
 * 1. Persistent SQLite-backed for auth-critical buckets (login, otp, change-password, admin).
 *    Survives restarts and syncs failure counters.
 * 2. In-memory sliding window for general public API endpoints (search, products, orders, etc.)
 *    to eliminate SQLite WAL writes and replication overhead.
 */
import { q } from '../db/index.js';
import { AppError } from './errors.js';

let lastPruneAt = 0;
const PRUNE_INTERVAL_MS = 5 * 60e3;
const MAX_WINDOW_MS = 3600e3; // 1 hour max retention
const MAX_ROWS_PER_BUCKET = 50;

// In-memory sliding window store: bucket -> number[] (timestamps)
const memBuckets = new Map();
let lastMemPrune = Date.now();

function pruneMemory(now) {
  if (now - lastMemPrune < 60e3) return;
  lastMemPrune = now;
  for (const [key, timestamps] of memBuckets.entries()) {
    const valid = timestamps.filter((t) => now - t < 3600e3);
    if (!valid.length) memBuckets.delete(key);
    else memBuckets.set(key, valid);
  }
}

function isAuthCritical(bucket) {
  const b = String(bucket).toLowerCase();
  return (
    b.startsWith('auth:') ||
    b.startsWith('admin:') ||
    b.startsWith('otp:') ||
    b.includes('login') ||
    b.includes('password') ||
    b.includes('forgot')
  );
}

function maybePruneSqlite(now) {
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = now;
  try {
    q.run('DELETE FROM rate_limits WHERE ts < ?', [now - MAX_WINDOW_MS]);
  } catch {
    /* ignore prune errors */
  }
}

export function checkRateLimit(
  bucket,
  {
    max = 10,
    windowMs = 10 * 60e3,
    record = true,
    code = 'too_many_attempts',
    message = 'Too many attempts. Please wait a few minutes.',
    persistent = undefined,
  } = {},
) {
  const now = Date.now();
  const cutoff = now - windowMs;
  const useSqlite = persistent !== undefined ? Boolean(persistent) : isAuthCritical(bucket);

  if (!useSqlite) {
    // In-memory token bucket / sliding window
    pruneMemory(now);
    const list = memBuckets.get(bucket) || [];
    const recent = list.filter((ts) => ts >= cutoff);
    if (recent.length >= max) {
      throw new AppError(429, code, message);
    }
    if (record) {
      recent.push(now);
      if (recent.length > MAX_ROWS_PER_BUCKET) recent.shift();
      memBuckets.set(bucket, recent);
    }
    return recent.length;
  }

  // SQLite-backed for auth-critical
  maybePruneSqlite(now);
  const count = Number(
    q.val('SELECT COUNT(*) FROM rate_limits WHERE bucket=? AND ts >= ?', [bucket, cutoff]) || 0,
  );
  if (count >= max) {
    throw new AppError(429, code, message);
  }
  if (record) {
    q.run('INSERT INTO rate_limits (bucket, ts) VALUES (?, ?)', [bucket, now]);
    // Cap rows per bucket if it accumulates too many records
    if (count >= MAX_ROWS_PER_BUCKET) {
      q.run(
        'DELETE FROM rate_limits WHERE id IN (SELECT id FROM rate_limits WHERE bucket=? ORDER BY ts ASC LIMIT 5)',
        [bucket],
      );
    }
  }
  return count + (record ? 1 : 0);
}

export function recordRateLimitHit(bucket, { persistent = undefined } = {}) {
  const now = Date.now();
  const useSqlite = persistent !== undefined ? Boolean(persistent) : isAuthCritical(bucket);
  if (!useSqlite) {
    const list = memBuckets.get(bucket) || [];
    list.push(now);
    if (list.length > MAX_ROWS_PER_BUCKET) list.shift();
    memBuckets.set(bucket, list);
    return;
  }
  q.run('INSERT INTO rate_limits (bucket, ts) VALUES (?, ?)', [bucket, now]);
}

export function clearRateLimit(bucket) {
  memBuckets.delete(bucket);
  q.run('DELETE FROM rate_limits WHERE bucket=?', [bucket]);
}

export function rateLimitMiddleware({
  prefix,
  max = 30,
  windowMs = 60e3,
  keyFn = (req) => req.ip || 'unknown',
  code = 'rate_limited',
  message = 'Too many requests. Please try again shortly.',
  persistent = undefined,
}) {
  return (req, _res, next) => {
    try {
      const key = `${prefix}:${keyFn(req)}`;
      checkRateLimit(key, { max, windowMs, record: true, code, message, persistent });
      next();
    } catch (err) {
      next(err);
    }
  };
}
