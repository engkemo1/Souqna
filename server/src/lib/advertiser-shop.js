/**
 * Optional "sell through the Twist basket" for an outside advertiser.
 *
 * The advertiser has no shop, so each one that turns this on gets a hidden "shadow shop" (stores.hidden = 1, delivery_mode = 'platform').
 * Every photo that has a name + a price becomes a normal product of that shop. From there the existing basket, checkout, orders,
 * delivery pricing and admin order screens work unchanged — the order simply arrives like any other Twist order, and Twist delivers it.
 * The shadow shop never shows in search, the stores directory, the home page or recommendations (they all filter hidden = 0).
 * Products are kept (as drafts) when an item stops being sellable, so old orders still point at them.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import bcrypt from 'bcryptjs';
import { IMAGE_SIZES } from '@souqna/shared';
import { config } from '../config.js';
import { q, insert, update } from '../db/index.js';
import { r2Enabled } from './r2.js';
import { writeMediaFile, getMedia, serializeMedia } from './media.js';

const OWNER_EMAIL = 'advertisers@twist.internal';
const itemSlug = (src) => `a${crypto.createHash('sha1').update(String(src)).digest('hex').slice(0, 10)}`;
export const isSellable = (it) => !!(it && it.src && it.name && Number.isInteger(it.price) && it.price > 0);

/** The (unlogin-able) platform user that owns every shadow shop. */
function platformOwnerId() {
  const u = q.get('SELECT id FROM users WHERE email=?', [OWNER_EMAIL]);
  if (u) return u.id;
  return insert('users', { name: 'Twist Advertisers', email: OWNER_EMAIL, password_hash: bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), 10) });
}

export function ensureShadowStore(adv) {
  if (adv.store_id && q.get('SELECT id FROM stores WHERE id=?', [adv.store_id])) {
    q.run('UPDATE stores SET name_ar=?, name_en=?, phone=?, whatsapp=?, address_ar=?, address_en=?, status=\'active\', hidden=1, delivery_mode=\'platform\' WHERE id=?',
      [adv.name_ar, adv.name_en || adv.name_ar, adv.phone || adv.whatsapp || null, adv.whatsapp || adv.phone || null, adv.address_ar || null, adv.address_en || adv.address_ar || null, adv.store_id]);
    return adv.store_id;
  }
  let slug = `adv-${adv.slug}`.slice(0, 48);
  while (q.get('SELECT id FROM stores WHERE slug=?', [slug])) slug = `adv-${adv.slug}-${crypto.randomBytes(2).toString('hex')}`.slice(0, 56);
  const sid = insert('stores', {
    owner_id: platformOwnerId(), slug, code: 'AD', name_ar: adv.name_ar, name_en: adv.name_en || adv.name_ar, category: 'mixed', departments: '',
    delivery_mode: 'platform', hidden: 1, show_when_empty: 0, free_shipping_over: 0, shipping_fee: 0, city: 'Banha',
    phone: adv.phone || adv.whatsapp || null, whatsapp: adv.whatsapp || adv.phone || null, auto_whatsapp: 0,
    address_ar: adv.address_ar || null, address_en: adv.address_en || adv.address_ar || null,
  });
  q.run('UPDATE featured_advertisers SET store_id=? WHERE id=?', [sid, adv.id]);
  return sid;
}

/** Read an image we stored ourselves (local media dir or our own R2 bucket). Never fetches arbitrary URLs. */
async function ownImageBuffer(url) {
  const u = String(url || '');
  const local = `${config.mediaBaseUrl}/`;
  try {
    if (u.startsWith(local)) {
      const rel = path.normalize(u.slice(local.length));
      if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
      return await fs.readFile(path.join(config.mediaDir, rel));
    }
    if (config.r2?.publicUrl && u.startsWith(`${config.r2.publicUrl}/`)) {
      const res = await fetch(u, { signal: AbortSignal.timeout(15_000) });
      return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
    }
  } catch { /* image is optional — the product still works without it */ }
  return null;
}

/** Turn an already-stored ad photo into a normal product image (same files/sizes the product pipeline produces, without recropping it). */
async function importPhoto(storeId, buffer, alt) {
  const meta = await sharp(buffer, { failOn: 'error' }).metadata();
  const key = crypto.randomBytes(8).toString('hex');
  const m = { store_id: storeId, key, remote: r2Enabled ? 1 : 0 };
  const sizes = [];
  for (const [name, width] of Object.entries(IMAGE_SIZES)) {
    const w = Math.min(width, meta.width || width);
    await writeMediaFile(m, `${name}.webp`, await sharp(buffer).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer());
    sizes.push({ name, width: w });
  }
  const jpg = await sharp(buffer).rotate().flatten({ background: '#ffffff' }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  await writeMediaFile(m, 'original.jpg', jpg);
  const id = insert('media', { store_id: storeId, kind: 'product', key, width: meta.width || 0, height: meta.height || 0, sizes: JSON.stringify(sizes), original_ext: 'jpg', bytes: jpg.length, alt: String(alt || '').slice(0, 120), attached: 1, remote: m.remote });
  return id;
}

/** Make the shop's products match the advertiser's sellable photos. Idempotent; safe to call after every save. */
export async function syncAdvertiserShop(advId) {
  const adv = q.get('SELECT * FROM featured_advertisers WHERE id=?', [advId]);
  if (!adv) return null;
  const on = !!adv.twist_orders && adv.status === 'active' && !!adv.consent;
  let items = [];
  try { items = JSON.parse(adv.gallery_json || '[]'); } catch { items = []; }
  items = items.filter((x) => x && typeof x === 'object');

  if (!on) {
    if (adv.store_id) q.run("UPDATE products SET status='draft', updated_at=datetime('now') WHERE store_id=? AND status='active'", [adv.store_id]);
    return { enabled: false, products: 0 };
  }
  const storeId = ensureShadowStore(adv);
  const live = new Set();
  let count = 0;
  for (const it of items) {
    if (!isSellable(it)) continue;
    const slug = itemSlug(it.src);
    live.add(slug);
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const existing = q.get('SELECT * FROM products WHERE store_id=? AND slug=?', [storeId, slug]);
    let pid;
    if (existing) {
      pid = existing.id;
      update('products', pid, { name_ar: it.name, name_en: it.name, price: it.price, status: 'active', track_stock: 0, updated_at: now });
    } else {
      pid = insert('products', { store_id: storeId, slug, name_ar: it.name, name_en: it.name, price: it.price, status: 'active', track_stock: 0, stock: 0, colors_json: '[]', sizes_json: '[]' });
    }
    if (!q.val('SELECT COUNT(*) FROM product_media WHERE product_id=?', [pid])) {
      const buf = await ownImageBuffer(it.src);
      if (buf) {
        try { const mid = await importPhoto(storeId, buf, it.name); q.run('INSERT OR IGNORE INTO product_media (product_id, media_id, position, is_primary) VALUES (?,?,0,1)', [pid, mid]); } catch { /* keep the product without a picture */ }
      }
    }
    count += 1;
  }
  for (const p of q.all("SELECT id, slug FROM products WHERE store_id=? AND status='active'", [storeId])) {
    if (!live.has(p.slug)) q.run("UPDATE products SET status='draft', updated_at=datetime('now') WHERE id=?", [p.id]);
  }
  return { enabled: true, products: count, storeId };
}

/** Basket data for each sellable item of a public page, keyed by photo URL. */
export function cartInfoFor(adv) {
  if (!adv.twist_orders || !adv.store_id) return new Map();
  const store = q.get("SELECT slug, name_ar, name_en FROM stores WHERE id=? AND status='active'", [adv.store_id]);
  if (!store) return new Map();
  const out = new Map();
  let items = [];
  try { items = JSON.parse(adv.gallery_json || '[]'); } catch { items = []; }
  for (const it of items) {
    if (!isSellable(it)) continue;
    const p = q.get("SELECT id, slug FROM products WHERE store_id=? AND slug=? AND status='active'", [adv.store_id, itemSlug(it.src)]);
    if (!p) continue;
    const mid = q.val('SELECT media_id FROM product_media WHERE product_id=? ORDER BY is_primary DESC, position LIMIT 1', [p.id]);
    out.set(it.src, { productId: p.id, slug: p.slug, storeSlug: store.slug, storeName: { ar: store.name_ar, en: store.name_en || store.name_ar }, image: mid ? serializeMedia(getMedia(mid)) : null });
  }
  return out;
}
