import crypto from 'node:crypto';
import { q, tx, json } from '../db/index.js';
import { AppError } from './errors.js';
import { normCode, parseQty } from './cashier-table.js';

const MAX_STOCK = 100000;
const MAX_LOG_CHANGES = 300;

/* ------------------------------------------------------------------ store catalogue index */

/** Everything we can match a cashier row against, for one store. */
export function loadIndex(storeId) {
  const variants = q.all(
    `SELECT v.id, v.product_id AS productId, v.sku, v.barcode, v.stock, v.color, v.size, p.name_ar AS name, p.track_stock AS trackStock
       FROM variants v JOIN products p ON p.id=v.product_id WHERE p.store_id=?`, [storeId]);
  const products = q.all(
    `SELECT p.id, p.sku, p.barcode, p.stock, p.name_ar AS name, p.price, p.track_stock AS trackStock,
            (SELECT COUNT(*) FROM variants v WHERE v.product_id=p.id) AS variantCount
       FROM products p WHERE p.store_id=?`, [storeId]);
  const byBarcode = new Map(); const bySku = new Map();
  const add = (map, key, entry) => { if (!key) return; const k = normCode(key); if (!k) return; (map.get(k) || map.set(k, []).get(k)).push(entry); };
  // Pieces reserved online ("reserve & try in store") still sit on the shop's shelf, so the shop's own cashier counts
  // them; on Twist they are already taken out. Without this, a stock update would put a reserved piece back on sale.
  const held = new Map();
  for (const h of q.all(`SELECT i.product_id AS p, i.variant_id AS v, SUM(i.qty) AS n FROM order_items i JOIN orders o ON o.id=i.order_id
      WHERE o.store_id=? AND o.delivery_by='pickup' AND o.status IN ('pending','confirmed') GROUP BY i.product_id, i.variant_id`, [storeId])) held.set(h.v ? `v${h.v}` : `p${h.p}`, h.n);
  for (const v of variants) { const e = { kind: 'variant', ...v, held: held.get(`v${v.id}`) || 0 }; add(byBarcode, v.barcode, e); add(bySku, v.sku, e); }
  for (const p of products) if (!p.variantCount) { const e = { kind: 'product', ...p, held: held.get(`p${p.id}`) || 0 }; add(byBarcode, p.barcode, e); add(bySku, p.sku, e); }
  const productsWithVariants = new Map();
  for (const p of products) if (p.variantCount) { add(productsWithVariants, p.sku, p); add(productsWithVariants, p.barcode, p); }
  return { variants, products, byBarcode, bySku, productsWithVariants };
}

/** barcode first, then sku. Returns { entry } or { skip: reason }. */
function matchKey(index, barcode, sku) {
  const resolve = (raw, map, how) => {
    const k = normCode(raw);
    if (!k) return null;
    const hits = map.get(k);
    if (hits?.length === 1) return { entry: hits[0], how };
    if (hits?.length > 1) return { skip: 'ambiguous' };
    if (index.productsWithVariants.has(k)) return { skip: 'has_variants' };
    return null;
  };
  const byBarcode = resolve(barcode, index.byBarcode, 'barcode');
  const bySku = resolve(sku, index.bySku, 'sku');
  if (byBarcode?.skip || bySku?.skip) return { skip: byBarcode?.skip || bySku?.skip };
  if (byBarcode?.entry && bySku?.entry) {
    const a = byBarcode.entry; const b = bySku.entry;
    if (a.kind !== b.kind || a.id !== b.id) return { skip: 'conflicting_codes' };
  }
  return byBarcode || bySku || { skip: 'not_found' };
}

/* ------------------------------------------------------------------ file import: plan then apply */

/**
 * rows: string[][], mapping: { sku, barcode, stock, price? ... -> column index|null }.
 * Returns the plan without touching the database.
 */
export function planImport(storeId, rows, mapping) {
  if (mapping.stock === null || mapping.stock === undefined) { const e = new Error('Choose the stock column.'); e.code = 'no_stock_column'; throw e; }
  if ((mapping.sku ?? null) === null && (mapping.barcode ?? null) === null) { const e = new Error('Choose a SKU or barcode column to match products.'); e.code = 'no_key_column'; throw e; }
  const index = loadIndex(storeId);
  const cell = (r, f) => (mapping[f] === null || mapping[f] === undefined ? '' : (r[mapping[f]] ?? ''));
  const seen = new Map();
  rows.forEach((r, i) => {
    const k = normCode(cell(r, 'barcode')) || normCode(cell(r, 'sku'));
    if (k) seen.set(k, (seen.get(k) || 0) + 1);
  });
  const changes = []; const skipped = []; const learn = [];
  const touched = new Set();
  let unchanged = 0; let priceDiffs = 0;
  rows.forEach((r, i) => {
    const line = i + 2; // spreadsheet row number (header is row 1)
    const barcode = cell(r, 'barcode'); const sku = cell(r, 'sku');
    const label = String(cell(r, 'name') || sku || barcode);
    const key = normCode(barcode) || normCode(sku);
    if (!key) return skipped.push({ line, label, reason: 'no_key' });
    if (seen.get(key) > 1) return skipped.push({ line, label, reason: 'duplicate_in_file' });
    let qty = parseQty(cell(r, 'stock'));
    if (qty === null) return skipped.push({ line, label, reason: 'bad_quantity' });
    let clamped = false;
    if (qty < 0) { qty = 0; clamped = true; }
    if (qty > MAX_STOCK) return skipped.push({ line, label, reason: 'bad_quantity' });
    const m = matchKey(index, barcode, sku);
    if (m.skip) return skipped.push({ line, label, reason: m.skip });
    const e = m.entry;
    const uid = `${e.kind}:${e.id}`;
    if (touched.has(uid)) return skipped.push({ line, label, reason: 'duplicate_in_file' });
    touched.add(uid);
    if (!e.trackStock) return skipped.push({ line, label, reason: 'not_tracked' });
    if (mapping.price !== null && mapping.price !== undefined && e.price) {
      const pr = parseQty(cell(r, 'price'));
      if (pr !== null && pr !== e.price) priceDiffs++;
    }
    if (e.kind === 'variant' && m.how === 'sku' && normCode(barcode) && !e.barcode && !index.byBarcode.has(normCode(barcode))) learn.push({ variantId: e.id, barcode: String(barcode).trim() });
    const free = Math.max(0, qty - e.held); // pieces reserved online are on the shelf but not free to sell
    if (e.stock === free) { unchanged++; return; }
    changes.push({ kind: e.kind, id: e.id, productId: e.kind === 'variant' ? e.productId : e.id, name: e.name, color: e.color || '', size: e.size || '', from: e.stock, to: free, clamped, line, ...(e.held ? { held: e.held } : {}) });
  });
  return { total: rows.length, changes, skipped, learn, unchanged, priceDiffs };
}

const recomputeProductStock = (productId) => q.run(
  "UPDATE products SET stock=(SELECT COALESCE(SUM(stock),0) FROM variants WHERE product_id=?), updated_at=datetime('now') WHERE id=?", [productId, productId]);

/** Writes the planned stock levels + a log row. Absolute values, so running it twice is harmless. */
export function applyPlan(storeId, plan, { source = 'file', message = '' } = {}) {
  return tx(() => {
    const touchedProducts = new Set();
    for (const c of plan.changes) {
      if (c.kind === 'variant') { q.run('UPDATE variants SET stock=? WHERE id=?', [c.to, c.id]); touchedProducts.add(c.productId); }
      else q.run("UPDATE products SET stock=?, updated_at=datetime('now') WHERE id=?", [c.to, c.id]);
    }
    for (const id of touchedProducts) recomputeProductStock(id);
    for (const l of plan.learn || []) q.run('UPDATE variants SET barcode=? WHERE id=? AND barcode IS NULL', [l.barcode, l.variantId]);
    return writeLog(storeId, {
      source, kind: 'stock', ok: 1, matched: plan.changes.length + plan.unchanged, updated: plan.changes.length, unmatched: plan.skipped.length, message,
      details: { changes: plan.changes.slice(0, MAX_LOG_CHANGES).map(({ kind, id, name, color, size, from, to }) => ({ kind, id, name, color, size, from, to })), skipped: plan.skipped.slice(0, MAX_LOG_CHANGES) },
    });
  });
}

/* ------------------------------------------------------------------ push API (a store's own key) */

export function pushStock(storeId, items) {
  const index = loadIndex(storeId);
  const results = []; const changes = []; const touchedProducts = new Set(); const touchedItems = new Set();
  tx(() => {
    for (const it of items) {
      const label = it.sku || it.barcode || '';
      const counted = Math.min(Math.max(Math.floor(Number(it.stock)), 0), MAX_STOCK);
      if (!Number.isFinite(counted)) { results.push({ ref: label, status: 'bad_quantity' }); continue; }
      const m = matchKey(index, it.barcode, it.sku);
      if (m.skip) { results.push({ ref: label, status: m.skip }); continue; }
      const e = m.entry;
      const itemKey = `${e.kind}:${e.id}`;
      if (touchedItems.has(itemKey)) { results.push({ ref: label, status: 'duplicate_in_request' }); continue; }
      touchedItems.add(itemKey);
      if (!e.trackStock) { results.push({ ref: label, status: 'not_tracked' }); continue; }
      const qty = Math.max(0, counted - e.held); // what is free to sell
      let status = 'unchanged';
      if (e.stock !== qty) {
        status = 'updated';
        if (e.kind === 'variant') { q.run('UPDATE variants SET stock=? WHERE id=?', [qty, e.id]); touchedProducts.add(e.productId); }
        else q.run("UPDATE products SET stock=?, updated_at=datetime('now') WHERE id=?", [qty, e.id]);
        changes.push({ kind: e.kind, id: e.id, name: e.name, color: e.color || '', size: e.size || '', from: e.stock, to: qty });
        e.stock = qty; // later rows of the same request see the new value
      }
      results.push({ ref: label, status });
    }
    for (const id of touchedProducts) recomputeProductStock(id);
    const bad = results.filter((r) => !['updated', 'unchanged'].includes(r.status)).length;
    writeLog(storeId, { source: 'api', kind: 'stock', ok: bad ? 0 : 1, matched: results.length - bad, updated: changes.length, unmatched: bad, message: '', details: { changes: changes.slice(0, MAX_LOG_CHANGES), skipped: results.filter((r) => !['updated', 'unchanged'].includes(r.status)).slice(0, MAX_LOG_CHANGES) } });
  });
  return { results, updated: changes.length };
}

/** A sale (or a return) the cashier already completed. `externalId` makes retries safe. */
export function pushSale(storeId, { externalId, type = 'sale', items }) {
  const requestHash = crypto.createHash('sha256').update(JSON.stringify({ type, items: items.map((i) => ({ sku: normCode(i.sku), barcode: normCode(i.barcode), qty: Math.floor(Number(i.qty)) })).sort((a, b) => `${a.barcode}|${a.sku}|${a.qty}`.localeCompare(`${b.barcode}|${b.sku}|${b.qty}`)) })).digest('hex');
  const dup = q.get('SELECT request_hash AS requestHash, result_json AS resultJson FROM cashier_events WHERE store_id=? AND external_id=?', [storeId, externalId]);
  if (dup) {
    if (dup.requestHash && dup.requestHash !== requestHash) throw new AppError(409, 'external_id_reused', 'رقم العملية اتستخدم قبل كده ببيانات مختلفة.');
    return { ...(json(dup.resultJson, { results: [], applied: 0 }) || {}), duplicate: true };
  }
  const index = loadIndex(storeId);
  const results = []; let applied = 0;
  tx(() => {
    const touchedProducts = new Set();
    for (const it of items) {
      const label = it.sku || it.barcode || '';
      const qty = Math.floor(Number(it.qty));
      if (!Number.isFinite(qty) || qty < 1 || qty > 1000) { results.push({ ref: label, status: 'bad_quantity' }); continue; }
      const m = matchKey(index, it.barcode, it.sku);
      if (m.skip) { results.push({ ref: label, status: m.skip }); continue; }
      const e = m.entry;
      const sign = type === 'return' ? 1 : -1;
      if (e.trackStock) {
        const next = Math.max(0, Math.min(MAX_STOCK, e.stock + sign * qty));
        if (e.kind === 'variant') { q.run('UPDATE variants SET stock=? WHERE id=?', [next, e.id]); touchedProducts.add(e.productId); }
        else q.run('UPDATE products SET stock=? WHERE id=?', [next, e.id]);
        e.stock = next;
      }
      const pid = e.kind === 'variant' ? e.productId : e.id;
      q.run("UPDATE products SET sold_count=MAX(0, sold_count + ?), updated_at=datetime('now') WHERE id=?", [type === 'return' ? -qty : qty, pid]);
      applied++;
      results.push({ ref: label, status: 'applied' });
    }
    for (const id of touchedProducts) recomputeProductStock(id);
    const bad = results.filter((r) => r.status !== 'applied').length;
    writeLog(storeId, { source: 'api', kind: type, ok: bad ? 0 : 1, matched: applied, updated: applied, unmatched: bad, message: externalId.slice(0, 80), details: { skipped: results.filter((r) => r.status !== 'applied') } });
    q.run('INSERT INTO cashier_events(store_id, external_id, kind, request_hash, result_json) VALUES(?,?,?,?,?)', [storeId, externalId, type, requestHash, JSON.stringify({ results, applied })]);
  });
  return { duplicate: false, results, applied };
}

/* ------------------------------------------------------------------ keys, log */

const hashKey = (k) => crypto.createHash('sha256').update(k).digest('hex');

export function createStoreKey(storeId) {
  const key = `cshr_${crypto.randomBytes(24).toString('base64url')}`;
  q.run(`INSERT INTO store_cashier_keys(store_id, key_hash, key_prefix, created_at, last_used_at) VALUES(?,?,?,datetime('now'),NULL)
    ON CONFLICT(store_id) DO UPDATE SET key_hash=excluded.key_hash, key_prefix=excluded.key_prefix, created_at=excluded.created_at, last_used_at=NULL`,
    [storeId, hashKey(key), key.slice(0, 9)]);
  return key; // shown once; only the hash is stored
}
export const revokeStoreKey = (storeId) => q.run('DELETE FROM store_cashier_keys WHERE store_id=?', [storeId]);
export const keyInfo = (storeId) => q.get('SELECT key_prefix AS prefix, created_at AS createdAt, last_used_at AS lastUsedAt FROM store_cashier_keys WHERE store_id=?', [storeId]) || null;

export function storeFromKey(key) {
  if (!key || !key.startsWith('cshr_')) return null;
  const row = q.get('SELECT store_id AS storeId FROM store_cashier_keys WHERE key_hash=?', [hashKey(key)]);
  if (!row) return null;
  q.run("UPDATE store_cashier_keys SET last_used_at=datetime('now') WHERE store_id=?", [row.storeId]);
  return row.storeId;
}

export function writeLog(storeId, { source, kind, ok, matched = 0, updated = 0, unmatched = 0, message = '', details = null }) {
  const id = Number(q.run(
    `INSERT INTO cashier_sync_log(store_id, source, kind, ok, matched, updated, unmatched, message, details_json) VALUES(?,?,?,?,?,?,?,?,?)`,
    [storeId, source, kind, ok ? 1 : 0, matched, updated, unmatched, message, details ? JSON.stringify(details) : null]).lastInsertRowid);
  // keep the log small: newest 200 per store
  q.run('DELETE FROM cashier_sync_log WHERE store_id=? AND id NOT IN (SELECT id FROM cashier_sync_log WHERE store_id=? ORDER BY id DESC LIMIT 200)', [storeId, storeId]);
  return id;
}
export const readLog = (storeId, limit = 30) => q.all(
  'SELECT id, source, kind, ok, matched, updated, unmatched, message, created_at AS createdAt FROM cashier_sync_log WHERE store_id=? ORDER BY id DESC LIMIT ?', [storeId, limit]);
export const readLogDetails = (storeId, id) => {
  const r = q.get('SELECT details_json AS d FROM cashier_sync_log WHERE store_id=? AND id=?', [storeId, id]);
  try { return r?.d ? JSON.parse(r.d) : null; } catch { return null; }
};

/** Refresh the stylist's cached catalogue after stock changes. Loaded lazily so tests don't boot the whole stylist. */
export async function refreshCatalogueCache() {
  if (process.env.NODE_TEST_CONTEXT) return;
  try { (await import('./stylist.js')).invalidateModaCatalogue(); } catch { /* cache refreshes on its own schedule */ }
}
