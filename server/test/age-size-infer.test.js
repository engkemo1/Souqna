// Kids' size written only in the description («مقاس 0/3 شهور») must reach the variants so the size filter finds the product.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

process.env.DB_FILE = path.join(os.tmpdir(), `souqna-agesize-${randomUUID()}.db`);
process.env.JWT_SECRET = `as-${randomUUID()}-min32charslong-xxxxxxxx`;
process.env.ADMIN_KEY = 'test-admin-key-0123456789'; process.env.NODE_ENV = 'test';
const { ageSizeFromText } = await import('../src/lib/age-size.js');
const { parseChildSizes } = await import('../src/lib/moda/childfit.js');
const { canonSize } = await import('../src/lib/size-normalize.js');

test('«0/3 شهور» and «3/6 شهور» are RANGES, not a single month', () => {
  const r = parseChildSizes('مقاس 0/3شهر', { source: 'description' }); assert.deepEqual([r[0].minAgeMonths, r[0].maxAgeMonths], [0, 3]);
  const s = parseChildSizes('مقاس 3/6 شهور', { source: 'description' }); assert.deepEqual([s[0].minAgeMonths, s[0].maxAgeMonths], [3, 6]);
  const t = parseChildSizes('من 6:9 شهور', { source: 'description' }); assert.deepEqual([t[0].minAgeMonths, t[0].maxAgeMonths], [6, 9]);
});

test('one clear age range in the text becomes a canonical size label the filter understands', () => {
  for (const [text, want] of [['خامه قطيفه متبطن مقاس 0/3شهر', '0-3 شهور'], ['بناتي قطيفه مقاس 0/3شهور', '0-3 شهور'], ['سلوبيت مقاس 3/6 شهور', '3-6 شهور'], ['مقاس ٦/٩ شهور', '6-9 شهور'], ['0-3 months', '0-3 شهور'], ['مقاس من 2-4 سنين', '2-4 سنين']]) {
    const label = ageSizeFromText(text); assert.equal(label, want, text);
    assert.ok(canonSize(label, { kid: true }).months, `${label} must parse back to an age range`);
  }
  assert.deepEqual(canonSize('0-3 شهور', { kid: true }).months, [0, 3]);
});

test('anything unclear is left alone (no guess): two ranges, no age, adult text', () => {
  assert.equal(ageSizeFromText('مقاس 0/3 شهور و 3/6 شهور'), null);
  assert.equal(ageSizeFromText('قميص قطن مريح'), null);
  assert.equal(ageSizeFromText(''), null);
  assert.equal(ageSizeFromText('مقاس L و XL'), null);
});

test('every common way of writing an age range is understood', () => {
  const same = ['0/3شهر', '0-3 شهور', '٠:٣ شهور', '0_3 months', '0\\3 شهر', '0 ل 3 شهور', 'من 0 الى 3 شهور', '0 لحد 3 شهور', '0 to 3 m', '0m-3m', '0M-3M', '0 شهر - 3 شهور', 'شهور 0-3', 'حتى 3 شهور', 'up to 3 months', '0→3 شهور', '0 3 شهور', '0،3 شهور', '0–3 شهور'];
  for (const t of same) assert.equal(ageSizeFromText(t), '0-3 شهور', t);
  assert.equal(ageSizeFromText('مقاس 3 6 شهور'), '3-6 شهور');
  assert.equal(ageSizeFromText('من 2 ل 4 سنه'), '2-4 سنين');
  assert.equal(ageSizeFromText('6 شهور الى 2 سنه'), null);
});

test('«نيو بورن» with no explicit age means the newborn size; an explicit age still wins; nothing else is guessed', async () => {
  const { ageSizeFromText } = await import('../src/lib/age-size.js');
  assert.equal(ageSizeFromText('سلوبيت بيبى نيو بورن'), '0-3 شهور');
  assert.equal(ageSizeFromText('سلوبيت نيوبورن'), '0-3 شهور');
  assert.equal(ageSizeFromText('سلوبيت نيو بورن مقاس 3-6 شهور'), '3-6 شهور');
  assert.equal(ageSizeFromText('جاكت بامب'), null);
  assert.equal(ageSizeFromText('سلوبيت بيبى'), null);
});

test('Egyptian notations: reversed «٦/٥ سنه», «3/0 شهر», words «سنه لسنه ونصف» / «سنتين لخمس سنين» / «من سنه ل ٣» / «مقاس سنه»', async () => {
  const { ageSizeFromText: f } = await import('../src/lib/age-size.js');
  assert.equal(f('مقاس 3/0شهر'), '0-3 شهور');
  assert.equal(f('مقاس ٦/٣ شهر'), '3-6 شهور');
  assert.equal(f('مقاس 6/5سنه'), '5-6 سنين');
  assert.equal(f('مقاس ٣/٢ سنه'), '2-3 سنين');
  assert.equal(f('مقاس سنه لسنه ونصف'), '12-18 شهور');
  assert.equal(f('من سن سنتين لخمس سنين'), '2-5 سنين');
  assert.equal(f('مقاسات من سنه ل ٣'), '1-3 سنين');
  assert.equal(f('مقاس سنه وخامه قطيفه'), 'سنة');
  assert.equal(f('عمر ٢ سنه'), 'سنتين');
  assert.equal(f('مقاس شهور لحد سنه'), '0-12 شهور');
  assert.equal(f('سوت أولادي ميلتون شيك'), null);
});
