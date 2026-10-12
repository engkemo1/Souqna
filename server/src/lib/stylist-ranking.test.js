import test from 'node:test';
import assert from 'node:assert/strict';
import { rankCandidateRows, coordinateLookCandidates, fitBudgetCandidates } from './stylist-ranking.js';

const product = (name, colors, extra = {}) => ({
  name_ar: name, name_en: name, colors_json: JSON.stringify(colors), description_ar: '', description_en: '',
  sold_count: 0, rating: 0, ...extra,
});

test('ranks a requested garment above unrelated products', () => {
  const results = rankCandidateRows({ label: 'هودي', keywords: ['hoodie', 'كحلي', 'navy'] }, [
    product('كوتشي رياضي', [{ name_ar: 'كحلي', name_en: 'Navy' }]),
    product('هودي كحلي', [{ name_ar: 'كحلي', name_en: 'Navy' }]),
  ]);
  assert.equal(results.length, 1);
  assert.equal(results[0].name_ar, 'هودي كحلي');
});

test('catalogue color metadata helps rank the requested palette', () => {
  const results = rankCandidateRows({ label: 'جاكيت', keywords: ['jacket', 'أسود', 'black'] }, [
    product('جاكيت يومي', [{ name_ar: 'أحمر', name_en: 'Red' }]),
    product('جاكيت يومي', [{ name_ar: 'أسود', name_en: 'Black' }]),
  ]);
  assert.equal(results[0].colors_json.includes('Black'), true);
});

test('prefers the explicit planned colour when the catalogue has it', () => {
  const results = rankCandidateRows({ label: 'هودي', color: 'كحلي', palette: ['كحلي', 'أبيض'], keywords: ['hoodie'] }, [
    product('هودي أساسي', [{ name_ar: 'أحمر', name_en: 'Red' }]),
    product('هودي أساسي', [{ name_ar: 'كحلي', name_en: 'Navy' }]),
  ]);
  assert.equal(results[0].colors_json.includes('Navy'), true);
});

test('personal preferences promote liked colours and demote colours the shopper avoids', () => {
  const results = rankCandidateRows({ label: 'هودي', keywords: ['hoodie'], likes: 'كحلي', avoid: 'أحمر' }, [
    product('هودي أساسي', [{ name_ar: 'أحمر', name_en: 'Red' }]),
    product('هودي أساسي', [{ name_ar: 'كحلي', name_en: 'Navy' }]),
    product('هودي أساسي', [{ name_ar: 'أسود', name_en: 'Black' }]),
  ]);
  assert.deepEqual(JSON.parse(results[0].colors_json).map((color) => color.name_ar), ['كحلي']);
  assert.equal(results.some((item) => JSON.parse(item.colors_json)[0].name_ar === 'أحمر'), true);
  assert.ok(results.findIndex((item) => JSON.parse(item.colors_json)[0].name_ar === 'أحمر') > 0);
});

test('uses a palette-compatible neutral when the exact planned colour is unavailable', () => {
  const results = rankCandidateRows({ label: 'جاكيت', color: 'كحلي', palette: ['كحلي', 'أبيض'], keywords: ['jacket'] }, [
    product('جاكيت أحمر', [{ name_ar: 'أحمر', name_en: 'Red' }]),
    product('جاكيت أبيض', [{ name_ar: 'أبيض', name_en: 'White' }]),
  ]);
  assert.equal(results[0].colors_json.includes('White'), true);
});

test('coordinates pieces together when their top individual picks would clash', () => {
  const looks = [
    { items: [{ name: { ar: 'بلوزة' }, colors: [{ name_ar: 'أحمر' }], price: 400 }, { name: { ar: 'بلوزة' }, colors: [{ name_ar: 'أزرق' }], price: 400 }], pick: 0 },
    { items: [{ name: { ar: 'بنطلون' }, colors: [{ name_ar: 'أزرق' }], price: 500 }, { name: { ar: 'بنطلون' }, colors: [{ name_ar: 'أحمر' }], price: 500 }], pick: 0 },
  ];
  coordinateLookCandidates(looks);
  const selectedColors = looks.map((look) => look.items[look.pick].colors[0].name_ar);
  assert.equal(selectedColors[0], selectedColors[1]);
});

test('does not invent a category that is absent from the catalogue', () => {
  const results = rankCandidateRows({ label: 'فستان سهرة', keywords: ['evening dress', 'فستان'] }, [
    product('جاكيت سهرة', [{ name_ar: 'أسود', name_en: 'Black' }]),
  ]);
  assert.deepEqual(results, []);
});

test('does not offer denim shorts as jeans when store category data is available', () => {
  const results = rankCandidateRows({ label: 'جينز', keywords: ['jeans', 'denim'] }, [
    product('شورت جينز كلاسيك', [], { cat_text: 'شورتات Shorts' }),
    product('جينز مستقيم', [], { cat_text: 'جينز Jeans' }),
  ]);
  assert.deepEqual(results.map((item) => item.name_ar), ['جينز مستقيم']);
});

test('respects the requested result limit', () => {
  const rows = Array.from({ length: 6 }, (_, i) => product(`هودي ${i}`, []));
  assert.equal(rankCandidateRows({ label: 'هودي', keywords: ['hoodie'] }, rows, 3).length, 3);
});

test('keeps a multi-piece look within budget when alternatives allow it', () => {
  const looks = [
    { items: [{ price: 1400 }, { price: 900 }], pick: 0 },
    { items: [{ price: 1100 }, { price: 650 }], pick: 0 },
  ];
  const total = fitBudgetCandidates(looks, 1900);
  assert.equal(total, 1550);
  assert.equal(looks.reduce((sum, look) => sum + look.items[look.pick].price, 0) <= 1900, true);
});

test('uses the closest-ranked alternative before dropping to a much cheaper low-match item', () => {
  const looks = [{ items: [{ price: 1400 }, { price: 1300 }, { price: 900 }], pick: 0 }, { items: [{ price: 1000 }], pick: 0 }];
  assert.equal(fitBudgetCandidates(looks, 2300), 2300);
  assert.equal(looks[0].pick, 1);
});

test('reports when catalogue options cannot satisfy a total budget', () => {
  const looks = [{ items: [{ price: 1200 }], pick: 0 }, { items: [{ price: 900 }], pick: 0 }];
  assert.equal(fitBudgetCandidates(looks, 1800), 2100);
});
