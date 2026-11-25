// Baby/newborn inference must not grab adult products or full kids size runs (startup migration safety).
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

process.env.DB_FILE = path.join(os.tmpdir(), `souqna-infer-${randomUUID()}.db`);
process.env.JWT_SECRET = `in-${randomUUID()}-min32charslong-xxxxxxxx`; process.env.NODE_ENV = 'test';
const { inferDepartment } = await import('../src/lib/departments.js');
const allowed = ['kids', 'kids_boys', 'kids_girls', 'kids_baby', 'kids_newborn', 'women', 'men', 'women_dresses', 'men_pants', 'men_tops'];

test('clear baby / newborn evidence is classified', () => {
  assert.equal(inferDepartment('بدي ولادي سن سنتين 2Y', allowed), 'kids_baby');
  assert.equal(inferDepartment('سلوبيت 6-9M', allowed), 'kids_baby');
  assert.equal(inferDepartment('بدي مواليد 0-3M', allowed), 'kids_newborn');
});
test('a size run that reaches older kids is not a baby product', () => {
  assert.notEqual(inferDepartment('جاكيت اولادي 0-3M 3-6M 1Y 2Y 4Y 8Y 14Y', allowed), 'kids_newborn');
  assert.notEqual(inferDepartment('تيشيرت كيدز 1Y 2Y 3Y 4Y 5Y 6Y 7Y 8Y', allowed), 'kids_baby');
});
test('adult products are never pulled into baby by wording', () => {
  assert.equal(inferDepartment('فستان حريمي baby blue S M L', allowed), 'women_dresses');
  assert.equal(inferDepartment('قميص رجالي مع baby hand L XL', allowed), 'men_tops');
  assert.equal(inferDepartment('جيبة حريمي ضمان 24 شهر M L', allowed), 'women_dresses');
});
