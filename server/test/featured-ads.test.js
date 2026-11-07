import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';

const KEY = 'featured-admin-key-0123456789';

let shared = null;
test.after(() => { if (shared) shared.server.close(); });
async function setup() {
  if (shared) { shared.reset(); return shared; }
  process.env.DB_FILE = path.join(os.tmpdir(), `souqna-featured-${randomUUID()}.db`);
  process.env.JWT_SECRET = `featured-${randomUUID()}-0123456789`;
  process.env.ADMIN_KEY = KEY;
  delete process.env.ADMIN_TOTP_SECRET;
  const { default: publicRoutes } = await import('../src/routes/public.js');
  const { default: ownerRoutes } = await import('../src/routes/owner.js');
  const { default: adminRoutes } = await import('../src/routes/admin.js');
  const { errorHandler } = await import('../src/lib/errors.js');
  const { signToken } = await import('../src/lib/auth.js');
  const { insert, q } = await import('../src/db/index.js');
  const featured = await import('../src/lib/featured.js');
  const app = express();
  app.use(express.json());
  app.use('/api', publicRoutes); app.use('/api/owner', ownerRoutes); app.use('/api/admin', adminRoutes); app.use(errorHandler);
  const server = createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, url, body, { token, admin = true } = {}) => {
    const headers = { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(admin && url.startsWith('/admin') ? { 'x-admin-key': KEY } : {}) };
    const r = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const mk = (n) => {
    const userId = insert('users', { name: `O${n}`, email: `${randomUUID()}@e.test`, password_hash: 'x' });
    const slug = `ft-${n}-${randomUUID().slice(0, 6)}`;
    const storeId = insert('stores', { owner_id: userId, slug, code: `FT${n}`, name_ar: `محل ${n}`, name_en: `Shop ${n}`, shipping_fee: 50, free_shipping_over: 100000 });
    const catId = insert('categories', { store_id: storeId, slug: 'c', name_ar: 'قسم', name_en: 'Cat' });
    const productId = insert('products', { store_id: storeId, slug: `p-${randomUUID().slice(0, 5)}`, name_ar: 'منتج', name_en: 'Item', price: 300, stock: 10, category_id: catId });
    return { storeId, slug, catId, productId, token: signToken({ id: userId }) };
  };
  const offer = async (S, over = {}) => {
    const r = await call('POST', '/owner/promotions', { name_ar: 'خصم 10%', type: 'percentage', status: 'active', def: { qualify: { all: true }, effect: { kind: 'percent_off', percent: 10 } }, ...over }, { token: S.token });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body.offer.id;
  };
  const custom = (over = {}) => ({
    type: 'custom', title_ar: 'إعلان مميز', title_en: 'Featured ad', desktop_image: '/img/a.jpg', destination_url: '/search',
    placements: [{ key: 'market_hero', order: 0, devices: ['desktop', 'mobile'] }], ...over,
  });
  const pub = (placement, qs = '') => call('GET', `/featured?placement=${placement}${qs}`);
  // the db module is loaded once per process, so every test shares one database; each test starts from a clean campaign table
  const reset = () => { q.run('DELETE FROM featured_hourly'); q.run('DELETE FROM featured_stats'); q.run('DELETE FROM featured_campaigns'); q.run('DELETE FROM promotions'); featured._resetSeen(); };
  shared = { server, call, mk, offer, custom, pub, q, featured, reset, close: () => {} };
  return shared;
}

test('permissions: admin endpoints reject callers without the admin key; public API is read-only', async () => {
  const t = await setup();
  try {
    const noKey = await t.call('GET', '/admin/featured/campaigns', null, { admin: false });
    assert.ok([401, 403].includes(noKey.status), `status ${noKey.status}`);
    const noKeyWrite = await t.call('POST', '/admin/featured/campaigns', t.custom(), { admin: false });
    assert.ok([401, 403].includes(noKeyWrite.status));
    const ok = await t.call('GET', '/admin/featured/campaigns');
    assert.equal(ok.status, 200);
    const S = t.mk('own'); // a store owner token is not an admin
    const owner = await t.call('GET', '/admin/featured/campaigns', null, { token: S.token, admin: false });
    assert.ok([401, 403].includes(owner.status));
    assert.equal((await t.call('POST', '/featured', t.custom())).status, 404); // no public write route for campaigns
  } finally { t.close(); }
});

test('validation: unsafe links, colours, dates, placements and missing content are rejected; text is sanitised', async () => {
  const t = await setup();
  try {
    const post = (b) => t.call('POST', '/admin/featured/campaigns', b);
    for (const bad of ['javascript:alert(1)', '//evil.example', 'data:text/html,x', 'http://plain.example.com/x', '/a b', '/x\\y']) {
      const r = await post(t.custom({ destination_url: bad }));
      assert.equal(r.status, 422, bad); assert.equal(r.body.error.fields.destination_url, 'bad_url');
    }
    assert.equal((await post(t.custom({ destination_url: 'https://good.example.com/offer' }))).status, 201);
    assert.equal((await post(t.custom({ desktop_image: 'javascript:alert(1)' }))).status, 422);
    assert.equal((await post(t.custom({ background_color: 'red; background:url(x)' }))).body.error.fields.background_color, 'bad_color');
    assert.equal((await post(t.custom({ text_color: 'linear-gradient(90deg,#fff,#000)' }))).status, 422); // gradient only allowed as background
    assert.equal((await post(t.custom({ background_color: 'linear-gradient(135deg, #111827, #ef4444)' }))).status, 201);
    // the admin form sends empty strings for untouched colour fields: that means "use the default", not an error
    assert.equal((await post(t.custom({ background_color: '', text_color: '' }))).status, 201);
    // look controls: text alignment and image overlay are validated and round-trip
    const look = await post(t.custom({ text_align: 'center', overlay: 30 }));
    assert.equal(look.status, 201); assert.equal(look.body.campaign.textAlign, 'center'); assert.equal(look.body.campaign.overlay, 30);
    assert.equal((await post(t.custom({ text_align: 'left; evil' }))).body.error.fields.text_align, 'bad_value');
    assert.equal((await post(t.custom({ overlay: 95 }))).body.error.fields.overlay, 'bad_value');
    assert.equal((await post(t.custom({ overlay: 'x' }))).body.error.fields.overlay, 'bad_value');
    assert.equal((await post(t.custom())).body.campaign.overlay, 65); // defaults
    // image control: zoom / focal point on the background, a second (foreground) image with its own size and side
    const img = await post(t.custom({ image_zoom: 150, image_x: 20, image_y: 80, fg_image: '/img/product.png', fg_size: 55, fg_pos: 'start' }));
    assert.equal(img.status, 201);
    assert.deepEqual([img.body.campaign.imageZoom, img.body.campaign.imageX, img.body.campaign.imageY, img.body.campaign.fgImage, img.body.campaign.fgSize, img.body.campaign.fgPos], [150, 20, 80, '/img/product.png', 55, 'start']);
    assert.equal((await post(t.custom())).body.campaign.imageZoom, 100); // defaults
    // logo/second image styling: circle or rounded, free vertical spot, optionally hanging half outside the banner
    const lg = await post(t.custom({ fg_image: '/img/logo.png', fg_size: 18, fg_shape: 'circle', fg_y: 100, fg_out: true }));
    assert.equal(lg.status, 201, JSON.stringify(lg.body));
    assert.deepEqual([lg.body.campaign.fgShape, lg.body.campaign.fgY, lg.body.campaign.fgOut], ['circle', 100, true]);
    assert.deepEqual([img.body.campaign.fgShape, img.body.campaign.fgY, img.body.campaign.fgOut], ['none', 100, false]); // old campaigns keep their look
    for (const bad of [{ fg_shape: 'star' }, { fg_y: 101 }, { fg_y: -1 }]) assert.equal((await post(t.custom({ fg_image: '/img/logo.png', ...bad }))).status, 422, JSON.stringify(bad));
    for (const bad of [{ image_zoom: 50 }, { image_zoom: 500 }, { image_x: 101 }, { image_y: -1 }, { fg_size: 5 }, { fg_pos: 'top' }, { fg_image: 'javascript:alert(1)' }]) assert.equal((await post(t.custom(bad))).status, 422, JSON.stringify(bad));
    // layout: width / height / alignment of the whole banner on the page, plus the two extra homepage positions
    const lay = await post(t.custom({ layout_width: 'narrow', layout_height: 'l', layout_align: 'end', placements: [{ key: 'market_top' }, { key: 'market_bottom' }] }));
    assert.equal(lay.status, 201); assert.deepEqual([lay.body.campaign.layoutWidth, lay.body.campaign.layoutHeight, lay.body.campaign.layoutAlign], ['narrow', 'l', 'end']);
    assert.deepEqual([(await post(t.custom())).body.campaign.layoutWidth, (await post(t.custom())).body.campaign.layoutHeight], ['wide', 'm']);
    for (const bad of [{ layout_width: 'huge' }, { layout_height: 'xl' }, { layout_align: 'top' }]) assert.equal((await post(t.custom(bad))).status, 422, JSON.stringify(bad));
    assert.equal((await post(t.custom({ desktop_image: '', fg_image: '/img/p.png', publish: true }))).status, 201); // a foreground image alone is enough media
    assert.equal((await post(t.custom({ placements: [] }))).body.error.fields.placements, 'no_placement');
    assert.equal((await post(t.custom({ placements: [{ key: 'nowhere' }] }))).status, 422);
    assert.equal((await post(t.custom({ starts_at: '2030-02-30T10:00' }))).body.error.fields.starts_at, 'bad_date');
    assert.equal((await post(t.custom({ starts_at: '2030-05-01T10:00', ends_at: '2030-04-01T10:00' }))).body.error.fields.ends_at, 'end_before_start');
    assert.equal((await post(t.custom({ title_ar: 'x'.repeat(200) }))).body.error.fields.title_ar, 'too_long');
    assert.equal((await post({ ...t.custom(), type: 'weird' })).status, 422);
    // publishing needs content; a draft does not
    assert.equal((await post(t.custom({ title_ar: '', title_en: '', publish: true }))).status, 422);
    assert.equal((await post(t.custom({ desktop_image: '', publish: true }))).body.error.fields.desktop_image, 'image_required');
    assert.equal((await post(t.custom({ desktop_image: '', destination_url: '' }))).status, 201);
    const xss = await post(t.custom({ title_ar: '<img src=x onerror=alert(1)>عرض', badge_en: '<b>Hot</b>' }));
    assert.equal(xss.status, 201);
    assert.ok(!/[<>]/.test(xss.body.campaign.title.ar) && !/[<>]/.test(xss.body.campaign.badge.en), 'tags stripped');
    const err = await post(t.custom({ destination_url: 'javascript:1' }));
    assert.match(err.body.error.message, /—/); // bilingual message
    assert.equal((await post(t.custom({ store_id: 99999 }))).body.error.fields.store_id, 'store_missing');
  } finally { t.close(); }
});

test('lifecycle: draft -> publish -> pause -> resume -> archive -> restore -> duplicate -> delete', async () => {
  const t = await setup();
  try {
    const created = await t.call('POST', '/admin/featured/campaigns', t.custom());
    assert.equal(created.status, 201);
    const id = created.body.campaign.id;
    assert.equal(created.body.campaign.state, 'draft');
    assert.equal((await t.pub('market_hero')).body.items.length, 0); // drafts never reach the public

    const edit = await t.call('PUT', `/admin/featured/campaigns/${id}`, { ...t.custom({ title_ar: 'معدّل' }), status: 'active' });
    assert.equal(edit.status, 200, JSON.stringify(edit.body));
    assert.equal(edit.body.campaign.state, 'active');
    assert.equal((await t.pub('market_hero')).body.items[0].title.ar, 'معدّل');

    assert.equal((await t.call('POST', `/admin/featured/campaigns/${id}/resume`)).status, 409); // not paused
    assert.equal((await t.call('POST', `/admin/featured/campaigns/${id}/pause`)).body.campaign.state, 'paused');
    assert.equal((await t.pub('market_hero')).body.items.length, 0);
    assert.equal((await t.call('POST', `/admin/featured/campaigns/${id}/resume`)).body.campaign.state, 'active');
    assert.equal((await t.pub('market_hero')).body.items.length, 1);

    const dup = await t.call('POST', `/admin/featured/campaigns/${id}/duplicate`);
    assert.equal(dup.status, 201); assert.equal(dup.body.campaign.state, 'draft'); assert.notEqual(dup.body.campaign.id, id);
    assert.equal((await t.pub('market_hero')).body.items.length, 1); // the copy is a draft

    assert.equal((await t.call('POST', `/admin/featured/campaigns/${id}/archive`)).body.campaign.state, 'archived');
    assert.equal((await t.pub('market_hero')).body.items.length, 0);
    assert.equal((await t.call('PUT', `/admin/featured/campaigns/${id}`, t.custom())).status, 409); // archived campaigns are read-only
    assert.equal((await t.call('POST', `/admin/featured/campaigns/${id}/restore`)).body.campaign.state, 'draft');

    const list = await t.call('GET', '/admin/featured/campaigns?state=draft');
    assert.equal(list.body.items.length, 2);
    assert.equal((await t.call('GET', '/admin/featured/campaigns?type=offer')).body.items.length, 0);
    assert.equal((await t.call('GET', '/admin/featured/campaigns?q=%D9%85%D8%B9%D8%AF%D9%91%D9%84')).body.items.length, 2); // the original and its copy
    assert.equal((await t.call('DELETE', `/admin/featured/campaigns/${id}`)).status, 200);
    assert.equal((await t.call('GET', `/admin/featured/campaigns/${id}`)).status, 404);
  } finally { t.close(); }
});

test('scheduling: not shown before start, after end, or when draft/paused; automatic activation and expiry', async () => {
  const t = await setup();
  try {
    const mkLive = (over) => t.call('POST', '/admin/featured/campaigns', t.custom({ publish: true, ...over }));
    const future = await mkLive({ title_ar: 'قادم', starts_at: '2099-01-01T00:00' });
    const past = await mkLive({ title_ar: 'منتهي', ends_at: '2000-01-01T00:00' });
    const now = await mkLive({ title_ar: 'شغال', starts_at: '2000-01-01T00:00', ends_at: '2099-01-01T00:00' });
    assert.equal(future.body.campaign.state, 'scheduled');
    assert.equal(past.body.campaign.state, 'expired');
    assert.equal(now.body.campaign.state, 'active');
    const items = (await t.pub('market_hero')).body.items;
    assert.deepEqual(items.map((i) => i.title.ar), ['شغال']);
    // the dashboard counts follow the derived state
    const counts = (await t.call('GET', '/admin/featured/campaigns')).body.counts;
    assert.deepEqual([counts.scheduled, counts.expired, counts.active], [1, 1, 1]);
    // time moving on changes visibility without any write: state is computed from the Cairo clock
    const { campaignState } = t.featured;
    const row = { status: 'active', starts_at: '2030-06-01T10:00', ends_at: '2030-06-02T10:00' };
    assert.equal(campaignState(row, { stamp: '2030-05-31T23:59' }), 'scheduled');
    assert.equal(campaignState(row, { stamp: '2030-06-01T10:00' }), 'active');
    assert.equal(campaignState(row, { stamp: '2030-06-02T10:01' }), 'expired');
  } finally { t.close(); }
});

test('placement filtering: slot, device, audience, store and category targeting, limits and ordering', async () => {
  const t = await setup();
  try {
    const A = t.mk('a'); const B = t.mk('b');
    const post = (over) => t.call('POST', '/admin/featured/campaigns', t.custom({ publish: true, ...over }));
    await post({ title_ar: 'هيرو', placements: [{ key: 'market_hero', order: 1, priority: 10 }] });
    await post({ title_ar: 'هيرو مهم', placements: [{ key: 'market_hero', order: 1, priority: 90 }] });
    await post({ title_ar: 'هيرو أول', placements: [{ key: 'market_hero', order: 0, priority: 1 }] });
    assert.deepEqual((await t.pub('market_hero')).body.items.map((i) => i.title.ar), ['هيرو أول', 'هيرو مهم', 'هيرو']); // order, then priority
    assert.equal((await t.pub('market_strip')).body.items.length, 0);

    await post({ title_ar: 'موبايل فقط', placements: [{ key: 'market_strip', devices: ['mobile'] }] });
    assert.equal((await t.pub('market_strip', '&device=desktop')).body.items.length, 0);
    assert.equal((await t.pub('market_strip', '&device=mobile')).body.items.length, 1);

    await post({ title_ar: 'للمحل A', placements: [{ key: 'store_hero' }], targeting: { stores: [A.storeId] } });
    await post({ title_ar: 'لكل المحلات', placements: [{ key: 'store_hero' }] });
    assert.deepEqual((await t.pub('store_hero', `&store=${A.slug}`)).body.items.map((i) => i.title.ar).sort(), ['للمحل A', 'لكل المحلات'].sort());
    assert.deepEqual((await t.pub('store_hero', `&store=${B.slug}`)).body.items.map((i) => i.title.ar), ['لكل المحلات']);
    assert.equal((await t.pub('store_hero')).body.items.length, 0); // a store slot needs a store

    await post({ title_ar: 'سوق فقط', placements: [{ key: 'market_grid' }, { key: 'store_offers' }], targeting: { audience: 'marketplace' } });
    assert.equal((await t.pub('market_grid')).body.items.length, 1);
    assert.equal((await t.pub('store_offers', `&store=${A.slug}`)).body.items.length, 0);
    await post({ title_ar: 'محلات فقط', placements: [{ key: 'market_grid' }, { key: 'store_ticker' }], targeting: { audience: 'store' } });
    assert.equal((await t.pub('market_grid')).body.items.length, 1);
    assert.equal((await t.pub('store_ticker', `&store=${A.slug}`)).body.items.length, 1);

    await post({ title_ar: 'قسم محدد', placements: [{ key: 'search_slot' }], targeting: { categories: [A.catId] } });
    assert.equal((await t.pub('search_slot')).body.items.length, 0);
    assert.equal((await t.pub('search_slot', `&store=${A.slug}&category=c`)).body.items.length, 1);
    assert.equal((await t.pub('search_slot', `&store=${B.slug}&category=c`)).body.items.length, 0);

    assert.equal((await t.pub('nope')).status, 422);
    // a disabled slot entry does not publish
    await post({ title_ar: 'معطّل', placements: [{ key: 'market_grid', enabled: false }, { key: 'market_strip' }] });
    assert.ok(!(await t.pub('market_grid')).body.items.some((i) => i.title.ar === 'معطّل'));
  } finally { t.close(); }
});

test('slot capacity: an over-full slot is refused with a useful message; other time windows are fine', async () => {
  const t = await setup();
  try {
    const hero = (over) => t.call('POST', '/admin/featured/campaigns', t.custom({ publish: true, ends_at: '2030-01-01T00:00', ...over }));
    for (let i = 0; i < 3; i++) assert.equal((await hero({ title_ar: `ه${i}` })).status, 201);
    const full = await hero({ title_ar: 'زيادة' });
    assert.equal(full.status, 409);
    assert.equal(full.body.error.code, 'placement_full');
    assert.match(full.body.error.message, /3/);
    assert.equal(full.body.error.fields.placement, 'market_hero');
    // a draft is always allowed; publishing it later hits the same rule
    const draft = await t.call('POST', '/admin/featured/campaigns', t.custom({ title_ar: 'مسودة' }));
    assert.equal(draft.status, 201);
    assert.equal((await t.call('PUT', `/admin/featured/campaigns/${draft.body.campaign.id}`, { ...t.custom(), status: 'active' })).status, 409);
    // different dates do not overlap, so they fit
    const scheduled = await t.call('POST', '/admin/featured/campaigns', t.custom({ publish: true, title_ar: 'مجدول', starts_at: '2098-01-01T00:00', ends_at: '2098-02-01T00:00' }));
    assert.equal(scheduled.status, 201);
    // the public API never returns more than the slot limit even if data was written around the rules
    assert.ok((await t.pub('market_hero')).body.items.length <= 3);
  } finally { t.close(); }
});

test('offer linking: only live offers of that store, never changes pricing, disappears when the offer is no longer live', async () => {
  const t = await setup();
  try {
    const A = t.mk('a'); const B = t.mk('b');
    const live = await t.offer(A, { name_ar: 'خصم 10%' });
    const draftOffer = await t.offer(A, { name_ar: 'مسودة', status: 'draft' });
    const futureOffer = await t.offer(A, { name_ar: 'مستقبلي', starts_at: '2099-01-01T00:00' });
    const other = await t.offer(B, { name_ar: 'عرض محل تاني' });

    const eligible = await t.call('GET', `/admin/featured/stores/${A.storeId}/offers`);
    assert.equal(eligible.status, 200);
    assert.deepEqual(eligible.body.items.map((o) => o.id), [live]); // draft and future offers are not offered; the engine decides
    assert.ok(eligible.body.items[0].headline.ar.includes('10'));
    assert.equal((await t.call('GET', '/admin/featured/stores/99999/offers')).status, 404);

    const mk = (over) => t.call('POST', '/admin/featured/campaigns', { type: 'offer', store_id: A.storeId, promotion_id: live, publish: true, placements: [{ key: 'market_strip' }, { key: 'store_offers' }], ...over });
    assert.equal((await mk({ promotion_id: other })).body.error.fields.promotion_id, 'offer_unavailable'); // another store's offer
    assert.equal((await mk({ promotion_id: draftOffer })).body.error.fields.promotion_id, 'offer_unavailable');
    assert.equal((await mk({ promotion_id: 424242 })).status, 422);
    assert.equal((await mk({ store_id: null })).body.error.fields.store_id, 'store_required');
    assert.equal((await mk({ promotion_id: null })).body.error.fields.promotion_id, 'offer_required');
    assert.equal((await mk({ promotion_id: futureOffer })).status, 201); // scheduled offers may be planned ahead...
    const camp = await mk({ title_ar: 'عنوان مخصص', badge_ar: 'عرض مميز' });
    assert.equal(camp.status, 201, JSON.stringify(camp.body));

    const strip = (await t.pub('market_strip')).body.items;
    assert.equal(strip.length, 1); // ...but a not-yet-live offer is invisible and the same offer is never shown twice in a slot
    assert.equal(strip[0].title.ar, 'عنوان مخصص');
    assert.equal(strip[0].offer.id, live);
    assert.ok(strip[0].offer.headline.ar.includes('10'));
    assert.equal(strip[0].store.slug, A.slug);
    assert.equal(strip[0].href, `/s/${A.slug}`);
    assert.equal((await t.pub('store_offers', `&store=${A.slug}`)).body.items.length, 1);

    // duplicates of the same offer in one slot collapse to one
    await mk({ title_ar: 'نسخة تانية' });
    assert.equal((await t.pub('market_strip')).body.items.length, 1);

    // pricing is untouched: the storefront promotions API still returns the engine's offer exactly as before
    const promos = await t.call('GET', `/stores/${A.slug}/promotions`);
    assert.deepEqual(promos.body.items.map((o) => o.id), [live]);

    // the offer is paused in the promotion engine -> the campaign vanishes from the public API on its own and is flagged in the admin
    const pause = await t.call('PUT', `/owner/promotions/${live}`, { name_ar: 'خصم 10%', type: 'percentage', status: 'paused', def: { qualify: { all: true }, effect: { kind: 'percent_off', percent: 10 } } }, { token: A.token });
    assert.equal(pause.status, 200, JSON.stringify(pause.body));
    assert.equal((await t.pub('market_strip')).body.items.length, 0);
    const adminList = (await t.call('GET', '/admin/featured/campaigns')).body.items.filter((c) => c.promotionId === live && c.state === 'active');
    assert.ok(adminList.length > 0 && adminList.every((c) => c.health === 'offer_unavailable'));
    // resuming a campaign whose offer is gone is refused
    const id = camp.body.campaign.id;
    await t.call('POST', `/admin/featured/campaigns/${id}/pause`);
    assert.equal((await t.call('POST', `/admin/featured/campaigns/${id}/resume`)).status, 422);
  } finally { t.close(); }
});

test('store targeting: a campaign tied to an inactive or deleted store is never public', async () => {
  const t = await setup();
  try {
    const A = t.mk('a');
    const c = await t.call('POST', '/admin/featured/campaigns', t.custom({ publish: true, store_id: A.storeId, destination_url: '', placements: [{ key: 'market_hero' }] }));
    assert.equal(c.status, 201, JSON.stringify(c.body));
    assert.equal(c.body.campaign.href, `/s/${A.slug}`);
    assert.equal((await t.pub('market_hero')).body.items.length, 1);
    t.q.run("UPDATE stores SET status='suspended' WHERE id=?", [A.storeId]);
    assert.equal((await t.pub('market_hero')).body.items.length, 0);
    assert.equal((await t.call('GET', '/admin/featured/campaigns')).body.items[0].health, 'store_inactive');
    // product / category destinations must belong to the chosen store
    const B = t.mk('b');
    const bad = await t.call('POST', '/admin/featured/campaigns', t.custom({ store_id: B.storeId, product_id: A.productId }));
    assert.equal(bad.body.error.fields.product_id, 'target_invalid');
    const good = await t.call('POST', '/admin/featured/campaigns', t.custom({ store_id: B.storeId, product_id: B.productId, destination_url: '' }));
    assert.match(good.body.campaign.href, new RegExp(`^/s/${B.slug}/p/`));
  } finally { t.close(); }
});

test('analytics: impressions are not double counted, only live campaigns count, CTR and breakdowns add up', async () => {
  const t = await setup();
  try {
    const A = t.mk('a');
    const c = await t.call('POST', '/admin/featured/campaigns', t.custom({ publish: true, store_id: A.storeId, placements: [{ key: 'market_hero' }, { key: 'market_strip' }] }));
    const id = c.body.campaign.id;
    const ev = (kind, placement, ua = 'Mozilla/5.0 test') => fetch(`${t.server.address() && `http://127.0.0.1:${t.server.address().port}/api`}/featured/${id}/${kind}`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': ua }, body: JSON.stringify({ placement }) }).then((r) => r.json().catch(() => ({ counted: false })));
    assert.equal((await ev('impression', 'market_hero')).counted, true);
    assert.equal((await ev('impression', 'market_hero')).counted, false); // same visitor, same slot, same render window
    assert.equal((await ev('impression', 'market_strip')).counted, true); // a different slot is a different impression
    assert.equal((await ev('impression', 'market_hero', 'Other Browser')).counted, true); // a different visitor
    assert.equal((await ev('impression', 'store_hero')).counted, false); // the campaign is not in that slot
    assert.equal((await ev('click', 'market_hero')).counted, true);
    assert.equal((await ev('click', 'market_hero')).counted, false); // double-click throttle
    t.featured._resetSeen();
    assert.equal((await ev('click', 'market_hero')).counted, true);
    assert.equal((await ev('bogus', 'market_hero')).counted, false);

    const a = (await t.call('GET', '/admin/featured/analytics?days=7')).body;
    assert.equal(a.totals.views, 3); assert.equal(a.totals.clicks, 2);
    assert.equal(a.totals.ctr, 66.7);
    assert.equal(a.hours.length, 24);
    assert.equal(a.hours.reduce((n, h) => n + h.views, 0), 3); assert.equal(a.hours.reduce((n, h) => n + h.clicks, 0), 2); // the hourly view adds up to the totals
    assert.equal(a.daily.length, 7);
    assert.equal(a.daily.at(-1).views, 3);
    assert.deepEqual(a.placements.map((p) => [p.key, p.views]).sort(), [['market_hero', 2], ['market_strip', 1]]);
    assert.equal(a.stores[0].key, A.storeId); assert.equal(a.stores[0].views, 3);
    const one = (await t.call('GET', `/admin/featured/campaigns/${id}/analytics`)).body;
    assert.equal(one.totals.views, 3);
    const listed = (await t.call('GET', '/admin/featured/campaigns')).body.items[0];
    assert.deepEqual(listed.stats, { views: 3, clicks: 2, ctr: 66.7 });

    // paused / unknown campaigns never count
    await t.call('POST', `/admin/featured/campaigns/${id}/pause`);
    t.featured._resetSeen();
    assert.equal((await ev('impression', 'market_hero', 'Third')).counted, false);
    assert.equal((await fetch(`http://127.0.0.1:${t.server.address().port}/api/featured/99999/impression`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ placement: 'market_hero' }) }).then((r) => r.json())).counted, false);
    // deleting a campaign removes its numbers
    await t.call('DELETE', `/admin/featured/campaigns/${id}`);
    assert.equal((await t.call('GET', '/admin/featured/analytics')).body.totals.views, 0);
  } finally { t.close(); }
});

test('preview returns the real public shape without saving, and warns about an unavailable offer', async () => {
  const t = await setup();
  try {
    const A = t.mk('a');
    const live = await t.offer(A);
    const before = (await t.call('GET', '/admin/featured/campaigns')).body.items.length;
    const p = await t.call('POST', '/admin/featured/preview', { type: 'offer', store_id: A.storeId, promotion_id: live, placements: [{ key: 'market_strip' }], badge_ar: 'مميز' });
    assert.equal(p.status, 200, JSON.stringify(p.body));
    assert.equal(p.body.campaign.offer.id, live); assert.equal(p.body.campaign.badge.ar, 'مميز'); assert.deepEqual(p.body.warnings, []);
    const c = await t.call('POST', '/admin/featured/preview', t.custom({ desktop_image: '' }));
    assert.deepEqual(c.body.warnings, ['no_image']);
    assert.equal((await t.call('POST', '/admin/featured/preview', t.custom({ destination_url: 'javascript:1' }))).status, 422);
    assert.equal((await t.call('GET', '/admin/featured/campaigns')).body.items.length, before); // nothing was stored
  } finally { t.close(); }
});
