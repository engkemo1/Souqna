// s31 — نفس فحص s29 لكن على كتالوج «مبعثر» متولّد (بدون قسم، بدون وصف، أخطاء كتابة، سلانج) مع الإجابة الصحيحة محفوظة جنب.
// المنتج الأصلي = الحقيقة، والمحرك بيشوف النسخة المبعثرة بس. (كتالوج تخميني؛ مش كتالوج Twist الحقيقي.)
// s29 — فحص شامل على كتالوج فيه إجابة معروفة لكل منتج (department + expect.key).
// بيسأل عن كل نوع لبس (رجالي/حريمي/أطفال) بصيغ مختلفة، ويتأكد إن كل منتج معروض من النوع والجمهور المطلوبين،
// وإن مفيش لانجيري/بيجامة من غير طلب صريح، وإن الميزانية والمقاس مضبوطين، وإن اللوك (التنسيق) مفيهوش قطع من جمهور غلط.
// node tests/s29_catalog_audit.mjs [engineRoot] [--json out.json]   (من غير شبكة)
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL, fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const root = args[0] && !args[0].startsWith('--') ? path.resolve(args[0]) : path.resolve(here, '..');
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const { runModa } = await import(pathToFileURL(path.join(root, 'src/lib/moda/engine.js')).href);
const cat = [path.join(here, '../test-fixtures/occasion-catalog.json'), path.join(here, 'fixtures/occasion-catalog.json')].find((p) => fs.existsSync(p));
const truthRows = JSON.parse(fs.readFileSync(cat, 'utf8')).products;
let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const typo = (t) => String(t).replace(/ة/g, () => (rnd() < 0.7 ? 'ه' : 'ة')).replace(/ي(?= |$)/g, () => (rnd() < 0.5 ? 'ى' : 'ي')).replace(/أ|إ/g, () => (rnd() < 0.6 ? 'ا' : 'أ')).replace(/ /g, () => (rnd() < 0.08 ? '  ' : ' '));
const PREFIX = ['', '', '🔥 ', 'جديد ', 'وصل حديثا ', '✨ ', 'عرض '];
const mutate = (p, kind, idOff) => {
  const q = { ...p, id: p.id + idOff }; delete q.expect;
  if (kind === 'A') { q.department = null; q.audience = null; }
  if (kind === 'B') { q.department = null; q.audience = null; q.description_ar = ''; q.description_en = ''; q.name_en = null; q.cat_text = 'ملابس'; }
  if (kind === 'C') { q.name_ar = PREFIX[Math.floor(rnd() * PREFIX.length)] + typo(p.name_ar); q.description_ar = rnd() < 0.5 ? '' : typo(p.description_ar || ''); if (rnd() < 0.4) q.department = null; }
  if (rnd() < 0.08) { q.stock = 0; q.track_stock = 1; }
  return q;
};
const rows = []; const byId = new Map(); const engineRows = []; const OOS = new Set();
for (const p of truthRows) for (const [kind, off] of [['A', 1000], ['B', 2000], ['C', 3000]]) {
  const m = mutate(p, kind, off); engineRows.push(m); if (m.stock === 0) OOS.add(m.id);
  const t = { ...p, id: p.id + off, name_ar: m.name_ar }; rows.push(t); byId.set(t.id, t);
}
const D = (p) => p.department; const K = (p) => p.expect?.key;
const is = (dept, keys) => (p) => (Array.isArray(dept) ? dept.includes(D(p)) : D(p) === dept) && (!keys || keys.includes(K(p)));
const FEMALE_DEPT = ['women', 'hijab', 'abaya', 'jalabiya'];
const dressKeys = ['dress_party', 'dress_evening', 'dress_casual', 'dress_work', 'dress_beach'];
// [عبارة, شرط المنتج المسموح عرضه]
const Q = [
  // رجالي
  ['عايز بدلة', is('men', ['suit', 'classic_set'])], ['محتاج بدلة رسمية', is('men', ['suit', 'classic_set'])], ['عايز قميص', is('men', ['shirt', 'polo'])],
  ['عايز بنطلون قماش', is('men', ['trousers', 'chinos'])], ['عايز جينز', is(['men', 'women'], ['jeans'])], ['عايز تيشيرت', is(['men', 'kids', 'women', 'sports'], ['tshirt', 'sport_top'])],
  ['عايز كرافتة', is('men', ['tie', 'bow_tie'])], ['عايز بليزر', is(['men', 'women'], ['blazer'])], ['عايز جزمة كلاسيك', is('men', ['formal_shoes', 'loafers'])],
  ['عايز كوتشي', is(['men', 'women', 'kids', 'sports'], ['sneakers', 'sport_shoes'])], ['عايز حزام', is('men', ['belt'])], ['عايز ساعة', is('men', ['watch'])], ['عايز هودي', is('men', ['hoodie'])], ['عايز جاكيت', is('men', ['jacket', 'blazer'])],
  ['عايز لبس لراجل شيك', is(['men', 'sports'])], ['عايز طقم رجالي', is('men', ['classic_set', 'suit'])], ['عايز بولو', is('men', ['polo'])],
  // حريمي
  ['عايزة فستان', (p) => is(FEMALE_DEPT.concat(['kids']), null)(p) && (dressKeys.concat(['dress_party']).includes(K(p)))],
  ['عايزة فستان سواريه', (p) => /dress_(party|evening)/.test(K(p)) && D(p) !== 'kids'], ['عايزة فستان سهرة', (p) => /dress_(party|evening)/.test(K(p)) && D(p) !== 'kids', [54]],
  ['عايزة فستان شغل', is('women', ['dress_work'])], ['عايزة دريس صيفي', is('women', ['dress_beach', 'dress_casual']), [63, 64]],
  ['عايزة جيبة', is(['women', 'kids'], ['skirt'])], ['عايزة بلوزة', is('women', ['blouse', 'top'])], ['عايزة جمبسوت', is('women', ['jumpsuit'])],
  ['عايزة تايير', is('women', ['womens_suit'])], ['عايزة بنطلون واسع', is(['women', 'hijab'], ['trousers'])], ['عايزة كعب', is('women', ['heels_high', 'heels_low'])],
  ['عايزة شنطة', is('women', ['handbag', 'clutch'])], ['عايزة كلتش', is('women', ['clutch'])], ['عايزة بالرينا', is(['women', 'kids'], ['flats'])], ['عايزة صندل', is('women', ['sandals'])],
  ['عايزة شال', is('women', ['shawl'])], ['عايزة كارديجان', is(['women', 'hijab'], ['cardigan', 'long_cardigan'])], ['عايزة عباية', is('abaya')], ['عايزة طرحة', is('hijab', ['tarha'])],
  ['عايزة طقم محجبات', is('hijab', ['hijab_set'])], ['عايزة تونيك', is('hijab', ['tunic'])], ['عايزة جلابية', is('jalabiya')], ['عايزة اكسسوار دهبي', is('women', ['jewelry'])],
  ['عايزة لبس شيك للشغل', (p) => D(p) !== 'men' && D(p) !== 'kids'],
  // أطفال
  ['عايزة فستان لبنتي', is('kids', ['dress_party'])], ['فستان بنات حفلات', is('kids', ['dress_party'])], ['عايز بدلة لابني', is('kids', ['suit', 'waistcoat', 'shirt', 'trousers', 'bow_tie', 'formal_shoes'])],
  ['عايزة لبس لبنتي', is('kids')], ['عايز لبس لولادي', is('kids')], ['عايزة كوتشي لبنتي', is('kids', ['sneakers']), [132]], ['عايزة شورت لابني', is('kids', ['shorts'])],
  ['عايزة ليجنز لبنتي', is('kids', ['leggings'])], ['عايزة قميص لابني', is('kids', ['shirt'])], ['عايز تيشيرت لابني', is('kids', ['tshirt'])],
  // كاجوال/شيك: مفيش بدلة لراجل ولا فستان سهرة لكاجوال
  ['رشحلي حاجة كاجوال لراجل', is(['men', 'sports'], ['shirt', 'polo', 'tshirt', 'jeans', 'chinos', 'trousers', 'sneakers', 'loafers', 'hoodie', 'jacket', 'belt', 'watch', 'sport_top', 'sport_bottom', 'sport_shoes'])],
  ['عايز لبس كاجوال لراجل', is(['men', 'sports'], ['shirt', 'polo', 'tshirt', 'jeans', 'chinos', 'trousers', 'sneakers', 'loafers', 'hoodie', 'jacket', 'belt', 'watch', 'sport_top', 'sport_bottom', 'sport_shoes', 'shorts'])],
  ['عايزة لبس شيك', (p) => !['men', 'kids'].includes(D(p))], ['عايزة لبس كاجوال', (p) => !['men', 'kids'].includes(D(p))], ['عايز لبس لولادي', is('kids')],
  // رياضة
  ['عايز لبس رياضة', is(['sports', 'men'], ['sport_top', 'sport_bottom', 'sport_shoes', 'leggings', 'tshirt', 'sneakers', 'shorts']), null], ['عايزة ليجنز رياضي', is(['sports', 'kids'], ['leggings'])], ['عايز حذاء جري', is(['sports', 'men'], ['sport_shoes', 'sneakers']), [145]],
];
const WRAP = [(t) => t, (t) => `${t} لو سمحت`, (t) => `ممكن ${t}؟`, (t) => `${t} ميزانيتي 5000`];
const INTIMATE = /(لانجيري|بيجام|قميص نوم|ملابس داخلي|بيبي دول)/;

const shownIds = (r) => [...new Set((JSON.stringify(r.blocks || null).match(/"id":(\d+)/g) || []).map((x) => +x.slice(5)).filter((id) => byId.has(id)))];
let total = 0; let bad = 0; const fails = []; let shownTotal = 0; let askedTotal = 0; let emptyTotal = 0;
for (const [text, allow, must] of Q) {
  for (const w of WRAP) {
    const q = w(text); total += 1;
    let r; try { r = await runModa([{ role: 'user', content: q }], { products: engineRows, session: null, now: new Date('2026-11-14T12:00:00Z') }); } catch (e) { bad += 1; fails.push({ q, why: `ERROR ${e.message}` }); continue; }
    const ids = shownIds(r); const why = [];
    if (r.state === 'clarify' || (r.questions?.length && !ids.length)) askedTotal += 1; else if (!ids.length) emptyTotal += 1; else shownTotal += 1;
    for (const id of ids) { if (OOS.has(id)) why.push(`out of stock shown ${id}`); const p = byId.get(id); if (!allow(p)) why.push(`shown ${id} «${p.name_ar}» (${D(p)}/${K(p)})`); }
    if (must && !/5000/.test(q) && ids.length && !must.some((m) => ids.some((i) => i % 1000 === m))) why.push(`none of required ${must} shown`);
    if (/5000/.test(q)) for (const id of ids) { const p = byId.get(id); if (p.price > 5000) why.push(`over budget ${id}=${p.price}`); }
    if (!INTIMATE.test(q) && ids.some((id) => /(لانجيري|بيجام|قميص نوم)/.test(byId.get(id).name_ar))) why.push('intimate shown without request');
    if (why.length) { bad += 1; fails.push({ q, why: why.join(' | '), say: String(r.say || '').slice(0, 100) }); }
  }
}
// تنسيق: لوك كامل لكل جمهور — القطع لازم من نفس الجمهور
const LOOKS = [
  ['عايز لبس لفرح صاحبي', (p) => D(p) === 'men'], ['عايز اتشيك لخطوبة', (p) => D(p) === 'men'], ['عايز لبس شغل رسمي', (p) => D(p) === 'men'], ['عايز لبس كاجوال للخروج', (p) => ['men', 'sports'].includes(D(p))],
  ['عايزة لبس لفرح صاحبتي', (p) => D(p) !== 'men' && D(p) !== 'kids'], ['عايزة لبس شغل', (p) => D(p) !== 'men' && D(p) !== 'kids'], ['عايزة لبس خروجة', (p) => D(p) !== 'men' && D(p) !== 'kids'],
  ['عايزة لبس سهرة', (p) => D(p) !== 'men' && D(p) !== 'kids'], ['عايزة لبس محجبات لخطوبة', (p) => D(p) !== 'men' && D(p) !== 'kids'],
  ['عايزة لبس لبنتي للعيد', (p) => D(p) === 'kids' || /bag|clutch/.test(K(p) || '')], ['عايز لبس لابني للعيد', (p) => D(p) === 'kids'],
  ['عايز لبس لبنتي لحفلة', (p) => D(p) === 'kids'], ['عايز لبس لابني للمدرسة', (p) => D(p) === 'kids'],
];
const lookFails = [];
for (const [q, allow] of LOOKS) {
  total += 1;
  const r = await runModa([{ role: 'user', content: q }], { products: engineRows, session: null, now: new Date('2026-11-14T12:00:00Z') });
  const ids = shownIds(r); const why = [];
  for (const id of ids) { if (OOS.has(id)) why.push(`out of stock shown ${id}`); const p = byId.get(id); if (!allow(p)) why.push(`look has ${id} «${p.name_ar}» (${D(p)}/${K(p)})`); }
  if (ids.some((id) => /(لانجيري|بيجام|قميص نوم)/.test(byId.get(id).name_ar))) why.push('intimate in look');
  if (why.length) { bad += 1; lookFails.push({ q, why: why.join(' | ') }); }
}
for (const f of fails.concat(lookFails)) console.log(`✗ ${f.q.replace(/\s+/g, '_')}\n    ${f.why}${f.say ? `\n    say: ${f.say}` : ''}`);
const summary = { total, bad, ok: total - bad, shown: shownTotal, asked: askedTotal, noProducts: emptyTotal };
console.log(JSON.stringify(summary));
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ summary, fails: fails.concat(lookFails) }, null, 1));
process.exitCode = bad ? 1 : 0;
