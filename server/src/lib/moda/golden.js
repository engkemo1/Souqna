// Golden Outfit Set: a frozen, human-judged exam for the outfit system (generator + safety gate + future ranker).
//  - generateBatch(): builds a balanced sample of REAL looks from the live catalog (shown / borderline / blocked by the reviewer), each stored with a full snapshot.
//  - A snapshot holds everything reviewLook() needs (pieces, variants, season/family maps, month, hero, audience), so the exam stays valid after the catalog changes.
//  - reviewSnapshot(): re-runs the CURRENT rules on a snapshot, deterministically. evaluateReviews(): compares those results with the human verdicts.
import { runModa } from './engine.js';
import { enrichAll } from './products.js';
import { smartLookText, acceptSmartLook, isFormalAnchor, reviewLook, minimumPiecesForLook, RULES_VERSION } from './smartlook.js';
import { q, insert } from '../../db/index.js';

export const REJECT_REASONS = ['color', 'fit', 'age_size', 'modesty', 'occasion', 'bad_data', 'other'];
const AUDIENCES = ['men', 'women', 'boys', 'girls', 'kids'];
export const BORDERLINE_MAX = 85; // accepted by the reviewer with a score in [MIN_SCORE, BORDERLINE_MAX] = borderline

const KEEP = ['id', 'key', 'gender', 'formality', 'colorKeys', 'typeConflict', 'colorConflict', 'audienceConflict', 'sizeConflict', 'notFashion', 'photo_mismatch', 'inStock', 'track_stock', 'frenchCuff', 'name_ar', 'name_en', 'price', 'sizes_json', 'store_slug', 'slug', 'vtags_json'];
export function pieceSnapshot(p, variants = []) {
  const o = {}; for (const k of KEEP) if (p[k] !== undefined) o[k] = p[k];
  o.description_ar = String(p.description_ar || '').slice(0, 300); o.description_en = String(p.description_en || '').slice(0, 300);
  o.variants = (variants || []).map((v) => ({ id: v.id, color: v.color, size: v.size, stock: v.stock }));
  return o;
}

export function monthInCairo(d = new Date()) { return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', month: 'numeric' }).format(d)); }

/** Everything reviewLook needs, frozen. K = loaded knowledge. */
export function makeSnapshot({ pieces, variantsByProduct, K, heroKey, audience, month = monthInCairo(), source = 'sample' }) {
  const keys = [...new Set(pieces.map((p) => p.key).filter(Boolean))];
  return {
    v: 1, source, month, heroKey: heroKey || null, audience: AUDIENCES.includes(audience) ? audience : null,
    season: Object.fromEntries(keys.map((k) => [k, K.kb?.seasonOf?.(k) || null])),
    family: Object.fromEntries(keys.map((k) => [k, K.items.get(k)?.family || null])),
    pieces: pieces.map((p) => pieceSnapshot(p, variantsByProduct.get(p.id) || [])),
  };
}

/** Re-run the CURRENT reviewer on a frozen snapshot. */
export function reviewSnapshot(snap) {
  const vs = new Map(snap.pieces.map((p) => [p.id, p.variants || []]));
  return reviewLook(snap.pieces, { variantsOf: (id) => vs.get(id) || [], seasonOf: (k) => snap.season?.[k] ?? null, familyOf: (k) => snap.family?.[k] ?? null, month: snap.month, heroKey: snap.heroKey, audience: snap.audience, visual: true });
}

/** Confusion of the reviewer against human verdicts. rows: [{ id, verdict, reasons:[], snapshot }]. The critical error is `badPass`: the reviewer lets through a look a human rejected. */
export function evaluateReviews(rows) {
  const out = { total: 0, truePass: 0, badPass: 0, missedGood: 0, trueBlock: 0, badPassIds: [], missedGoodIds: [], badPassReasons: {}, rulesVersion: RULES_VERSION };
  for (const r of rows) {
    if (r.verdict !== 'accept' && r.verdict !== 'reject') continue;
    const sys = reviewSnapshot(r.snapshot).ok; out.total += 1;
    if (r.verdict === 'accept') { if (sys) out.truePass += 1; else { out.missedGood += 1; out.missedGoodIds.push(r.id); } }
    else if (sys) { out.badPass += 1; out.badPassIds.push(r.id); for (const x of r.reasons || []) out.badPassReasons[x] = (out.badPassReasons[x] || 0) + 1; }
    else out.trueBlock += 1;
  }
  const humanReject = out.badPass + out.trueBlock; const humanAccept = out.truePass + out.missedGood; const sysPass = out.truePass + out.badPass;
  out.badPassRate = humanReject ? out.badPass / humanReject : 0;      // share of human-rejected looks the reviewer would still show (want ~0)
  out.precision = sysPass ? out.truePass / sysPass : 0;               // of the looks shown, how many humans accept
  out.recall = humanAccept ? out.truePass / humanAccept : 0;          // of the looks humans accept, how many are shown
  out.agreement = out.total ? (out.truePass + out.trueBlock) / out.total : 0;
  return out;
}

const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

/**
 * Build a balanced sample: ~40% shown, ~25% borderline, ~35% blocked-by-reviewer, spread across garment types and audiences.
 * deps: { rows, K, offers, stores, training, assistantName } (same inputs the product-page route uses). Stops at `budgetMs`.
 */
export async function generateBatch({ count = 30, batch, rows, K, offers, stores, training, assistantName, budgetMs = 40_000 }) {
  const enriched = enrichAll(rows, K); const byId = new Map(enriched.map((x) => [x.id, x]));
  const quota = { shown: Math.max(1, Math.round(count * 0.4)), borderline: Math.max(1, Math.round(count * 0.25)) }; quota.blocked = Math.max(1, count - quota.shown - quota.borderline);
  const got = { shown: 0, borderline: 0, blocked: 0 }; const skipped = {};
  const existing = new Set(q.all('SELECT anchor_id, sig FROM look_reviews').map((x) => `${x.anchor_id}:${x.sig}`));
  // anchors grouped by audience + garment so the sample is not 30 hoodies
  const groups = new Map();
  for (const p of enriched) {
    if (!p.key || p.inStock === false || p.typeConflict || p.colorConflict || p.audienceConflict || p.sizeConflict || p.notFashion || !AUDIENCES.includes(p.gender)) continue;
    const g = `${p.gender}:${p.key}`; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(p);
  }
  const queues = shuffle([...groups.values()]).map(shuffle);
  const perGroup = new Map(); const t0 = Date.now(); let tries = 0; const month = monthInCairo();
  const loadVariants = (ids) => { const map = new Map(ids.map((id) => [id, []])); if (ids.length) for (const v of q.all(`SELECT id, product_id, color, size, stock FROM variants WHERE product_id IN (${ids.map(() => '?').join(',')})`, ids)) map.get(v.product_id).push(v); return map; };
  let progressed = true;
  while (progressed && Date.now() - t0 < budgetMs && Object.keys(quota).some((b) => got[b] < quota[b])) {
    progressed = false;
    for (const qu of queues) {
      if (Date.now() - t0 >= budgetMs || !Object.keys(quota).some((b) => got[b] < quota[b])) break;
      const anchor = qu.pop(); if (!anchor) continue; progressed = true; tries += 1;
      const gk = `${anchor.gender}:${anchor.key}`; if ((perGroup.get(gk) || 0) >= 3) continue;
      const text = smartLookText(anchor); if (!text) { skipped.audience_unknown = (skipped.audience_unknown || 0) + 1; continue; }
      let result; try { result = await runModa([{ role: 'user', content: text }], { products: rows, assistantName, offers, stores, training }); } catch { skipped.engine_error = (skipped.engine_error || 0) + 1; continue; }
      const verdict = acceptSmartLook(result, { anchorId: anchor.id, anchorKey: anchor.key, anchorFormal: isFormalAnchor(anchor), keyOf: (id) => byId.get(id)?.key, minPieces: Math.max(1, minimumPiecesForLook(anchor.key) - 1) });
      if (!verdict.ok) { skipped[verdict.reason] = (skipped[verdict.reason] || 0) + 1; continue; } // the engine itself offered nothing: nothing to judge
      const pieces = [anchor, ...verdict.ids.map((id) => byId.get(id))]; if (pieces.some((x) => !x)) continue;
      const audience = anchor.gender;
      const snap = makeSnapshot({ pieces, variantsByProduct: loadVariants(pieces.map((x) => x.id)), K, heroKey: anchor.key, audience, month });
      const sys = reviewSnapshot(snap);
      const bucket = !sys.ok ? 'blocked' : sys.score <= BORDERLINE_MAX ? 'borderline' : 'shown';
      if (got[bucket] >= quota[bucket]) { skipped[`${bucket}_full`] = (skipped[`${bucket}_full`] || 0) + 1; continue; }
      const sig = pieces.map((x) => x.id).sort((a, b) => a - b).join(',');
      if (existing.has(`${anchor.id}:${sig}`)) { skipped.duplicate = (skipped.duplicate || 0) + 1; continue; }
      existing.add(`${anchor.id}:${sig}`);
      insert('look_reviews', { batch, anchor_id: anchor.id, sig, bucket, snapshot_json: JSON.stringify(snap), system_ok: sys.ok ? 1 : 0, system_score: sys.score, system_reasons: JSON.stringify(sys.reasons.slice(0, 12)), rules_version: RULES_VERSION });
      got[bucket] += 1; perGroup.set(gk, (perGroup.get(gk) || 0) + 1);
    }
  }
  return { batch, created: got, quota, tries, skipped, ms: Date.now() - t0 };
}
