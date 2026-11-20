/** Visual search — pure helpers for related garment families (no DB, no model). */
/**
 * Families that shoppers treat as interchangeable when they photograph an outfit: a velvet tracksuit may be listed under
 * "sport", "suiting" (سوت) or only by its name, and a matching set is never a single garment family.
 * Searching one family only (the old behaviour) hid products that were really there.
 */
export const RELATED_FAMILIES = {
  sport: ['suiting', 'dresses', 'tops', 'bottoms'],
  suiting: ['sport', 'dresses', 'outerwear'],
  dresses: ['suiting', 'sport'],
  tops: ['sport', 'outerwear', 'underwear_sleep'],
  bottoms: ['sport'],
  outerwear: ['tops', 'sport', 'suiting'],
  underwear_sleep: ['sport', 'tops'],
  modest: ['outerwear', 'dresses'],
};
/** score taken off a candidate that is only a related family / has no recorded type, so exact-family products still win ties */
export const RELATED_PENALTY = 0.03;
export const UNTYPED_PENALTY = 0.045;

/** names that say "this is a matching set" (ترنج / طقم / سوت / سلوبيت / بدلة …) */
const SET_NAME = /(طقم|ترنج|ترينج|تريننج|سوت|بدل[ةه]|سلوبيت|تراك\s?سوت|تراك|مجموع[ةه]|two[\s-]?piece|track\s?suit|jogging\s?suit|\bset\b|\bsuit\b|co-?ord)/i;
export const isSetName = (row) => SET_NAME.test(`${row?.name_ar || ''} ${row?.name_en || ''}`);

/**
 * Candidate pool for one detected piece. Exact family first, but also related families (a tracksuit may be filed as
 * sport / suiting / tops) and products whose type could not be inferred (family null) — both with a small score penalty so
 * exact-family products still win ties. `set` = a matching outfit: products named طقم/ترنج/سوت… or filed under sport/suiting.
 * pool rows: { id, vec, hist, family, isSet }
 */
export function candidatesFor(pool, family) {
  if (!family) return pool;
  if (family === 'set') {
    return pool.filter((r) => r.isSet || r.family === 'suiting' || r.family === 'sport')
      .map((r) => (r.isSet ? r : { ...r, penalty: RELATED_PENALTY }));
  }
  const related = new Set(RELATED_FAMILIES[family] || []);
  const out = [];
  for (const r of pool) {
    if (r.family === family) out.push(r);
    else if (related.has(r.family)) out.push({ ...r, penalty: RELATED_PENALTY });
    else if (!r.family) out.push({ ...r, penalty: UNTYPED_PENALTY });
  }
  return out;
}
