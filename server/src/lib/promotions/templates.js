/**
 * Shared promotional image library: one image per (offer type, product category), stored ONCE and used by every store.
 * Reuses the existing photo storage: Cloudflare R2 through lib/r2.js when configured (same bucket and credentials as product photos,
 * under the shared `offer-templates/` prefix), otherwise the local media folder. SQLite keeps only references.
 *
 * This module is purely visual. The pricing engine never imports it, and nothing here can change what an offer calculates.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { q, json } from '../../db/index.js';
import { config } from '../../config.js';
import { r2Enabled, r2Put } from '../r2.js';
import { TEMPLATE_KEYS } from './store.js';

const PREFIX = 'offer-templates';
export const GENERAL = 'general';
/** Pseudo offer type for category artwork that serves EVERY offer type (one picture per product category). */
export const ANY = 'any';
/** Offer types that have no images of their own reuse another type's artwork. */
const TYPE_ALIAS = { category_reward: 'buy_x_get_y' };
const urlOf = (row) => (row ? `${row.remote ? config.r2.publicUrl : config.mediaBaseUrl}/${PREFIX}/${row.file}` : null);

export function imageCategories() {
  return q.all('SELECT * FROM offer_image_categories WHERE active=1 ORDER BY sort, key').map((c) => ({ key: c.key, name: { ar: c.name_ar, en: c.name_en }, departments: json(c.department_slugs_json, []) }));
}

/** Every uploaded image: [{ offerType, category, url }]. */
export function libraryItems() {
  return q.all('SELECT * FROM offer_templates ORDER BY offer_type, category_key').map((r) => ({ offerType: r.offer_type, category: r.category_key, url: urlOf(r) }));
}

/**
 * Best image for a type + category. Order: exact pair, the category's shared picture (any offer type), the aliased type's pair,
 * the type's general picture, the shared general picture, then null (the UI draws a colour gradient).
 */
export function resolveTemplate(offerType, category = GENERAL) {
  const t = TYPE_ALIAS[offerType] || offerType;
  const get = (type, cat) => q.get('SELECT * FROM offer_templates WHERE offer_type=? AND category_key=?', [type, cat]);
  const row = get(offerType, category) || get(ANY, category) || get(t, category) || get(t, GENERAL) || get(ANY, GENERAL);
  return row ? { url: urlOf(row), category: row.category_key, offerType: row.offer_type } : null;
}

/** Which image category fits a set of products? Majority vote of their departments (and parent departments). */
export function categoryForProducts(productIds, storeId) {
  const cats = q.all('SELECT key, department_slugs_json FROM offer_image_categories WHERE active=1').map((c) => ({ key: c.key, deps: new Set(json(c.department_slugs_json, [])) })).filter((c) => c.deps.size);
  if (!cats.length) return GENERAL;
  const parents = new Map(q.all('SELECT slug, parent_slug FROM departments').map((d) => [d.slug, d.parent_slug]));
  const chain = (slug) => { const out = []; for (let s = slug, i = 0; s && i < 5; s = parents.get(s), i++) out.push(s); return out; };
  const votes = new Map();
  // walk from the product's own department up to its parents; the MOST specific match wins (women_sports -> sportswear, not women)
  const bump = (slug) => { for (const s of chain(slug)) { const c = cats.find((x) => x.deps.has(s)); if (c) { votes.set(c.key, (votes.get(c.key) || 0) + 1); return; } } };
  if (productIds?.length) {
    const rows = q.all(`SELECT department FROM products WHERE store_id=? AND department IS NOT NULL AND id IN (${productIds.slice(0, 500).map(() => '?').join(',')})`, [storeId, ...productIds.slice(0, 500)]);
    rows.forEach((r) => bump(r.department));
  }
  if (!votes.size) { // no product evidence (e.g. "whole store" offers): use what the store sells
    const sells = String(q.val('SELECT departments FROM stores WHERE id=?', [storeId]) || '').split(',').filter(Boolean);
    sells.forEach(bump);
  }
  const best = [...votes].sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : GENERAL;
}

/**
 * Decide the picture of an offer (decorative only):
 *  - custom:  the store's own upload (image_media_id, handled by the existing media pipeline)
 *  - library: the shared image the owner picked (type + category)
 *  - auto:    chosen from the offer's products / the store's departments
 */
export function resolveOfferImage(row, productIds) {
  if (row.image_mode === 'custom' && row.image_media_id) return { mode: 'custom', url: null, category: null };
  const category = row.image_mode === 'library' && row.image_category ? row.image_category : categoryForProducts(productIds, row.store_id);
  const hit = resolveTemplate(row.template_key || row.type, category);
  return { mode: row.image_mode === 'library' ? 'library' : 'auto', url: hit?.url || null, category, matched: hit?.category || null };
}

/** Upload (or refresh) one library image. Idempotent: identical content is never uploaded twice. */
export async function publishTemplate(offerType, category, srcPath) {
  if (offerType !== ANY && !TEMPLATE_KEYS.includes(offerType)) throw new Error(`unknown offer type ${offerType}`);
  if (!/^[a-z0-9_]{1,40}$/.test(category)) throw new Error(`bad category key ${category}`);
  const src = await fs.readFile(srcPath);
  const buf = await sharp(src).resize({ width: 1400, withoutEnlargement: true }).webp({ quality: 82, effort: 6 }).toBuffer();
  const meta = await sharp(buf).metadata();
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  const existing = q.get('SELECT * FROM offer_templates WHERE offer_type=? AND category_key=?', [offerType, category]);
  if (existing && existing.sha256 === sha && Boolean(existing.remote) === r2Enabled) return { offerType, category, status: 'unchanged' };
  const file = `${offerType}.${category}.${sha.slice(0, 10)}.webp`;
  if (r2Enabled) await r2Put(`${PREFIX}/${file}`, buf);
  else { const dir = path.join(config.mediaDir, PREFIX); await fs.mkdir(dir, { recursive: true }); await fs.writeFile(path.join(dir, file), buf); }
  q.run(`INSERT INTO offer_templates(offer_type, category_key, file, sha256, remote, width, height, bytes, updated_at) VALUES (?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(offer_type, category_key) DO UPDATE SET file=excluded.file, sha256=excluded.sha256, remote=excluded.remote, width=excluded.width, height=excluded.height, bytes=excluded.bytes, updated_at=excluded.updated_at`,
  [offerType, category, file, sha, r2Enabled ? 1 : 0, meta.width, meta.height, buf.length]);
  return { offerType, category, status: existing ? 'updated' : 'uploaded', file };
}

/** Add a new product category to the library (no code change needed): then drop `<type>.<key>.png` files and re-run the upload script. */
export function addImageCategory({ key, nameAr, nameEn, departments = [] }) {
  if (!/^[a-z0-9_]{1,40}$/.test(key)) throw new Error('bad category key');
  q.run('INSERT OR REPLACE INTO offer_image_categories(key, name_ar, name_en, department_slugs_json, sort, active) VALUES (?,?,?,?,COALESCE((SELECT sort FROM offer_image_categories WHERE key=?),(SELECT COALESCE(MAX(sort),0)+1 FROM offer_image_categories)),1)', [key, nameAr, nameEn, JSON.stringify(departments), key]);
}
