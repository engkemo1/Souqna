import test from 'node:test';
import assert from 'node:assert/strict';
import { generateColorHarmonyInsight, generateFitAndSizingTip } from '../src/lib/moda/stylingInsights.js';
import { runModa } from '../src/lib/moda/engine.js';

test('stylingInsights: generates expert color harmony notes', () => {
  // 1. Navy + Tan
  const navyTan = generateColorHarmonyInsight(['navy', 'tan'], 'engagement_guest', false);
  assert.match(navyTan, /الكحلي مع درجات الهافان/);

  // 2. Black + White in formal context
  const bwFormal = generateColorHarmonyInsight(['black', 'white'], 'wedding_guest', false);
  assert.match(bwFormal, /قمة الشياكة الرسمية/);

  // 3. Earth tones
  const earth = generateColorHarmonyInsight(['beige', 'olive', 'camel'], 'casual_outing', false);
  assert.match(earth, /تناغم الدرجات الترابية/);

  // 4. Monochrome
  const mono = generateColorHarmonyInsight(['black'], 'date_night', false);
  assert.match(mono, /المونوكروم بالأسود/);

  // 5. Couple
  const couple = generateColorHarmonyInsight(['navy', 'powder_blue'], 'wedding_guest', true);
  assert.match(couple, /الألوان متناسقة بين الإطلالتين/);
});

test('stylingInsights: generates actionable fit and sizing guidance based on attributes and name', () => {
  // 1. Slim fit
  const slimTip = generateFitAndSizingTip({ name_ar: 'بدلة رجالي كلاسيك سليم فيت', price: 2000 });
  assert.match(slimTip, /سليم فيت مجسمة/);

  // 2. Oversized
  const overTip = generateFitAndSizingTip({ name_ar: 'هودي أوفر سايز ميلتون', price: 800 });
  assert.match(overTip, /أوفرسايز/);

  // 3. Winter Fleece / Milton
  const fleeceTip = generateFitAndSizingTip({ name_ar: 'ترنج ميلتون مبطن شتوي', price: 550 });
  assert.match(fleeceTip, /ميلتون/);

  // 4. Linen
  const linenTip = generateFitAndSizingTip({ name_ar: 'قميص كتان صيفي أبيض', price: 650 });
  assert.match(linenTip, /كتان/);

  // 5. Classic Leather Shoes
  const shoeTip = generateFitAndSizingTip({ name_ar: 'حذاء كلاسيك جلد طبيعي أسود', price: 750 });
  assert.match(shoeTip, /جلد/);
});

test('runModa: enriches outfits with styleTips and item-level fitTips', async () => {
  const products = [
    { id: 501, name_ar: 'بدلة رجالي سليم فيت كحلي', key: 'suit', gender: 'men', price: 2500, formality: 5, colorKeys: ['navy'], inStock: true },
    { id: 502, name_ar: 'حذاء كلاسيك جلد طبيعي هافان', key: 'formal_shoes', gender: 'men', price: 850, formality: 5, colorKeys: ['tan'], inStock: true },
  ];

  const res = await runModa([{ role: 'user', content: 'عاوز بدله كحلي سليم فيت' }], { products });
  assert.ok(res.blocks?.tabs?.length > 0);

  // Check styleTips has harmony explanation
  assert.ok(res.styleTips?.length > 0);

  // Check items carry fitTip
  const suitItem = res.blocks.tabs[0].items.find((it) => it.id === 501);
  assert.ok(suitItem?.fitTip, 'Suit item must carry a fitTip');
  assert.match(suitItem.fitTip, /سليم فيت/);
});
