/**
 * Acceptance measurement for visual search — pure logic (no DB, no model), driven by the script `npm run eval:visual -w server`.
 * A "case" is a query photo with the product that SHOULD be found:
 *   kind 'reshot' : a synthetic phone re-shot of the product's own photo
 *   kind 'photo'  : ANOTHER photo of the same product (worn / different angle) with the query photo left out of the catalogue
 *   kind 'noise'  : a photo that resembles nothing in a clothing catalogue; nothing may be returned as a match
 * `search(buffer, opts)` is searchByImage (or a stub in tests) → { groups: [{ items, similar }] }.
 */
const has = (groups, key, id) => groups.some((g) => (g[key] || []).some((x) => x.id === id));

export async function measure(cases, search, opts = {}) {
  const { onProgress, ...searchOpts } = opts;
  const kinds = {}; const fails = []; let itemsShown = 0; let noiseFP = 0; let noiseN = 0;
  let done = 0;
  for (const c of cases) {
    onProgress?.(++done, cases.length);
    const res = await search(c.buffer, { ...searchOpts, ...(c.expectId ? { _expectId: c.expectId } : {}), ...(c.excludeSlot ? { _excludeSlot: c.excludeSlot } : {}) });
    const groups = res.groups || [];
    const k = (kinds[c.kind] ||= { n: 0, strict: 0, near: 0, equiv: 0 });
    if (c.kind === 'noise') { noiseN++; if (groups.some((g) => g.items.length)) noiseFP++; continue; }
    k.n++;
    const strict = has(groups, 'items', c.expectId); const near = strict || has(groups, 'similar', c.expectId);
    // «equivalent»: the shopper was shown a product that looks the same as the expected one (the same item listed in another colour / twice)
    const equiv = strict || groups.some((g) => g.items.some((x) => c.equiv?.has(x.id)));
    if (strict) k.strict++; if (near) k.near++; if (equiv) k.equiv++;
    itemsShown += groups.reduce((n, g) => n + g.items.length, 0);
    if (!strict) if (!equiv) fails.push({ id: c.expectId, kind: c.kind, name: c.name || '', near, diag: res.diag || null });
  }
  const real = Object.entries(kinds).filter(([k]) => k !== 'noise').map(([, v]) => v);
  const n = real.reduce((a, v) => a + v.n, 0); const strict = real.reduce((a, v) => a + v.strict, 0); const equiv = real.reduce((a, v) => a + v.equiv, 0); const near = real.reduce((a, v) => a + v.near, 0);
  return {
    n, strictRecall: n ? strict / n : NaN, equivRecall: n ? equiv / n : NaN, nearRecall: n ? near / n : NaN, byKind: kinds,
    avgItems: n ? itemsShown / n : NaN, noiseFalsePositive: noiseN ? noiseFP / noiseN : 0, noiseN, fails,
  };
}

/** Same measurement at several floors (cosine, 0..1): the table shows recall bought per floor, and the false-positive cost. */
export async function sweep(cases, search, floors) {
  const rows = [];
  for (const f of floors) { const m = await measure(cases, search, { _floor: f }); rows.push({ floor: f, strictRecall: m.strictRecall, equivRecall: m.equivRecall, avgItems: m.avgItems, noiseFalsePositive: m.noiseFalsePositive }); }
  return rows;
}

/** Highest floor that still reaches `target` strict recall with at most `maxNoiseFP` false positives; null when none does. */
export function recommendFloor(rows, target = 0.98, maxNoiseFP = 0.02) {
  const ok = rows.filter((r) => (r.equivRecall ?? r.strictRecall) >= target && r.noiseFalsePositive <= maxNoiseFP).sort((a, b) => b.floor - a.floor);
  return ok[0]?.floor ?? null;
}

/**
 * Why a product was not found, from `diag.expect` (see searchByImage `_expectId`): the best of the searched groups decides.
 *   wrong_family : the product is in no searched candidate list     below_floor : its score is under the match floor
 *   cut_off      : above the floor but not shown (outranked / outside the window / over the limit)    unknown : no diagnostics
 */
export function failureReason(diag, floor) {
  const ex = (diag?.expect || []).filter(Boolean);
  if (!ex.length) return 'unknown';
  const inC = ex.filter((e) => e.inCands && e.score != null);
  if (!inC.length) return 'wrong_family';
  const best = inC.sort((a, b) => b.score - a.score)[0];
  return best.score < floor ? 'below_floor' : 'cut_off';
}
