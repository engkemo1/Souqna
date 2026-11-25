/**
 * Size normalisation for filters.
 * Store owners type sizes freely: «10», «10Y», «10y», «١٠», «١٢:١١», «٥:٢», «0-3M», «١٢-١٨ شهور», «1Y»…
 * Shoppers saw every spelling as its own filter and the filter matched the exact text only.
 * Here every spelling becomes ONE canonical label, and kids' sizes become AGE RANGES (in months) so
 * «سنة / سنتين / 12-18 شهور / 0-3M» can be searched by age bucket.
 */
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const toLatin = (s) => String(s ?? '').replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
const MON = '(?:m|mo|mos|month|months|شهر|شهور|اشهر|أشهر)';
const YRS = '(?:y|yr|yrs|year|years|سنه|سنة|سنين|سنوات|عام)';

/** Age buckets shoppers actually think in (months, [from, to) ). */
export const AGE_BUCKETS = [
  { key: 'a0_3', label: '0-3 شهور (حديث الولادة)', from: 0, to: 3 },
  { key: 'a3_6', label: '3-6 شهور', from: 3, to: 6 },
  { key: 'a6_12', label: '6-12 شهر', from: 6, to: 12 },
  { key: 'a12_24', label: 'سنة لسنتين', from: 12, to: 24 },
  { key: 'a24_48', label: '2-4 سنين', from: 24, to: 48 },
  { key: 'a48_72', label: '4-6 سنين', from: 48, to: 72 },
  { key: 'a72_96', label: '6-8 سنين', from: 72, to: 96 },
  { key: 'a96_120', label: '8-10 سنين', from: 96, to: 120 },
  { key: 'a120_144', label: '10-12 سنة', from: 120, to: 144 },
  { key: 'a144_192', label: '12-16 سنة', from: 144, to: 192 },
];
export const BABY_MAX_MONTHS = 35; // up to the end of the 2nd year = «رضع» (1 and 2 years old included)

const LETTER_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL', '5XL'];
const GRP_RANK = { age: 0, shoes: 1, num: 2, letters: 3 };
const yearsLabel = (a, b) => (a === b ? (a === 1 ? 'سنة' : a === 2 ? 'سنتين' : `${a} سنين`) : `${a}-${b} سنين`);

/**
 * @param {string} raw  the size as typed by the store
 * @param {{kid?:boolean}} ctx  kid = the product sits in a kids department (a plain number is then an AGE in years)
 * @returns {{label:string, grp:'age'|'num'|'letters', months:[number,number]|null, order:number}}
 */
export function canonSize(raw, { kid = false } = {}) {
  const s0 = toLatin(raw).trim().replace(/\s+/g, ' ');
  const s = s0.toLowerCase().replace(/[–—−]/g, '-').replace(/\s*([-:\/])\s*/g, '$1');
  if (!s) return { label: '', grp: 'letters', months: null, order: 9999 };
  let m;
  // the bare words «سنة» (1 year) and «سنتين» (2 years)
  if (/^(سنه|سنة|عام)$/.test(s)) return { label: 'سنة', grp: 'age', months: [12, 23], order: 12000 + 12 };
  if (/^(سنتين|عامين)$/.test(s)) return { label: 'سنتين', grp: 'age', months: [24, 35], order: 24000 + 24 };
  // 12-18 شهور / 0-3M / 3:6 months
  if ((m = s.match(new RegExp(`^(\\d{1,2})[-:/](\\d{1,2}) ?${MON}$`)))) { let a = +m[1], b = +m[2]; if (a > b) [a, b] = [b, a]; return { label: `${a}-${b} شهور`, grp: 'age', months: [a, b], order: a * 1000 + b }; }
  if ((m = s.match(new RegExp(`^(\\d{1,2}) ?${MON}$`)))) { const a = +m[1]; return { label: `${a} شهور`, grp: 'age', months: [a, a], order: a * 1000 + a }; }
  // 2-5 سنين / ٥:٢ (typed backwards) / 11-12y
  if ((m = s.match(new RegExp(`^(\\d{1,2})[-:/](\\d{1,2})(?: ?${YRS})?$`))) && (kid || new RegExp(YRS).test(s))) {
    let a = +m[1], b = +m[2]; if (a > b) [a, b] = [b, a];
    if (b <= 18) return { label: yearsLabel(a, b), grp: 'age', months: [a * 12, b * 12 + 11], order: a * 12000 + b * 12 };
  }
  // 1Y / 10y / 4 سنين
  if ((m = s.match(new RegExp(`^(\\d{1,2}) ?${YRS}$`)))) { const a = +m[1]; if (a <= 18) return { label: yearsLabel(a, a), grp: 'age', months: [a * 12, a * 12 + 11], order: a * 12000 + a * 12 }; }
  // a plain number inside a kids department is an age in years («10» = 10 years)
  if (kid && /^\d{1,2}$/.test(s) && +s <= 18) { const a = +s; return { label: yearsLabel(a, a), grp: 'age', months: [a * 12, a * 12 + 11], order: a * 12000 + a * 12 }; }
  if (/^free ?size$/.test(s)) return { label: 'Free size', grp: 'letters', months: null, order: 9000 };
  if (/^one ?size$/.test(s)) return { label: 'One size', grp: 'letters', months: null, order: 9001 };
  if (/^\d+(\.\d+)?$/.test(s)) return { label: s, grp: 'num', months: null, order: Number(s) };
  if (/^[a-z0-9]{1,5}$/.test(s) && /^(x{0,3}s|m|l|x{0,3}l|\d?x{1,3}l)$/.test(s)) { const up = s.toUpperCase(); const i = LETTER_ORDER.indexOf(up); return { label: up, grp: 'letters', months: null, order: i === -1 ? 500 : i }; }
  return { label: s0, grp: 'letters', months: null, order: 5000 };
}

// a month range that merely ENDS where a bucket starts («6-12 شهور» vs «سنة لسنتين») is not in that bucket; a single month (12M) is
const overlaps = (r, b) => r[0] < b.to && (r[1] > b.from || (r[1] === b.from && r[0] === r[1]));
const bucketByLabel = new Map(AGE_BUCKETS.map((b) => [b.label, b]));

/** Rows are DISTINCT (size, pid, kid, shoe). Returns the facet list [{size,grp,n}] — one entry per canonical label / age bucket. */
export function sizeFacets(rows) {
  const sets = new Map(); // key → {size, grp, order, pids:Set}
  const add = (key, size, grp, order, pid) => { let e = sets.get(key); if (!e) { e = { size, grp, order, pids: new Set() }; sets.set(key, e); } e.pids.add(pid); };
  for (const r of rows) {
    const c = canonSize(r.size, { kid: !!r.kid });
    if (!c.label) continue;
    // an explicit age («6-12 شهور», «سنة», «2Y») is an age bucket even when the product itself was not flagged as kids'
    if (c.months) { AGE_BUCKETS.forEach((b, i) => { if (overlaps(c.months, b)) add(`age:${b.key}`, b.label, 'age', i, r.pid); }); continue; }
    const grp = r.shoe && c.grp === 'num' ? 'shoes' : c.grp;
    add(`${grp}:${c.label}`, c.label, grp, c.order, r.pid);
  }
  return [...sets.values()].map((e) => ({ size: e.size, grp: e.grp, n: e.pids.size, _o: e.order }))
    .sort((a, b) => GRP_RANK[a.grp] - GRP_RANK[b.grp] || a._o - b._o).map(({ _o, ...x }) => x);
}

/**
 * Turn the requested filter values (labels from the facets, or old raw spellings like «1Y») into raw size strings to match in SQL.
 * @param {string[]} values
 * @param {{size:string,kid:number}[]} distinctRows every distinct (size, kid) pair that exists in variants
 * @returns {{kidSizes:string[], anySizes:string[]}} kidSizes only count on kids' products (ages); anySizes on every product (letters, numbers)
 */
export function sizeFilterSets(values, distinctRows) {
  const ranges = []; const labels = new Set();
  for (const v of values) {
    const b = bucketByLabel.get(v);
    if (b) { ranges.push([b.from, b.to - 1]); continue; }
    const c = canonSize(v, { kid: true });
    if (c.months) ranges.push(c.months);
    const c2 = canonSize(v, { kid: false });
    labels.add(c2.label); labels.add(String(v));
  }
  const kidSizes = new Set(); const anySizes = new Set();
  for (const r of distinctRows) {
    const c = canonSize(r.size, { kid: !!r.kid });
    if (c.months && ranges.some((x) => c.months[0] <= x[1] && c.months[1] >= x[0])) kidSizes.add(r.size);
    if ((!c.months || !r.kid) && (labels.has(c.label) || labels.has(String(r.size)))) anySizes.add(r.size);
  }
  return { kidSizes: [...kidSizes], anySizes: [...anySizes] };
}

/** raw sizes (on kids' products) for babywear: infant and toddler sizes through 2Y. */
export function babySizes(distinctRows) {
  return [...new Set(distinctRows.filter((r) => { const c = canonSize(r.size, { kid: !!r.kid }); return c.months && c.months[1] <= BABY_MAX_MONTHS; }).map((r) => r.size))];
}

/** Raw sizes on kids' products that are for children of 3 years or older. A product that also carries one of these is a general kids product, not babywear. */
export function olderKidSizes(distinctRows) {
  return [...new Set(distinctRows.filter((r) => { const c = canonSize(r.size, { kid: !!r.kid }); return c.months && c.months[0] >= 36; }).map((r) => r.size))];
}

/** Raw sizes for newborns (0–3 months), kept separate from babywear for ages 1–2. */
export function newbornSizes(distinctRows) {
  return [...new Set(distinctRows.filter((r) => { const c = canonSize(r.size, { kid: !!r.kid }); return c.months && c.months[1] <= 3; }).map((r) => r.size))];
}
