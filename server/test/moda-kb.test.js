import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKb, productFacts } from '../src/lib/moda/kb.js';
import { sanitizeBrain, brainPrompt } from '../src/lib/moda/brain.js';

const p = { id: 1, name_ar: 'قميص أبيض', store_slug: 'a', stock: 2, track_stock: 1, material_ar: 'كتان', sizes_json: '["M"]' };
const stores = [{ slug: 'a', name_ar: 'مارتن', phone: '01234567890', return_days: 3 }];

test('الحقائق بتكتب «مش مسجل» للمجهول ومفيهاش أسعار', () => {
  const t = productFacts({ ...p, material_ar: '', price: 450 });
  assert.match(t, /مش مسجلة من المحل/);
  assert.doesNotMatch(t, /450/);
});
test('buildKb بيجمع المنتج ومحله', () => {
  const kb = buildKb({ products: [p], lookItems: [{ id: 1 }], stores });
  assert.match(kb, /كتان/); assert.match(kb, /01234567890/);
});
test('تقدير الصورة موسوم إنه مش مؤكد', () => {
  assert.match(productFacts({ ...p, material_ar: '', ai_json: JSON.stringify({ sleeves: 'كم طويل', material_look: 'قطن', v: 1 }) }), /مش مؤكد من المحل.*الكم=كم طويل/);
});
test('بيانات المحل بتكسب على تقدير الصورة في الخامة', () => {
  const t = productFacts({ ...p, material_ar: 'كتان', ai_json: JSON.stringify({ material_look: 'جلد' }) });
  assert.match(t, /الخامة: كتان/); assert.doesNotMatch(t, /جلد/);
});
test('زرار الإيقاف MODA_AI_FACTS=0', () => {
  process.env.MODA_AI_FACTS = '0';
  try { assert.doesNotMatch(productFacts({ ...p, ai_json: JSON.stringify({ sleeves: 'كم طويل' }) }), /من تحليل الصورة/); } finally { delete process.env.MODA_AI_FACTS; }
});
test('رقم تليفون مخترع بيتشال، وبتاع الحقائق بيعدّي', () => {
  const kb = buildKb({ products: [p], lookItems: [{ id: 1 }], stores });
  assert.equal(sanitizeBrain({ reply: 'كلمهم على 01111111111' }, { kb }).reply, '');
  assert.match(sanitizeBrain({ reply: 'كلمهم على 01234567890' }, { kb }).reply, /01234567890/);
});
test('البرومبت فيه قاعدة المعرفة', () => { assert.match(brainPrompt({ kb: 'x' }), /KNOWLEDGE RULE/); });
