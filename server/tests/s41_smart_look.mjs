// s41: «طقم كامل يكمّل القطعة دي» — الاقتراح يظهر بس لو الطقم كامل، ويسكت في الباقي
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const { runModa } = await import(path.join(here, '../src/lib/moda/engine.js'));
const { smartLookText, acceptSmartLook } = await import(path.join(here, '../src/lib/moda/smartlook.js'));
const { enrichAll } = await import(path.join(here, '../src/lib/moda/products.js'));
const lines = fs.readFileSync(path.join(here, 'fixtures/twistegy_live_names.txt'), 'utf8').trim().split('\n');
const rows = lines.map((l, i) => { const [n, s, d, p] = l.split('|'); return { id: i + 1, store_id: +d || 1, slug: 'l' + i, name_ar: n, name_en: n, description_ar: '', price: +p, category_id: 1, status: 'active', colors_json: '[]', sizes_json: '[]', track_stock: 0, stock: 10, moda_key: null, department: null, audience: null, cat_text: '', store_name_ar: s, store_slug: 's' + s.length, rating: 4, rating_count: 5, sold_count: 3 }; });
const enr = enrichAll(rows);
let pass = 0, fail = 0; const bad = []; const ok = (c, m) => { if (c) pass++; else { fail++; bad.push(m); } };
const run = async (name, gender) => { const a = enr.find((r) => r.name_ar === name) ; const anchor = { ...a, gender: gender || a.gender }; const text = smartLookText(anchor); if (!text) return { text: null }; const r = await runModa([{ role: 'user', content: text }], { products: rows, session: null, now: new Date('2026-11-16T12:00:00Z') }); return { text, r, verdict: acceptSmartLook(r, { anchorId: a.id }), a }; };
ok(smartLookText({ name_ar: 'قميص', gender: 'unisex' }) === null, 'unisex => no guess');
ok(smartLookText({ name_ar: '', gender: 'men' }) === null, 'empty name');
ok(/رجالي/.test(smartLookText({ name_ar: 'جاكت جينز', gender: 'men' })), 'audience word');
const j = await run('جاكت جينز', 'men'); ok(j.verdict?.ok === true, 'denim jacket men => full look: ' + JSON.stringify(j.verdict));
if (j.verdict?.ok) { ok(j.verdict.ids.length >= 2, 'pieces>=2'); ok(!j.verdict.ids.includes(j.a.id), 'anchor not duplicated'); }
const s = await run('كوتشى سامبا', 'men'); ok(s.verdict?.ok === true && !s.verdict.ids.includes(s.a.id), 'sneakers => full look without the sneakers: ' + JSON.stringify(s.verdict));
const d = await run('دريس سواريه', 'women'); ok(d.verdict?.ok === false, 'party dress partial => silent: ' + JSON.stringify(d.verdict));
// وحدات البوابة
const mk = (o) => ({ state: 'full', missing: [], blocks: { total: 1000, over: 0, tabs: [{ items: [{ id: 1 }, { id: 2 }] }] }, ...o });
ok(acceptSmartLook(mk({})).ok, 'gate: ok');
ok(!acceptSmartLook(mk({ state: 'partial' })).ok, 'gate: partial');
ok(!acceptSmartLook(mk({ state: 'alternatives' })).ok, 'gate: alternatives');
ok(!acceptSmartLook(mk({ missing: [{ label: 'x' }] })).ok, 'gate: missing');
ok(!acceptSmartLook(mk({ blocks: { total: 1000, over: 0, tabs: [{ items: [{ id: 1 }] }] } })).ok, 'gate: single piece');
ok(!acceptSmartLook(mk({ blocks: { total: 1000, over: 0, tabs: [{ items: [{ id: 1 }, { id: 1 }] }] } })).ok, 'gate: duplicate');
ok(!acceptSmartLook(mk({}), { anchorId: 2 }).ok, 'gate: anchor inside');
ok(!acceptSmartLook(mk({ blocks: { total: 1000, over: 50, tabs: [{ items: [{ id: 1 }, { id: 2 }] }] } })).ok, 'gate: over');
ok(!acceptSmartLook(mk({}), { budget: 900 }).ok, 'gate: budget');
ok(acceptSmartLook(mk({}), { budget: 1200 }).ok, 'gate: budget ok');
ok(!acceptSmartLook(mk({ blocks: { total: 1, over: 0, tabs: [{ items: [{ id: 1 }, { id: 2, repaired: true }] }] } })).ok, 'gate: repaired');
ok(!acceptSmartLook(null).ok, 'gate: null');
console.log(JSON.stringify({ total: pass + fail, pass, fail, bad }));
process.exit(fail ? 1 : 0);
