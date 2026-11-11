import test from 'node:test';
import assert from 'node:assert/strict';
import { runModa } from '../src/lib/moda/engine.js';
import { isContinuationRequest, isSameGarmentReference } from '../src/lib/moda/continuity.js';

const MOCK_PRODUCTS = [
  { id: 101, name_ar: 'بدلة رجالي كلاسيك كحلي', key: 'suit', gender: 'men', price: 2500, formality: 5, colorKeys: ['navy'], inStock: true, popularity: 10 },
  { id: 102, name_ar: 'بدلة رجالي سليم رمادي', key: 'suit', gender: 'men', price: 2200, formality: 5, colorKeys: ['grey'], inStock: true, popularity: 5 },
  { id: 201, name_ar: 'حذاء كلاسيك جلد أسود برباط', key: 'formal_shoes', gender: 'men', price: 750, formality: 5, colorKeys: ['black'], inStock: true, popularity: 8 },
  { id: 202, name_ar: 'كوتشي أبيض كاجوال رياضي', key: 'sneakers', gender: 'men', price: 600, formality: 2, colorKeys: ['white'], inStock: true, popularity: 9 },
  { id: 203, name_ar: 'شبشب بيتي مريح فلات', key: 'slippers', gender: 'men', price: 150, formality: 1, colorKeys: ['black'], inStock: true, popularity: 4 },
  { id: 301, name_ar: 'كافلينج قميص رجالي فضي أنيق', key: 'cufflinks', gender: 'men', price: 120, formality: 4, inStock: true },
  { id: 401, name_ar: 'قميص نوم لانجري ستان أحمر', key: 'lingerie', gender: 'women', price: 450, formality: 1, inStock: true },
];

test('continuity: detects continuation and same-garment reference phrases', () => {
  assert.equal(isContinuationRequest('عاوز عليها جزمه', null), true);
  assert.equal(isContinuationRequest('عاوز عليها جزمة كلاسيك', null), true);
  assert.equal(isContinuationRequest('معاها جزمة', null), true);
  assert.equal(isContinuationRequest('تليق عليها جزمة', null), true);
  assert.equal(isContinuationRequest('يا ستي انا عاوز البدله اللي انا قولت لك عليها وعاوز عليها جزمه', null), true);
  assert.equal(isSameGarmentReference('البدلة اللي قولتلك عليها'), true);
  assert.equal(isSameGarmentReference('نفس البدلة'), true);
});

test('outfit continuity: asking for shoes on a suit retains the EXACT same suit across turns', async () => {
  // Turn 1: User asks for a suit
  const t1 = await runModa([{ role: 'user', content: 'عاوز بدله كحلي كلاسيك' }], { products: MOCK_PRODUCTS });
  assert.ok(t1.blocks?.tabs?.length > 0, 'Turn 1 must produce outfit tabs');
  const suitPick = t1.blocks.tabs[0].items.find((it) => it.id === 101);
  assert.ok(suitPick, 'Turn 1 must pick Suit 101');
  assert.ok(t1.session?.activeLook?.items?.length > 0, 'Session must retain activeLook');

  // Turn 2: User says "عاوز عليها جزمه"
  const t2 = await runModa([
    { role: 'user', content: 'عاوز بدله كحلي كلاسيك' },
    { role: 'assistant', content: t1.say },
    { role: 'user', content: 'عاوز عليها جزمه' },
  ], { products: MOCK_PRODUCTS, session: t1.session });

  assert.ok(t2.blocks?.tabs?.length > 0, 'Turn 2 must produce outfit tabs');
  const items = t2.blocks.tabs[0].items;

  // CRITICAL TEST: Suit 101 MUST STILL BE THERE! Not replaced by Suit 102!
  const keptSuit = items.find((it) => it.id === 101);
  assert.ok(keptSuit, 'Must retain the EXACT same suit (id: 101) that the user liked!');
  const otherSuit = items.find((it) => it.id === 102);
  assert.equal(otherSuit, undefined, 'Must NOT replace the user suit with a different suit (102)!');

  // And shoes should be added to coordinate with the suit!
  const shoesPick = items.find((it) => it.id === 201);
  assert.ok(shoesPick, 'Must add the matching formal shoes (id: 201) to coordinate with the suit!');

  // Twylla says she kept the suit and added the shoes
  assert.match(t2.say, /احتفظتلك بنفس القطعة/);
});

test('zero guessing: when no matching formal shoes exist, NEVER substitute slippers or casual sneakers', async () => {
  // Only suit, casual sneakers, and slippers in stock (NO formal shoes)
  const rowsNoFormalShoes = MOCK_PRODUCTS.filter((p) => p.id !== 201);

  // Turn 1: User gets a suit
  const t1 = await runModa([{ role: 'user', content: 'عاوز بدله كحلي' }], { products: rowsNoFormalShoes });
  assert.ok(t1.session?.activeLook?.items?.length > 0);

  // Turn 2: User asks for shoes to go with it
  const t2 = await runModa([
    { role: 'user', content: 'عاوز بدله كحلي' },
    { role: 'assistant', content: t1.say },
    { role: 'user', content: 'عاوز عليها جزمه كلاسيك' },
  ], { products: rowsNoFormalShoes, session: t1.session });

  const items = t2.blocks.tabs[0].items;
  // Suit 101 is kept
  assert.ok(items.find((it) => it.id === 101), 'Suit 101 must be kept');

  // NEVER guess with slippers or sneakers!
  assert.equal(items.some((it) => it.id === 202), false, 'Never guess with casual sneakers!');
  assert.equal(items.some((it) => it.id === 203), false, 'Never guess with slippers!');

  // Honest availability: shoes marked missing with request button!
  const missing = t2.missing || t2.missingItems || [];
  assert.ok(missing.length > 0, 'Must honestly report shoes as missing instead of guessing');
  assert.match(t2.say, /مفيش قطعة مناسبة ومضمونة متاحة حالياً/);
});

test('complaint recovery: "يا ستي انا عاوز البدله اللي قولتلك عليها وعاوز عليها جزمه" restores original suit', async () => {
  // Simulate Turn 1 where user had Suit 101
  const t1 = await runModa([{ role: 'user', content: 'عاوز بدله كحلي' }], { products: MOCK_PRODUCTS });

  // Simulate Turn 2 where user clarifies/complains:
  const t2 = await runModa([
    { role: 'user', content: 'عاوز بدله كحلي' },
    { role: 'assistant', content: t1.say },
    { role: 'user', content: 'يا ستي انا عاوز البدله اللي انا قولت لك عليها وعاوز عليها جزمه' },
  ], { products: MOCK_PRODUCTS, session: t1.session });

  const items = t2.blocks.tabs[0].items;
  assert.ok(items.find((it) => it.id === 101), 'Must restore and keep Suit 101');
  assert.equal(items.find((it) => it.id === 102), undefined, 'Must not show wrong Suit 102');
  assert.ok(items.find((it) => it.id === 201), 'Must coordinate matching shoes 201');
});
