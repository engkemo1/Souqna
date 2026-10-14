import test from 'node:test';
import assert from 'node:assert/strict';
import { productTypeTree, deriveDepartment, sizeKindFor, typeFitsAudience, SIZE_KINDS } from '../src/lib/product-types.js';
import { loadKnowledge } from '../src/lib/moda/knowledge.js';
import { inferGender } from '../src/lib/moda/products.js';

const K = loadKnowledge();

test('tree is built from the Moda taxonomy: every type is a real, non-virtual Moda garment', () => {
  const t = productTypeTree(K);
  assert.ok(t.families.length >= 10 && t.audiences.length === 6);
  for (const f of t.families) for (const ty of f.types) { assert.ok(K.items.get(ty.key) && !K.items.get(ty.key).virtual, ty.key); assert.ok(ty.audiences.length); for (const a of t.audiences) assert.ok(SIZE_KINDS[ty.sizeKind[a.key]], `${ty.key}/${a.key}`); }
});

test('types are filtered by audience (no suits for women, no abayas for men)', () => {
  assert.equal(typeFitsAudience('suit', 'women'), false); assert.equal(typeFitsAudience('abaya', 'men'), false);
  assert.equal(typeFitsAudience('tshirt', 'women'), true); assert.equal(typeFitsAudience('dress_party', 'girls'), true); assert.equal(typeFitsAudience('suit', 'girls'), false);
});

test('sizes follow type + audience (women shoes 35-42, men jeans waist, kids by age, bags none)', () => {
  assert.equal(sizeKindFor('sneakers', 'women', K), 'shoes_women'); assert.equal(sizeKindFor('sneakers', 'men', K), 'shoes_men'); assert.equal(sizeKindFor('sneakers', 'boys', K), 'shoes_kids');
  assert.equal(sizeKindFor('jeans', 'men', K), 'waist_men'); assert.equal(sizeKindFor('tshirt', 'girls', K), 'kids'); assert.equal(sizeKindFor('tshirt', 'men', K), 'letters');
  assert.equal(sizeKindFor('handbag', 'women', K), 'none'); assert.equal(sizeKindFor('suit', 'men', K), 'suit'); assert.equal(sizeKindFor('tarha', 'women', K), 'free');
});

test('department is derived from type + audience and limited to what the store sells', () => {
  assert.equal(deriveDepartment('sneakers', 'women', ['men', 'women', 'shoes'], K), 'shoes');
  assert.equal(deriveDepartment('sneakers', 'women', ['men', 'women'], K), 'women');
  assert.equal(deriveDepartment('shirt', 'men', ['men'], K), 'men');
  assert.equal(deriveDepartment('jeans', 'men', ['men', 'denim'], K), 'denim');
  assert.equal(deriveDepartment('tshirt', 'girls', ['kids'], K), 'kids');
  assert.equal(deriveDepartment('suit', 'men', ['women'], K), null);
});

test('explicit audience beats name guessing; wedding departments map to the right audience', () => {
  assert.equal(inferGender({ name_ar: 'قميص', audience: 'women' }, 'shirt', K), 'women');
  assert.equal(inferGender({ name_ar: 'حاجة', department: 'wedding_dress' }, null, K), 'women');
  assert.equal(inferGender({ name_ar: 'حاجة', department: 'wedding_suit' }, null, K), 'men');
});
