import test from 'node:test';
import assert from 'node:assert/strict';
import { familyForLabel, parseRow } from '../src/lib/visual-testset.js';

test('article types map to garment families', () => {
  const m = { Tshirts: 'tops', Shirts: 'tops', Jeans: 'bottoms', Trousers: 'bottoms', Dresses: 'dresses', Jackets: 'outerwear', 'Casual Shoes': 'shoes', Heels: 'shoes', Handbags: 'bags', Backpacks: 'bags', Watches: 'accessories', Belts: 'accessories', 'Track Pants': 'sport', Nightdress: 'underwear_sleep', 'Sports Shoes': 'shoes' };
  for (const [k, v] of Object.entries(m)) { const got = familyForLabel(k); if (k === 'Track Pants') assert.equal(got, 'sport'); else assert.equal(got, v, k); }
  assert.equal(familyForLabel('Fragrance gift set'), null);
});

test('parseRow reads datasets-server rows and skips unusable ones', () => {
  const ok = parseRow({ row_idx: 5, row: { id: 123, articleType: 'Jeans', image: { src: 'https://x/y.jpg', height: 80, width: 60 } } });
  assert.deepEqual(ok, { id: '123', family: 'bottoms', url: 'https://x/y.jpg' });
  assert.equal(parseRow({ row: { articleType: 'Perfume', image: { src: 'u' } } }), null);
  assert.equal(parseRow({ row: { articleType: 'Jeans' } }), null);
  assert.equal(parseRow({ row: { articleType: 'Perfume', subCategory: 'Dress', image: 'https://z' } }).family, 'dresses');
});
