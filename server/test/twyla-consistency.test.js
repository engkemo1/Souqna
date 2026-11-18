// تويلا لازم ما ترشّحش منتج بياناته بتتعارض (اسم/وصف/ألوان/مقاسات/قسم) ولا منتج الصفة المطلوبة فيه غير مؤكدة،
// وتلاقي المنتج الصح لما يكون موجود بصياغة تانية (سواريه/سهرة)، وتقول بوضوح لما اللون أو الخامة مختلفة.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runModa } from '../src/lib/moda/engine.js';
import { enrichAll } from '../src/lib/moda/products.js';
import { loadKnowledge } from '../src/lib/moda/knowledge.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(fs.readFileSync(path.join(here, '../test-fixtures', f), 'utf8'));
const live = load('twist-live-sample.json'); // منتجات حقيقية من twistegy.com (17 نوفمبر 2026) + حالات تعارض متعمّدة
const snap = load('real-catalog-snapshot.json');
const now = new Date('2026-11-17T12:00:00Z');
const ask = (q, rows = live) => runModa([{ role: 'user', content: q }], { products: rows, session: null, now });
const shown = (r, rows = live) => { const byId = new Map(rows.map((x) => [x.id, x])); return [...new Set((JSON.stringify(r.blocks || null).match(/"id":(\d+)/g) || []).map((x) => +x.slice(5)))].map((i) => byId.get(i)).filter(Boolean); };
const names = (r) => shown(r).map((p) => `${p.name_ar}#${p.id}`);

test('اسم بالإنجليزي + سواريه/سهرة: الفستان الأسود مقاس L بيظهر', async () => {
  for (const q of ['عايز فستان سواريه أسود مقاس L', 'عايز فستان سهرة أسود', 'عايز فستان أسود L']) {
    const r = await ask(q); assert.ok(shown(r).some((p) => p.id === 1001), `${q}: ${names(r)}`); assert.doesNotMatch(r.say, /مش متاح/);
  }
});
test('منتج اسمه لون والألوان المسجلة لون تاني (أو قسم/اسم متضاربين) مايترشحش', async () => {
  const r = await ask('عايز فستان سهرة أسود'); assert.ok(!shown(r).some((p) => p.id === 1011), 'فستان سهرة أسود لكن لونه أبيض');
  const r2 = await ask('عايز تيشرت أسود رجالي'); assert.ok(!shown(r2).some((p) => p.id === 1010), 'اسمه رجالي وقسمه حريمي');
});
test('لون قريب: سماوي → كحلي/أزرق مع توضيح صريح', async () => {
  const r = await ask('عايز قميص أزرق سماوي رجالي'); assert.ok(shown(r).some((p) => [1006, 1012].includes(p.id)), names(r)); assert.match(r.say, /كحلي|أزرق/); assert.doesNotMatch(r.say, /أبيض/); assert.ok(!shown(r).some((p) => p.id === 1005), 'القميص الأبيض مش قريب من السماوي');
});
test('خامة مش موجودة بنفس اللون: نحافظ على اللون ونقول إن الخامة مختلفة', async () => {
  const r = await ask('محتاج جاكيت جلد بني ميزانيتي 1500 جنيه'); assert.ok(shown(r).some((p) => p.id === 1008), names(r)); assert.match(r.say, /خامة/);
});
test('العباية السودا: كل المعروض متاح بالأسود', async () => {
  const r = await ask('عايز عباية سودا'); for (const p of shown(r)) assert.ok(JSON.parse(p.colors_json).some((c) => c.name_ar === 'أسود'), p.name_ar);
});
test('منتج من غير ألوان مسجلة مايترشحش لما العميل يحدد لون', async () => {
  const r = await ask('عايز فستان سهرة أسود'); assert.ok(!shown(r).some((p) => JSON.parse(p.colors_json).length === 0));
});
test('مقاس مجهول أو غير متاح: مايترشحش كأنه متاح', async () => {
  const r = await ask('عايز فستان سواريه أسود مقاس XS'); assert.match(r.say, /مقاس XS مش متاح/);
  const r2 = await ask('عايز قميص كلاسيك مقاس XL'); assert.ok(shown(r2).every((p) => JSON.parse(p.sizes_json).includes('XL')));
});
test('الكتالوج الحقيقي: مفيش منتج متعارض البيانات، ومفيش منتج معروض بعكس اللون/المقاس المطلوب', async () => {
  const K = loadKnowledge(); assert.equal(enrichAll(snap, K).filter((p) => p.dataConflicts.length).length, 0);
  for (const [q, col, size] of [['عايز هودي أسود مقاس L', 'أسود', 'L'], ['عايز هودي أزرق مقاس M', 'أزرق', 'M'], ['عايزة تيشيرت أبيض مقاس S', 'أبيض', 'S'], ['عايز شورت أسود مقاس XL', 'أسود', 'XL']]) {
    const r = await ask(q, snap); if (/مقاس .* مش متاح/.test(r.say)) continue;
    for (const p of shown(r, snap)) { assert.ok(JSON.parse(p.sizes_json || '[]').includes(size) || !p.sizes_json, `${q}: ${p.name_ar} sizes ${p.sizes_json}`); if (!/(مش متاح|أقرب|مفيش)/.test(r.say)) assert.ok(JSON.parse(p.colors_json).some((c) => c.name_ar === col), `${q}: ${p.name_ar}`); }
  }
});

test('طقم الفرح: النص بيذكر ألوان القطع المعروضة فعلًا (مش بيج لوحده والحذاء أسود)', async () => {
  const q = 'عندي فرح وعايز بدلة كاملة بكرافتة وجزمة بـ 4000 جنيه';
  let r = await ask(q); if (r.state === 'clarify') r = await runModa([{ role: 'user', content: q }], { products: live, session: null, now, answers: { engagement_role: 'self', who_is_it_for: 'men' } });
  const cols = new Set(shown(r).map((p) => JSON.parse(p.colors_json)[0]?.name_ar).filter(Boolean));
  for (const c of cols) assert.match(r.say, new RegExp(c), `${c} موجود في القطع ومش مذكور: ${r.say}`);
});
test('تعارض السن: خاصية الفئة العمرية أو الوصف بيتعارضوا مع مقاسات الأعمار', async () => {
  const { ageAttrConflict, sizeSourcesConflict } = await import('../src/lib/moda/sizes.js');
  assert.equal(ageAttrConflict({ attrs_json: '{"age":"newborn"}', size_list: '8Y,10Y' }), true);
  assert.equal(ageAttrConflict({ attrs_json: '{"age":"baby"}', size_list: '0-3M,3-6M' }), false);
  assert.ok(sizeSourcesConflict({ size_list: '2Y,3Y', description_ar: 'مقاس 10-12 سنة' }));
  assert.equal(sizeSourcesConflict({ size_list: '2Y,3Y', description_ar: 'مقاس 2-4 سنة' }), null);
});

test('multi-colour product: requested colour first, in palette, with differs flag when substituted', async () => {
  const fs = await import('node:fs');
  const { runModa } = await import('../src/lib/moda/engine.js');
  const rows = JSON.parse(fs.readFileSync(new URL('../test-fixtures/twist-live-sample.json', import.meta.url), 'utf8'));
  const r = await runModa([{ role: 'user', content: 'عايز عباية سودا' }], { products: rows, session: null, now: new Date('2026-11-17T12:00:00Z') });
  const it = r.blocks.tabs[0].items[0];
  assert.equal(it.colors[0], 'black');
  assert.equal(r.blocks.palette[0].key, 'black');
  const r2 = await runModa([{ role: 'user', content: 'عايز جاكيت سماوي' }], { products: rows, session: null, now: new Date('2026-11-17T12:00:00Z') });
  assert.ok(r2.blocks.tabs[0].items[0].differs);
});

test('French-cuff (دابل مانشت) shirt is formal: suit looks only, never a casual look', async () => {
  const fsx = await import('node:fs');
  const { enrichAll } = await import('../src/lib/moda/products.js');
  const { loadKnowledge: lk } = await import('../src/lib/moda/knowledge.js');
  const { smartLookText, acceptSmartLook } = await import('../src/lib/moda/smartlook.js');
  const rows = JSON.parse(fsx.readFileSync(new URL('../test-fixtures/twist-live-sample.json', import.meta.url), 'utf8'));
  const en = enrichAll(rows, lk());
  const cuff = en.find((p) => p.id === 1005);
  assert.equal(cuff.frenchCuff, true); assert.equal(cuff.formality, 5);
  assert.equal(en.find((p) => p.id === 1012).frenchCuff, false);
  for (const q of ['قميص دبل مانشيت مقاس 42', 'عايز قميص مناسب للكفلينك', 'عايز french cuff shirt']) {
    const r = await runModa([{ role: 'user', content: q }], { products: rows });
    assert.equal(r.blocks.tabs[0].items[0].id, 1005, q);
  }
  // اقتراح الطقم حوالين القميص: بدلة + كرافتة + حذاء رسمي
  const r = await runModa([{ role: 'user', content: smartLookText(cuff) }], { products: rows });
  const v = acceptSmartLook(r, { anchorId: 1005, anchorKey: 'shirt', anchorFormal: true, keyOf: (id) => en.find((x) => x.id === id)?.key });
  assert.equal(v.ok, true);
  const keys = r.blocks.tabs.flatMap((t) => t.items.map((i) => i.key));
  assert.ok(keys.includes('suit') && !keys.includes('jeans') && !keys.includes('sneakers'));
  // طقم كاجوال حوالين كوتشي Air Max: مفيهوش قميص المانشت المزدوجة
  const air = en.find((p) => p.id === 1018);
  const r2 = await runModa([{ role: 'user', content: smartLookText(air) }], { products: rows });
  const ids = r2.blocks.tabs.flatMap((t) => t.items.map((i) => i.id));
  assert.ok(!ids.includes(1005)); assert.ok(ids.includes(1017));
  // بوابة الجودة: قطعة رسمية + جينز = مرفوض
  const fake = { state: 'full', missing: [], blocks: { over: 0, total: 1, tabs: [{ items: [{ id: 1, key: 'jeans' }, { id: 2, key: 'suit' }] }] } };
  assert.equal(acceptSmartLook(fake, { anchorFormal: true }).ok, false);
});

test('Air Max casual pairing offers tee/polo/hoodie/jacket options, never a formal cuff shirt', async () => {
  const fsx = await import('node:fs');
  const rows = JSON.parse(fsx.readFileSync(new URL('../test-fixtures/twist-live-sample.json', import.meta.url), 'utf8'));
  const r = await runModa([{ role: 'user', content: 'معايا Air max 95 رجالي نسقلي عليه باقي الطقم' }], { products: rows });
  const items = r.blocks.tabs.flatMap((t) => t.items);
  const keys = items.map((i) => i.key);
  assert.ok(keys.includes('tshirt') && keys.includes('jeans'));
  const all = items.flatMap((i) => [i, ...i.alts]);
  assert.ok(all.some((x) => x.key === 'hoodie'));
  assert.ok(!all.some((x) => x.id === 1005));
});

test('black bow tie: suit is black (not beige) + double-cuff shirt + formal shoes', async () => {
  const fsx = await import('node:fs');
  const { enrichAll } = await import('../src/lib/moda/products.js');
  const { loadKnowledge: lk } = await import('../src/lib/moda/knowledge.js');
  const { smartLookText, acceptSmartLook, isFormalAnchor } = await import('../src/lib/moda/smartlook.js');
  const rows = JSON.parse(fsx.readFileSync(new URL('../test-fixtures/twist-live-sample.json', import.meta.url), 'utf8'));
  const en = enrichAll(rows, lk());
  const bow = en.find((p) => p.id === 1021);
  assert.equal(bow.key, 'bow_tie'); assert.equal(isFormalAnchor(bow), true);
  const r = await runModa([{ role: 'user', content: smartLookText(bow) }], { products: rows });
  const items = r.blocks.tabs.flatMap((t) => t.items);
  assert.deepEqual(items.map((i) => i.key), ['suit', 'shirt', 'formal_shoes']);
  assert.equal(items[0].colors[0], 'black');
  assert.equal(items[1].id, 1005);
  assert.equal(acceptSmartLook(r, { anchorId: 1021, anchorKey: 'bow_tie', anchorFormal: true, keyOf: (id) => en.find((x) => x.id === id)?.key }).ok, true);
});

test('double-cuff shirt page: suggests black suit + bow tie (tie as swap) + formal shoes; beige suit with black bow tie is rejected', async () => {
  const fsx = await import('node:fs');
  const { enrichAll } = await import('../src/lib/moda/products.js');
  const { loadKnowledge: lk } = await import('../src/lib/moda/knowledge.js');
  const { smartLookText, acceptSmartLook } = await import('../src/lib/moda/smartlook.js');
  const rows = JSON.parse(fsx.readFileSync(new URL('../test-fixtures/twist-live-sample.json', import.meta.url), 'utf8'));
  const en = enrichAll(rows, lk());
  const r = await runModa([{ role: 'user', content: smartLookText(en.find((p) => p.id === 1005)) }], { products: rows });
  const items = r.blocks.tabs.flatMap((t) => t.items);
  assert.deepEqual(items.map((i) => i.key), ['suit', 'bow_tie', 'formal_shoes']);
  assert.equal(items[0].colors[0], 'black');
  const beige = { state: 'full', missing: [], blocks: { over: 0, total: 1, tabs: [{ items: [{ id: 1, key: 'suit', colors: ['beige'] }, { id: 2, key: 'bow_tie', colors: ['black'] }] }] } };
  assert.equal(acceptSmartLook(beige, { anchorFormal: true }).reason, 'tie_suit_color');
});

test('double-cuff shirt never gets a regular necktie in an auto-built look', async () => {
  const fsx = await import('node:fs');
  const rows = JSON.parse(fsx.readFileSync(new URL('../test-fixtures/twist-live-sample.json', import.meta.url), 'utf8'));
  const r = await runModa([{ role: 'user', content: 'عايز بدلة وقميص دابل مانشت وجزمة لفرح كضيف ميزانيتي 5000' }], { products: rows });
  const keys = r.blocks.tabs.flatMap((t) => t.items.map((i) => i.key));
  assert.ok(keys.includes('shirt') && !keys.includes('tie'));
});
