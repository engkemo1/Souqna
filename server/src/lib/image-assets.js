/**
 * Central category image library.
 * ------------------------------------------------------------
 * An image is processed ONCE — when an admin uploads it (single or bulk) or approves a generated candidate — and stored as an
 * `image_assets` row plus a small family of immutable files (original + thumb/card/hero WebP) on R2 (or the media volume when R2
 * is not configured). Departments reference an asset by id. Nothing here runs while a customer browses: the public API only
 * builds URLs from the stored rows.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { config } from '../config.js';
import { q, insert, update, tx, json } from '../db/index.js';
import { AppError, badRequest } from './errors.js';
import { r2Enabled, r2Put, r2Delete } from './r2.js';

export const VARIANTS = { thumb: 160, card: 480, hero: 1200 };      // widths (WebP). Only the sizes the UI really uses.
export const MAX_BYTES = 8 * 1024 * 1024;
export const MIN_SIDE = 300;
const ALLOWED = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' };
const IMMUTABLE = { 'cache-control': 'public, max-age=31536000, immutable' };

/** The same normalisation for file names and slugs: "Women_Dresses .JPG" → "women-dresses". */
export const normName = (s) => String(s || '').replace(/\.[a-z0-9]{2,5}$/i, '').toLowerCase().normalize('NFKC').replace(/[\s_]+/g, '-').replace(/[^a-z0-9؀-ۿ-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');

/** 8×8 average hash as 16 hex chars; images that differ by ≤ 5 bits are near-duplicates. */
async function averageHash(buf) {
  const px = await sharp(buf).rotate().resize(8, 8, { fit: 'fill' }).grayscale().raw().toBuffer();
  const avg = px.reduce((a, b) => a + b, 0) / px.length;
  let bits = ''; for (const v of px) bits += v >= avg ? '1' : '0';
  return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
}
export const hamming = (a, b) => { let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`), n = 0; while (x) { n += Number(x & 1n); x >>= 1n; } return n; };

/** Validate + decode an upload. Throws friendly 4xx errors; never touches storage. */
export async function inspect(buffer) {
  if (!buffer?.length) throw badRequest('invalid_image', 'Empty file.');
  if (buffer.length > MAX_BYTES) throw badRequest('image_too_large', 'Image is larger than 8 MB.');
  let meta;
  try { meta = await sharp(buffer, { failOn: 'error' }).metadata(); } catch { throw badRequest('invalid_image', 'This file is not a supported image.'); }
  const mime = ALLOWED[meta.format];
  if (!mime) throw badRequest('invalid_image', 'Only JPG, PNG, WebP or AVIF images are allowed.');
  if (Math.min(meta.width || 0, meta.height || 0) < MIN_SIDE) throw badRequest('image_too_small', `Image is too small (min ${MIN_SIDE}px).`);
  return { meta, mime };
}

const keyFor = (hash) => `category-images/${hash.slice(0, 16)}`;
async function putFile(key, buf) {
  if (r2Enabled) return r2Put(key, buf, IMMUTABLE);
  const file = path.join(config.mediaDir, key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, buf);
}
async function rmFile(key) {
  try { if (r2Enabled) await r2Delete(key); else await fs.rm(path.join(config.mediaDir, key), { force: true }); } catch { /* best effort */ }
}
const baseUrl = () => (r2Enabled ? config.r2.publicUrl : config.mediaBaseUrl);

export function assetUrls(asset) {
  if (!asset) return null;
  const v = json(asset.variants_json, {});
  const out = {};
  for (const [name, f] of Object.entries(v)) out[name] = `${baseUrl()}/${asset.object_key}/${f.file}`;
  return out;
}
export const serializeAsset = (a, extra = {}) => a && ({
  id: a.id, key: a.object_key, filename: a.original_filename, mime: a.mime, bytes: a.bytes, width: a.width, height: a.height, format: a.format,
  sha256: a.sha256, source: a.source, status: a.status, alt: { ar: a.alt_ar || '', en: a.alt_en || '' }, created_at: a.created_at,
  urls: assetUrls(a), ...extra,
});

/**
 * Store an image once. Identical bytes (same SHA-256) return the existing asset and write nothing.
 * Returns { asset, duplicate, nearDuplicates }.
 */
export async function saveAsset(buffer, { filename = null, source = 'upload', createdBy = null } = {}) {
  const { meta, mime } = await inspect(buffer);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const existing = q.get('SELECT * FROM image_assets WHERE sha256=?', [sha256]);
  if (existing) return { asset: existing, duplicate: true, nearDuplicates: [] };

  const key = keyFor(sha256);
  const variants = {};
  const files = [];
  const rotated = sharp(buffer).rotate();
  for (const [name, width] of Object.entries(VARIANTS)) {
    const out = await rotated.clone().resize({ width, withoutEnlargement: true }).webp({ quality: name === 'thumb' ? 70 : 78, effort: 5, smartSubsample: true }).toBuffer({ resolveWithObject: true });
    variants[name] = { file: `${name}.webp`, w: out.info.width, h: out.info.height, bytes: out.data.length };
    files.push([`${name}.webp`, out.data]);
  }
  files.push([`original.${meta.format === 'jpeg' ? 'jpg' : meta.format}`, buffer]);   // the untouched upload is preserved
  const phash = await averageHash(buffer);
  const near = q.all('SELECT id, phash FROM image_assets WHERE phash IS NOT NULL').filter((r) => hamming(phash, r.phash) <= 5).map((r) => r.id);

  const written = [];
  try {
    for (const [f, buf] of files) { await putFile(`${key}/${f}`, buf); written.push(`${key}/${f}`); }
    const id = insert('image_assets', {
      object_key: key, original_filename: filename ? String(filename).slice(0, 200) : null, mime, bytes: buffer.length,
      width: meta.width, height: meta.height, format: meta.format, sha256, phash, variants_json: JSON.stringify(variants),
      source, created_by: createdBy ? String(createdBy).slice(0, 80) : null,
    });
    return { asset: q.get('SELECT * FROM image_assets WHERE id=?', [id]), duplicate: false, nearDuplicates: near };
  } catch (e) {
    for (const k of written) await rmFile(k);      // never leave orphaned files behind a failed save
    throw e;
  }
}

/**
 * Point a department at a stored asset (and keep the legacy `image` column in sync with the card rendition).
 * A pre-library image URL is remembered in `legacy_image` first, so un-assigning restores it instead of losing it.
 */
export function assignAsset(slug, assetId) {
  const d = q.get('SELECT * FROM departments WHERE slug=?', [slug]);
  if (!d) throw new AppError(404, 'not_found', 'Department not found.');
  const a = q.get('SELECT * FROM image_assets WHERE id=?', [assetId]);
  if (!a || a.status !== 'active') throw new AppError(404, 'not_found', 'Image not found.');
  const legacy = !d.image_asset_id && d.image && !d.legacy_image ? d.image : undefined;
  update('departments', d.id, { image_asset_id: a.id, image: assetUrls(a).card, legacy_image: legacy });
  return a;
}
export function unassign(slug) {
  const d = q.get('SELECT * FROM departments WHERE slug=?', [slug]);
  if (!d) throw new AppError(404, 'not_found', 'Department not found.');
  update('departments', d.id, { image_asset_id: null, image: d.legacy_image || null });   // back to the original picture, if there was one
}
export const usage = (assetId) => q.all('SELECT slug, name_ar, name_en FROM departments WHERE image_asset_id=?', [assetId]);

/** Deleting is refused while any department still uses the asset; the admin must replace or unassign first. */
export async function deleteAsset(id) {
  const a = q.get('SELECT * FROM image_assets WHERE id=?', [id]);
  if (!a) throw new AppError(404, 'not_found', 'Image not found.');
  const used = usage(id);
  if (used.length) throw new AppError(409, 'asset_in_use', 'This image is used by categories; replace or unassign it first.', { used: used.map((u) => u.slug) });
  q.run('UPDATE image_candidates SET asset_id=NULL WHERE asset_id=?', [id]);
  q.run('DELETE FROM image_assets WHERE id=?', [id]);
  const files = [...Object.values(json(a.variants_json, {})).map((v) => v.file), `original.${a.format === 'jpeg' ? 'jpg' : a.format}`];
  for (const f of files) await rmFile(`${a.object_key}/${f}`);
  return true;
}

/** Match a bulk-uploaded file name to a department: slug, English name, or Arabic name. */
export function matchDepartment(filename, depts) {
  const n = normName(filename);
  if (!n) return null;
  const bySlug = depts.find((d) => normName(d.slug) === n);
  if (bySlug) return bySlug;
  const byName = depts.filter((d) => normName(d.name_en) === n || normName(d.name_ar) === n);
  return byName.length === 1 ? byName[0] : null;           // an ambiguous name is NOT guessed
}

/**
 * Bulk upload: many files, mapped to departments by file name. Each file is reported individually; one bad file never aborts the rest.
 * An existing image on a department is kept unless `overwrite`.
 */
export async function bulkUpload(files, { overwrite = false, createdBy = null } = {}) {
  const depts = q.all('SELECT slug, name_ar, name_en, image_asset_id, image FROM departments');
  const results = [];
  for (const f of files) {
    const row = { filename: f.originalname };
    try {
      const dept = matchDepartment(f.originalname, depts);
      const { asset, duplicate, nearDuplicates } = await saveAsset(f.buffer, { filename: f.originalname, source: 'bulk', createdBy });
      Object.assign(row, { asset_id: asset.id, duplicate, near_duplicates: nearDuplicates });
      if (!dept) { Object.assign(row, { status: 'unmatched' }); }
      else if ((dept.image_asset_id || dept.image) && !overwrite) { Object.assign(row, { status: 'skipped_has_image', department: dept.slug }); }
      else { assignAsset(dept.slug, asset.id); dept.image_asset_id = asset.id; Object.assign(row, { status: 'assigned', department: dept.slug }); }
    } catch (e) { Object.assign(row, { status: 'failed', error: e.code || 'error', message: e.message }); }
    results.push(row);
  }
  const count = (s) => results.filter((r) => r.status === s).length;
  return { results, summary: { total: results.length, assigned: count('assigned'), unmatched: count('unmatched'), skipped: count('skipped_has_image'), failed: count('failed'), duplicates: results.filter((r) => r.duplicate).length } };
}

/** One row per department with its image status: ok | missing | legacy (only an old URL) | broken (asset row gone/archived). */
export function libraryStatus() {
  const rows = q.all('SELECT d.*, a.id AS a_id, a.status AS a_status, a.width AS a_w, a.height AS a_h, a.bytes AS a_bytes, a.variants_json AS a_v, a.object_key AS a_key FROM departments d LEFT JOIN image_assets a ON a.id=d.image_asset_id ORDER BY d.sort, d.id');
  const by = new Map(rows.map((r) => [r.slug, r]));
  const level = (s) => { let n = 0; for (let c = by.get(s)?.parent_slug; c && n < 10; c = by.get(c)?.parent_slug) n++; return n; };
  const pending = new Set(q.all("SELECT department_slug FROM image_candidates WHERE status='pending'").map((r) => r.department_slug));
  const items = rows.map((r) => {
    let status = 'missing';
    if (r.image_asset_id) status = r.a_id && r.a_status === 'active' ? 'ok' : 'broken';
    else if (r.image) status = 'legacy';
    return {
      id: r.id, slug: r.slug, name: { ar: r.name_ar, en: r.name_en }, parent: r.parent_slug || null, level: level(r.slug), active: !!r.active, status,
      asset: r.a_id ? { id: r.a_id, width: r.a_w, height: r.a_h, bytes: r.a_bytes, urls: assetUrls({ object_key: r.a_key, variants_json: r.a_v }) } : null,
      legacy_url: status === 'legacy' ? r.image : null, has_pending_candidate: pending.has(r.slug),
    };
  });
  const c = (s) => items.filter((i) => i.status === s).length;
  return { items, summary: { total: items.length, ok: c('ok'), missing: c('missing'), legacy: c('legacy'), broken: c('broken') } };
}

export function listAssets({ term = '' } = {}) {
  const t = normName(term);
  return q.all('SELECT * FROM image_assets ORDER BY id DESC').map((a) => {
    const used = usage(a.id);
    return serializeAsset(a, { used_by: used.map((u) => ({ slug: u.slug, name: { ar: u.name_ar, en: u.name_en } })) });
  }).filter((a) => !t || normName(a.filename).includes(t) || a.used_by.some((u) => normName(u.slug).includes(t) || normName(u.name.en).includes(t) || normName(u.name.ar).includes(t)));
}

/** Reused assets (intended) and visually near-identical assets (probably an accidental second upload). */
export function duplicatesReport() {
  const reused = q.all('SELECT image_asset_id AS id, COUNT(*) AS n FROM departments WHERE image_asset_id IS NOT NULL GROUP BY image_asset_id HAVING n>1')
    .map((r) => ({ asset_id: r.id, departments: usage(r.id).map((u) => u.slug) }));
  const all = q.all('SELECT id, phash, original_filename FROM image_assets WHERE phash IS NOT NULL');
  const near = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) { const d = hamming(all[i].phash, all[j].phash); if (d <= 5) near.push({ a: all[i].id, b: all[j].id, distance: d }); }
  return { reused, near_duplicates: near, exact_duplicates_blocked: 'identical files are rejected at upload by SHA-256' };
}

/** Explicit, admin-triggered probe of the stored URLs (HEAD). Never run on page views. */
export async function checkLinks({ fetchImpl = fetch } = {}) {
  const broken = [];
  for (const it of libraryStatus().items) {
    const url = it.asset?.urls?.card || it.legacy_url;
    if (!url) continue;
    const abs = url.startsWith('http') ? url : null;
    if (!abs) continue;                                    // local media is served by this server; only remote URLs are probed
    try { const r = await fetchImpl(abs, { method: 'HEAD' }); if (!r.ok) broken.push({ slug: it.slug, url, status: r.status }); } catch (e) { broken.push({ slug: it.slug, url, error: String(e.message || e) }); }
  }
  return { checked: true, broken };
}
