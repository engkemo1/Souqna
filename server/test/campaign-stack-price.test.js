// «وفّرها مرتين»: Twist's extra % comes off the SHOP's price after the shop's own discount; final price is clear on cards and in the cart.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

process.env.DB_FILE = path.join(os.tmpdir(), `souqna-stack-${randomUUID()}.db`);
process.env.JWT_SECRET = `stack-${randomUUID()}`;

test('stack mode: Twist % on top of the shop price after its discount; the shop is still paid in full', async () => {
  const { q, insert } = await import('../src/db/index.js');
  const { saveCampaign, cardPricing, THEMES, publicCampaigns } = await import('../src/lib/sale-campaigns.js');
  const { quote } = await import('../src/lib/cart.js');
  const { serializeCards } = await import('../src/lib/serialize.js').catch(() => ({}));
  assert.ok(THEMES.includes('twice'));
  const uid = insert('users', { name: 'o', email: 'o@st.test', password_hash: 'x', role: 'owner', token_version: 1 });
  const sid = insert('stores', { owner_id: uid, slug: 'st', code: 'ST1', name_ar: 'م', name_en: 'S', shipping_fee: 0, status: 'active', phone: '01011112222', whatsapp: '01011112222' });
  // shop's own sale: list 1000, now 800 (20% off)
  const pid = insert('products', { store_id: sid, slug: 'sale-p', name_en: 'p', name_ar: 'ب', price: 800, compare_at_price: 1000, status: 'active', track_stock: 1, stock: 9, department: 'women_tops' });
  const plain = insert('products', { store_id: sid, slug: 'plain-p', name_en: 'q', name_ar: 'ج', price: 500, status: 'active', track_stock: 1, stock: 9, department: 'women_tops' });
  const t = Date.now();
  const r = saveCampaign({ kind: 'discount', name: 'وفّرها مرتين', theme: 'twice', status: 'active', startsAt: t - 1000, endsAt: t + 3600e3, percent: 10, mode: 'stack', headline: 'وفّرها مرتين' });
  assert.ok(r.campaign, JSON.stringify(r));
  const p1 = q.get('SELECT * FROM products WHERE id=?', [pid]); const p2 = q.get('SELECT * FROM products WHERE id=?', [plain]);
  const c1 = cardPricing(p1);
  assert.equal(c1.storePrice, 800); assert.equal(c1.price, 720); assert.equal(c1.compareAt, 1000); assert.equal(c1.mode, 'stack');
  assert.ok(c1.price < c1.storePrice, 'final price is below the shop price after its own discount');
  const c2 = cardPricing(p2); assert.equal(c2.price, 450); assert.equal(c2.storePrice, 500);
  const store = q.get('SELECT * FROM stores WHERE id=?', [sid]);
  const qt = quote(store, [{ productId: pid, qty: 2 }]);
  assert.equal(qt.campaignDiscount, 160); assert.equal(qt.campaignMode, 'stack');
  assert.equal(qt.subtotal - qt.campaignDiscount, 1440, 'pays 2 × 720'); assert.equal(qt.platformDiscount, 160, 'Twist funds it: the shop is paid in full');
  assert.equal(publicCampaigns().discount.theme, 'twice');
  if (serializeCards) { const card = serializeCards([p1])[0]; assert.equal(card.price, 720); assert.equal(card.campaign.storePrice, 800); assert.equal(card.campaign.mode, 'stack'); }
});
