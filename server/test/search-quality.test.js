import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';

// Real product names (from the live shop) are the fixture: "name|department" per line.
const CORPUS = fs.readFileSync(new URL('./search-corpus.txt', import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => l.split('|'));

test('search text helpers: normalisation, synonym groups, typo repair', async () => {
  const { norm, buildQuery, editDistance, vocabFrom, suggestCorrection } = await import('../src/lib/search-text.js');
  assert.equal(norm('الجَاكِيت  أحمر - ٣'), 'الجاكيت احمر 3');
  assert.equal(norm('جاكيت!!! "بناتي"، (جديد)'), 'جاكيت بناتي جديد');
  assert.equal(norm('طرحة / حجاب'), 'طرحه حجاب');
  assert.equal(editDistance('لانجري', 'لانجيري'), 1);
  assert.equal(editDistance('فستن', 'فستان'), 1);
  const alts = (t, vocab) => buildQuery(t, { vocab }).tokens.map((x) => x.alts.map((a) => a.text));
  // the same product written in different ways ends up in the same group
  const flat = (t) => new Set(alts(t).flat());
  for (const w of ['تيشرت', 'تيشيرت', 'تي شيرت', 'tshirt']) assert.ok(flat(w).has('تيشرت') && flat(w).has('تيشيرت'), w);
  for (const w of ['حديثي الولادة', 'حديث الولادة', 'رضع', 'رضيع', 'مواليد', 'بيبي', 'مولود جديد']) assert.ok(flat(w).has('بيبي') && flat(w).has('ولاده'), w);
  // "حديثي الولادة" is ONE idea, not two words that must both appear
  assert.equal(buildQuery('حديثي الولادة').tokens.length, 1);
  // filler words are ignored, and only-filler is reported
  assert.equal(buildQuery('ملابس جاكيت').tokens.length, 1);
  assert.equal(buildQuery('ملابس').onlyFiller, true);
  assert.equal(buildQuery('').tokens.length, 0);
  // "did you mean": only words the shop does not know get corrected, to the closest real word
  const vc = vocabFrom(['فستان سهرة', 'بنطلون جينز', 'كوتشي رجالي']);
  assert.equal(suggestCorrection('فستن سهره', vc), 'فستان سهره');
  assert.equal(suggestCorrection('بنطلوون', vc), 'بنطلون');
  assert.equal(suggestCorrection('فستان', vc), null, 'known words are left alone');
  assert.equal(suggestCorrection('xyzqwk', vc), null, 'nothing close → no suggestion');
  assert.equal(suggestCorrection('', vc), null);
  // articles and plurals
  assert.ok(flat('الجاكيتات').has('جاكيت'));
  // short words must match as a whole word
  const kab = buildQuery('كاب').tokens[0].alts.find((a) => a.text === 'كاب');
  assert.equal(kab.exact, true);
  // typo repair only uses words that really exist in the shop
  const vocab = vocabFrom(['فستان سهرة', 'بنطلون جينز', 'كوتشي']);
  assert.ok(flat('بنطلن').size > 0);
  assert.ok(alts('بنطلن', vocab)[0].includes('بنطلون'));
  assert.ok(!alts('بنطلن', vocab)[0].includes('xyz'));
});

test('marketplace search finds what customers mean: newborn words, spellings, typos, colours, audience; and never goes empty-and-silly', async () => {
  process.env.DB_FILE = path.join(os.tmpdir(), `souqna-sq-${randomUUID()}.db`);
  process.env.JWT_SECRET = `search-quality-${randomUUID()}`;
  const { default: routes } = await import('../src/routes/public.js');
  const { errorHandler } = await import('../src/lib/errors.js');
  const { insert } = await import('../src/db/index.js');
  const user = insert('users', { name: 'Search', email: `${randomUUID()}@example.test`, password_hash: 'x' });
  const store = insert('stores', { owner_id: user, slug: `sq-${randomUUID().slice(0, 6)}`, code: 'SQ', name_ar: 'محل التجربة', name_en: 'Test Shop' });
  const otherSlug = `sq2-${randomUUID().slice(0, 6)}`;
  const other = insert('stores', { owner_id: user, slug: otherSlug, code: 'S2', name_ar: 'محل تاني', name_en: 'Other Shop' });
  for (const [name, dept] of CORPUS) insert('products', { store_id: store, slug: `p-${randomUUID().slice(0, 8)}`, name_ar: name, name_en: name, price: 100, status: 'active', department: dept || null });
  insert('products', { store_id: other, slug: `p-${randomUUID().slice(0, 8)}`, name_ar: 'جاكيت الاخر', name_en: 'Other jacket', price: 90, status: 'active', department: null });
  insert('products', { store_id: other, slug: `p-${randomUUID().slice(0, 8)}`, name_ar: 'قميص مخفي', name_en: 'Draft shirt', price: 90, status: 'draft', department: null });

  const app = express(); app.use(express.json()); app.use('/api', routes); app.use(errorHandler);
  const server = createServer(app); await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const search = async (t, extra = '') => (await fetch(`${base}/search?q=${encodeURIComponent(t)}${extra}`)).json();
  const names = (r) => r.items.map((i) => i.name.ar);
  const set = async (t) => new Set(names(await search(t)));
  const same = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  try {
    // 1. newborn words all return the baby products (and not the unrelated "جاكت اطفال")
    const baby = await set('حديثي الولادة');
    for (const n of ['سلوبيت بيبى ولد', 'سلوبيت بيبى برتو', 'بيجامه الولاده', 'سوت بيبي اولادي', 'سوت بيبي بناتي', 'سلوبيت اطفالى']) assert.ok(baby.has(n), `baby: ${n}`);
    assert.ok(!baby.has('جاكت اطفال'));
    for (const w of ['حديث الولادة', 'حديثي الولاده', 'رضع', 'رضيع', 'مواليد', 'بيبي', 'مولود جديد', 'ملابس بيبي', 'newborn', 'baby']) assert.ok(same(await set(w), baby), `same as newborn: ${w}`);
    // 2. spelling variants are one search
    const tee = await set('تيشرت');
    assert.ok(tee.has('تيشيرت اولادي') && tee.has('تيشرت نص سوسته شتوى'));
    for (const w of ['تيشيرت', 'تي شيرت', 'tshirt', 'التيشيرتات']) assert.ok(same(await set(w), tee), `tshirt: ${w}`);
    const jacket = await set('جاكيت');
    assert.ok(jacket.has('جاكت جينز') && jacket.has('جاكيت كت'));
    for (const w of ['جاكت', 'الجاكيتات', 'jacket']) assert.ok(same(await set(w), jacket), `jacket: ${w}`);
    const pj = await set('بيجاما');
    assert.ok(pj.has('بيجامه ستان') && pj.has('Pijama') && pj.has('لبس نوم'));
    for (const w of ['بيجامه', 'بجامة', 'pajama', 'قميص نوم']) assert.ok(same(await set(w), pj), `pajama: ${w}`);
    assert.ok(same(await set('لانجري'), await set('لانجيري')));
    assert.ok((await set('لانجري')).has('لانجيري ستان'));
    assert.ok(same(await set('كوتشي'), await set('كوتش')) && same(await set('كوتشى'), await set('حذاء')));
    for (const w of ['جاكيت!!!', '"جاكيت"', 'جاكيت؟', 'الـجاكيت', 'جـاكـيت']) assert.ok(same(await set(w), jacket), `punctuation/tatweel: ${w}`);
    assert.equal((await (await fetch(`${base}/search?q=${encodeURIComponent('جاكيت')}`)).json()).didYouMean, undefined);
    { // "most searched" shown under an empty search box: only words that are popular AND still find products; junk is left out
      const { q: dbq } = await import('../src/db/index.js');
      const day = new Date().toISOString().slice(0, 10);
      for (const [t, n, m] of [['جاكيت', 9, 0], ['فستان', 5, 1], ['xyzqwk', 20, 20], ['هودي', 2, 0], ['جاكيت 01012345678', 9, 0]]) dbq.run('INSERT OR REPLACE INTO search_terms (day, term, searches, misses) VALUES (?, ?, ?, ?)', [day, t, n, m]);
      const pop = await (await fetch(`${base}/search/popular`)).json();
      assert.deepEqual(pop.items, ['جاكيت', 'فستان'], 'popular + still finds products; no misses, no rare words, no phone numbers');
    }
    // 3. typos
    assert.ok((await set('فستن')).has('فستان زفاف'));
    assert.ok((await set('بنطلن')).has('بنطلون جينز مستورد'));
    assert.ok((await set('هوودي')).has('هودي دبل سوسته'));
    // 4. a word only matches at the start of a word, and short words as a whole word
    assert.ok(!(await set('كاب')).has('بيجامه ستان كابلز'));
    assert.ok(!(await set('ولاد')).has('بيجامه الولاده'), '"ولاد" (boys) is not "ولادة" (birth)');
    assert.ok((await set('ولاد')).has('جاكت اولادى'));
    assert.ok((await set('الطرحه')).has('طرحه كويتي'));
    // 5. type + audience: AND first; if nothing, the describing word is dropped instead of showing unrelated stuff
    const both = await search('جاكيت بناتي');
    assert.equal(both.match, 'exact'); assert.ok(names(both).every((n) => /جاك/.test(n) && /بنات/.test(n)));
    const pants = await search('بنطلون رجالي');
    assert.deepEqual(names(pants), ['بنطلون جينز مستورد']); assert.equal(pants.match, 'partial');
    { // a loose (widened) result still counts as a gap for the admin's "searches with no result" report
      const { q: dbq } = await import('../src/db/index.js');
      const gap = dbq.get('SELECT SUM(misses) AS m FROM search_terms WHERE term LIKE ?', ['%بنطلون%']);
      assert.ok(gap && gap.m >= 1, 'partial match is logged as a miss');
    }
    const black = await search('جاكت اسود'); // colour is not in the names → still jackets, not nothing and not hoodies
    assert.ok(black.total >= 10 && names(black).every((n) => /جاك/.test(n)));
    assert.ok((await search('ترنج اسود')).items.every((i) => /ترن|سويت بانتس|ترينج|تراك/.test(i.name.ar)));
    // 6. honest empties, filler words and one-letter searches
    for (const w of ['شبشب', 'بوكسر', 'xyzabc', 'ك', 'T']) assert.equal((await search(w)).total, 0, `no results for ${w}`);
    assert.equal((await search('ملابس')).total, CORPUS.length + 1, 'only filler words = no filter');
    assert.equal((await search('')).total, CORPUS.length + 1, 'empty search = browse everything');
    assert.equal((await (await fetch(`${base}/search?sizes=M`)).json()).total, 0, 'filters alone still work (no variants here)');
    // 7. other shops' products show, drafts never do; the match flag is reported
    const all = await set('جاكيت');
    assert.ok(all.has('جاكيت الاخر'));
    assert.ok(!(await set('قميص مخفي')).has('قميص مخفي') && !(await set('draft')).has('قميص مخفي'));
    assert.equal((await search('حذاء')).match, 'exact');
    // 8. filters and sorting still work together with the new search
    const cheap = await search('جاكيت', '&sort=price_asc&max=95');
    assert.deepEqual(names(cheap), ['جاكيت الاخر']);
    assert.ok((await search('جاكيت', '&department=kids')).total >= 1);
    assert.equal((await search('جاكيت', '&store=nope')).total, 0);
    // 9. suggestions use the same understanding
    const sug = await (await fetch(`${base}/search/suggest?q=${encodeURIComponent('رضيع')}`)).json();
    assert.ok(sug.products.length >= 3 && sug.products.some((p) => /بيبي|بيبى|الولاده/.test(p.name.ar)));
    assert.deepEqual((await (await fetch(`${base}/search/suggest?q=a`)).json()).products, []);
    for (const [typed, expect] of [['جاك', 'جاك'], ['كوت', 'كوتش'], ['بيجا', 'بيجامه'], ['حذ', 'حذاء']]) {
      const sg = await (await fetch(`${base}/search/suggest?q=${encodeURIComponent(typed)}`)).json();
      assert.ok(sg.products.length >= 1 && sg.products.some((p) => p.name.ar.includes(expect)), `suggest while typing "${typed}"`);
    }
    // 10. fast enough: every query of this suite answers well under half a second on ~160 products
    const t0 = Date.now(); for (const w of ['حديثي الولادة', 'تيشرت', 'جينز حريمي', 'كوتشي ابيض حريمي', 'xyzabc']) await search(w);
    assert.ok(Date.now() - t0 < 2500, `5 searches took ${Date.now() - t0}ms`);
    // 11. in-store search uses the same engine but stays inside the shop
    const inStore = await (await fetch(`${base}/stores/${otherSlug}/products?q=${encodeURIComponent('جاكت')}`)).json();
    assert.deepEqual(inStore.items.map((i) => i.name.ar), ['جاكيت الاخر']);
    assert.equal((await (await fetch(`${base}/stores/${otherSlug}/products?q=${encodeURIComponent('حذاء')}`)).json()).items.length, 0);
  } finally { server.close(); }
});
