// يمنع رجوع مشكلة "تويلا رشّحت روب/لانجري/بيجامة/كفلينج في طقم مناسبة".
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKnowledge } from '../src/lib/moda/knowledge.js';
import { enrichProduct } from '../src/lib/moda/products.js';
import { NEVER_UNASKED } from '../src/lib/moda/plan.js';

const K = loadKnowledge();
const cases = [
  ['روب ستان', 'robe'], ['روب ستان توب', 'robe'], ['برنس حمام', 'robe'], ['لانجيري دانتيل', 'lingerie'],
  ['بيجامة قطن', 'sleepwear'], ['روب رجالي قطن', 'robe'], ['بيجامة رجالي', 'sleepwear'], ['تيشرت داخلي رجالي', 'underwear'], ['فانلة داخلية رجالي', 'underwear'], ['بوكسر رجالي', 'underwear'], ['كفلينج رجالي', 'cufflinks'], ['لبس نوم حريمي', 'sleepwear'], ['كفلينج فضي', 'cufflinks'],
];
for (const [name, key] of cases) {
  test(`"${name}" يتصنّف ${key} حتى لو القسم "توب"`, () => {
    const p = enrichProduct({ name_ar: name, cat_text: 'توب', price: 560, stock: 5 }, K);
    assert.equal(p.key, key);
    assert.ok(NEVER_UNASKED.has(p.key));
  });
}
test('فستان سواريه ما يتأثرش', () => {
  assert.equal(enrichProduct({ name_ar: 'فستان سواريه', price: 900, stock: 5 }, K).key, 'dress_party');
});
