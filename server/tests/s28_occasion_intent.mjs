// اختبارات نوع المنتج / المناسبة / الستايل + سؤال التوضيح
// node tests/s28_occasion_intent.mjs [engineRoot] [--json out.json]
// بيشغّل كل حالة من tests/fixtures/occasion/cases.json على كتالوج ثابت (fixtures/occasion/catalog.json)، من غير شبكة.
// «llm» في الحالة = محاكاة لطبقة الفهم (understand) بترجع التخمين ده بالظبط، عشان نختبر إن الكود بيرفض التخمين الغلط.
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL, fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const root = args[0] && !args[0].startsWith('--') ? path.resolve(args[0]) : path.resolve(here, '..');
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const { runModa } = await import(pathToFileURL(path.join(root, 'src/lib/moda/engine.js')).href);
const fx = path.join(here, 'fixtures/occasion');
const rows = JSON.parse(fs.readFileSync(path.join(fx, 'catalog.json'), 'utf8'));
const { cases } = JSON.parse(fs.readFileSync(path.join(fx, 'cases.json'), 'utf8'));
const byId = new Map(rows.map((r) => [r.id, r]));

const FAMILY = (k) => { if (!k) return null; if (/^dress_/.test(k)) return 'dress';
  return ({ lingerie: 'lingerie', sleepwear: 'sleepwear', robe: 'sleepwear', underwear: 'underwear', two_piece_set: 'set', classic_set: 'set', womens_suit: 'set', blouse: 'top', top: 'top', tshirt: 'top', shirt: 'top', tunic: 'top', polo: 'top', jumpsuit: 'jumpsuit', skirt: 'skirt', trousers: 'bottoms', jeans: 'bottoms', chinos: 'bottoms', abaya: 'abaya', suit: 'suit', tuxedo: 'suit', blazer: 'blazer', heels_high: 'shoes', heels_low: 'shoes', flats: 'shoes', sandals: 'shoes', sneakers: 'shoes', formal_shoes: 'shoes', loafers: 'shoes', boots: 'shoes', shoes_any: 'shoes', handbag: 'bag', clutch: 'bag', crossbody: 'bag', tote: 'bag' })[k] || k; };
const OCC = (p) => p?.occasion ?? null;
const MATERIALS = ['قطن', 'كتان', 'صوف', 'جلد', 'شيفون', 'ستان', 'ساتان', 'حرير', 'بوليستر', 'فيسكوز', 'ليكرا', 'تريكو', 'قطيفه', 'قطيفة', 'كريب', 'دانتيل', 'دنيم', 'تول', 'ترتر'];
const nrm = (s) => String(s || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

function shownIds(r) { return [...new Set((JSON.stringify(r.blocks || null).match(/"id":(\d+)/g) || []).map((x) => +x.slice(5)).filter((id) => byId.has(id)))]; }

async function run(c) {
  const understand = c.llm ? async () => ({ persons: [], context: null, role: 'guest', budget: null, daypart: null, ...c.llm, garments: (c.llm.garments || []).map((g, i) => ({ key: g.type, color: g.color || null, material: null, text: g.type, position: i })) }) : undefined;
  let s = null; let r = null;
  const turns = [...c.context, c.input];
  for (let i = 0; i < turns.length; i += 1) {
    const last = i === turns.length - 1;
    r = await runModa([{ role: 'user', content: turns[i] }], { products: rows, session: s, understand, answers: last && c.answers ? c.answers : undefined, now: new Date('2026-11-14T12:00:00Z') });
    s = r.session;
  }
  const p = r.session?.parsed || {};
  const ids = shownIds(r);
  // سؤال = حالة توضيح (أو أسئلة من غير أي منتج معروض). أسئلة اختيارية تحت نتايج معروضة (مقاس/لون) = بحث
  const ask = r.state === 'clarify' || (r.questions?.length && !ids.length) ? (r.ask?.[0] || r.questions?.[0]?.id || null) : null;
  const action = ask === 'product_type' ? 'ask_product_type' : ask ? `ask:${ask}` : ids.length ? 'search' : 'chat';
  return { r, p, ask, ids, action, keys: (p.garments || []).map((g) => g.key), opts: (r.questions?.[0]?.options || []).map((o) => o.value), excluded: r.session?.excludedTypes || [] };
}

function judge(c, x) {
  const e = c.expected; const k = c.checks || {}; const why = [];
  if (e.action && e.action !== 'any') { if (e.action === 'search' ? x.action !== 'search' : x.action !== e.action) why.push(`action=${x.action}≠${e.action}`); }
  if (e.product_type !== undefined) { const got = FAMILY(x.keys[0]) || null; if (e.product_type === null ? x.keys.length : got !== e.product_type) why.push(`type=${got}≠${e.product_type}`); }
  if (e.occasion !== undefined) { const got = OCC(x.p); if (got !== e.occasion) why.push(`occasion=${got}≠${e.occasion}`); }
  if (e.style?.length) { const got = x.p.style || []; if (!e.style.every((s) => got.includes(s))) why.push(`style=${JSON.stringify(got)}⊉${JSON.stringify(e.style)}`); }
  if (k.shownAny && !k.shownAny.some((id) => x.ids.includes(id))) why.push(`none of ${k.shownAny} shown (${x.ids})`);
  if (k.shownNone) { const bad = x.ids.filter((id) => k.shownNone.includes(id)); if (bad.length) why.push(`shown forbidden ${bad}`); }
  if (k.firstNot && x.ids.length && k.firstNot.includes(x.ids[0])) why.push(`first=${x.ids[0]}`);
  if (k.noAsk) for (const a of k.noAsk) if (x.ask === a || (a === 'occasion' && x.ask === 'occasion')) why.push(`re-asked ${a}`);
  if (k.noAskId && x.ask === k.noAskId) why.push(`asked ${k.noAskId}`);
  if (k.optionsInclude) for (const o of k.optionsInclude) if (!x.opts.includes(o)) why.push(`option ${o} missing (${x.opts})`);
  if (k.optionsExclude) for (const o of k.optionsExclude) if (x.opts.includes(o)) why.push(`option ${o} offered`);
  if (k.color) { const g = (x.p.garments || [])[0]; if (g?.color !== k.color) why.push(`color=${g?.color}≠${k.color}`); }
  if (k.size && x.p.flags?.size !== k.size) why.push(`size=${x.p.flags?.size}≠${k.size}`);
  if (k.excluded) for (const t of k.excluded) if (!x.excluded.includes(t)) why.push(`excluded lacks ${t} (${x.excluded})`);
  if (k.notFamily && x.ids.some((id) => /فستان|دريس/.test(byId.get(id)?.name_ar || ''))) why.push(`shown ${k.notFamily}`);
  if (k.noInventedMaterial) { const say = nrm(x.r.say); const data = nrm(x.ids.map((id) => { const b = byId.get(id); return `${b.name_ar} ${b.description_ar || ''}`; }).join(' ')); const bad = MATERIALS.filter((m) => new RegExp(`(^|\\s|ال|بال)${nrm(m)}`).test(say) && !data.includes(nrm(m))); if (bad.length) why.push(`invented ${bad}`); }
  if (k.uncertainIf) for (const id of k.uncertainIf) if (x.ids.includes(id) && !/(مش متأكد|مش متاكد|مش مكتوب|مفيش تفاصيل|مش واضح)/.test(x.r.say || '')) why.push(`${id} shown without uncertainty note`);
  return why;
}

let pass = 0; const out = [];
for (const c of cases) {
  let x; let why;
  try { x = await run(c); why = judge(c, x); } catch (err) { why = [`ERROR ${err.message}`]; x = { action: 'error', keys: [], ids: [], p: {}, r: { say: '' } }; }
  const ok = !why.length; if (ok) pass += 1;
  out.push({ id: c.id, category: c.category, ok, why, action: x.action, keys: x.keys, occasion: OCC(x.p), style: x.p.style || [], ids: x.ids, say: String(x.r.say || '').slice(0, 140) });
  console.log(`${ok ? '✓' : '✗'} ${c.id} [${c.category}] ${[...c.context, c.input || JSON.stringify(c.answers)].join(' ⟶ ')}${ok ? '' : `\n    ✗ ${why.join(' | ')}`}\n    → ${x.action} keys=${JSON.stringify(x.keys)} occ=${OCC(x.p)} style=${JSON.stringify(x.p.style || [])} ids=${x.ids.join(',')} | ${String(x.r.say || '').slice(0, 90)}`);
}
const byCat = {}; for (const o of out) { byCat[o.category] = byCat[o.category] || [0, 0]; byCat[o.category][1] += 1; if (o.ok) byCat[o.category][0] += 1; }
const neg = {}; for (const c of cases) for (const nn of c.negative || []) { neg[nn] = neg[nn] || [0, 0]; neg[nn][1] += 1; if (out.find((o) => o.id === c.id).ok) neg[nn][0] += 1; }
console.log(JSON.stringify({ pass, fail: cases.length - pass, total: cases.length, byCategory: byCat, negativeTests: neg }));
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ pass, total: cases.length, byCat, neg, out }, null, 1));
process.exitCode = pass === cases.length ? 0 : 1;
