// s42: طبقات اللبس — مش أي توب يتلبس تحت الجاكيت
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const { runModa } = await import(path.join(here, '../src/lib/moda/engine.js'));
const { layerOK } = await import(path.join(here, '../src/lib/moda/plan.js'));
const { acceptSmartLook } = await import(path.join(here, '../src/lib/moda/smartlook.js'));
let pass = 0, fail = 0; const bad = []; const ok = (c, m) => { if (c) pass++; else { fail++; bad.push(m); } };
const J = new Set(['jacket']), B = new Set(['blazer']), N = new Set();
ok(!layerOK({ key: 'tshirt', sleeveless: true }, J), 'tank under jacket');
ok(layerOK({ key: 'tshirt', sleeveless: false }, J), 'tee under jacket');
ok(!layerOK({ key: 'sport_top' }, J), 'sport top under jacket');
ok(layerOK({ key: 'hoodie' }, J), 'hoodie under casual jacket ok');
ok(!layerOK({ key: 'hoodie' }, B), 'hoodie under blazer');
ok(!layerOK({ key: 'tshirt' }, B), 'tee under blazer');
ok(layerOK({ key: 'shirt' }, B), 'shirt under blazer');
ok(layerOK({ key: 'sweater' }, B), 'knit under blazer');
ok(layerOK({ key: 'tshirt', sleeveless: true }, N), 'no outer => no rule');
ok(layerOK({ key: 'jeans' }, J), 'non-top unaffected');
const mk = (names) => names.map(([n, p], i) => ({ id: i + 1, store_id: 1 + (i % 4), slug: 'p' + i, name_ar: n, name_en: n, description_ar: '', price: p, category_id: 1, status: 'active', colors_json: '[]', sizes_json: '[]', track_stock: 0, stock: 10, moda_key: null, department: null, audience: null, cat_text: '', store_name_ar: 'S' + (i % 4), store_slug: 's' + (i % 4), rating: 4, rating_count: 5, sold_count: 3 }));
const rows = mk([['تيشيرت بدون اكمام رجالي', 200], ['تانك توب رجالي', 180], ['كروب توب حريمي', 150], ['هودي رجالي', 500], ['تيشيرت رجالي قطن', 250], ['قميص رجالي', 400], ['بنطلون جينز رجالي', 700], ['بنطلون قماش رجالي', 650], ['كوتشي رجالي', 800], ['حذاء رسمي رجالي', 900], ['جاكت بليزر رجالي', 1500], ['جاكت جلد رجالي', 2000], ['جاكت جينز رجالي', 900]]);
const by = new Map(rows.map((r) => [r.id, r]));
const look = async (a) => { const r = await runModa([{ role: 'user', content: `معايا ${a} رجالي نسقلي عليه باقي الطقم` }], { products: rows, session: null, now: new Date('2026-11-16T12:00:00Z') }); return (r.blocks?.tabs || []).flatMap((t) => t.items).map((i) => by.get(i.id).name_ar); };
for (const a of ['جاكت جلد', 'جاكت جينز', 'جاكت بليزر']) { const n = await look(a); ok(!n.some((x) => /بدون اكمام|تانك|كروب/.test(x)), `${a}: sleeveless excluded => ${n}`); }
const nb = await look('جاكت بليزر'); ok(!nb.some((x) => /هودي|تيشيرت/.test(x)), 'blazer: no hoodie/tee => ' + nb);
// طلب صريح لتوب من غير جاكيت: بدون أكمام مسموح
const r2 = await runModa([{ role: 'user', content: 'عايز تانك توب رجالي' }], { products: rows, session: null, now: new Date('2026-11-16T12:00:00Z') });
ok(JSON.stringify(r2.blocks || r2.say).length > 0, 'explicit tank request still answered');
// بوابة اقتراح الطقم
const mkRes = (ids) => ({ state: 'full', missing: [], blocks: { total: 100, over: 0, tabs: [{ items: ids.map((id) => ({ id })) }] } });
const keyOf = (id) => ({ 1: 'blazer', 2: 'trousers', 3: 'jeans' }[id]);
ok(!acceptSmartLook(mkRes([1, 2]), { anchorKey: 'hoodie', keyOf }).ok, 'hoodie anchor + blazer => silent');
ok(acceptSmartLook(mkRes([2, 3]), { anchorKey: 'hoodie', keyOf }).ok, 'hoodie anchor + casual pieces => ok');
ok(acceptSmartLook(mkRes([1, 2]), { anchorKey: 'shirt', keyOf }).ok, 'shirt anchor + blazer => ok');
console.log(JSON.stringify({ total: pass + fail, pass, fail, bad }));
process.exit(fail ? 1 : 0);
