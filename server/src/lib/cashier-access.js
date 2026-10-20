import { q, tx } from '../db/index.js';

/**
 * Who may use the cashier integration, and until when.
 *   platform switch (app_settings.cashier_sync_enabled)  -> kill switch for everyone
 *   store link status: none | pending | active | paused   -> set by the platform admin
 *   subscription dates: starts_at / ends_at (+ grace_days) -> independent of the main Twist subscription
 * States: off, pending, paused, active, grace (past the end date but inside the grace days: still works), expired.
 * Expiry only stops syncing. Nothing is ever deleted, and the admin can still import files and read the log.
 */
export const DEFAULT_GRACE_DAYS = 7;

export const todayCairo = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });

const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function addMonths(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

export function platformSwitchOn() {
  return q.get("SELECT value FROM app_settings WHERE key='cashier_sync_enabled'")?.value === '1';
}

export function cashierAccess(storeId, today = todayCairo()) {
  const link = q.get('SELECT status, starts_at AS startsAt, ends_at AS endsAt, grace_days AS graceDays FROM store_cashier_links WHERE store_id=?', [storeId]);
  const base = { endsAt: link?.endsAt || null, startsAt: link?.startsAt || null, graceDays: link?.graceDays ?? DEFAULT_GRACE_DAYS };
  const done = (state) => ({ state, allowed: state === 'active' || state === 'grace', ...base });
  if (!platformSwitchOn() || !link || link.status === 'none') return done('off');
  if (link.status === 'pending') return done('pending');
  if (link.status === 'paused') return done('paused');
  if (link.startsAt && today < link.startsAt) return done('pending');
  if (!link.endsAt || today <= link.endsAt) return done('active');
  if (today <= addDays(link.endsAt, link.graceDays ?? DEFAULT_GRACE_DAYS)) return done('grace');
  return done('expired');
}

/** What the store owner's dashboard may know. */
export const cashierActiveFor = (storeId) => cashierAccess(storeId).allowed;

/** Record a payment and push the end date forward. Returns the new end date. */
export function extendSubscription(storeId, { months, amount = 0, note = '' }, today = todayCairo()) {
  return tx(() => {
    const link = q.get('SELECT status, starts_at AS startsAt, ends_at AS endsAt FROM store_cashier_links WHERE store_id=?', [storeId]);
    if (!link) { const e = new Error('Choose a cashier system for this store first.'); e.code = 'no_link'; throw e; }
    const from = link.endsAt && link.endsAt >= today ? link.endsAt : today;
    const endsAt = addMonths(from, months);
    q.run('INSERT INTO cashier_subscription_periods(store_id, months, amount, covered_from, covered_through, note) VALUES(?,?,?,?,?,?)', [storeId, months, amount, from, endsAt, note]);
    q.run("UPDATE store_cashier_links SET ends_at=?, starts_at=COALESCE(starts_at, ?), status=CASE WHEN status='pending' THEN 'active' ELSE status END, updated_at=datetime('now') WHERE store_id=?", [endsAt, today, storeId]);
    return endsAt;
  });
}

export const subscriptionHistory = (storeId) => q.all(
  'SELECT id, months, amount, covered_from AS coveredFrom, covered_through AS coveredThrough, note, created_at AS createdAt FROM cashier_subscription_periods WHERE store_id=? ORDER BY id DESC LIMIT 20', [storeId]);
