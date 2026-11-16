/**
 * Persistent SQLite-backed sliding-window rate limiter.
 * Survives process restarts, supports clearing on successful authentication,
 * and periodically prunes expired rows.
 */
import { q } from '../db/index.js';
import { AppError } from './errors.js';

let lastPruneAt = 0;
const PRUNE_INTERVAL_MS = 5 * 60e3;
const MAX_WINDOW_MS = 24 * 3600e3;

function maybePrune(now) {
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
  } = {},
) {
  const now = Date.now();
  maybePrune(now);
  const cutoff = now - windowMs;
  q.run('DELETE FROM rate_limits WHERE bucket=? AND ts < ?', [bucket, cutoff]);
  const count = Number(q.val('SELECT COUNT(*) FROM rate_limits WHERE bucket=? AND ts >= ?', [bucket, cutoff]) || 0);
  if (count >= max) {
    throw new AppError(429, code, message);
  }
  if (record) {
    q.run('INSERT INTO rate_limits (bucket, ts) VALUES (?, ?)', [bucket, now]);
  }
  return count + (record ? 1 : 0);
}

export function recordRateLimitHit(bucket) {
  const now = Date.now();
  q.run('INSERT INTO rate_limits (bucket, ts) VALUES (?, ?)', [bucket, now]);
}

export function clearRateLimit(bucket) {
  q.run('DELETE FROM rate_limits WHERE bucket=?', [bucket]);
}

export function rateLimitMiddleware({
  prefix,
  max = 30,
  windowMs = 60e3,
  keyFn = (req) => req.ip || 'unknown',
  code = 'rate_limited',
  message = 'Too many requests. Please try again shortly.',
}) {
  return (req, _res, next) => {
    try {
      const key = `${prefix}:${keyFn(req)}`;
      checkRateLimit(key, { max, windowMs, record: true, code, message });
      next();
    } catch (err) {
      next(err);
    }
  };
}
