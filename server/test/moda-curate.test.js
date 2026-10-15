import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runModa } from '../src/lib/moda/engine.js';
import { makeCurator, candidatePool } from '../src/lib/moda/curate.js';
import { enrichAll } from '../src/lib/moda/products.js';
import { loadKnowledge } from '../src/lib/moda/knowledge.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test-fixtures');
const K = loadKnowledge();
const rows = enrichAll(JSON.parse(fs.readFileSync(path.join(DIR, 'occasion-catalog.json'), 'utf8')).products, K);
const base = { products: rows, weatherMock: { temp_c: 22, feels_like_c: 22, rain_pct: 2 } };
const ASK = 'أنا رايح فرح بالليل، عايز لبس لحد 5000 جنيه';

test('curator picks from the real stock, sends unavailable pieces outside as request buttons', async () => {
  let prompt = '';
  const men = candidatePool(rows, 'men', K, { context: 'wedding_guest' });
  assert.ok(men.length > 3);
  const pick = men[0];
  const cur = makeCurator(async (system) => {
    prompt = system;
    return JSON.stringify({ people: [{ aud: 'men', note: 'خليك على درجتين من الكحلي', items: [{ type: pick.key, productId: pick.id, why: 'مناسب' }, { type: 'bow_tie', productId: null, title: 'ببيون كحلي ساتان' }] }] });
  });
  const res = await runModa(ASK, { ...base, curator: cur });
  assert.match(prompt, /STOCK for "men"/);
  assert.equal(res.curated, true);
  const tab = res.blocks.tabs[0];
  assert.ok(tab.items.some((i) => i.id === pick.id));
  assert.ok(tab.missing.some((m) => m.label === 'ببيون كحلي ساتان'));
  assert.equal(res.state, 'partial');
});

test('invented ids, over-budget looks and failures fall back to the rules engine', async () => {
  const bad = makeCurator(async () => JSON.stringify({ people: [{ aud: 'men', items: [{ type: 'suit', productId: 99999999 }] }] }));
  const r1 = await runModa(ASK, { ...base, curator: bad });
  assert.equal(r1.curated, false); assert.ok(r1.blocks.tabs[0].items.length);
  const priciest = [...rows].filter((p) => p.gender === 'men' && p.inStock).sort((a, b) => b.price - a.price).slice(0, 8);
  const over = makeCurator(async () => JSON.stringify({ people: [{ aud: 'men', items: priciest.map((p) => ({ type: p.key, productId: p.id })) }] }));
  const r2 = await runModa('أنا رايح فرح بالليل، عايز لبس لحد 800 جنيه', { ...base, curator: over });
  assert.equal(r2.curated, false);
  const boom = makeCurator(async () => { throw new Error('quota'); });
  const r3 = await runModa(ASK, { ...base, curator: boom });
  assert.equal(r3.curated, false); assert.ok(r3.say.length > 5);
});

test('type is verified by name AND stored type: sneakers never pass as formal shoes', () => {
  const mk = (over) => enrichAll([{ id: 9001, name_en: 'x', name_ar: '', price: 500, stock: 5, track_stock: 1, ...over }], K)[0];
  const a = mk({ name_en: 'Desert For Men D2057/1 - Basic Lace-Up Leather Sneakers', moda_key: 'formal_shoes' });
  assert.equal(a.key, 'sneakers');
  const b = mk({ name_ar: 'جزمة اوكسفورد جلد', moda_key: 'sneakers' });
  assert.equal(b.key, 'formal_shoes');
  const c = mk({ name_ar: 'بنطلون جينز ازرق', moda_key: 'shirt' });
  assert.equal(c.typeConflict, true);
  assert.equal(candidatePool([c, mk({ id: 9002, name_ar: 'قميص ابيض', moda_key: 'shirt' })], 'men', K).length <= 1, true);
});

test('every shoe kind is told apart by name (formal, derby, loafer, boot, flat, slipper, sneaker)', () => {
  const key = (n) => enrichAll([{ id: 1, name_en: n, name_ar: '', price: 100, stock: 1, track_stock: 1 }], K)[0].key;
  const cases = { 'Classic Oxford Leather Shoes': 'formal_shoes', 'حذاء ديربي': 'formal_shoes', 'لوفر جلد': 'loafers', 'Chelsea Boots': 'boots', 'Flat Ballerina Shoes': 'flats', 'سليبر بيت': 'slippers', 'Running Shoes Nike': 'sneakers', 'كوتشي ابيض جلد': 'sneakers', 'Block Heel Sandals': 'heels_low', 'صندل جلد رجالي': 'sandals' };
  for (const [n, k] of Object.entries(cases)) assert.equal(key(n), k, n);
});

test('طلب قطعة واحدة (كوتشي يليق على قميصي) ما بيشغّلش المنسّق ومفيش قطع زيادة', async () => {
  let called = 0;
  const cur = async () => { called += 1; return null; };
  const res = await runModa('عندي قميص أزرق سماوي، عايز كوتشي أبيض يليق عليه', { ...base, curator: cur });
  assert.equal(called, 0);
  assert.ok(!(res.blocks?.tabs || []).some((t) => (t.missing || []).length));
});
