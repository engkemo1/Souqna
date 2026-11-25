// «ازاي أتتبع طلبي؟» and its spoken variants must reach the order_track FAQ.
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchFaq, faqAnswer } from '../src/lib/moda/faq.js';
const norm = (x) => String(x).toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

test('tracking questions map to order_track', () => {
  for (const t of ['ازاي اتتبع طلبي؟', 'هتتبع طلبي منين', 'ممكن اتابع الشحنة', 'رقم الطلب بتاعي مش لاقيه', 'انا نسيت رقم الاوردر', 'عايز اتتبع الاوردر', 'فين طلبي', 'track my order'])
    assert.equal(matchFaq(norm(t)), 'order_track', t);
});
test('the answer tells how to recover a lost tracking number', () => {
  assert.match(faqAnswer('order_track', { lang: 'ar' }), /رقم الطلب ورقم التليفون/);
  assert.match(faqAnswer('order_track', { lang: 'en' }), /order number and the phone/);
});
