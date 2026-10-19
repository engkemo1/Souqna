import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_DEPARTMENTS } from '@souqna/shared';
import { config } from '../config.js';

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });

export const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
db.exec(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
// Lightweight migrations for databases created by earlier versions.
{
  const cols = db.prepare('PRAGMA table_info(stores)').all().map((c) => c.name);
  if (!cols.includes('auto_whatsapp')) db.exec('ALTER TABLE stores ADD COLUMN auto_whatsapp INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('sort_order')) db.exec('ALTER TABLE stores ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('return_days')) db.exec('ALTER TABLE stores ADD COLUMN return_days INTEGER NOT NULL DEFAULT 3');
  if (!cols.includes('hidden')) db.exec('ALTER TABLE stores ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('search_indexable')) db.exec('ALTER TABLE stores ADD COLUMN search_indexable INTEGER NOT NULL DEFAULT 1');
  if (!db.prepare("SELECT 1 FROM app_settings WHERE key='seo_indexability_bootstrapped'").get()) {
    // Existing catalogue rows are the known demo stores. New stores keep the column default (indexable).
    db.exec('UPDATE stores SET search_indexable=0');
    db.prepare("INSERT INTO app_settings (key, value) VALUES ('seo_indexability_bootstrapped', '1')").run();
  }
  if (!cols.includes('map_url')) db.exec('ALTER TABLE stores ADD COLUMN map_url TEXT');
  if (!cols.includes('opens_at')) db.exec('ALTER TABLE stores ADD COLUMN opens_at TEXT');
  if (!cols.includes('closes_at')) db.exec('ALTER TABLE stores ADD COLUMN closes_at TEXT');
  if (!cols.includes('day_off')) db.exec('ALTER TABLE stores ADD COLUMN day_off INTEGER');
  if (!cols.includes('departments')) db.exec("ALTER TABLE stores ADD COLUMN departments TEXT NOT NULL DEFAULT ''");
  if (!cols.includes('delivery_mode')) db.exec("ALTER TABLE stores ADD COLUMN delivery_mode TEXT NOT NULL DEFAULT 'store'");
  if (!cols.includes('hero_mode')) db.exec("ALTER TABLE stores ADD COLUMN hero_mode TEXT NOT NULL DEFAULT 'auto'");
  if (!cols.includes('logo_initials')) db.exec("ALTER TABLE stores ADD COLUMN logo_initials TEXT NOT NULL DEFAULT ''");
  if (!cols.includes('logo_color')) db.exec("ALTER TABLE stores ADD COLUMN logo_color TEXT NOT NULL DEFAULT '#1B1B1B'");
  if (!cols.includes('same_day_date')) db.exec('ALTER TABLE stores ADD COLUMN same_day_date TEXT');
  if (!cols.includes('same_day_until')) db.exec("ALTER TABLE stores ADD COLUMN same_day_until TEXT NOT NULL DEFAULT '18:00'");
  if (!cols.includes('customization_json')) db.exec("ALTER TABLE stores ADD COLUMN customization_json TEXT NOT NULL DEFAULT '{}'");
  db.exec("UPDATE stores SET departments=',' || category || ',' WHERE departments='' AND category NOT IN ('mixed','')");
  const mcols = db.prepare('PRAGMA table_info(media)').all().map((c) => c.name);
  if (!mcols.includes('remote')) db.exec('ALTER TABLE media ADD COLUMN remote INTEGER NOT NULL DEFAULT 0');
  const dcols = db.prepare('PRAGMA table_info(departments)').all().map((c) => c.name);
  if (!dcols.includes('image')) db.exec('ALTER TABLE departments ADD COLUMN image TEXT');
  const pcols = db.prepare('PRAGMA table_info(products)').all().map((c) => c.name);
  if (!pcols.includes('department')) db.exec('ALTER TABLE products ADD COLUMN department TEXT');
  if (!pcols.includes('style_level')) db.exec('ALTER TABLE products ADD COLUMN style_level INTEGER'); // درجة الرسمية 1-5 اللي صاحب المحل حددها لمودة (فاضي = تلقائي)
  if (!pcols.includes('badge_text')) db.exec('ALTER TABLE products ADD COLUMN badge_text TEXT'); // شارة مخصصة على كارت المنتج (مثلاً: قطن مصري 100%)
  if (!pcols.includes('badge_tone')) db.exec('ALTER TABLE products ADD COLUMN badge_tone TEXT');
  if (!pcols.includes('audience')) db.exec('ALTER TABLE products ADD COLUMN audience TEXT'); // الفئة: men|women|boys|girls|kids|unisex (فاضي = مستنتج من الاسم)
  if (!pcols.includes('moda_key')) db.exec('ALTER TABLE products ADD COLUMN moda_key TEXT'); // نوع القطعة الصريح لمحرك مودة (فاضي = تلقائي)
  // Single-department stores: their products belong to that department.
  db.exec(`UPDATE products SET department = (SELECT TRIM(s.departments, ',') FROM stores s WHERE s.id = products.store_id)
           WHERE department IS NULL AND (SELECT LENGTH(s.departments) - LENGTH(REPLACE(s.departments, ',', '')) FROM stores s WHERE s.id = products.store_id) = 2`);
  const slcols = db.prepare('PRAGMA table_info(shared_looks)').all().map((c) => c.name);
  if (!slcols.includes('kind')) db.exec("ALTER TABLE shared_looks ADD COLUMN kind TEXT NOT NULL DEFAULT 'look'");
  // visual search: one-time move of the old single-vector table into visual_vectors (multi-photo, multi-model)
  if (!db.prepare('SELECT 1 FROM visual_vectors LIMIT 1').get() && db.prepare('SELECT 1 FROM product_vectors LIMIT 1').get()) {
    db.exec(`INSERT OR IGNORE INTO visual_vectors (product_id, model, slot, media_id, vec, hist)
             SELECT v.product_id, v.model, 'm' || v.media_id, v.media_id, v.vec, c.hist FROM product_vectors v LEFT JOIN product_colors c ON c.product_id = v.product_id`);
    db.exec('DELETE FROM product_vectors');
  }
  const ocols = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
  if (!ocols.includes('delivery_by')) db.exec("ALTER TABLE orders ADD COLUMN delivery_by TEXT NOT NULL DEFAULT 'store'");
  if (!ocols.includes('handoff_at')) db.exec('ALTER TABLE orders ADD COLUMN handoff_at TEXT');
  if (!ocols.includes('platform_discount')) db.exec('ALTER TABLE orders ADD COLUMN platform_discount INTEGER NOT NULL DEFAULT 0');
  if (!ocols.includes('buyer_id')) db.exec('ALTER TABLE orders ADD COLUMN buyer_id INTEGER');
  if (!ocols.includes('track_token')) db.exec('ALTER TABLE orders ADD COLUMN track_token TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_track_token ON orders(track_token) WHERE track_token IS NOT NULL');
  // Backfill tracking links for orders placed before this feature.
  for (const row of db.prepare('SELECT id FROM orders WHERE track_token IS NULL').all()) {
    db.prepare('UPDATE orders SET track_token=? WHERE id=?').run(crypto.randomBytes(12).toString('base64url'), row.id);
  }
  const ucols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!ucols.includes('setup_token_hash')) db.exec('ALTER TABLE users ADD COLUMN setup_token_hash TEXT');
  if (!ucols.includes('setup_expires')) db.exec('ALTER TABLE users ADD COLUMN setup_expires TEXT');
}

{
  // Seed the default departments once (the admin manages them afterwards).
  if (!db.prepare('SELECT COUNT(*) AS c FROM departments').get().c) {
    const ins = db.prepare('INSERT OR IGNORE INTO departments (slug, name_ar, name_en, sizes_json, sort) VALUES (?,?,?,?,?)');
    DEFAULT_DEPARTMENTS.forEach((d, i) => ins.run(d.slug, d.ar, d.en, JSON.stringify(d.sizes), i));
  }
  // أقسام اتضافت بعد أول إطلاق (عطور ومكياج، عنايات، حوامل) وكانت ظاهرة في الموقع بس: بتتضاف مرة واحدة عشان تظهر في الأدمن. لو الأدمن حذفها ما بترجعش.
  try {
    if (!db.prepare("SELECT 1 FROM app_settings WHERE key='departments_added_v2'").get()) {
      const ins2 = db.prepare('INSERT OR IGNORE INTO departments (slug, name_ar, name_en, sizes_json, sort) VALUES (?,?,?,?,?)');
      let next = db.prepare('SELECT COALESCE(MAX(sort), -1) + 1 AS n FROM departments').get().n;
      for (const slug of ['perfume_makeup', 'care', 'maternity']) {
        const d = DEFAULT_DEPARTMENTS.find((x) => x.slug === slug);
        if (d) ins2.run(d.slug, d.ar, d.en, JSON.stringify(d.sizes), next++);
      }
      db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('departments_added_v2', '1')").run();
    }
  } catch { /* الجدول لسه مش جاهز: هنحاول في التشغيل الجاي */ }
}

const cache = new Map();
const stmt = (sql) => {
  let s = cache.get(sql);
  if (!s) { s = db.prepare(sql); cache.set(sql, s); }
  return s;
};

/** Plain-object rows (node:sqlite returns null-prototype objects). */
const plain = (r) => (r ? { ...r } : r);

const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v);
const args = (p) => (Array.isArray(p) ? p.map(norm) : [Object.fromEntries(Object.entries(p).map(([k, v]) => [k, norm(v)]))]);

export const q = {
  all: (sql, params = []) => stmt(sql).all(...args(params)).map(plain),
  get: (sql, params = []) => plain(stmt(sql).get(...args(params))),
  run: (sql, params = []) => stmt(sql).run(...args(params)),
  val: (sql, params = []) => { const r = stmt(sql).get(...args(params)); return r ? Object.values(r)[0] : null; },
};

/** INSERT from an object — undefined keys are skipped. Returns new id. */
export function insert(table, obj) {
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
  const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
  return Number(q.run(sql, keys.map((k) => obj[k])).lastInsertRowid);
}

/** UPDATE by id from an object — undefined keys are skipped. */
export function update(table, id, obj, where = '') {
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
  if (!keys.length) return 0;
  const sql = `UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=? ${where}`;
  return q.run(sql, [...keys.map((k) => obj[k]), id]).changes;
}

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export const json = (s, fallback) => {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
};
