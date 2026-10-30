import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

test('image library: type + category pairs, shared once, auto-detected from products, engine untouched', async () => {
  process.env.DB_FILE = path.join(os.tmpdir(), `souqna-tpl-${randomUUID()}.db`);
  process.env.MEDIA_DIR = path.join(os.tmpdir(), `souqna-tpl-media-${randomUUID()}`);
  const T = await import('../src/lib/promotions/templates.js');
  const { q, insert } = await import('../src/db/index.js');
  const mkImg = async (color) => { const f = path.join(os.tmpdir(), `${randomUUID()}.png`); await sharp({ create: { width: 800, height: 400, channels: 3, background: color } }).png().toFile(f); return f; };
  const a = await mkImg('#cc3366'); const b = await mkImg('#3366cc'); const c = await mkImg('#33cc66');

  assert.equal((await T.publishTemplate('buy_x_get_y', 'perfumes', a)).status, 'uploaded');
  assert.equal((await T.publishTemplate('buy_x_get_y', 'perfumes', a)).status, 'unchanged', 'identical content is never uploaded twice');
  await T.publishTemplate('buy_x_get_y', 'general', b);
  await T.publishTemplate('percentage', 'makeup', c);
  assert.equal(q.val('SELECT COUNT(*) FROM offer_templates'), 3);
  assert.equal((await fs.readdir(path.join(process.env.MEDIA_DIR, 'offer-templates'))).length, 3);

  // exact pair, then the type's general image, then nothing (UI gradient)
  assert.match(T.resolveTemplate('buy_x_get_y', 'perfumes').url, /buy_x_get_y\.perfumes\./);
  assert.match(T.resolveTemplate('buy_x_get_y', 'kids_fashion').url, /buy_x_get_y\.general\./);
  assert.equal(T.resolveTemplate('percentage', 'kids_fashion'), null);
  assert.match(T.resolveTemplate('category_reward', 'perfumes').url, /buy_x_get_y\.perfumes\./, 'category reward reuses Buy X Get Y art');

  // a brand new product category needs no code
  T.addImageCategory({ key: 'electronics', nameAr: 'إلكترونيات', nameEn: 'Electronics', departments: ['electronics'] });
  assert.equal((await T.publishTemplate('percentage', 'electronics', a)).status, 'uploaded');
  assert.ok(T.imageCategories().some((x) => x.key === 'electronics'));

  // automatic choice from the offer's products
  const userId = insert('users', { name: 'o', email: `${randomUUID()}@x.test`, password_hash: 'x' });
  const storeId = insert('stores', { owner_id: userId, slug: `t-${randomUUID().slice(0, 6)}`, code: 'TPL', name_ar: 'م', name_en: 'S' });
  const p1 = insert('products', { store_id: storeId, slug: 'p1', name_ar: 'عطر', name_en: 'Perfume', price: 100, stock: 5, department: 'perfume_makeup' });
  const row = { store_id: storeId, type: 'buy_x_get_y', template_key: 'buy_x_get_y', image_mode: 'auto', image_media_id: null };
  assert.equal(T.resolveOfferImage(row, [p1]).category, 'perfumes');
  assert.match(T.resolveOfferImage(row, [p1]).url, /perfumes/);
  assert.equal(T.resolveOfferImage({ ...row, image_mode: 'library', image_category: 'makeup', type: 'percentage', template_key: 'percentage' }, [p1]).category, 'makeup');

  // one picture per category serves every offer type (and every quantity): no per-number images
  await T.publishTemplate('any', 'perfumes', a);
  for (const type of ['percentage', 'group_price', 'bundle', 'gift']) assert.match(T.resolveTemplate(type, 'perfumes').url, /any\.perfumes\./);
  assert.match(T.resolveTemplate('fixed_amount', 'perfumes').url, /any\.perfumes\./);
  assert.match(T.resolveTemplate('buy_x_get_y', 'perfumes').url, /buy_x_get_y\.perfumes\./, 'an exact type+category image still wins');
  // the most specific department wins: a women's sportswear product is sportswear, not women's fashion
  const p2 = insert('products', { store_id: storeId, slug: 'p2', name_ar: 'ت', name_en: 'T', price: 100, stock: 5, department: 'women_sports' });
  const p3 = insert('products', { store_id: storeId, slug: 'p3', name_ar: 'ت', name_en: 'T', price: 100, stock: 5, department: 'kids_baby' });
  const p4 = insert('products', { store_id: storeId, slug: 'p4', name_ar: 'ت', name_en: 'T', price: 100, stock: 5, department: 'women_dresses' });
  assert.equal(T.categoryForProducts([p2], storeId), 'sportswear');
  assert.equal(T.categoryForProducts([p3], storeId), 'babywear');
  assert.equal(T.categoryForProducts([p4], storeId), 'womens_fashion');
  const p5 = insert('products', { store_id: storeId, slug: 'p5', name_ar: 'ت', name_en: 'T', price: 100, stock: 5, department: 'kids_baby' });
  assert.equal(T.categoryForProducts([p2, p3, p5], storeId), 'babywear', 'majority of the products decides');
  assert.equal(T.resolveOfferImage({ ...row, image_mode: 'custom', image_media_id: 5 }, [p1]).mode, 'custom');
  await assert.rejects(() => T.publishTemplate('not_a_type', 'general', a));
  await assert.rejects(() => T.publishTemplate('percentage', '../evil', a));

  // the engine has no dependency on the image layer
  const src = await fs.readFile(new URL('../src/lib/promotions/engine.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /templates|image|r2/i);
});
