import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';

const KEY = 'advertiser-admin-key-0123456789';
process.env.DB_FILE = path.join(os.tmpdir(), `souqna-advertiser-${randomUUID()}.db`);
process.env.JWT_SECRET = `advertiser-${randomUUID()}-0123456789`;
process.env.ADMIN_KEY = KEY;
delete process.env.ADMIN_TOTP_SECRET;

let ctx = null;
test.after(() => ctx?.server.close());
async function setup() {
  if (ctx) return ctx;
  const { default: publicRoutes } = await import('../src/routes/public.js');
  const { default: adminRoutes } = await import('../src/routes/admin.js');
  const { errorHandler } = await import('../src/lib/errors.js');
  const app = express(); app.use(express.json());
  app.use('/api', publicRoutes); app.use('/api/admin', adminRoutes); app.use(errorHandler);
  const server = createServer(app); await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, url, body) => {
    const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(url.startsWith('/admin') ? { 'x-admin-key': KEY } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  ctx = { server, call };
  return ctx;
}
const adv = (over = {}) => ({ name_ar: 'ورشة النور', name_en: 'Al Nour', tagline_ar: 'أحسن تفصيل في بنها', whatsapp: '01012345678', phone: '01012345678', address_ar: 'شارع سعد زغلول', hours_ar: 'يوميًا 10 ص – 12 م', offer_text_ar: 'قول الكلمة واخد هدية', offer_code: 'TWIST', consent: true, gallery: ['/img/1.jpg', '/img/2.jpg'], ...over });
const ad = (advertiser_id, over = {}) => ({ type: 'custom', title_ar: 'ورشة النور', title_en: 'Al Nour', desktop_image: '/img/a.jpg', advertiser_id, placements: [{ key: 'market_hero', order: 0, devices: ['desktop', 'mobile'] }], ...over });

test('advertiser: validation — consent, contact method, phone, links, photo count, duplicate address', async () => {
  const { call } = await setup();
  const bad = async (over, field) => { const r = await call('POST', '/admin/featured/advertisers', adv(over)); assert.equal(r.status, 422, field); assert.ok(r.body.error.fields[field], `${field}: ${JSON.stringify(r.body.error.fields)}`); };
  await bad({ consent: false }, 'consent');
  await bad({ whatsapp: '', phone: '', maps_url: '' }, 'whatsapp');
  await bad({ whatsapp: 'abc' }, 'whatsapp');
  await bad({ instagram: 'http://insecure.example' }, 'instagram');
  await bad({ maps_url: 'javascript:alert(1)' }, 'maps_url');
  await bad({ gallery: Array(7).fill('/img/x.jpg') }, 'gallery');
  await bad({ name_ar: '' }, 'name_ar');
  await bad({ offer_code: 'see https://evil.example' }, 'offer_code');
  const ok = await call('POST', '/admin/featured/advertisers', adv({ slug: 'al-nour' }));
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.advertiser.whatsapp, '201012345678'); // Egyptian number normalised for wa.me
  assert.equal(ok.body.advertiser.url, '/a/al-nour');
  const dup = await call('POST', '/admin/featured/advertisers', adv({ slug: 'al-nour' }));
  assert.equal(dup.status, 422); assert.ok(dup.body.error.fields.slug);
  const auto = await call('POST', '/admin/featured/advertisers', adv({ name_ar: 'ثاني', name_en: 'Al Nour' })); // same English name, no slug given → made unique
  assert.equal(auto.status, 201); assert.notEqual(auto.body.advertiser.slug, 'al-nour');
});

test('advertiser: public page, hidden/withdrawn is gone, events counted and de-duplicated, report text', async () => {
  const { call } = await setup();
  const { _resetSeen } = await import('../src/lib/advertisers.js');
  _resetSeen();
  const made = (await call('POST', '/admin/featured/advertisers', adv({ slug: 'page-test' }))).body.advertiser;
  const pub = await call('GET', '/advertiser/page-test');
  assert.equal(pub.status, 200);
  assert.equal(pub.body.advertiser.name.ar, 'ورشة النور');
  assert.equal(pub.body.advertiser.offer.code, 'TWIST');
  assert.ok(pub.body.advertiser.whatsappText.includes('TWIST'));
  assert.equal(pub.body.advertiser.consent, undefined); // internal fields are not exposed
  assert.equal((await call('GET', '/advertiser/nope')).status, 404);

  for (const e of ['view', 'view', 'whatsapp', 'whatsapp', 'call', 'map', 'offer', 'bogus']) await call('POST', '/advertiser/page-test/event', { event: e });
  const a = (await call('GET', `/admin/featured/advertisers/${made.id}`)).body.advertiser;
  assert.equal(a.stats.view, 1); assert.equal(a.stats.whatsapp, 1); assert.equal(a.stats.call, 1); assert.equal(a.stats.map, 1); assert.equal(a.stats.offer, 1);
  assert.equal(a.stats.contacts, 3);
  const rep = (await call('GET', `/admin/featured/advertisers/${made.id}/report`)).body;
  assert.match(rep.text, /ورشة النور/); assert.match(rep.text, /واتساب 1/);

  const hide = await call('PUT', `/admin/featured/advertisers/${made.id}`, adv({ slug: 'page-test', status: 'hidden' }));
  assert.equal(hide.status, 200);
  assert.equal((await call('GET', '/advertiser/page-test')).status, 404);
  assert.equal((await call('POST', '/advertiser/page-test/event', { event: 'view' })).body.counted, false);
});

test('advertiser: an ad can point at an advertiser; hides when the advertiser is hidden; cannot delete one in use', async () => {
  const { call } = await setup();
  const featured = await import('../src/lib/featured.js');
  const { q } = await import('../src/db/index.js');
  q.run('DELETE FROM featured_campaigns');
  const a = (await call('POST', '/admin/featured/advertisers', adv({ slug: 'ad-link', name_ar: 'مربوط', name_en: 'Linked' }))).body.advertiser;
  // needs either a destination, a store or an advertiser
  const ghost = await call('POST', '/admin/featured/campaigns', { ...ad(999999), status: 'active' });
  assert.equal(ghost.status, 422);
  const created = await call('POST', '/admin/featured/campaigns', { ...ad(a.id), status: 'active' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.campaign.href, '/a/ad-link');
  assert.equal(created.body.campaign.advertiser.slug, 'ad-link');
  const live = await call('GET', '/featured?placement=market_hero');
  assert.equal(live.body.items.length, 1);
  assert.equal(live.body.items[0].href, '/a/ad-link');
  assert.equal((await call('DELETE', `/admin/featured/advertisers/${a.id}`)).status, 409);
  await call('PUT', `/admin/featured/advertisers/${a.id}`, adv({ slug: 'ad-link', name_ar: 'مربوط', name_en: 'Linked', status: 'hidden' }));
  featured._resetSeen();
  assert.equal((await call('GET', '/featured?placement=market_hero')).body.items.length, 0); // ad disappears with the page
  const list = (await call('GET', '/admin/featured/campaigns')).body.items;
  assert.equal(list[0].health, 'advertiser_hidden');
  // both a shop and an advertiser is refused
  const both = await call('POST', '/admin/featured/campaigns', { ...ad(a.id), store_id: 1 });
  assert.equal(both.status, 422);
});

test('advertiser: opening hours give an "open now" flag; bad hours are refused', async () => {
  const { call } = await setup();
  const none = (await call('POST', '/admin/featured/advertisers', adv({ slug: 'no-hours' }))).body.advertiser;
  assert.equal((await call('GET', '/advertiser/no-hours')).body.advertiser.openNow, null); // no structured hours → no badge
  const half = await call('POST', '/admin/featured/advertisers', adv({ slug: 'half', open_from: '09:00' }));
  assert.equal(half.status, 422); assert.ok(half.body.error.fields.open_from);
  const same = await call('POST', '/admin/featured/advertisers', adv({ slug: 'same', open_from: '09:00', open_to: '09:00' }));
  assert.equal(same.status, 422);
  const badDay = await call('POST', '/admin/featured/advertisers', adv({ slug: 'badday', open_days: [9] }));
  assert.equal(badDay.status, 422);
  // every day, whole day except a 1-minute gap is effectively always open; a 00:00→23:59 window covers all but 23:59
  const all = await call('POST', '/admin/featured/advertisers', adv({ slug: 'always', open_from: '00:00', open_to: '23:59' }));
  assert.equal(all.status, 201); assert.equal(all.body.advertiser.openFrom, '00:00');
  const pub = (await call('GET', '/advertiser/always')).body.advertiser;
  assert.equal(typeof pub.openNow, 'boolean');
  // closed all week days listed = never open on other days: pick the 6 days that are not today (Cairo) → closed now
  const { cairoStamp } = await import('../src/lib/promotions/store.js');
  const today = cairoStamp().dow;
  const others = [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== today);
  await call('POST', '/admin/featured/advertisers', adv({ slug: 'not-today', open_days: others }));
  assert.equal((await call('GET', '/advertiser/not-today')).body.advertiser.openNow, false);
  await call('POST', '/admin/featured/advertisers', adv({ slug: 'today-only', open_days: [today] }));
  assert.equal((await call('GET', '/advertiser/today-only')).body.advertiser.openNow, true);
  assert.ok(none.id);
});

test('advertiser: photos can carry a name + price and become orderable on WhatsApp; orders are counted', async () => {
  const { call } = await setup();
  const { _resetSeen } = await import('../src/lib/advertisers.js');
  _resetSeen();
  const bad = await call('POST', '/admin/featured/advertisers', adv({ slug: 'bad-price', gallery: [{ src: '/img/1.jpg', name: 'قطعة', price: '12.5' }] }));
  assert.equal(bad.status, 422); assert.ok(bad.body.error.fields.gallery);
  const neg = await call('POST', '/admin/featured/advertisers', adv({ slug: 'neg-price', gallery: [{ src: '/img/1.jpg', price: -5 }] }));
  assert.equal(neg.status, 422);
  const evil = await call('POST', '/admin/featured/advertisers', adv({ slug: 'evil-src', gallery: [{ src: 'javascript:alert(1)', name: 'x' }] }));
  assert.equal(evil.status, 422);
  const ok = await call('POST', '/admin/featured/advertisers', adv({ slug: 'items', gallery: [{ src: '/img/1.jpg', name: 'جاكيت جلد', price: '1250' }, { src: '/img/2.jpg', name: '', price: '' }, '/img/3.jpg'] }));
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.deepEqual(ok.body.advertiser.gallery, [{ src: '/img/1.jpg', name: 'جاكيت جلد', price: 1250 }, { src: '/img/2.jpg', name: '', price: null }, { src: '/img/3.jpg', name: '', price: null }]);
  const pub = (await call('GET', '/advertiser/items')).body.advertiser;
  assert.equal(pub.gallery[0].price, 1250); assert.equal(pub.gallery[1].name, '');
  await call('POST', '/advertiser/items/event', { event: 'order' });
  const a = (await call('GET', `/admin/featured/advertisers/${ok.body.advertiser.id}`)).body.advertiser;
  assert.equal(a.stats.order, 1);
  const rep = (await call('GET', `/admin/featured/advertisers/${ok.body.advertiser.id}/report`)).body;
  assert.match(rep.text, /طلبوا قطع/);
});
