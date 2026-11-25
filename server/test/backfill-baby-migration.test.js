// The startup migration on a database copy: what it moves and what it leaves alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

process.env.DB_FILE = path.join(os.tmpdir(), `souqna-bfm-${randomUUID()}.db`);
process.env.JWT_SECRET = `bf-${randomUUID()}-min32charslong-xxxxxxxx`; process.env.NODE_ENV = 'test';
const { insert, q } = await import('../src/db/index.js');
const { backfillDepartments } = await import('../src/lib/departments.js');

const ownerId = insert('users', { name: 'O', email: 'o@bf.test', password_hash: 'x' });
const storeId = insert('stores', { owner_id: ownerId, slug: 'bf-store', code: 'BF1', name_ar: 'م', name_en: 'S', shipping_fee: 0, status: 'active', phone: '01011112222', whatsapp: '01011112222', departments: ',kids,kids_boys,kids_girls,kids_baby,kids_newborn,women,' });
const P = {};
const add = (key, name, dept, sizes) => { const id = insert('products', { store_id: storeId, slug: `bf-${key}`, name_en: key, name_ar: name, price: 300, status: 'active', track_stock: 1, stock: 9, department: dept }); for (const size of sizes) insert('variants', { product_id: id, size, color: '#112233', stock: 5, sku: `B-${randomUUID().slice(0, 6)}` }); P[key] = id; };
add('newbornWide', 'جاكيت اولادي', 'kids_newborn', ['0-3M', '3-6M', '1Y', '4Y', '8Y', '14Y']); // old newborn filing, sizes reach 14Y
add('babyOld', 'تيشيرت ولادي', 'kids_baby', ['10Y', '12Y']);                                    // filed under baby but 10-12 years
add('babyOk', 'سلوبيت', 'kids_baby', ['1Y', '2Y']);                                             // correct, stays
add('newbornOk', 'بدي مواليد', 'kids_newborn', ['0-3M']);                                       // correct, stays
add('boysBaby', 'بدي ولادي', 'kids_boys', ['1Y']);                                              // moves to baby
add('womenBlue', 'فستان حريمي baby blue', 'women', ['S', 'M']);                                 // untouched
add('babyNoInfo', 'تيشيرت قطن', 'kids_baby', []);                                               // no age evidence: untouched
const dep = (k) => q.get('SELECT department FROM products WHERE id=?', [P[k]]).department;

test('dry run reports moves and changes nothing', () => {
  const report = []; const n = backfillDepartments({ dryRun: true, report });
  assert.equal(dep('newbornWide'), 'kids_newborn'); assert.equal(dep('boysBaby'), 'kids_boys');
  const by = Object.fromEntries(report.map((r) => [r.id, r]));
  assert.equal(by[P.newbornWide]?.to, 'kids'); assert.equal(by[P.babyOld]?.to, 'kids'); assert.equal(by[P.boysBaby]?.to, 'kids_baby');
  for (const k of ['babyOk', 'newbornOk', 'womenBlue', 'babyNoInfo']) assert.ok(!by[P[k]], `${k} must be left alone`);
  assert.equal(n, 3);
});
test('real run moves old wide-size products out of baby/newborn and leaves the rest', () => {
  backfillDepartments();
  assert.equal(dep('newbornWide'), 'kids'); assert.equal(dep('babyOld'), 'kids'); assert.equal(dep('boysBaby'), 'kids_baby');
  assert.equal(dep('babyOk'), 'kids_baby'); assert.equal(dep('newbornOk'), 'kids_newborn');
  assert.equal(dep('womenBlue'), 'women'); assert.equal(dep('babyNoInfo'), 'kids_baby');
});
test('running it twice changes nothing more', () => { assert.equal(backfillDepartments(), 0); });
