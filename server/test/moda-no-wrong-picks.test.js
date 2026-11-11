import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runModa } from '../src/lib/moda/engine.js';
import { enrichAll, inferKey, enrichProduct } from '../src/lib/moda/products.js';
import { makeVerifier } from '../src/lib/moda/curate.js';
import { loadKnowledge } from '../src/lib/moda/knowledge.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test-fixtures');
const K = loadKnowledge();
const base = JSON.parse(fs.readFileSync(path.join(DIR, 'occasion-catalog.json'), 'utf8')).products;
const weatherMock = { temp_c: 21, feels_like_c: 21, rain_pct: 2 };

// منتجات "فخاخ": رخيصة وكل واحدة بتشبه قطعة مطلوبة في الاسم. لو تويلا اختارتها يبقى فيه مشكلة.
const traps = [
  { id: 9001, name_ar: 'كافلينج قميص', price: 50, stock: 5, moda_key: 'shirt', audience: 'men' },
  { id: 9002, name_ar: 'لانجيري سهرة طويل', price: 60, stock: 5, moda_key: 'dress_evening', audience: 'women' },
  { id: 9003, name_ar: 'روب ستان للفرح', price: 55, stock: 5, moda_key: 'dress_bridal', audience: 'women' },
  { id: 9004, name_ar: 'قميص نوم سهرة', price: 45, stock: 5, audience: 'women' },
  { id: 9005, name_ar: 'شبشب بيت', price: 30, stock: 5, audience: 'men' },
].map((p) => ({ track_stock: 1, colors_json: '[]', ...p }));

test('names decide the type: cufflinks, lingerie, robes and sleepwear are never shirts or dresses', () => {
  const cases = { 'كافلينج قميص': 'cufflinks', 'لانجيري سهرة طويل': 'lingerie', 'روب ستان للفرح': 'robe', 'قميص نوم سهرة': 'sleepwear', 'Short Sleeve Tee': 'tshirt', 'تيشيرت أوفر سايز': 'tshirt', 'جاكيت تريكو': 'jacket', 'فستان سهرة طويل': 'dress_evening' };
  for (const [name, key] of Object.entries(cases)) assert.equal(inferKey(name, K), key, name);
  // حتى لو النوع المحفوظ في القاعدة غلط
  assert.equal(enrichProduct({ name_ar: 'كافلينج قميص', moda_key: 'shirt', price: 120 }, K).key, 'cufflinks');
  assert.equal(enrichProduct({ name_ar: 'لانجيري سهرة', moda_key: 'dress_evening', price: 120 }, K).key, 'lingerie');
});

test('trap products are never picked for engagement / wedding / work looks', async () => {
  const rows = enrichAll([...base, ...traps], K);
  const forbidden = new Set(['cufflinks', 'lingerie', 'robe', 'sleepwear', 'slippers']);
  for (const text of ['أنا وخطيبتي رايحين خطوبة، عايزين طقم لينا الاتنين', 'انا راجل عايز اطلالة للشغل ميزانيتي 3000', 'عاوزة حاجة للفرح']) {
    const res = await runModa(text, { products: rows, weatherMock });
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const tab of res.blocks?.tabs || []) for (const item of tab.items) {
      assert.ok(item.id < 9000, `${text}: picked trap product ${item.id}`);
      assert.ok(!forbidden.has(byId.get(item.id)?.key), `${text}: forbidden type`);
    }
  }
});

test('the Gemini verifier removes a piece that does not match its slot and keeps the rest', async () => {
  const rows = enrichAll(base, K);
  const plain = await runModa('انا راجل عايز اطلالة للشغل ميزانيتي 3000', { products: rows, weatherMock });
  assert.ok(plain.blocks?.tabs?.length);
  const firstId = plain.blocks.tabs[0].items[0].id;
  const verifier = makeVerifier(async () => JSON.stringify({ bad: [firstId, 123456] }));
  const res = await runModa('انا راجل عايز اطلالة للشغل ميزانيتي 3000', { products: rows, weatherMock, verifier });
  const ids = (res.blocks?.tabs || []).flatMap((t) => t.items.map((i) => i.id));
  assert.ok(!ids.includes(firstId), 'flagged piece removed');
  assert.ok(ids.length >= 1, 'other pieces stay');
});

test('a broken verifier never breaks the reply', async () => {
  const rows = enrichAll(base, K);
  const res = await runModa('انا راجل عايز اطلالة للشغل ميزانيتي 3000', { products: rows, weatherMock, verifier: makeVerifier(async () => { throw new Error('down'); }) });
  assert.ok(res.blocks?.tabs?.length);
});
