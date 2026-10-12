import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesVisualType, visualProductFamily, visualTypeOptions } from '../src/lib/visual-taxonomy.js';

test('visual type choices come from Moda taxonomy and exclude virtual items', () => {
  const shoes = visualTypeOptions().find((item) => item.key === 'shoes');
  assert.ok(shoes?.itemKeys.includes('sneakers'));
  assert.ok(!shoes?.itemKeys.includes('shoes_any'));
});

test('visual filtering keeps shoes separate from jackets', () => {
  const shoe = { department: 'women', name_ar: 'كوتشي رياضي أبيض', cat_text: 'أحذية رياضية' };
  const jacket = { department: 'women', name_ar: 'جاكيت شتوي', cat_text: 'ملابس حريمي' };
  assert.equal(visualProductFamily(shoe), 'shoes');
  assert.equal(matchesVisualType(shoe, 'shoes'), true);
  assert.equal(matchesVisualType(shoe, 'outerwear'), false);
  assert.equal(matchesVisualType(jacket, 'outerwear'), true);
  assert.equal(matchesVisualType(jacket, 'shoes'), false);
});

test('conflicting product and category labels are excluded rather than guessed', () => {
  const ambiguous = { department: 'shoes', name_ar: 'جاكيت مبطن', cat_text: 'أحذية' };
  assert.equal(visualProductFamily(ambiguous), null);
  assert.equal(matchesVisualType(ambiguous, 'shoes'), false);
  assert.equal(matchesVisualType(ambiguous, 'outerwear'), false);
});
