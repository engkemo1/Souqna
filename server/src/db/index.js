import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_DEPARTMENTS, LEGACY_DEPARTMENTS } from '@souqna/shared';
import { config } from '../config.js';

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });

export const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
db.exec(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
{
  const cols = db.prepare('PRAGMA table_info(pos_sale_items)').all().map((c) => c.name);
  if (!cols.includes('no_return')) db.exec('ALTER TABLE pos_sale_items ADD COLUMN no_return INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('return_until')) db.exec('ALTER TABLE pos_sale_items ADD COLUMN return_until TEXT');
}
{
  const cols = db.prepare('PRAGMA table_info(pos_return_items)').all().map((c) => c.name);
  if (!cols.includes('defective')) db.exec('ALTER TABLE pos_return_items ADD COLUMN defective INTEGER NOT NULL DEFAULT 0');
}
db.exec(`INSERT OR IGNORE INTO app_settings(key,value) VALUES
  ('subscription_monthly_fee','0'),
  ('subscription_reminder_days','5'),
  ('subscription_reminder_template','أهلاً {store}، نذكّرك إن اشتراك متجرك على Twist مستحق بمبلغ {amount} ج.م. موعد التجديد {due_date}. ابعتلنا صورة التحويل أو تواصل معانا لتأكيد الدفع. شكراً لثقتك في Twist.'),
  ('cashier_sync_enabled','0')`);
db.exec('CREATE TABLE IF NOT EXISTS store_slug_aliases (old_slug TEXT PRIMARY KEY, store_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
{
  const eventCols = db.prepare('PRAGMA table_info(cashier_events)').all().map((c) => c.name);
  if (!eventCols.includes('request_hash')) db.exec('ALTER TABLE cashier_events ADD COLUMN request_hash TEXT');
  if (!eventCols.includes('result_json')) db.exec('ALTER TABLE cashier_events ADD COLUMN result_json TEXT');
}
// Lightweight migrations for databases created by earlier versions.
{
  const cols = db.prepare('PRAGMA table_info(stores)').all().map((c) => c.name);
  if (!cols.includes('auto_whatsapp')) db.exec('ALTER TABLE stores ADD COLUMN auto_whatsapp INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('sort_order')) db.exec('ALTER TABLE stores ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('return_days')) db.exec('ALTER TABLE stores ADD COLUMN return_days INTEGER NOT NULL DEFAULT 3');
  if (!cols.includes('reserve_hours')) db.exec('ALTER TABLE stores ADD COLUMN reserve_hours INTEGER NOT NULL DEFAULT 24'); // "reserve & try in store": hold time, 0 = off
  if (!cols.includes('hidden')) db.exec('ALTER TABLE stores ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('show_when_empty')) {
    db.exec('ALTER TABLE stores ADD COLUMN show_when_empty INTEGER NOT NULL DEFAULT 0');
    // one-time: keep the test store(s) visible even while empty
    db.exec("UPDATE stores SET show_when_empty=1 WHERE lower(slug) LIKE '%test%' OR name_ar LIKE '%تجريب%' OR name_ar LIKE '%تجرب%'");
  }
  if (!cols.includes('lat')) db.exec('ALTER TABLE stores ADD COLUMN lat REAL');
  if (!cols.includes('lng')) db.exec('ALTER TABLE stores ADD COLUMN lng REAL');
  // delivery is always done by Twist - no more per-store delivery choice
  db.exec("UPDATE stores SET delivery_mode='platform' WHERE delivery_mode<>'platform'");
  db.exec(`CREATE TABLE IF NOT EXISTS wa_links (out_id TEXT PRIMARY KEY, store_id INTEGER NOT NULL, product_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  { const pc = db.prepare('PRAGMA table_info(products)').all().map((c) => c.name);
    if (!pc.includes('expires_at')) db.exec('ALTER TABLE products ADD COLUMN expires_at INTEGER'); // ms; set for products added by WhatsApp (auto-hidden after it)
    if (!pc.includes('source')) db.exec('ALTER TABLE products ADD COLUMN source TEXT'); }
  { const bc = db.prepare('PRAGMA table_info(buyers)').all().map((c) => c.name);
    if (bc.length && !bc.includes('phone_verified')) db.exec('ALTER TABLE buyers ADD COLUMN phone_verified INTEGER NOT NULL DEFAULT 0'); } // 1 = proved by a WhatsApp code
  db.exec(`CREATE TABLE IF NOT EXISTS wa_otps (phone TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0, sent_at INTEGER NOT NULL)`);
  db.exec(`CREATE TABLE IF NOT EXISTS wa_inbound (id TEXT PRIMARY KEY, from_wa TEXT NOT NULL, type TEXT NOT NULL, body TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  db.exec(`CREATE TABLE IF NOT EXISTS pickup_zones (id INTEGER PRIMARY KEY, key TEXT NOT NULL UNIQUE, name TEXT NOT NULL, fee INTEGER NOT NULL DEFAULT 0 CHECK (fee >= 0 AND fee <= 5000), courier_cost INTEGER NOT NULL DEFAULT 0 CHECK (courier_cost >= 0 AND courier_cost <= 5000), created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  // every store is shown by default, even before it has products (the admin can switch it off per store)
  // the stylist was renamed from «مودة» to «تويلا»: carry over names the admin saved before (only if still the old default)
  db.prepare("UPDATE app_settings SET value='تويلا' WHERE key='stylist_name_ar' AND value='مودة'").run();
  db.prepare("UPDATE app_settings SET value='Twila' WHERE key='stylist_name_en' AND value='Moda'").run();
  if (db.prepare("INSERT OR IGNORE INTO app_settings(key,value) VALUES('show_empty_default_v1','1')").run().changes) db.exec('UPDATE stores SET show_when_empty=1');
  if (!cols.includes('delivery_zone')) db.exec("ALTER TABLE stores ADD COLUMN delivery_zone TEXT NOT NULL DEFAULT ''");
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
  if (!cols.includes('photo_style')) db.exec("ALTER TABLE stores ADD COLUMN photo_style TEXT NOT NULL DEFAULT 'white'");
  if (!cols.includes('customization_json')) db.exec("ALTER TABLE stores ADD COLUMN customization_json TEXT NOT NULL DEFAULT '{}'");
  if (!cols.includes('tiktok')) db.exec('ALTER TABLE stores ADD COLUMN tiktok TEXT');
  db.exec("UPDATE stores SET departments=',' || category || ',' WHERE departments='' AND category NOT IN ('mixed','')");
  const mcols = db.prepare('PRAGMA table_info(media)').all().map((c) => c.name);
  if (!mcols.includes('remote')) db.exec('ALTER TABLE media ADD COLUMN remote INTEGER NOT NULL DEFAULT 0');
  if (!mcols.includes('quality')) db.exec('ALTER TABLE media ADD COLUMN quality INTEGER'); // 0-100 photo quality score (null = older photo)
  if (!mcols.includes('bg_cut')) db.exec('ALTER TABLE media ADD COLUMN bg_cut INTEGER'); // 1 = background replaced, 0 = a plain look was wanted but the real background was kept
  if (!mcols.includes('canvas_v')) db.exec('ALTER TABLE media ADD COLUMN canvas_v INTEGER'); // 2 = made with the product-framing canvas (no bars); null = older
  const dcols = db.prepare('PRAGMA table_info(departments)').all().map((c) => c.name);
  if (!dcols.includes('image')) db.exec('ALTER TABLE departments ADD COLUMN image TEXT');
  const pcols = db.prepare('PRAGMA table_info(products)').all().map((c) => c.name);
  if (!pcols.includes('department')) db.exec('ALTER TABLE products ADD COLUMN department TEXT');
  if (!pcols.includes('no_return')) db.exec('ALTER TABLE products ADD COLUMN no_return INTEGER NOT NULL DEFAULT 0'); // 1 = this piece is not returnable / exchangeable
  if (!pcols.includes('style_level')) db.exec('ALTER TABLE products ADD COLUMN style_level INTEGER'); // درجة الرسمية 1-5 اللي صاحب المحل حددها لتويلا (فاضي = تلقائي)
  if (!pcols.includes('badge_text')) db.exec('ALTER TABLE products ADD COLUMN badge_text TEXT'); // شارة مخصصة على كارت المنتج (مثلاً: قطن مصري 100%)
  if (!pcols.includes('badge_tone')) db.exec('ALTER TABLE products ADD COLUMN badge_tone TEXT');
  if (!pcols.includes('audience')) db.exec('ALTER TABLE products ADD COLUMN audience TEXT'); // الفئة: men|women|boys|girls|kids|unisex (فاضي = مستنتج من الاسم)
  if (!pcols.includes('moda_key')) db.exec('ALTER TABLE products ADD COLUMN moda_key TEXT'); // نوع القطعة الصريح لمحرك تويلا (فاضي = تلقائي)
  // Cashier linking: barcodes (matched together with sku when a cashier file or API call arrives).
  if (!pcols.includes('barcode')) db.exec('ALTER TABLE products ADD COLUMN barcode TEXT');
  const vcols = db.prepare('PRAGMA table_info(variants)').all().map((c) => c.name);
  if (!vcols.includes('barcode')) db.exec('ALTER TABLE variants ADD COLUMN barcode TEXT');
  const clcols = db.prepare('PRAGMA table_info(store_cashier_links)').all().map((x) => x.name);
  if (!clcols.includes('starts_at')) db.exec('ALTER TABLE store_cashier_links ADD COLUMN starts_at TEXT');
  if (!clcols.includes('ends_at')) db.exec('ALTER TABLE store_cashier_links ADD COLUMN ends_at TEXT');
  if (!clcols.includes('grace_days')) db.exec('ALTER TABLE store_cashier_links ADD COLUMN grace_days INTEGER NOT NULL DEFAULT 7');
  db.exec('CREATE INDEX IF NOT EXISTS idx_variants_barcode ON variants(barcode) WHERE barcode IS NOT NULL');
  db.exec('CREATE INDEX IF NOT EXISTS idx_variants_sku ON variants(sku) WHERE sku IS NOT NULL');
  db.exec('CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(store_id, barcode) WHERE barcode IS NOT NULL');
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
  const pcmcols = db.prepare('PRAGMA table_info(pos_cash_movements)').all().map((c) => c.name);
  if (pcmcols.length && !pcmcols.includes('uuid')) db.exec('ALTER TABLE pos_cash_movements ADD COLUMN uuid TEXT'); // same request sent twice = one movement
  if (pcmcols.length) db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_cash_movements_uuid ON pos_cash_movements(store_id, uuid) WHERE uuid IS NOT NULL');
  const pscols = db.prepare('PRAGMA table_info(pos_sales)').all().map((c) => c.name);
  if (pscols.length && !pscols.includes('order_id')) db.exec('ALTER TABLE pos_sales ADD COLUMN order_id INTEGER'); // the store reservation this sale completed
  if (pscols.length && !pscols.includes('shift_id')) db.exec('ALTER TABLE pos_sales ADD COLUMN shift_id INTEGER');
  const prcols = db.prepare('PRAGMA table_info(pos_returns)').all().map((c) => c.name);
  if (prcols.length && !prcols.includes('shift_id')) db.exec('ALTER TABLE pos_returns ADD COLUMN shift_id INTEGER');
  if (!ocols.includes('reserve_until')) db.exec('ALTER TABLE orders ADD COLUMN reserve_until TEXT'); // pickup reservations (delivery_by=\'pickup\'): held until
  if (!ocols.includes('delivery_group')) db.exec('ALTER TABLE orders ADD COLUMN delivery_group TEXT');
  if (!ocols.includes('delivery_route_id')) db.exec('ALTER TABLE orders ADD COLUMN delivery_route_id TEXT');
  if (!ocols.includes('delivery_mode')) db.exec("ALTER TABLE orders ADD COLUMN delivery_mode TEXT NOT NULL DEFAULT 'pooled'");
  if (!ocols.includes('delivery_fee_status')) db.exec("ALTER TABLE orders ADD COLUMN delivery_fee_status TEXT NOT NULL DEFAULT 'confirmed'");
  if (!ocols.includes('handoff_at')) db.exec('ALTER TABLE orders ADD COLUMN handoff_at TEXT');
  if (!ocols.includes('platform_discount')) db.exec('ALTER TABLE orders ADD COLUMN platform_discount INTEGER NOT NULL DEFAULT 0');
  if (!ocols.includes('buyer_id')) db.exec('ALTER TABLE orders ADD COLUMN buyer_id INTEGER');
  if (!ocols.includes('track_token')) db.exec('ALTER TABLE orders ADD COLUMN track_token TEXT');
  if (!ocols.includes('shipping_free')) db.exec('ALTER TABLE orders ADD COLUMN shipping_free INTEGER NOT NULL DEFAULT 0');
  if (!ocols.includes('courier_cost')) db.exec('ALTER TABLE orders ADD COLUMN courier_cost INTEGER');
  if (!ocols.includes('delivery_person_id')) db.exec('ALTER TABLE orders ADD COLUMN delivery_person_id INTEGER');
  if (!ocols.includes('delivery_fee_quote')) db.exec('ALTER TABLE orders ADD COLUMN delivery_fee_quote INTEGER');
  if (!ocols.includes('delivery_sponsor_share')) db.exec('ALTER TABLE orders ADD COLUMN delivery_sponsor_share INTEGER NOT NULL DEFAULT 0');
  if (!ocols.includes('delivery_sponsor_collected')) db.exec('ALTER TABLE orders ADD COLUMN delivery_sponsor_collected INTEGER NOT NULL DEFAULT 0');
  db.exec("UPDATE orders SET delivery_route_id=COALESCE(delivery_group,'order:' || id) WHERE delivery_by='platform' AND delivery_route_id IS NULL");
  // Older single-store orders with zero delivery were genuinely free; only
  // grouped marketplace sub-orders use zero to mean the basket fee is shared.
  db.exec('UPDATE orders SET shipping_free=1 WHERE shipping=0 AND delivery_group IS NULL AND shipping_free=0');
  if (!db.prepare("SELECT 1 FROM app_settings WHERE key='marketplace_shipping_customer_totals_v1'").get()) {
    // Marketplace delivery is collected by Twist, not earned by a store.
    // Remove any previously allocated shared fee from per-store customer spend.
    db.exec(`UPDATE customers SET total_spent=MAX(0,total_spent-COALESCE((
      SELECT SUM(o.shipping) FROM orders o WHERE o.customer_id=customers.id AND o.delivery_group IS NOT NULL AND o.status<>'cancelled'
    ),0)) WHERE id IN (SELECT customer_id FROM orders WHERE delivery_group IS NOT NULL AND status<>'cancelled' AND shipping>0)`);
    db.prepare("INSERT INTO app_settings(key,value) VALUES('marketplace_shipping_customer_totals_v1','1')").run();
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_orders_delivery_group ON orders(delivery_group)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_orders_delivery_route ON orders(delivery_route_id)');
  const rateCols = db.prepare('PRAGMA table_info(delivery_rates)').all().map((c) => c.name);
  if (!rateCols.includes('distance_km')) db.exec('ALTER TABLE delivery_rates ADD COLUMN distance_km REAL');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_rates_area ON delivery_rates(lower(governorate), lower(city))');
  db.exec(`INSERT OR IGNORE INTO app_settings(key,value) VALUES
    ('delivery_base_fee','50'), ('delivery_included_km','2'), ('delivery_per_km','10'),
    ('delivery_extra_pickup_stop_fee','0'), ('delivery_extra_pickup_zone_fee','0')`);
  db.exec(`INSERT OR IGNORE INTO delivery_rates(governorate,city,fee,distance_km) VALUES
    ('Qalyubia','Banha',50,0), ('Qalyubia','بنها',50,0),
    ('Qalyubia','نصف أتريب',50,0.8), ('Qalyubia','كفر مناقر',50,1.3), ('Qalyubia','بطا',50,1.5),
    ('Qalyubia','كفر أبو زكري',60,2.3), ('Qalyubia','كفر ابوزكري',60,2.3), ('Qalyubia','كفر ابو ذكري',60,2.3),
    ('Qalyubia','كفر الجزار',60,2.5), ('Qalyubia','كفر سعد',70,3.6), ('Qalyubia','كفر بطا',70,4.0),
    ('Qalyubia','بقيرة',80,5.0), ('Qalyubia','كفر الأربعين',90,5.4), ('Qalyubia','كفر فرسيس',90,5.7)`);
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

// Promotions: extra columns on existing tables (the new tables themselves come from schema.sql).
{
  const add = (table, col, ddl) => { const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name); if (cols.length && !cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`); };
  add('orders', 'promo_discount', 'INTEGER NOT NULL DEFAULT 0');          // part of `discount` that came from store promotions (the rest is the coupon)
  add('order_items', 'promo_discount', 'INTEGER NOT NULL DEFAULT 0');     // this line's share of the promotion discount
  add('order_items', 'is_gift', 'INTEGER NOT NULL DEFAULT 0');            // free gift added by a promotion (price is 0)
  add('order_items', 'promotion_id', 'INTEGER');
  add('order_items', 'returned_qty', 'INTEGER NOT NULL DEFAULT 0');
  add('order_promotions', 'snapshot_json', 'TEXT');   // the definition the order was sold under (re-evaluated for partial returns)
  add('order_returns', 'calc_json', 'TEXT');          // the refund calculation, kept for transparency
  add('promotions', 'image_mode', "TEXT NOT NULL DEFAULT 'auto'");       // auto (by product category) | library (owner picked a shared image) | custom (own upload)
  add('promotions', 'image_category', 'TEXT');                             // library choice: offer_image_categories.key
  // Twist's nine marketplace image categories (+ a neutral one). Departments are matched most-specific-first.
  db.exec(`INSERT OR IGNORE INTO offer_image_categories(key, name_ar, name_en, department_slugs_json, sort) VALUES
    ('general','عام','General','[]',0),
    ('womens_fashion','أزياء حريمي','Women''s Fashion','["women"]',1),
    ('mens_fashion','أزياء رجالي','Men''s Fashion','["men"]',2),
    ('kids_fashion','أزياء أطفال','Kids Fashion','["kids","kids_girls","kids_boys"]',3),
    ('babywear','ملابس رضع ومواليد','Babywear & Newborn','["kids_baby"]',4),
    ('sportswear','ملابس رياضية','Sportswear','["women_sports","men_sports"]',5),
    ('accessories','إكسسوارات','Accessories','["women_accessories","men_accessories","women_bags","men_bags"]',6),
    ('perfumes','عطور','Perfumes','["perfume_makeup"]',7),
    ('shoes_sneakers','أحذية وكوتشيات','Shoes & Sneakers','["shoes","shoes_men","shoes_women","shoes_kids"]',8),
    ('makeup','مكياج','Makeup','[]',9)`);
  // categories from the first draft of the library: move offers to their new key, drop the old rows only if nothing uses them
  for (const [oldKey, newKey] of [['kids', 'kids_fashion'], ['men', 'mens_fashion'], ['women', 'womens_fashion'], ['shoes_bags', 'shoes_sneakers']]) {
    db.prepare('UPDATE promotions SET image_category=? WHERE image_category=?').run(newKey, oldKey);
    db.prepare('UPDATE offer_templates SET category_key=? WHERE category_key=? AND NOT EXISTS (SELECT 1 FROM offer_templates t2 WHERE t2.offer_type=offer_templates.offer_type AND t2.category_key=?)').run(newKey, oldKey, newKey);
    db.prepare('DELETE FROM offer_image_categories WHERE key=? AND NOT EXISTS (SELECT 1 FROM offer_templates WHERE category_key=?)').run(oldKey, oldKey);
  }
  db.prepare("DELETE FROM offer_image_categories WHERE key='skincare' AND NOT EXISTS (SELECT 1 FROM offer_templates WHERE category_key='skincare')").run();
  add('products', 'exclude_from_promotions', 'INTEGER NOT NULL DEFAULT 0');
  add('stores', 'promo_resolution', "TEXT NOT NULL DEFAULT 'best_savings'"); // best_savings | priority
  add('stores', 'promo_max_per_cart', 'INTEGER');                          // null = no limit
}
// Sub-categories (store categories under a top-level one) + department tree (main section > section > type).
{
  const cc = db.prepare('PRAGMA table_info(categories)').all().map((c) => c.name);
  if (!cc.includes('parent_id')) db.exec('ALTER TABLE categories ADD COLUMN parent_id INTEGER');
  if (!cc.includes('system')) db.exec('ALTER TABLE categories ADD COLUMN system INTEGER NOT NULL DEFAULT 0');
  const dc = db.prepare('PRAGMA table_info(departments)').all().map((c) => c.name);
  if (!dc.includes('parent_slug')) db.exec('ALTER TABLE departments ADD COLUMN parent_slug TEXT');
  if (!db.prepare("SELECT 1 FROM app_settings WHERE key='dept_tree_v1'").get()) {
    try {
      db.exec('BEGIN');
      // 1) the new tree: insert missing nodes, set parents + order (existing images/sizes are kept)
      const insD = db.prepare('INSERT OR IGNORE INTO departments (slug, name_ar, name_en, sizes_json, sort) VALUES (?,?,?,?,?)');
      const updD = db.prepare('UPDATE departments SET parent_slug=?, sort=?, active=1 WHERE slug=?');
      DEFAULT_DEPARTMENTS.forEach((d, i) => { insD.run(d.slug, d.ar, d.en, JSON.stringify(d.sizes), i * 10); updD.run(d.parent || null, i * 10, d.slug); });
      db.exec("UPDATE departments SET name_ar='أحذية', name_en='Shoes' WHERE slug='shoes' AND name_ar='كوتشيات وأحذية'");
      // 2) move stores + products from the old flat departments to the new sections
      const encode = (list) => `,${[...new Set(list)].join(',')},`;
      const legacy = Object.keys(LEGACY_DEPARTMENTS);
      for (const st of db.prepare('SELECT id, departments, category FROM stores').all()) {
        const cur = String(st.departments || '').split(',').filter(Boolean);
        if (!cur.some((d) => LEGACY_DEPARTMENTS[d])) continue;
        const next = cur.flatMap((d) => LEGACY_DEPARTMENTS[d] || [d]);
        const uniq = [...new Set(next)];
        db.prepare('UPDATE stores SET departments=?, category=? WHERE id=?').run(encode(uniq), uniq.length === 1 ? uniq[0] : 'mixed', st.id);
      }
      for (const old of legacy) {
        const [w, m] = LEGACY_DEPARTMENTS[old];
        db.prepare("UPDATE products SET department=? WHERE department=? AND COALESCE(audience,'')<>'men'").run(w, old);
        db.prepare('UPDATE products SET department=? WHERE department=?').run(m || w, old);
      }
      db.prepare(`DELETE FROM departments WHERE slug IN (${legacy.map(() => '?').join(',')})`).run(...legacy);
      // 3) every store gets a category per department it sells (owners add sub-categories under them)
      const nodes = new Map(db.prepare('SELECT slug, name_ar, name_en, parent_slug FROM departments').all().map((n) => [n.slug, n]));
      const ensure = (node, depth = 0, storeId) => {
        const catSlug = node.slug.replace(/_/g, '-');
        const ex = db.prepare('SELECT id FROM categories WHERE store_id=? AND slug=?').get(storeId, catSlug);
        if (ex) return ex.id;
        const parent = node.parent_slug ? nodes.get(node.parent_slug) : null;
        const parentId = parent && parent.parent_slug && depth < 3 ? ensure(parent, depth + 1, storeId) : null;
        const sort = db.prepare('SELECT COALESCE(MAX(sort),-1)+1 AS n FROM categories WHERE store_id=?').get(storeId).n;
        return Number(db.prepare('INSERT INTO categories (store_id, slug, name_ar, name_en, parent_id, system, sort) VALUES (?,?,?,?,?,1,?)').run(storeId, catSlug, node.name_ar, node.name_en, parentId, sort).lastInsertRowid);
      };
      for (const st of db.prepare('SELECT id, departments FROM stores').all()) {
        for (const slug of String(st.departments || '').split(',').filter(Boolean)) { const n = nodes.get(slug); if (n) ensure(n, 0, st.id); }
      }
      db.exec("UPDATE categories SET system=1 WHERE slug IN (SELECT REPLACE(slug,'_','-') FROM departments)");
      // 3b) "جينز" is not a section of its own any more (it lives inside "بناطيل وجينز"): remove such store categories even when they hold products
      const jeansCats = db.prepare("SELECT id FROM categories WHERE system=0 AND (slug='denim' OR name_ar IN ('جينز','الجينز') OR LOWER(name_en) IN ('denim','jeans'))").all().map((c) => c.id);
      for (const id of jeansCats) { db.prepare('UPDATE products SET category_id=NULL WHERE category_id=?').run(id); db.prepare('UPDATE categories SET parent_id=NULL WHERE parent_id=?').run(id); db.prepare('DELETE FROM categories WHERE id=?').run(id); }
      // 4) drop empty leftover starter categories (e.g. "جينز" in a dresses store) that aren't one of the store's departments
      const del = db.prepare('DELETE FROM categories WHERE id=?');
      for (const c of db.prepare('SELECT c.id, c.slug, s.departments FROM categories c JOIN stores s ON s.id=c.store_id WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.category_id=c.id) AND NOT EXISTS (SELECT 1 FROM categories k WHERE k.parent_id=c.id)').all()) {
        const deps = String(c.departments || '').split(',').filter(Boolean).map((d) => d.replace(/_/g, '-'));
        if (!deps.includes(c.slug)) del.run(c.id);
      }
      db.prepare("INSERT INTO app_settings (key, value) VALUES ('dept_tree_v1', '1')").run();
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch { /* ignore */ }
      console.error('[db] department tree migration failed (will retry on next start):', e.message);
    }
  }
}
