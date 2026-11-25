// Visual style tags for outfit compatibility (Smart Look + Twila full outfits only; never used to hide products from search).
//  pattern: plain | plaid | stripe | subtle_print | graphic | logo_heavy | unknown
//  visualLoudness: low | medium | high | unknown
//  styleTier: basic | casual | streetwear | smart_casual | formal | unknown
//  silhouette: fitted | regular | relaxed | oversized | unknown
//  layerRole: base | outerwear | bottom | footwear | accessory | unknown
// Sources, strongest first: 'admin' (owner/admin correction) > 'image' (image-analysis service, interface below) > 'text' (name/description keywords).
// Text-only inference is never presented as image certainty: it carries source:'text' and a confidence, and a missing pattern stays 'unknown'.

export const PATTERNS = ['plain', 'plaid', 'stripe', 'subtle_print', 'graphic', 'logo_heavy', 'unknown'];
export const LOUDNESS = ['low', 'medium', 'high', 'unknown'];
export const TIERS = ['basic', 'casual', 'streetwear', 'smart_casual', 'formal', 'unknown'];
export const SILHOUETTES = ['fitted', 'regular', 'relaxed', 'oversized', 'unknown'];
export const LAYER_ROLES = ['base', 'outerwear', 'bottom', 'footwear', 'accessory', 'unknown'];

const BASE_KEYS = new Set(['tshirt', 'polo', 'shirt', 'blouse', 'sweater', 'hoodie', 'tunic', 'top', 'sport_top']);
const OUTER_KEYS = new Set(['jacket', 'coat', 'cardigan', 'blazer', 'waistcoat', 'long_cardigan', 'shawl']);
const BOTTOM_KEYS = new Set(['jeans', 'trousers', 'chinos', 'shorts', 'skirt', 'leggings', 'joggers', 'sport_bottom']);
const SHOE_KEYS = new Set(['sneakers', 'formal_shoes', 'loafers', 'heels_low', 'heels_high', 'flats', 'sandals', 'boots', 'slippers', 'sport_shoes', 'shoes_any']);
export function layerRoleOf(key) {
  if (!key) return 'unknown';
  if (BASE_KEYS.has(key)) return 'base'; if (OUTER_KEYS.has(key)) return 'outerwear'; if (BOTTOM_KEYS.has(key)) return 'bottom'; if (SHOE_KEYS.has(key)) return 'footwear';
  return 'accessory';
}
export const isUpperBody = (role) => role === 'base' || role === 'outerwear';

const norm = (s) => String(s || '').toLowerCase().replace(/[ً-ٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
const has = (t, re) => re.test(t);
const PLAID = /\b(plaid|check(ed|s)?|checkered|tartan|flannel|gingham|houndstooth)\b|كاروهات|كارو|مربعات|مقلم\s*كاروهات|فلانيل|اسكتلندي|تارتان/;
const STRIPE = /\b(stripe[sd]?|striped|pinstripe)\b|مخطط|ستريب|مقلم|خطوط/;
const LOGO = /\b(logo[- ]?(heavy|print|all|over)|all[- ]?over\s*logo|monogram|brand(ed)?\s*print)\b|لوجو\s*(كبير|كامل)|شعار\s*(كبير|كامل)/;
const GRAPHIC = /\b(graphic|print(ed)?|skull|skeleton|dragon|tiger|anime|cartoon|slogan|letter(ing)?|typography|tie[- ]?dye|camo(uflage)?|drip|flame|rock|metal|band)\b|طباعه|مطبوع|برنت|جمجم|هيكل|تنين|كارتون|انمي|كتابه|شعار|ستريت\s*ور/;
const SUBTLE = /\b(subtle|small|micro|tiny|tonal|jacquard|embossed|textured|dotted|polka)\b\s*(print|pattern|logo|texture)?|نقشه\s*(صغير|هاد)|منقط|نقش\s*خفيف|مطرز\s*بسيط|تيكستشر|جاكارد/;
const PLAIN = /\b(plain|solid|basic|classic|essential|one[- ]?colou?r|monochrome)\b|ساده|سادا|سولد|بيسيك|بدون\s*(طباعه|نقش|رسم|برنت)|لون\s*واحد/;
const BIG = /\b(large|big|oversized\s*(print|graphic)|bold|giant|all[- ]?over|statement|loud)\b|كبير|ضخم|صارخ|صاخب|جمجم|skull/;
const STREET = /\b(street(wear)?|hip[- ]?hop|skate|urban|grunge|y2k|baggy|oversize[d]?)\b|ستريت|هيب\s*هوب|اوفر\s*سايز/;
const WORKWEAR = /\b(work(wear)?|utility|smart[- ]?casual|business\s*casual|lumberjack|chore)\b|وورك\s*ويير|سمارت\s*كاجوال|عملي|شغل|مكتب/;
const FORMAL = /\b(formal|classic|dress\s*shirt|tuxedo|office)\b|رسمي|كلاسيك|سموكن/;
const OVERSIZE = /\b(oversize[d]?|baggy|boxy)\b|اوفر\s*سايز|واسع\s*جدا/;
const RELAXED = /\b(relaxed|loose|wide)\b|واسع|ريلاكس|فضفاض/;
const FITTED = /\b(slim|fitted|skinny|tight|body\s*fit)\b|سليم|ضيق|ملتصق|فيت/;

/** Text inference. p: enriched product row ({key, formality, name_ar, name_en, description_ar, description_en}). Returns tags + per-field evidence (what text triggered it). */
export function inferVisualTags(p) {
  const text = norm(`${p.name_ar || ''} ${p.name_en || ''} ${p.description_ar || ''} ${p.description_en || ''}`);
  const name = norm(`${p.name_ar || ''} ${p.name_en || ''}`);
  const role = layerRoleOf(p.key); const evidence = [];
  let pattern = 'unknown'; let loudness = 'unknown'; let conf = 'none';
  const gStrong = has(name, GRAPHIC) || has(text, GRAPHIC);
  if (has(text, LOGO)) { pattern = 'logo_heavy'; loudness = 'high'; conf = 'medium'; evidence.push('logo'); }
  else if (gStrong && !has(text, SUBTLE)) { pattern = 'graphic'; loudness = has(text, BIG) ? 'high' : 'medium'; conf = 'medium'; evidence.push('graphic'); }
  else if (has(text, PLAID)) { pattern = 'plaid'; loudness = has(text, BIG) ? 'high' : 'medium'; conf = 'medium'; evidence.push('plaid'); }
  else if (has(text, STRIPE)) { pattern = 'stripe'; loudness = 'medium'; conf = 'medium'; evidence.push('stripe'); }
  else if (has(text, SUBTLE)) { pattern = 'subtle_print'; loudness = 'low'; conf = 'medium'; evidence.push('subtle'); }
  else if (has(text, PLAIN)) { pattern = 'plain'; loudness = 'low'; conf = 'medium'; evidence.push('plain_word'); }
  else if (isUpperBody(role) && Number(p.formality) >= 4) { pattern = 'plain'; loudness = 'low'; conf = 'low'; evidence.push('formal_default'); } // formal tops/outerwear are plain by nature
  let tier = 'unknown';
  if (has(text, STREET) || pattern === 'graphic' || pattern === 'logo_heavy') { tier = 'streetwear'; evidence.push('tier:street'); }
  else if (has(text, WORKWEAR) || (pattern === 'plaid' && role === 'outerwear')) { tier = 'smart_casual'; evidence.push('tier:work'); }
  else if (Number(p.formality) >= 4 || has(text, FORMAL)) { tier = 'formal'; evidence.push('tier:formal'); }
  else if (pattern === 'plain' && conf !== 'low') { tier = 'basic'; evidence.push('tier:basic'); }
  const silhouette = has(text, OVERSIZE) ? 'oversized' : has(text, RELAXED) ? 'relaxed' : has(text, FITTED) ? 'fitted' : 'unknown';
  return { pattern, visualLoudness: loudness, styleTier: tier, silhouette, layerRole: role, source: 'text', confidence: conf, evidence };
}

const pick = (v, allowed) => (allowed.includes(v) ? v : undefined);
/** Parse an override / image-analysis blob ({pattern, visualLoudness, styleTier, silhouette, layerRole, source, confidence}). Invalid fields are dropped. */
export function parseStoredTags(raw) {
  let o = raw; if (typeof o === 'string') { try { o = JSON.parse(o); } catch { return null; } }
  if (!o || typeof o !== 'object') return null;
  const out = { pattern: pick(o.pattern, PATTERNS), visualLoudness: pick(o.visualLoudness, LOUDNESS), styleTier: pick(o.styleTier, TIERS), silhouette: pick(o.silhouette, SILHOUETTES), layerRole: pick(o.layerRole, LAYER_ROLES) };
  out.source = o.source === 'admin' ? 'admin' : o.source === 'image' ? 'image' : null;
  out.confidence = ['high', 'medium', 'low'].includes(o.confidence) ? o.confidence : out.source === 'admin' ? 'high' : 'medium';
  return out.source ? out : null;
}

/**
 * Final tags for a product. Stored tags (admin > image) override the text inference field by field; 'unknown' in a stored blob does not override.
 * `reliable` = the pattern is known from an admin/image source, or from explicit text evidence (not from a guess).
 */
export function visualTagsOf(p) {
  const base = inferVisualTags(p); const image = visualFactsTags(p.ai_json, p.key); const stored = parseStoredTags(p.vtags_json);
  // Priority: owner/admin correction > analyzed product image > explicit catalogue text.
  const out = image
    ? { ...base, ...image, evidence: [...base.evidence, 'image_facts'] }
    : { ...base };
  if (stored) {
    out.source = stored.source; out.confidence = stored.confidence;
    out.evidence = [...out.evidence, `${stored.source}_override`];
    for (const k of ['pattern', 'visualLoudness', 'styleTier', 'silhouette', 'layerRole']) if (stored[k] && stored[k] !== 'unknown') out[k] = stored[k];
  }
  out.reliable = out.pattern !== 'unknown';
  return out;
}

function visualFactsTags(raw, key) {
  let f = raw;
  if (typeof f === 'string') { try { f = JSON.parse(f); } catch { return null; } }
  if (!f || typeof f !== 'object') return null;
  const pat = norm(f.pattern || '');
  const pattern = /كاروه|مربعات|تارتان|فلانيل/.test(pat) ? 'plaid'
    : /مخطط|خطوط|ستريب/.test(pat) ? 'stripe'
      : /ساده|لون واحد/.test(pat) ? 'plain'
        : /مطرز|منقط|نقش خفيف|جاكار/.test(pat) ? 'subtle_print'
          : /مطبوع|برنت|طباعه|جرافيك|شعار/.test(pat) ? 'graphic' : 'unknown';
  if (pattern === 'unknown') return null;
  const l = norm(f.visual_loudness || f.visualLoudness || '');
  const visualLoudness = /عال|قوي|بارز|صارخ|صاخب|high/.test(l) ? 'high'
    : /هادي|خفيف|منخفض|low/.test(l) ? 'low'
      : /متوسط|medium/.test(l) ? 'medium'
        : pattern === 'graphic' ? 'high' : pattern === 'plain' || pattern === 'subtle_print' ? 'low' : 'medium';
  const ft = norm(f.style_tier || f.styleTier || f.formality || '');
  const styleTier = /رسمي|سواريه|formal/.test(ft) ? 'formal'
    : /شبه رسمي|عملي|مكتب|smart/.test(ft) ? 'smart_casual'
      : /ستريت|شارع|street|رياضي|sport/.test(ft) ? 'streetwear'
        : /كاجوال|casual/.test(ft) ? 'casual'
          : pattern === 'graphic' ? 'streetwear' : 'unknown';
  const fit = norm(f.fit || '');
  const silhouette = /اوفر|oversize|فضفاض/.test(fit) ? 'oversized'
    : /ضيق|سليم|skinny|fitted/.test(fit) ? 'fitted'
      : /واسع|ريلاكس|loose|relaxed/.test(fit) ? 'relaxed'
        : /مستقيم|regular/.test(fit) ? 'regular' : 'unknown';
  return { pattern, visualLoudness, styleTier, silhouette, layerRole: layerRoleOf(key), source: 'image', confidence: 'medium' };
}

/** Interface for a later image classifier. Implement `classify(imageUrl, product) -> {pattern,...,confidence}` and call saveImageTags(); nothing calls a model today. */
export const imageAnalysis = { classify: null };

/**
 * Outfit-level visual check. Returns { hard: [reasons], pen: [[reason, points]] }.
 * Only upper-body pieces (base + outerwear) must have reliable tags; bottoms/footwear/accessories don't affect print or loudness.
 */
export function visualOutfitCheck(pieces) {
  const hard = []; const pen = [];
  const tagged = pieces.map((p) => ({ p, t: p.visual || visualTagsOf(p) }));
  const upper = tagged.filter(({ t, p }) => isUpperBody(layerRoleOf(p.key)) || isUpperBody(t.layerRole));
  if (upper.some(({ t }) => !t.reliable || t.pattern === 'unknown')) hard.push('visual_tags_unknown');
  const known = upper.filter(({ t }) => t.pattern !== 'unknown');
  const loud = (t) => t.visualLoudness === 'high' || t.pattern === 'logo_heavy';
  const bold = (t) => t.pattern === 'graphic' || t.pattern === 'logo_heavy';
  const roleOf = (x) => layerRoleOf(x.p.key);
  if (known.filter(({ t }) => loud(t)).length >= 2) hard.push('upper_body_visual_competition');
  const plaidOuter = known.filter((x) => x.t.pattern === 'plaid' && roleOf(x) === 'outerwear');
  const boldInner = known.filter((x) => bold(x.t) && roleOf(x) === 'base');
  if (plaidOuter.length && boldInner.length) hard.push('plaid_graphic_conflict');
  else if (known.some((x) => x.t.pattern === 'plaid') && known.some((x) => bold(x.t))) hard.push('plaid_graphic_conflict'); // plaid vs graphic in either layering
  // loud / plaid outerwear needs a plain or subtle inner top
  for (const o of known.filter((x) => roleOf(x) === 'outerwear' && (loud(x.t) || x.t.pattern === 'plaid' || x.t.pattern === 'stripe'))) {
    for (const i of known.filter((x) => roleOf(x) === 'base')) if (!['plain', 'subtle_print'].includes(i.t.pattern) && !hard.includes('plaid_graphic_conflict') && !hard.includes('upper_body_visual_competition')) { if (!hard.includes('pattern_conflict')) hard.push('pattern_conflict'); }
    void o;
  }
  // two different non-plain patterns (plaid+stripe, stripe+graphic...) on the upper body
  const patterned = known.filter((x) => !['plain', 'subtle_print'].includes(x.t.pattern));
  if (patterned.length >= 2 && new Set(patterned.map((x) => x.t.pattern)).size >= 2 && !hard.includes('plaid_graphic_conflict') && !hard.includes('pattern_conflict')) hard.push('pattern_conflict');
  // style tiers: smart-casual/formal vs streetwear is a mismatch unless the whole look is consistently streetwear
  const tiers = tagged.filter(({ p, t }) => t.styleTier !== 'unknown' && layerRoleOf(p.key) !== 'accessory').map(({ t }) => t.styleTier);
  const serious = tiers.some((x) => x === 'smart_casual' || x === 'formal'); const street = tiers.includes('streetwear');
  if (serious && street) hard.push('style_tier_mismatch');
  const missing = upper.filter(({ t }) => !t.reliable || t.pattern === 'unknown').map(({ p }) => p.id);
  return { hard: [...new Set(hard)], pen, missing };
}

export const ALL_VISUAL_REASONS = ['visual_tags_unknown', 'upper_body_visual_competition', 'plaid_graphic_conflict', 'style_tier_mismatch', 'pattern_conflict'];
// Rollout, in order. Reasons switched on one by one with VISUAL_ENFORCE (comma list, or "all").
export const CLEAR_VISUAL_REASONS = ['plaid_graphic_conflict', 'upper_body_visual_competition'];
/**
 * VISUAL_GATE: unset | "1"       -> reject only clear, explicitly tagged clashes (default)
 *              "shadow"          -> observe only: nothing is hidden, would-be rejections are logged
 *              "0" | "off"       -> not even observed
 *              "1" | "enforce"   -> reject only VISUAL_ENFORCE reasons (default: the two clear clashes)
 *              "full"            -> reject every visual reason (only once tag coverage is high)
 * Returns { mode, visual, observe } where `visual` is what reviewLook enforces (false | true | [reasons]).
 */
export function visualGateConfig(env = process.env) {
  // Clear pattern clashes are high-confidence when tags have explicit evidence (text, image, or admin).
  // Unknown tags remain observable and are not blocked by default, so sparse catalog coverage does not blank the feature.
  const raw = String(env.VISUAL_GATE ?? '1').trim().toLowerCase();
  if (['0', 'off', 'false'].includes(raw)) return { mode: 'off', visual: false, observe: false };
  if (['full', 'all'].includes(raw)) return { mode: 'full', visual: true, observe: true };
  if (['1', 'on', 'enforce', 'true'].includes(raw)) {
    const list = String(env.VISUAL_ENFORCE || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (list.includes('all')) return { mode: 'full', visual: true, observe: true };
    const reasons = (list.length ? list : CLEAR_VISUAL_REASONS).filter((r) => ALL_VISUAL_REASONS.includes(r));
    return { mode: 'enforce', visual: reasons.length ? reasons : false, observe: true };
  }
  return { mode: 'shadow', visual: false, observe: true };
}

/** Tag coverage of upper-body products: the number that decides whether enforcement is safe. rows: enriched product rows. */
export function coverageOf(rows) {
  const upper = (rows || []).filter((p) => p && p.key && !p.notFashion && isUpperBody(layerRoleOf(p.key)));
  const tags = upper.map((p) => ({ p, t: visualTagsOf(p) }));
  const reliable = tags.filter((x) => x.t.reliable);
  const by = (f) => tags.filter(f).length;
  const pct = upper.length ? reliable.length / upper.length : 0;
  return { upperBody: upper.length, reliable: reliable.length, unknown: upper.length - reliable.length, pct, fromText: by((x) => x.t.reliable && x.t.source === 'text'), fromImage: by((x) => x.t.source === 'image' && x.t.reliable), fromAdmin: by((x) => x.t.source === 'admin' && x.t.reliable),
    readyForClear: pct >= 0.8, readyForUnknown: pct >= 0.9 };
}
