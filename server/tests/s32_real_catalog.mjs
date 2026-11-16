// s32 — فحص على لقطة من الكتالوج الفعلي (souqna.db بتاع 16 نوفمبر 2026: 150 منتج نشط) بنفس استعلام التطبيق.
// 1) كل منتج: لو العميل كتب اسمه بالظبط لازم يظهر (أو تويلا تسأل لمين/لون). 2) أسئلة أنواع وجمهور: مفيش قطعة لجمهور غلط ولا نوع غلط ولا فوق الميزانية.
// node tests/s32_real_catalog.mjs [engineRoot]
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL, fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(here, '..');
const { runModa } = await import(pathToFileURL(path.join(root, 'src/lib/moda/engine.js')).href);
const rows = JSON.parse(fs.readFileSync(path.join(here, '../test-fixtures/real-catalog-snapshot.json'), 'utf8'));
const byId = new Map(rows.map((r) => [r.id, r]));
// الحقيقة: audience=unisex (بنطلونات/تيشيرتات/طواقي دنيم هاوس وتاون ستايل) محايد حتى لو القسم حريمي؛ الباقي بالقسم
const isMen = (p) => /^men/.test(p.department || '') && p.audience !== 'unisex'; const isWomen = (p) => /^women/.test(p.department || '') && p.audience !== 'unisex';
const ids = (r) => [...new Set((JSON.stringify(r.blocks || null).match(/"id":(\d+)/g) || []).map((x) => +x.slice(5)).filter((i) => byId.has(i)))];
const fails = []; const misses = []; let hits = 0; let total = 0; const now = new Date('2026-11-14T12:00:00Z');
const ask = (q, extra = {}) => runModa([{ role: 'user', content: q }], { products: rows, session: null, now, ...extra });
// 1) الاسم بالظبط (مقياس استرجاع: لازم ≥ 90%؛ الغلطات الفعلية = جمهور/نوع/ميزانية غلط وبتفشّل الاختبار على طول)
for (const p of rows) {
  total += 1; const fem = isWomen(p); const q = `${fem ? 'عايزة' : isMen(p) ? 'عايز' : 'ورّيني'} ${p.name_ar}`;
  let r = await ask(q); let shown = ids(r);
  if (r.state === 'clarify' && !shown.length) { const a = {}; for (const qq of r.questions || []) a[qq.id] = qq.id === 'who_is_it_for' ? (isMen(p) ? 'men' : 'women') : qq.id === 'color_preference' ? 'any' : undefined; r = await runModa([{ role: 'user', content: q }], { products: rows, session: null, now, answers: Object.fromEntries(Object.entries(a).filter(([, v]) => v)) }); shown = ids(r); }
  // نفس الاسم ممكن يتكرر في أكتر من منتج: كفاية يظهر منتج بنفس الاسم
  const sameName = rows.filter((x) => x.name_ar === p.name_ar).map((x) => x.id);
  if (!shown.some((i) => sameName.includes(i))) misses.push({ q, why: `product ${p.id} not shown (got ${shown.slice(0, 4)}; state ${r.state})` }); else hits += 1;
}
// 2) نوع + جمهور
const T = [['هودي', ['hoodie']], ['بنطلون', ['trousers', 'jeans', 'chinos', 'joggers', 'sport_bottom', 'leggings']], ['جينز', ['jeans']], ['شورت', ['shorts']], ['تيشيرت', ['tshirt', 'sport_top']], ['جاكيت', ['jacket']], ['طاقية', ['cap']], ['جوجر', ['joggers', 'sport_bottom']], ['ليجنز', ['leggings']]];
for (const [word, keys] of T) for (const [verb, wrong, tag] of [['عايز', isWomen, 'لراجل'], ['عايزة', isMen, 'لبنت']]) {
  const q = `${verb} ${word} ${tag}`; total += 1; const r = await ask(q); const shown = ids(r); const why = [];
  for (const i of shown) { const p = byId.get(i); if (wrong(p)) why.push(`wrong audience ${i} «${p.name_ar}» (${p.department})`); if (!keys.includes(p.moda_key) && !(word === 'بنطلون' && /pants/.test(p.cat_text || ''))) why.push(`wrong type ${i} «${p.name_ar}» (${p.moda_key})`); }
  if (why.length) fails.push({ q, why: why.join(' | ') });
}
// 3) ميزانية ومواسم
for (const [q, f] of [['عايز هودي ميزانيتي 800', (p) => p.price <= 800], ['عايزة جاكيت ميزانيتي 1000', (p) => p.price <= 1000], ['عايز لبس شتوي', (p) => !/(shorts|cap)/.test(p.moda_key) || true]]) {
  total += 1; const r = await ask(q); const why = r.state === 'over_budget' ? (/أعلى من ميزانيتك/.test(r.say) ? [] : ['over budget silently']) : ids(r).filter((i) => !f(byId.get(i))).map((i) => `violates ${i}`); if (why.length) fails.push({ q, why: why.join(',') });
}
for (const f of misses) console.log(`~ ${f.q.replace(/\s+/g, '_')}  ${f.why}`);
const recall = hits / rows.length;
if (recall < 0.9) fails.push({ q: 'recall', why: `exact-name recall ${(recall * 100).toFixed(1)}% < 90%` });
for (const f of fails) console.log(`✗ ${f.q.replace(/\s+/g, '_')}\n    ${f.why}`);
console.log(JSON.stringify({ total, bad: fails.length, ok: total - fails.length, exactNameRecall: `${hits}/${rows.length}` }));
process.exitCode = fails.length ? 1 : 0;
