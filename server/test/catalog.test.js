import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';

const ADMIN_KEY = 'test-admin-key-0123456789';
let migrated = false;
let pn = 0;
const prod = (t, over) => t.insert('products', { store_id: t.storeId, slug: `p-${++pn}-${randomUUID().slice(0, 4)}`, name_en: 'P', name_ar: 'منتج', price: 10, status: 'active', ...over });

/** Fresh DB in the OLD state (default departments), then optionally the approved catalog migration. */
async function setup({ migrate = true } = {}) {
  process.env.DB_FILE = path.join(os.tmpdir(), `souqna-catalog-${randomUUID()}.db`);
  process.env.JWT_SECRET = `catalog-${randomUUID()}`;
  process.env.ADMIN_KEY = ADMIN_KEY;
  const { default: publicRoutes } = await import('../src/routes/public.js');
  const { default: ownerRoutes } = await import('../src/routes/owner.js');
  const { default: adminRoutes } = await import('../src/routes/admin.js');
  const { errorHandler } = await import('../src/lib/errors.js');
  const { signToken } = await import('../src/lib/auth.js');
  const { insert, q, db } = await import('../src/db/index.js');
  const mig = await import('../src/lib/catalog-migration.js');
  if (migrate && !migrated) { mig.apply(db, { approved: true }); migrated = true; }
  const app = express();
  app.use(express.json());
  app.use('/api', publicRoutes); app.use('/api/owner', ownerRoutes); app.use('/api/admin', adminRoutes); app.use(errorHandler);
  const server = createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, url, body, token, headers = {}) => { const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch { /* none */ } return { status: r.status, body: j }; };
  const admin = (method, url, body) => call(method, `/admin${url}`, body, null, { 'x-admin-key': ADMIN_KEY });
  const userId = insert('users', { name: 'Owner', email: `${randomUUID()}@e.test`, password_hash: 'x' });
  const storeId = insert('stores', { owner_id: userId, slug: `cat-${randomUUID().slice(0, 6)}`, code: 'CT1', name_ar: 'م', name_en: 'S', shipping_fee: 0, status: 'active', departments: ',hijabs_chiffon,hijabs_cotton,', category: 'mixed' });
  return { server, call, admin, q, db, insert, mig, storeId, slug: q.get('SELECT slug FROM stores WHERE id=?', [storeId]).slug, token: signToken({ id: userId }) };
}

test('migration refuses to run without explicit approval and changes nothing', async () => {
  const t = await setup({ migrate: false });
  try {
    const before = t.q.val('SELECT COUNT(*) FROM departments');
    assert.throws(() => t.mig.apply(t.db, {}), /approv/i);
    assert.throws(() => t.mig.apply(t.db, { approved: 'yes' }), /approv/i);
    assert.equal(t.q.val('SELECT COUNT(*) FROM departments'), before);
  } finally { t.server.close(); }
});

test('migration keeps ids/products/stores, moves old sections into the new tree, and is idempotent', async () => {
  const t = await setup({ migrate: false });
  try {
    const { db } = t;
    const mk = (slug) => t.q.get('SELECT * FROM departments WHERE slug=?', [slug]);
    const abayaBefore = mk('women_abaya'); const bagsBefore = mk('women_bags');
    const p1 = prod(t, { name_ar: 'عباية', price: 10, department: 'women_abaya', status: 'active' });
    const p2 = prod(t, { name_ar: 'شنطة', price: 10, department: 'women_bags', status: 'active' });
    // an owner-created section waiting for approval (old flow)
    const pslug = `c${t.storeId}_abc`;
    t.insert('departments', { slug: pslug, name_ar: 'قسم المحل', name_en: 'Shop section', sizes_json: '[]', sort: 99, active: 0, parent_slug: 'women' });
    t.insert('categories', { store_id: t.storeId, slug: pslug.replace(/_/g, '-'), name_ar: 'قسم المحل', name_en: 'Shop section', sort: 1 });
    const pp = prod(t, { department: pslug, status: 'active' });
    const snap = t.mig.snapshot(db);
    t.mig.apply(db, { approved: true });
    assert.equal(mk('women_abaya').id, abayaBefore.id, 'department id preserved');
    assert.equal(mk('women_bags').id, bagsBefore.id);
    assert.equal(mk('women_abaya').parent_slug, 'modest');
    assert.equal(mk('women_bags').parent_slug, 'accessories');
    assert.equal(t.q.get('SELECT department FROM products WHERE id=?', [p1]).department, 'women_abaya', 'products are never moved');
    assert.equal(t.q.get('SELECT store_id FROM products WHERE id=?', [p2]).store_id, t.storeId);
    assert.equal(t.q.val('SELECT COUNT(*) FROM products WHERE department IS NULL'), 0);
    // re-running changes nothing
    t.mig.apply(db, { approved: true });
    assert.equal(t.q.val('SELECT COUNT(*) FROM departments'), t.q.val('SELECT COUNT(DISTINCT slug) FROM departments'));
    // no cycles, no orphans
    const rows = t.q.all('SELECT slug, parent_slug FROM departments'); const by = new Map(rows.map((r) => [r.slug, r.parent_slug]));
    for (const [s, p] of by) { if (p) assert.ok(by.has(p), `${s} has missing parent ${p}`); let c = s, i = 0; while (c && i++ < 20) c = by.get(c); assert.ok(i < 20, `cycle at ${s}`); }
    // the pending section became a request; approving it activates that same department, so its product stays linked
    const reqRow = t.q.get('SELECT * FROM category_requests WHERE department_slug=?', [pslug]);
    assert.ok(reqRow && reqRow.status === 'pending');
    const ap = await t.admin('POST', `/category-requests/${reqRow.id}/approve`, {});
    assert.equal(ap.status, 200, JSON.stringify(ap.body));
    assert.equal(ap.body.department, pslug);
    assert.equal(t.q.get('SELECT active FROM departments WHERE slug=?', [pslug]).active, 1);
    assert.equal(t.q.get('SELECT department FROM products WHERE id=?', [pp]).department, pslug);
    assert.equal(t.q.val("SELECT COUNT(*) FROM departments WHERE name_ar='قسم المحل'"), 1, 'no duplicate section created');
    migrated = true;
  } finally { t.server.close(); }
});

test('migration rolls back completely when verification fails', async () => {
  const t = await setup({ migrate: false });
  try {
    const { db } = t;
    prod(t, { name_ar: 'ثابت', price: 10, department: 'women_abaya', status: 'active' });
    t.q.run("UPDATE departments SET parent_slug=NULL, sort=999 WHERE slug='women_abaya'"); // a state the migration would change
    const prodBefore = t.q.val('SELECT COUNT(*) FROM products');
    db.exec("CREATE TRIGGER sabotage AFTER UPDATE ON departments BEGIN DELETE FROM products WHERE id=(SELECT MIN(id) FROM products); END");
    assert.throws(() => t.mig.apply(db, { approved: true }), (e) => e instanceof t.mig.VerifyError || /verif/i.test(e.message));
    db.exec('DROP TRIGGER sabotage');
    assert.deepEqual(t.q.all('SELECT slug, parent_slug FROM departments ORDER BY id').filter((r) => r.slug === 'women_abaya'), [{ slug: 'women_abaya', parent_slug: null }], 'the move was rolled back');
    assert.equal(t.q.val('SELECT COUNT(*) FROM products'), prodBefore, 'no product lost');
    t.mig.apply(db, { approved: true }); // the real run afterwards still works and puts it right
    assert.equal(t.q.get("SELECT parent_slug FROM departments WHERE slug='women_abaya'").parent_slug, 'modest');
  } finally { t.server.close(); }
});

test('profiles and attribute definitions are inherited down the tree', async () => {
  const t = await setup();
  try {
    const { listDepartments, deptProfile, deptAttrDefs } = await import('../src/lib/departments.js');
    const by = new Map(listDepartments({ all: true }).map((d) => [d.slug, d]));
    for (const s of ['modest', 'beauty', 'accessories', 'sportswear', 'perfumes', 'hijabs_turkish', 'modest_open_abayas', 'shoes_boots', 'perfume_unisex']) assert.ok(by.get(s), `missing ${s}`);
    assert.equal(deptProfile('modest_open_abayas'), 'modest');
    assert.equal(deptProfile('hijabs_turkish'), 'hijab');
    assert.equal(deptProfile('shoes_boots'), 'shoes');
    assert.ok(deptAttrDefs('hijabs_cotton').some((a) => a.key === 'fabric'));
    // an own definition replaces the inherited one for that branch; active=0 switches an inherited one off
    t.q.run("INSERT INTO category_attributes (department_slug,key,type,label_ar,label_en,options_json) VALUES ('hijabs_cotton','weave','select','نسيج','Weave','[{\"v\":\"plain\",\"ar\":\"سادة\",\"en\":\"Plain\"}]')");
    t.q.run("INSERT INTO category_attributes (department_slug,key,type,label_ar,label_en,options_json,active) VALUES ('hijabs_cotton','style','select','س','s','[]',0)");
    const keys = deptAttrDefs('hijabs_cotton').map((a) => a.key);
    assert.ok(keys.includes('weave')); assert.ok(!keys.includes('style'));
    assert.ok(deptAttrDefs('hijabs_chiffon').some((a) => a.key === 'style'), 'sibling branch unaffected');
  } finally { t.server.close(); }
});

test('product attributes are validated per department and drive storefront filters + facet counts', async () => {
  const t = await setup();
  try {
    const mk = (n, department, attrs) => t.call('POST', '/owner/products', { name_ar: `منتج ${n}`, price: 100 + n, department, attrs, media: [], variants: [], stock: 5 }, t.token);
    const a = await mk(1, 'hijabs_chiffon', { fabric: 'chiffon', style: 'scarf', hacker: 'x' });
    assert.equal(a.status, 201, JSON.stringify(a.body));
    const b = await mk(2, 'hijabs_cotton', { fabric: 'cotton' });
    const c = await mk(3, 'hijabs_cotton', { fabric: 'not-an-option' });
    assert.equal(b.status, 201); assert.equal(c.status, 201);
    const id = (x) => x.body.product?.id || x.body.id;
    assert.deepEqual(JSON.parse(t.q.get('SELECT attrs_json FROM products WHERE id=?', [id(a)]).attrs_json), { fabric: 'chiffon', style: 'scarf' });
    assert.equal(t.q.get('SELECT attrs_json FROM products WHERE id=?', [id(c)]).attrs_json, null);
    const all = await t.call('GET', '/search?department=women_hijab');
    assert.equal(all.body.total, 3);
    const fab = all.body.facets.attrs.find((f) => f.key === 'fabric');
    assert.deepEqual(Object.fromEntries(fab.options.map((o) => [o.v, o.n])), { chiffon: 1, cotton: 1 });
    assert.equal((await t.call('GET', '/search?department=women_hijab&a_fabric=cotton')).body.total, 1);
    assert.equal((await t.call('GET', '/search?department=women_hijab&a_fabric=cotton,chiffon')).body.total, 2);
    assert.equal((await t.call('GET', '/search?department=women_hijab&a_fabric=nope')).body.total, 3);
    const inj = await t.call('GET', "/search?department=women_hijab&a_fabric=cotton'));DROP TABLE products;--");
    assert.equal(inj.status, 200);
    assert.equal((await t.call('GET', '/search?department=women_hijab')).body.total, 3);
  } finally { t.server.close(); }
});

test('admin category API: no duplicates, no cycles, safe delete, attributes, reorder', async () => {
  const t = await setup();
  try {
    const dept = (slug) => t.q.get('SELECT * FROM departments WHERE slug=?', [slug]);
    const dup = await t.admin('POST', '/departments', { name_ar: dept('modest').name_ar, name_en: 'Anything', parent: null });
    assert.equal(dup.status, 422, 'same Arabic name at the same level is refused');
    const ok = await t.admin('POST', '/departments', { name_ar: 'نقاب', name_en: 'Niqab', parent: 'modest', attrs: [{ key: 'fabric2', ar: 'خامة', type: 'select', options: [{ v: 'cot', ar: 'قطن' }] }, { key: 'bad key', ar: 'x', type: 'select', options: [] }] });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    const created = dept('niqab');
    assert.ok(created); assert.equal(created.parent_slug, 'modest');
    assert.equal(t.q.val("SELECT COUNT(*) FROM category_attributes WHERE department_slug='niqab'"), 1, 'invalid attribute dropped');
    // cycle: modest cannot move under its own descendant
    const cyc = await t.admin('PATCH', `/departments/${dept('modest').id}`, { parent: 'niqab' });
    assert.equal(cyc.status, 422);
    assert.equal(dept('modest').parent_slug, null);
    // depth: a 4th level is refused
    const deep = await t.admin('POST', '/departments', { name_ar: 'مستوى رابع', name_en: 'Level four', parent: 'modest_open_abayas' });
    assert.equal(deep.status, 422);
    // safe delete with products
    prod(t, { name_ar: 'ن', price: 5, department: 'niqab', status: 'active' });
    const refuse = await t.admin('DELETE', `/departments/${created.id}`);
    assert.equal(refuse.status, 409);
    assert.ok(dept('niqab'), 'still there');
    const move = await t.admin('DELETE', `/departments/${created.id}?reassign_to=modest_open_abayas`);
    assert.equal(move.status, 200, JSON.stringify(move.body));
    assert.equal(dept('niqab'), undefined);
    assert.equal(t.q.val("SELECT COUNT(*) FROM products WHERE department='modest_open_abayas'"), 1, 'product reassigned, not lost');
    // parent with children cannot be deleted
    assert.equal((await t.admin('DELETE', `/departments/${dept('modest').id}`)).status, 409);
    // reorder
    const ids = [dept('women').id, dept('men').id];
    await t.admin('POST', '/departments/reorder', { order: [ids[1], ids[0]] });
    assert.ok(dept('men').sort < dept('women').sort);
  } finally { t.server.close(); }
});

test('merchant section picker, usage tracking and the request → approve / reject workflow', async () => {
  const t = await setup();
  try {
    const pick = await t.call('GET', '/owner/category-picker?name=' + encodeURIComponent('عباية كريب'), null, t.token);
    assert.equal(pick.status, 200);
    assert.ok(pick.body.suggestions.length && pick.body.suggestions.every((s) => s.confirm === true), 'suggestions always need confirmation');
    assert.ok(pick.body.suggestions[0].breadcrumb.length >= 2);
    await t.call('POST', '/owner/category-usage', { department: 'hijabs_cotton' }, t.token);
    await t.call('POST', '/owner/category-usage', { department: 'hijabs_cotton' }, t.token);
    const again = await t.call('GET', '/owner/category-picker', null, t.token);
    assert.equal(again.body.frequent[0].slug, 'hijabs_cotton');
    // a section that already exists is not requested again
    const exist = await t.call('POST', '/owner/category-requests', { name_ar: t.q.get("SELECT name_ar FROM departments WHERE slug='beauty'").name_ar }, t.token);
    assert.equal(exist.status, 409);
    const r1 = await t.call('POST', '/owner/category-requests', { name_ar: 'قسم جديد تماما', name_en: 'Brand new', parent: 'modest' }, t.token);
    assert.equal(r1.status, 201, JSON.stringify(r1.body));
    assert.equal((await t.call('POST', '/owner/category-requests', { name_ar: 'قسم جديد تماما', parent: 'modest' }, t.token)).status, 400, 'same pending request twice');
    const rid = r1.body.request.id;
    const ap = await t.admin('POST', `/category-requests/${rid}/approve`, {});
    assert.equal(ap.status, 200, JSON.stringify(ap.body));
    const d = t.q.get('SELECT * FROM departments WHERE slug=?', [ap.body.department]);
    assert.equal(d.active, 1); assert.equal(d.parent_slug, 'modest');
    assert.equal(t.q.get('SELECT status FROM category_requests WHERE id=?', [rid]).status, 'approved');
    assert.equal((await t.admin('POST', `/category-requests/${rid}/approve`, {})).status, 404, 'cannot decide twice');
    const r2 = await t.call('POST', '/owner/category-requests', { name_ar: 'قسم مرفوض', parent: 'beauty' }, t.token);
    const rej = await t.admin('POST', `/category-requests/${r2.body.request.id}/reject`, {});
    assert.equal(rej.status, 422, 'a reason is required');
    assert.equal((await t.admin('POST', `/category-requests/${r2.body.request.id}/reject`, { reason: 'موجود تحت قسم آخر' })).status, 200);
    const mine = await t.call('GET', '/owner/category-requests', null, t.token);
    assert.deepEqual(mine.body.requests.map((x) => x.status).sort(), ['approved', 'rejected']);
    // a product can now use an active leaf section the store did not list; unknown / parent sections stay invalid
    const okp = await t.call('POST', '/owner/products', { name_ar: 'عباية', price: 50, department: 'modest_open_abayas', media: [], variants: [], stock: 1 }, t.token);
    assert.equal(okp.status, 201, JSON.stringify(okp.body));
    assert.equal((await t.call('POST', '/owner/products', { name_ar: 'x1', price: 50, department: 'modest', media: [], variants: [], stock: 1 }, t.token)).status, 400);
    assert.equal((await t.call('POST', '/owner/products', { name_ar: 'x2', price: 50, department: 'nope_nope', media: [], variants: [], stock: 1 }, t.token)).status, 400);
  } finally { t.server.close(); }
});
