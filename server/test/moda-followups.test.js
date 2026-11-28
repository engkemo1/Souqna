// Twyla follow-ups: «مش عاوز حاجه كلاسيك» adjusts the LAST request (same person / occasion / budget); «مش فاهم» never gets the same sentence again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runModa } from '../src/lib/moda/engine.js';

const P = [
  { id: 101, name_ar: 'قميص رجالي كاجوال أبيض', key: 'shirt', gender: 'men', price: 450, formality: 3, colorKeys: ['white'], inStock: true },
  { id: 107, name_ar: 'جينز رجالي كاجوال', key: 'jeans', gender: 'men', price: 650, formality: 2, colorKeys: ['blue'], inStock: true },
  { id: 103, name_ar: 'كوتشي أبيض كاجوال', key: 'sneakers', gender: 'men', price: 500, formality: 2, colorKeys: ['white'], inStock: true },
  { id: 108, name_ar: 'حذاء قرنيه كلاسيك', key: 'formal_shoes', gender: 'men', price: 650, formality: 5, colorKeys: ['black'], inStock: true },
];
const talk = async (turns, products = P) => {
  const msgs = []; let session; const out = [];
  for (const u of turns) { msgs.push({ role: 'user', content: u }); const r = await runModa(msgs, { products, session }); session = r.session; msgs.push({ role: 'assistant', content: r.say }); out.push(r); }
  return out;
};
const ids = (r) => (r.blocks?.tabs || []).flatMap((t) => t.items.map((i) => i.id));

test('«مش عاوز حاجه كلاسيك» after an outfit keeps the person, occasion and budget (no «ده لأنهي مناسبة؟»)', async () => {
  const [t1, t2] = await talk(['رشحلي لوك رجالي للخروج ميزانيتي 3000', 'مش عاوز حاجه كلاسيك']);
  assert.ok(ids(t1).length >= 2);
  assert.ok(ids(t2).length >= 2, t2.say);
  assert.ok(!/لأنهي مناسبة/.test(t2.say), t2.say);
  assert.ok(!ids(t2).includes(108), 'the classic shoe must not come back');
  assert.ok(ids(t2).every((id) => P.find((p) => p.id === id).gender === 'men'));
});

test('«مش فاهم» after a question never repeats the same sentence', async () => {
  const [t1, t2] = await talk(['أنا عاوز أزياء رجالي', 'مش فاهم']);
  assert.ok(t1.say);
  assert.notEqual(t2.say.trim(), t1.say.trim());
});
test('«مش فاهم» right after a clarifying question explains it again, simpler', async () => {
  const [t1, t2] = await talk(['انا عاوز حاجه شيك', 'مش فاهم']);
  if (/[؟?]/.test(t1.say)) { assert.notEqual(t2.say.trim(), t1.say.trim()); assert.ok(t2.say.includes(t1.say.trim().slice(0, 12)) || t2.say.length > 10); }
});

const mk = (id, ar, key, price, f, c) => ({ id, name_ar: ar, key, gender: 'men', price, formality: f, colorKeys: [c], inStock: true });
const BIG = [mk(1, 'قميص أبيض كاجوال', 'shirt', 450, 3, 'white'), mk(2, 'قميص أزرق كاجوال', 'shirt', 480, 3, 'blue'), mk(3, 'قميص بيج كاجوال', 'shirt', 470, 3, 'beige'),
  mk(4, 'جينز أزرق', 'jeans', 650, 2, 'blue'), mk(5, 'جينز أسود', 'jeans', 700, 2, 'black'), mk(6, 'بنطلون كاكي', 'pants', 600, 3, 'khaki'),
  mk(7, 'كوتشي أبيض', 'sneakers', 500, 2, 'white'), mk(8, 'كوتشي أسود', 'sneakers', 520, 2, 'black'), mk(9, 'كوتشي بيج', 'sneakers', 510, 2, 'beige')];
for (const phrase of ['عاوز حاجه تانيه', 'شوفلي حاجه تانيه', 'شوفلي طقم تاني', 'غيرلي الطقم', 'فيه غيرها؟', 'مش عاجبني', 'غيرها']) {
  test(`«${phrase}» after an outfit gives a DIFFERENT outfit (nothing already shown is repeated)`, async () => {
    const [t1, t2] = await talk(['رشحلي لوك رجالي للخروج ميزانيتي 3000', phrase], BIG);
    assert.ok(ids(t1).length >= 2); assert.ok(ids(t2).length >= 2, t2.say);
    assert.ok(ids(t2).every((id) => !ids(t1).includes(id)), `${ids(t1)} vs ${ids(t2)}`);
  });
}
