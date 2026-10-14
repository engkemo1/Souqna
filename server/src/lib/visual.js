/**
 * Visual search ("صوّرها ولاقيها في بنها").
 * Each product's primary photo is turned into a vector; the customer's photo is turned into the same kind of vector and
 * compared (cosine similarity) with active products. Models (never mixed — each product stores which one produced its vector):
 *   - 'clip'  : free local computer-vision model (CLIP, see visual-clip.js). Understands what the item IS (shirt, jeans, shoes…),
 *               detects several pieces in an outfit photo, learns from Banha's own catalogue, and is gated strictly so that
 *               only genuinely similar products are ever shown. Falls back to the colour model if it cannot load.
 *   - 'color' : built-in colour/layout fingerprint (color-v1) — no model download, finds items that look alike in colour and shape.
 *   - 'jina'  : optional hosted embeddings; sends resized image data to Jina only when explicitly selected in Admin.
 */
import sharp from 'sharp';
import { q } from '../db/index.js';
import { readMediaFile } from './media.js';
import { visualProductFamily, visualTypeOptions } from './visual-taxonomy.js';
import { clipReady, clipStatus, clipEmbedImage, clipEmbedTexts, CLIP_MODEL_NAME } from './visual-clip.js';
import { cropRegions, colorDescriptor, rankConfident, normalize, toBlob, fromBlob, dominantColor, FRIENDLY_AR } from './visual-core.js';
import { buildTextPrototypes, buildCentroids, detectItems, vectorForFamily } from './visual-classify.js';

const GRID_W = 6, GRID_H = 8, HUE_BINS = 12;

/* ---------------- settings ---------------- */
// Conservative initial match floors: the fallback color model must be nearly identical;
// semantic embeddings can accept a slightly wider range. These are tunable in Admin.
// The CLIP floor is a cosine score (colour-adjusted) on a strict gate; `npm run train:visual` recommends a value from real catalogue data.
const DEF = { visual_enabled: '1', visual_model: process.env.VISUAL_MODEL === 'clip' ? 'clip' : 'color', visual_daily: '40', visual_min_color: '97', visual_min_jina: '78', visual_min_clip: '80' };

const FLOOR_KEY = { color: 'visual_min_color', jina: 'visual_min_jina', clip: 'visual_min_clip' };

export function visualSettings() {
  const m = { ...DEF, ...Object.fromEntries(q.all("SELECT key, value FROM app_settings WHERE key LIKE 'visual_%'").map((r) => [r.key, r.value])) };
  const model = m.visual_model === 'jina' && m.visual_jina_consent === '1' ? 'jina' : m.visual_model === 'clip' ? 'clip' : 'color';
  const readFloor = (key) => Math.max(0, Math.min(100, Number.isFinite(Number(m[key])) ? Number(m[key]) : Number(DEF[key])));
  return {
    enabled: m.visual_enabled === '1',
    // Older admin builds exposed a nonfunctional Jina option. Require the new explicit setting save
    // (which also shows the data-transfer notice) before sending any images to the hosted API.
    model,
    dailyFree: Math.max(0, Number(m.visual_daily) || 0),
    minSimilarity: readFloor(FLOOR_KEY[model]),
    minSimilarityByModel: { color: readFloor('visual_min_color'), jina: readFloor('visual_min_jina'), clip: readFloor('visual_min_clip') },
  };
}

export function saveVisualSettings({ enabled, model, dailyFree, minSimilarity }) {
  const put = (k, v) => q.run('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, String(v)]);
  if (enabled !== undefined) put('visual_enabled', enabled ? '1' : '0');
  if (model) {
    put('visual_model', model);
    put('visual_jina_consent', model === 'jina' ? '1' : '0');
  }
  if (dailyFree !== undefined) put('visual_daily', Math.max(0, Math.min(1000, Math.floor(dailyFree))));
  if (minSimilarity !== undefined) {
    const target = model || visualSettings().model;
    put(FLOOR_KEY[target] || 'visual_min_color', Math.max(0, Math.min(100, Math.floor(minSimilarity))));
  }
  return visualSettings();
}

export function visualStatus() {
  const s = visualSettings();
  const indexed = q.all('SELECT model, COUNT(DISTINCT product_id) AS c FROM visual_vectors GROUP BY model').reduce((o, r) => ({ ...o, [r.model]: r.c }), {});
  const total = (q.get("SELECT COUNT(*) AS c FROM products WHERE status='active'")?.c) || 0;
  const model = settingModelName(s.model);
  const pending = q.get(`SELECT COUNT(*) AS c FROM products p
    JOIN product_media pm ON pm.product_id=p.id AND pm.is_primary=1
    WHERE p.status='active' AND NOT EXISTS (SELECT 1 FROM visual_vectors v WHERE v.product_id=p.id AND v.model=? AND v.slot='m'||pm.media_id)`, [model])?.c || 0;
  const cs = clipStatus();
  return { ...s, indexed, total, pending, providers: { jina: { configured: Boolean(process.env.JINA_API_KEY) }, clip: { ...cs, available: !cs.error } } };
}

export { visualTypeOptions };

/** weight cells near the centre more (the garment), ignore the borders (background / blurred padding) */
const CELL_W = Array.from({ length: GRID_H }, (_, y) => Array.from({ length: GRID_W }, (_, x) => {
  const dx = (x + 0.5) / GRID_W - 0.5, dy = (y + 0.5) / GRID_H - 0.5;
  return 0.35 + 0.65 * Math.exp(-(dx * dx * 5 + dy * dy * 4));
})).flat();

function rgbToHsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx ? d / mx : 0, mx / 255];
}

async function colorEmbed(buffer) {
  const { data } = await sharp(buffer).rotate().resize(GRID_W * 4, GRID_H * 4, { fit: 'cover', position: 'centre' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = GRID_W * 4, grid = new Float32Array(GRID_W * GRID_H * 3), cnt = new Float32Array(GRID_W * GRID_H);
  const hue = new Float32Array(HUE_BINS);
  for (let y = 0; y < GRID_H * 4; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3, c = Math.floor(y / 4) * GRID_W + Math.floor(x / 4);
    grid[c * 3] += data[i]; grid[c * 3 + 1] += data[i + 1]; grid[c * 3 + 2] += data[i + 2]; cnt[c]++;
    const [h, s, v] = rgbToHsv(data[i], data[i + 1], data[i + 2]);
    if (s > 0.18 && v > 0.15) hue[Math.floor(h / 360 * HUE_BINS) % HUE_BINS] += CELL_W[c] * s;
  }
  const out = [];
  for (let c = 0; c < GRID_W * GRID_H; c++) for (let k = 0; k < 3; k++) out.push(((grid[c * 3 + k] / cnt[c]) - 128) / 128 * CELL_W[c]);
  const hs = hue.reduce((a, b) => a + b, 0) || 1;
  for (let k = 0; k < HUE_BINS; k++) out.push((hue[k] / hs) * 3); // hue profile counts as much as a few cells
  return out;
}

const JINA_MODEL = 'jina-embeddings-v5-omni-nano';
class VisualProviderError extends Error { constructor(message, status = 503) { super(message); this.status = status; this.code = 'visual_provider_unavailable'; } }
async function jinaEmbed(buffer) {
  if (!process.env.JINA_API_KEY) throw new VisualProviderError('Jina image search is selected but JINA_API_KEY is not configured.');
  const image = await sharp(buffer).rotate().resize(600, 600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch('https://api.jina.ai/v1/embeddings', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${process.env.JINA_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: JINA_MODEL, input: [{ image: `data:image/jpeg;base64,${image.toString('base64')}` }] }),
    });
    if (!response.ok) throw new VisualProviderError(`Jina embedding request failed (${response.status}).`, response.status === 429 ? 503 : 502);
    const embedding = (await response.json())?.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || !embedding.length || embedding.some((v) => !Number.isFinite(v))) throw new VisualProviderError('Jina returned an invalid image embedding.', 502);
    return embedding;
  } catch (e) {
    if (e instanceof VisualProviderError) throw e;
    throw new VisualProviderError(e.name === 'AbortError' ? 'Jina image search timed out.' : 'Could not reach Jina image search.');
  } finally { clearTimeout(timeout); }
}
const EMBEDDERS = { 'color-v1': colorEmbed, [JINA_MODEL]: jinaEmbed, [CLIP_MODEL_NAME]: clipEmbedImage };
const CLIP_WAIT_MS = 4000;
const settingModelName = (m) => (m === 'jina' ? JINA_MODEL : m === 'clip' ? CLIP_MODEL_NAME : 'color-v1');
/** Admin-selected model. Never silently mix or fall back between incompatible vector spaces. */
export async function activeModel() {
  if (visualSettings().model === 'jina') {
    if (!process.env.JINA_API_KEY) throw new VisualProviderError('Jina image search is selected but its API key is not configured.');
    return JINA_MODEL;
  }
  // CLIP is "best effort": while it loads (or if it cannot load: package / model / RAM) searches are answered by the colour model, whose
  // vectors are always kept up to date next to CLIP's — a customer never waits on a model download and never gets an empty page because of it.
  if (visualSettings().model === 'clip') {
    if (clipStatus().loaded) return CLIP_MODEL_NAME;
    const ready = await Promise.race([clipReady(), new Promise((r) => { const t = setTimeout(() => r(false), CLIP_WAIT_MS); t.unref?.(); })]);
    if (ready) return CLIP_MODEL_NAME;
  }
  return 'color-v1';
}

export async function embedImage(buffer, model) {
  const m = model || await activeModel();
  try { return { model: m, vec: normalize(await EMBEDDERS[m](buffer)) }; }
  catch (e) { if (e instanceof VisualProviderError) throw e; throw new VisualProviderError('Could not analyze this image.', 422); }
}

const MAX_IMAGES = 4; // photos indexed per product (primary first)
async function mediaBytes(m) {
  for (const f of ['md.jpg', 'md.webp', 'sm.jpg', 'sm.webp', 'original.jpg']) { try { return await readMediaFile(m, f); } catch { /* try next */ } }
  return null;
}

/**
 * Index every active product's photos (up to MAX_IMAGES, primary first) for the active model — and always for the colour model, the safety
 * net that answers searches while CLIP loads or if it is unavailable. Also keeps the primary photo's colour histogram (owner reports).
 */
export async function reindexPending(limit = 20, forceModel) {
  const active = forceModel || await activeModel();
  const models = [...new Set([active, 'color-v1'])];
  // photos that were removed / replaced no longer match anything
  q.run("DELETE FROM visual_vectors WHERE slot LIKE 'm%' AND NOT EXISTS (SELECT 1 FROM product_media pm WHERE pm.product_id=visual_vectors.product_id AND pm.media_id=visual_vectors.media_id)");
  let done = 0, remaining = false;
  for (const model of models) {
    const rows = q.all(
      `SELECT pm.product_id AS product_id, m.* FROM products p
         JOIN product_media pm ON pm.product_id=p.id JOIN media m ON m.id=pm.media_id
        WHERE p.status='active'
          AND (SELECT COUNT(*) FROM product_media o WHERE o.product_id=pm.product_id AND (o.is_primary>pm.is_primary OR (o.is_primary=pm.is_primary AND (o.position<pm.position OR (o.position=pm.position AND o.media_id<pm.media_id)))))<?
          AND NOT EXISTS (SELECT 1 FROM visual_vectors v WHERE v.product_id=pm.product_id AND v.model=? AND v.slot='m'||pm.media_id)
        ORDER BY pm.is_primary DESC LIMIT ?`, [MAX_IMAGES, model, limit]);
    if (rows.length === limit) remaining = true;
    for (const m of rows) {
      try {
        const buf = await mediaBytes(m); if (!buf) continue;
        const e = await embedImage(buf, model);
        const hist = await colorDescriptor(buf).catch(() => null);
        q.run('INSERT OR REPLACE INTO visual_vectors (product_id, model, slot, media_id, vec, hist) VALUES (?,?,?,?,?,?)', [m.product_id, e.model, `m${m.id}`, m.id, toBlob(e.vec), hist ? toBlob(hist) : null]);
        done++;
      } catch (e) { console.error('[visual] index failed for product', m.product_id, e.message); }
    }
  }
  const colorRows = q.all(
    `SELECT p.id AS product_id, m.* FROM products p JOIN product_media pm ON pm.product_id=p.id AND pm.is_primary=1 JOIN media m ON m.id=pm.media_id
       LEFT JOIN product_colors c ON c.product_id=p.id WHERE p.status='active' AND (c.product_id IS NULL OR c.media_id!=m.id) LIMIT ?`, [limit]);
  for (const m of colorRows) {
    try {
      const buf = await mediaBytes(m); if (!buf) continue;
      q.run('INSERT INTO product_colors (product_id, media_id, hist) VALUES (?,?,?) ON CONFLICT(product_id) DO UPDATE SET media_id=excluded.media_id, hist=excluded.hist', [m.product_id, m.id, toBlob(await colorDescriptor(buf))]);
      done++;
    } catch (e) { console.error('[visual] colour index failed for product', m.product_id, e.message); }
  }
  if (colorRows.length === limit) remaining = true;
  if (done) invalidateVisualCache();
  return { done, remaining };
}

let timer = null, running = false;
/** Debounced background indexing — call after a product is saved. */
export function triggerReindex(delay = 4000) {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (running) return triggerReindex(10000);
    running = true;
    try { const r = await reindexPending(20); if (r.remaining) triggerReindex(60_000); } catch (e) { console.error('[visual]', e.message); }
    running = false;
  }, delay);
  timer.unref?.();
}
export function startVisualIndexer() {
  if (visualSettings().model === 'clip') clipReady().then(() => triggerReindex(1000)).catch(() => {}); // load the model in the background
  triggerReindex(3000);
  setInterval(() => triggerReindex(0), 10 * 60 * 1000).unref?.();
}

/* ---------------- catalogue cache (vectors + family + colour), refreshed every 30 s ---------------- */
let catalog = { at: 0, model: null, rows: [], centroids: new Map() };
export function invalidateVisualCache() { catalog.at = 0; }
function loadCatalog(model) {
  if (catalog.model === model && Date.now() - catalog.at < 30_000) return catalog;
  const vectors = q.all(
    `SELECT v.product_id AS id, v.slot, v.vec, v.hist, COALESCE(pm.is_primary, 0) AS is_primary, p.name_ar, p.name_en, p.department,
            COALESCE(cat.name_ar || ' ' || cat.name_en, '') AS cat_text
       FROM visual_vectors v JOIN products p ON p.id=v.product_id JOIN stores s ON s.id=p.store_id
       LEFT JOIN product_media pm ON pm.product_id=v.product_id AND pm.media_id=v.media_id
       LEFT JOIN categories cat ON cat.id=p.category_id
      WHERE v.model=? AND p.status='active' AND (p.track_stock=0 OR p.stock>0) AND s.status='active' AND s.hidden=0
      ORDER BY v.product_id, is_primary DESC, v.slot`, [model])
    .map((r) => ({ id: r.id, vec: fromBlob(r.vec), hist: r.hist ? fromBlob(r.hist) : null, department: r.department, family: visualProductFamily(r) }));
  // `vectors`: every photo (search pool; a product counts once, via its best photo). `rows`: one per product (primary photo first) — used for
  // "training": the catalogue's own labelled products become per-family centroids (used only by the CLIP classifier).
  const seen = new Set(); const rows = [];
  for (const v of vectors) if (!seen.has(v.id)) { seen.add(v.id); rows.push(v); }
  catalog = { at: Date.now(), model, rows, vectors, centroids: buildCentroids(rows) };
  return catalog;
}

export const loadVisualCatalog = (model) => loadCatalog(model);

/** primary photo bytes of a product (used by the training / calibration script) */
export async function readPrimaryImage(productId) {
  const m = q.get('SELECT m.* FROM product_media pm JOIN media m ON m.id=pm.media_id WHERE pm.product_id=? AND pm.is_primary=1', [productId]);
  if (!m) return null;
  for (const f of ['md.jpg', 'md.webp', 'sm.jpg', 'sm.webp', 'original.jpg']) { try { return await readMediaFile(m, f); } catch { /* try next */ } }
  return null;
}

let textProtos = null; // { model, map } — text prompts are embedded once per model
export async function protosFor(model, cat) {
  if (textProtos?.model !== model) textProtos = { model, map: await buildTextPrototypes(clipEmbedTexts) };
  return { text: textProtos.map, centroids: cat.centroids };
}

/** The «closest alternatives» list (shown under the exact matches, clearly labelled) goes this far below the match floor. */
const SIMILAR_MARGIN = { clip: 0.15, jina: 0.10, color: 0.07 };
const SIMILAR_MAX = 8;
const similarFloorOf = (model, floor) => Math.max(0.4, floor - (model === CLIP_MODEL_NAME ? SIMILAR_MARGIN.clip : model === JINA_MODEL ? SIMILAR_MARGIN.jina : SIMILAR_MARGIN.color));
const floorOf = (settings, model) => (model === CLIP_MODEL_NAME ? settings.minSimilarityByModel.clip : model === JINA_MODEL ? settings.minSimilarityByModel.jina : settings.minSimilarityByModel.color) / 100;

/**
 * Finds what the customer's photo shows and returns ONLY genuinely similar products.
 *   → { model, detected: [{ type, label, confidence }], groups: [{ type, label, confidence, items: [{ id, score }], similar: [{ id, score }] }] }
 * Without `type` (CLIP): pieces are detected automatically (an outfit photo yields top / bottom / shoes groups).
 * With `type`: only that family. A group with no item above the quality gate simply has an empty `items` list —
 * nothing weak is ever added as filler; the UI offers a sourcing request instead.
 */
export async function searchByImage(buffer, { department = '', type = '', limit = 24, _model } = {}) {
  if (type && !visualTypeOptions().some((candidate) => candidate.key === type)) throw new VisualProviderError('Unknown item type.', 422);
  const settings = visualSettings();
  const model = _model || await activeModel();
  const isClip = model === CLIP_MODEL_NAME;
  const floor = floorOf(settings, model);

  let regions;
  if (isClip) {
    try {
      regions = [];
      for (const crop of await cropRegions(buffer)) regions.push({ key: crop.key, vec: normalize(await clipEmbedImage(crop.buffer)), hist: await colorDescriptor(crop.buffer) });
    } catch (e) {
      // CLIP failed on this photo (model error / out of memory): answer with the colour model instead of failing the customer
      if (!_model) { console.error('[visual] CLIP failed, using colour model:', e.message); return searchByImage(buffer, { department, type, limit, _model: 'color-v1' }); }
      throw new VisualProviderError('Could not analyze this image.', 422);
    }
  } else {
    regions = [{ key: 'full', vec: (await embedImage(buffer, model)).vec, hist: null }];
  }

  const cat = loadCatalog(model);
  const pool = department ? cat.vectors.filter((r) => r.department === department) : cat.vectors;
  const histOf = (key) => regions.find((r) => r.key === key)?.hist || null;

  let detections;
  if (isClip) {
    const protos = await protosFor(model, cat);
    if (type) { const pick = vectorForFamily(regions, protos, type); detections = [{ family: type, p: pick.p, vec: pick.vec, hist: histOf(pick.regionKey) }]; }
    else detections = detectItems(regions, protos).map((d) => ({ ...d, hist: histOf(d.regionKey) }));
  } else {
    detections = [{ family: type, p: 1, vec: regions[0].vec, hist: null }];
  }

  const wholeHist = await colorDescriptor(buffer).catch(() => null); // colour naming for the demand log (all models)
  const groups = detections.map((d) => {
    const cands = d.family ? pool.filter((r) => r.family === d.family) : pool;
    const best = rankConfident(d.vec, d.hist, cands, { floor: -Infinity, window: Infinity, limit: 1, useColor: isClip })[0]?.score ?? null;
    const items = rankConfident(d.vec, d.hist, cands, { floor, limit, useColor: isClip });
    // «closest alternatives»: same garment type, below the strict floor, never the same products as `items`; the UI labels them honestly
    const shown = new Set(items.map((x) => x.id));
    const similar = rankConfident(d.vec, d.hist, cands, { floor: similarFloorOf(model, floor), window: Infinity, limit: limit + SIMILAR_MAX, useColor: isClip })
      .filter((x) => !shown.has(x.id)).slice(0, SIMILAR_MAX);
    return {
      type: d.family || '', label: FRIENDLY_AR[d.family] || '', confidence: Math.round(d.p * 100) / 100,
      color: dominantColor(d.hist || wholeHist)?.key || '', best, items, similar,
    };
  });
  return { model, detected: groups.map(({ type: t, label, confidence }) => ({ type: t, label, confidence })), groups };
}

export { VisualProviderError };
