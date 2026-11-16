/**
 * SQLite-locked background job coordinator with timeout, error isolation, and clean shutdown.
 */
import crypto from 'node:crypto';
import { q, db } from '../db/index.js';

db.exec(`
CREATE TABLE IF NOT EXISTS job_locks (
  name TEXT PRIMARY KEY,
  holder TEXT NOT NULL,
  acquired_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_run_at TEXT,
  last_status TEXT,
  last_error TEXT
)
`);

const INSTANCE_ID = crypto.randomUUID().slice(0, 12);
const activeTimers = new Set();

export function acquireJobLock(name, ttlMs = 60_000, holder = INSTANCE_ID) {
  const now = Date.now();
  const expiresAt = now + ttlMs;
  const res = q.run(
    `INSERT INTO job_locks (name, holder, acquired_at, expires_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET
       holder = excluded.holder,
       acquired_at = excluded.acquired_at,
       expires_at = excluded.expires_at
     WHERE job_locks.expires_at <= ? OR job_locks.holder = ?`,
    [name, holder, now, expiresAt, now, holder],
  );
  return res.changes > 0;
}

export function releaseJobLock(name, holder = INSTANCE_ID, { status = 'ok', error = null } = {}) {
  const nowIso = new Date().toISOString();
  q.run(
    `UPDATE job_locks
     SET expires_at = 0, last_run_at = ?, last_status = ?, last_error = ?
     WHERE name = ? AND holder = ?`,
    [nowIso, status, error ? String(error).slice(0, 300) : null, name, holder],
  );
}

export async function runJobWithLock(name, fn, { ttlMs = 60_000, timeoutMs = 45_000, holder = INSTANCE_ID } = {}) {
  if (!acquireJobLock(name, ttlMs, holder)) {
    return { ran: false, reason: 'locked' };
  }
  let timer;
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => fn()),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Job "${name}" timed out after ${timeoutMs}ms`)), timeoutMs);
        timer.unref?.();
      }),
    ]);
    releaseJobLock(name, holder, { status: 'ok', error: null });
    return { ran: true, result };
  } catch (err) {
    releaseJobLock(name, holder, { status: 'error', error: err?.message || String(err) });
    return { ran: true, error: err?.message || String(err) };
  } finally {
    clearTimeout(timer);
  }
}

export function scheduleManagedInterval(name, fn, intervalMs, opts = {}) {
  const handle = setInterval(() => {
    runJobWithLock(name, fn, opts).catch(() => {});
  }, intervalMs);
  handle.unref?.();
  activeTimers.add(handle);
  return handle;
}

export function stopAllJobs() {
  for (const handle of activeTimers) {
    clearInterval(handle);
    clearTimeout(handle);
  }
  activeTimers.clear();
}

export function listJobStatuses() {
  return q.all('SELECT name, holder, acquired_at, expires_at, last_run_at, last_status, last_error FROM job_locks ORDER BY name');
}
