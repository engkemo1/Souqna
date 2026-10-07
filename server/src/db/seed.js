/**
 * Seeds four realistic Banha fashion stores with real product photography
 * (processed through the production media pipeline), ~90 days of orders,
 * customers, offers, banners and traffic so the dashboard tells a story.
 *
 *   npm run seed
 *
 * Demo logins (password: demo1234)
 *   ahmed@souqna.app  → Ahmed Fashion
 *   lamar@souqna.app  → Lamar Boutique
 *   sport@souqna.app  → Sport Zone
 *   denim@souqna.app  → Denim House
 */
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { config, ROOT } from '../config.js';

for (const f of [config.dbFile, `${config.dbFile}-wal`, `${config.dbFile}-shm`]) fs.rmSync(f, { force: true });
fs.rmSync(config.mediaDir, { recursive: true, force: true });

const { q, tx, insert } = await import('./index.js');
const { processImage } = await import('../lib/media.js');
const { THEME_PRESETS } = await import('@souqna/shared');

const ASSETS = path.join(ROOT, 'seed-assets');
const catalog = JSON.parse(fs.readFileSync(path.join(ASSETS, 'catalog.json'), 'utf8'));

/* ---------------------------------------------------------- deterministic random */
let seed = 20261007;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const ri = (a, b) => Math.floor(rand() * (b - a + 1)) + a;
const pickOne = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;
const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
const NOW = Date.now();
const daysAgo = (d, hourCairo = 12, min = 0) => {
  const base = new Date(NOW + 3 * 3600e3 - d * 864e5); // Cairo "today"
  base.setUTCHours(hourCairo - 3, min, ri(0, 59), 0);
  return base;
};

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  }));
  return out;
}

const img = (rel, storeId, kind = 'product', alt = null) => processImage(fs.readFileSync(path.join(ASSETS, rel)), { storeId, kind, alt });

/* ---------------------------------------------------------- stores */

const STORES = [
  {
    slug: 'ahmed-fashion', code: 'AF', email: 'ahmed@souqna.app', owner: 'Ahmed Samir',
    name: ['أحمد فاشون', 'Ahmed Fashion'], tagline: ['ملابس رجالي عصرية في قلب بنها', 'Modern menswear in the heart of Banha'],
    description: ['من 2012 وإحنا بنلبّس شباب بنها. هوديز وجواكت وبناطيل بخامات ممتازة وأسعار مناسبة، مع توصيل لكل القليوبية.', 'Dressing Banha since 2012 — hoodies, jackets and pants in quality fabrics at fair prices, delivered across Qalyubia.'],
    address: ['شارع فريد ندا، بنها، القليوبية', 'Farid Nada St, Banha, Qalyubia'],
    category: 'men', rating: 4.8, ratingCount: 412, featured: 1, badge: ['خصم 30٪', '30% OFF'],
    phone: '01001234567', instagram: 'ahmedfashion.banha', facebook: 'AhmedFashionBanha',
    theme: { ...THEME_PRESETS.noir, accent: '#B4532A', secondary: '#F3F0EA' },
    cats: { mh: ['hoodies', 'هوديز', 'Hoodies'], mj: ['jackets', 'جواكت', 'Jackets'], mp: ['pants', 'بناطيل', 'Pants'] },
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], volume: 1.0,
  },
  {
    slug: 'lamar-boutique', code: 'LB', email: 'lamar@souqna.app', owner: 'Lamar Hassan',
    name: ['لمار بوتيك', 'Lamar Boutique'], tagline: ['أزياء نسائية ناعمة ومريحة', 'Soft, comfortable womenswear'],
    description: ['بوتيك نسائي في بنها بيختار لك قطع عملية وأنيقة للبيت والشغل والجيم.', 'A Banha womenswear boutique curating practical, elegant pieces for home, work and the gym.'],
    address: ['شارع سعد زغلول، بنها، القليوبية', 'Saad Zaghloul St, Banha, Qalyubia'],
    category: 'women', rating: 4.9, ratingCount: 268, featured: 1, badge: ['جديد', 'NEW IN'],
    phone: '01112345678', instagram: 'lamar.boutique', facebook: 'LamarBoutique',
    theme: THEME_PRESETS.rose,
    cats: { wh: ['hoodies', 'هوديز', 'Hoodies'], wj: ['jackets', 'جواكت', 'Jackets'], wp: ['pants', 'بناطيل وليجن', 'Pants & Leggings'] },
    sizes: ['XS', 'S', 'M', 'L', 'XL'], volume: 0.7,
  },
  {
    slug: 'sport-zone', code: 'SZ', email: 'sport@souqna.app', owner: 'Karim Adel',
    name: ['سبورت زون', 'Sport Zone'], tagline: ['كل اللي تحتاجه للجيم والجري', 'Everything you need to train'],
    description: ['ملابس رياضية رجالي وحريمي بخامات دراي فيت، أسعار جملة وقطاعي.', 'Dri-fit sportswear for men and women at great prices.'],
    address: ['ميدان الإشارة، بنها، القليوبية', 'El-Ishara Sq, Banha, Qalyubia'],
    category: 'sports', rating: 4.6, ratingCount: 189, featured: 0, badge: ['شحن مجاني', 'FREE DELIVERY'],
    phone: '01223456789', instagram: 'sportzone.eg', facebook: 'SportZoneBanha',
    theme: { primary: '#1F4FA8', secondary: '#EEF3FB', accent: '#F2B705', background: '#FFFFFF', text: '#0F172A', button: '#1F4FA8', header: '#FFFFFF', footer: '#0F172A' },
    cats: { ms: ['men-tees', 'تيشيرتات رجالي', 'Men’s Tees'], msh: ['shorts', 'شورتات', 'Shorts'], ws: ['women', 'حريمي', 'Women'] },
    sizes: ['S', 'M', 'L', 'XL'], volume: 0.55,
  },
  {
    slug: 'denim-house', code: 'DH', email: 'denim@souqna.app', owner: 'Omar Fathy',
    name: ['دنيم هاوس', 'Denim House'], tagline: ['جينز وتيشيرتات قطن مصري', 'Denim & Egyptian cotton tees'],
    description: ['متخصصين في الجينز والتيشيرتات التقيلة. قصّات حديثة وغسلات مختارة بعناية.', 'Specialists in denim and heavyweight tees — modern cuts and carefully chosen washes.'],
    address: ['كورنيش النيل، بنها، القليوبية', 'Nile Corniche, Banha, Qalyubia'],
    category: 'denim', rating: 4.7, ratingCount: 331, featured: 1, badge: ['كود DENIM15', 'CODE DENIM15'],
    phone: '01534567890', instagram: 'denimhouse.banha', facebook: 'DenimHouseEG',
    theme: { ...THEME_PRESETS.indigo, background: '#FBFAF7', secondary: '#EEF0F6', header: '#FBFAF7' },
    cats: { jeans: ['jeans', 'جينز', 'Jeans'], shorts: ['shorts', 'شورتات', 'Shorts'], tee: ['tees', 'تيشيرتات', 'Tees'], cap: ['beanies', 'طواقي', 'Beanies'] },
    sizes: ['S', 'M', 'L', 'XL'], volume: 0.8,
  },
];

const OFFERS = (s) => [
  { type: 'percentage', code: 'WELCOME10', title_ar: 'خصم 10٪ لأول طلب', title_en: '10% off your first order', value: 10, min_subtotal: 0, usage_count: ri(20, 90) },
  { type: 'fixed', code: 'BANHA100', title_ar: 'خصم 100 جنيه على 1000', title_en: 'EGP 100 off orders over 1,000', value: 100, min_subtotal: 1000, usage_count: ri(10, 50) },
  { type: 'free_shipping', code: 'FREESHIP', title_ar: 'شحن مجاني', title_en: 'Free delivery', value: 0, min_subtotal: 600, usage_count: ri(15, 60) },
  ...(s.code === 'DH' ? [{ type: 'percentage', code: 'DENIM15', title_ar: 'خصم 15٪ على الدنيم', title_en: '15% off denim', value: 15, min_subtotal: 700, usage_count: ri(30, 80) }] : []),
  { type: 'percentage', code: 'SUMMER25', title_ar: 'تخفيضات الصيف', title_en: 'Summer sale', value: 25, min_subtotal: 0, starts_at: '2026-07-01', ends_at: '2026-08-31', usage_count: ri(80, 160) },
  { type: 'percentage', code: 'EID20', title_ar: 'عرض العيد', title_en: 'Eid offer', value: 20, min_subtotal: 500, active: 0, usage_count: ri(40, 90) },
];

const FIRST = ['محمد', 'أحمد', 'محمود', 'مصطفى', 'عمر', 'يوسف', 'كريم', 'إسلام', 'حسن', 'علي', 'خالد', 'مينا', 'أمير', 'زياد', 'عبدالرحمن', 'سارة', 'منى', 'نورهان', 'آية', 'مريم', 'هبة', 'ياسمين', 'دينا', 'رحمة', 'شيماء', 'إيمان', 'ندى', 'سلمى', 'مارينا', 'روان'];
const LAST = ['السيد', 'عبدالله', 'إبراهيم', 'حسن', 'فتحي', 'منصور', 'الشافعي', 'عادل', 'سمير', 'جمال', 'رمضان', 'شحاتة', 'عبدالعزيز', 'نصر', 'سليمان', 'فوزي', 'حمدي', 'زكي'];
const CITIES = [['بنها', 0.52], ['طوخ', 0.1], ['قليوب', 0.08], ['شبين القناطر', 0.07], ['كفر شكر', 0.06], ['القناطر الخيرية', 0.05], ['الخانكة', 0.04], ['مدينة نصر', 0.04], ['المعادي', 0.02], ['طنطا', 0.02]];
const STREETS = ['شارع فريد ندا', 'شارع سعد زغلول', 'شارع الجيش', 'شارع الثورة', 'ش. مصطفى كامل', 'شارع البحر', 'شارع الفلل', 'شارع عبدالمنعم رياض', 'حي الزهور', 'كفر الجزار'];
const cityGov = (c) => (['مدينة نصر', 'المعادي'].includes(c) ? 'Cairo' : c === 'طنطا' ? 'Gharbia' : 'Qalyubia');
const weightedCity = () => { let r = rand(), acc = 0; for (const [c, w] of CITIES) { acc += w; if (r <= acc) return c; } return 'بنها'; };
const phone = () => pickOne(['010', '011', '012', '015']) + String(ri(10000000, 99999999));

/* ---------------------------------------------------------- run */

console.time('seed');
const hash = bcrypt.hashSync('demo1234', 10);

for (const S of STORES) {
  const uid = insert('users', { name: S.owner, email: S.email, password_hash: hash });
  const sid = insert('stores', {
    owner_id: uid, slug: S.slug, code: S.code, name_ar: S.name[0], name_en: S.name[1], tagline_ar: S.tagline[0], tagline_en: S.tagline[1],
    description_ar: S.description[0], description_en: S.description[1], address_ar: S.address[0], address_en: S.address[1],
    category: S.category, city: 'Banha', phone: S.phone, whatsapp: S.phone, instagram: S.instagram, facebook: S.facebook,
    theme_json: JSON.stringify(S.theme), rating: S.rating, rating_count: S.ratingCount, featured: S.featured,
    offer_badge_ar: S.badge[0], offer_badge_en: S.badge[1], shipping_fee: 50, free_shipping_over: 1500,
    created_at: fmt(daysAgo(400)),
  });

  const [logo, cover] = await Promise.all([img(`logos/${S.slug}.webp`, sid, 'logo'), img(`covers/${S.slug}.webp`, sid, 'cover')]);
  q.run('UPDATE stores SET logo_media_id=?, cover_media_id=? WHERE id=?', [logo.id, cover.id, sid]);
  q.run('UPDATE media SET attached=1 WHERE id IN (?,?)', [logo.id, cover.id]);

  // categories
  const catIds = {};
  Object.entries(S.cats).forEach(([type, [slug, ar, en]], i) => { catIds[type] = insert('categories', { store_id: sid, slug, name_ar: ar, name_en: en, sort: i }); });

  // products (images through the real pipeline)
  const items = catalog.products[S.slug];
  const seen = new Set();
  for (const it of items) {
    if (seen.has(it.name_en) && it.type === 'ws') { it.name_en = `Women\u2019s ${it.name_en}`; it.name_ar = `${it.name_ar} نسائي`; }
    seen.add(it.name_en);
  }
  const products = await pool(items, 3, async (p, idx) => {
    const media = [];
    for (const rel of p.images) media.push(await img(rel, sid, 'product', p.name_en));
    return { p, media, idx };
  });

  const sizes = (type) => (type === 'cap' ? ['One size'] : type === 'jeans' ? ['30', '32', '34', '36', '38'] : S.sizes);
  const productRows = [];
  tx(() => {
    for (const { p, media, idx } of products) {
      const discounted = chance(0.32);
      const compare = discounted ? Math.round((p.price * (1 + ri(15, 40) / 100)) / 10) * 10 - 1 : null;
      const age = idx % 9 === 0 ? ri(1, 12) : ri(14, 160);
      const created = fmt(daysAgo(age, ri(9, 22)));
      const sz = sizes(p.type);
      const pid = insert('products', {
        store_id: sid, slug: p.name_en.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        name_ar: p.name_ar, name_en: p.name_en, description_ar: p.description_ar, description_en: p.description_en,
        price: p.price, compare_at_price: compare, cost: Math.round(p.price * (0.42 + rand() * 0.12)),
        sku: `${S.code}-${p.code.toUpperCase()}`, category_id: catIds[p.type], status: 'active',
        featured: chance(0.25) ? 1 : 0, is_new: 0, colors_json: JSON.stringify(p.colors), sizes_json: JSON.stringify(sz),
        track_stock: 1, stock: 0, low_stock_at: 5, rating: Math.round((4.2 + rand() * 0.8) * 10) / 10, rating_count: ri(3, 120),
        views: ri(150, 2400), created_at: created, updated_at: created,
      });
      media.forEach((m, i) => {
        insert('product_media', { product_id: pid, media_id: m.id, position: i, is_primary: i === 0 ? 1 : 0 });
        q.run('UPDATE media SET attached=1 WHERE id=?', [m.id]);
      });
      let total = 0;
      for (const c of p.colors) for (const s of sz) {
        let stock = ri(0, 18);
        if (chance(0.12)) stock = 0;
        total += stock;
        insert('variants', { product_id: pid, color: c.hex, size: s, stock, sku: `${S.code}-${p.code.toUpperCase()}-${c.name_en.slice(0, 3).toUpperCase()}-${s}` });
      }
      q.run('UPDATE products SET stock=? WHERE id=?', [total, pid]);
      productRows.push({ id: pid, price: p.price, type: p.type, name_ar: p.name_ar, name_en: p.name_en, media: media[0].id, pop: rand() ** 2.2 });
    }
    // category hero images
    for (const [type, cid] of Object.entries(catIds)) {
      const first = productRows.find((r) => r.type === type);
      if (first) q.run('UPDATE categories SET media_id=? WHERE id=?', [first.media, cid]);
    }
  });

  // a few deliberately low / out of stock products so inventory alerts have something to say
  productRows.filter((_, i) => i % 7 === 3).forEach((pr, i) => {
    q.run('UPDATE variants SET stock=0 WHERE product_id=?', [pr.id]);
    if (i % 3 !== 2) q.run('UPDATE variants SET stock=? WHERE id IN (SELECT id FROM variants WHERE product_id=? ORDER BY id LIMIT 2)', [ri(1, 2), pr.id]);
    q.run('UPDATE products SET stock=(SELECT SUM(stock) FROM variants WHERE product_id=?) WHERE id=?', [pr.id, pr.id]);
  });

  // banners
  for (const [i, b] of (catalog.banners[S.slug] || []).entries()) {
    const [desk, mob] = await Promise.all([img(b.image, sid, 'banner'), img(b.mobile, sid, 'banner')]);
    insert('banners', {
      store_id: sid, media_id: desk.id, mobile_media_id: mob.id,
      eyebrow_ar: b.eyebrow[0], eyebrow_en: b.eyebrow[1], title_ar: b.title[0], title_en: b.title[1], subtitle_ar: b.subtitle[0], subtitle_en: b.subtitle[1],
      cta_ar: b.cta[0], cta_en: b.cta[1], link: b.link, align: b.align, tone: b.tone, mirror_rtl: b.mirror ? 1 : 0, position: i, active: 1,
    });
    q.run('UPDATE media SET attached=1 WHERE id IN (?,?)', [desk.id, mob.id]);
  }

  // offers
  for (const o of OFFERS(S)) insert('offers', { store_id: sid, active: 1, ...o, created_at: fmt(daysAgo(ri(20, 120))) });

  // customers + orders + traffic (90 days)
  tx(() => {
    const variantsByProduct = new Map();
    for (const v of q.all('SELECT v.* FROM variants v JOIN products p ON p.id=v.product_id WHERE p.store_id=?', [sid])) {
      const list = variantsByProduct.get(v.product_id) || [];
      list.push(v);
      variantsByProduct.set(v.product_id, list);
    }
    const colorNames = new Map();
    for (const it of items) for (const c of it.colors) colorNames.set(c.hex, c);
    const popular = productRows.slice().sort((a, b) => b.pop - a.pop);
    const pickProduct = () => popular[Math.min(popular.length - 1, Math.floor(rand() ** 1.8 * popular.length))];

    const customers = [];
    const newCustomer = (when) => {
      const name = `${pickOne(FIRST)} ${pickOne(LAST)}`;
      const city = weightedCity();
      const c = { name, phone: phone(), city, governorate: cityGov(city), address: `${ri(1, 120)} ${pickOne(STREETS)}، ${city}`, created_at: fmt(when) };
      c.id = insert('customers', { store_id: sid, ...c });
      customers.push(c);
      return c;
    };

    let seq = 10001;
    for (let d = 89; d >= 0; d--) {
      const date = daysAgo(d);
      const wd = date.getUTCDay();
      const weekend = wd === 4 || wd === 5; // Thu/Fri peaks in Egypt
      const trend = (0.75 + (89 - d) / 89 * 0.55) * (d <= 6 ? 1.3 : 1);
      const base = (weekend ? 7.5 : 5) * trend * S.volume;
      const n = Math.max(0, Math.round(base + (rand() - 0.5) * base * 0.8));
      let dayOrders = 0;
      for (let k = 0; k < n; k++) {
        const hour = pickOne([10, 12, 13, 15, 16, 17, 18, 19, 19, 20, 20, 21, 21, 21, 22, 22, 23, 23, 0]);
        if (d === 0 && hour > new Date(NOW + 3 * 3600e3).getUTCHours()) continue;
        const when = daysAgo(d, hour || 24, ri(0, 59));
        if (when.getTime() > NOW) continue;
        const customer = customers.length > 12 && chance(0.34) ? pickOne(customers) : newCustomer(when);
        const lines = [];
        const nItems = pickOne([1, 1, 1, 1, 2, 2, 3]);
        for (let i = 0; i < nItems; i++) {
          const pr = pickProduct();
          if (lines.some((l) => l.pr.id === pr.id)) continue;
          const vs = variantsByProduct.get(pr.id) || [];
          const v = pickOne(vs);
          lines.push({ pr, v, qty: chance(0.15) ? 2 : 1 });
        }
        const subtotal = lines.reduce((s, l) => s + l.pr.price * l.qty, 0);
        let discount = 0, coupon = null;
        if (chance(0.18)) { coupon = 'WELCOME10'; discount = Math.round(subtotal * 0.1); }
        else if (subtotal >= 1000 && chance(0.15)) { coupon = 'BANHA100'; discount = 100; }
        const shipping = subtotal >= 1500 ? 0 : 50;
        const total = subtotal - discount + shipping;
        let status = 'delivered';
        if (d <= 1) status = pickOne(['pending', 'pending', 'confirmed', 'processing']);
        else if (d <= 3) status = pickOne(['processing', 'shipped', 'shipped', 'delivered']);
        else if (d <= 5) status = pickOne(['shipped', 'delivered', 'delivered']);
        if (d > 1 && chance(0.06)) status = 'cancelled';
        const created = fmt(when);
        const oid = insert('orders', {
          store_id: sid, number: `${S.code}-${seq++}`, customer_id: customer.id, customer_name: customer.name, phone: customer.phone,
          governorate: customer.governorate, city: customer.city, address: customer.address, notes: chance(0.15) ? pickOne(['برجاء الاتصال قبل التوصيل', 'التوصيل بعد الساعة 5', 'الدور التالت شقة 7', 'لو المقاس مش مظبوط هبدّله']) : null,
          status, payment_method: 'cod', subtotal, discount, shipping, total, coupon_code: coupon, created_at: created, updated_at: created,
        });
        for (const l of lines) {
          insert('order_items', { order_id: oid, product_id: l.pr.id, variant_id: l.v?.id ?? null, name_ar: l.pr.name_ar, name_en: l.pr.name_en, media_id: l.pr.media, color: l.v?.color ?? null, size: l.v?.size ?? null, price: l.pr.price, qty: l.qty });
        }
        // timeline
        const flow = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];
        const upto = status === 'cancelled' ? 1 : flow.indexOf(status);
        let t = when.getTime();
        for (let i = 0; i <= upto; i++) {
          insert('order_events', { order_id: oid, status: flow[i], created_at: fmt(new Date(Math.min(t, NOW))) });
          t += ri(2, 20) * 3600e3;
        }
        if (status === 'cancelled') insert('order_events', { order_id: oid, status: 'cancelled', note: pickOne(['العميل لم يرد على الهاتف', 'Customer changed their mind', 'طلب مكرر']), created_at: fmt(new Date(Math.min(t, NOW))) });
        dayOrders++;
      }
      const visits = Math.round(dayOrders * (32 + rand() * 22) + 40 * S.volume + rand() * 30);
      insert('store_visits', { store_id: sid, day: fmt(daysAgo(d)).slice(0, 10), visits });
    }

    // aggregates
    q.run(`UPDATE customers SET
      orders_count=(SELECT COUNT(*) FROM orders o WHERE o.customer_id=customers.id),
      total_spent=(SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.customer_id=customers.id AND o.status<>'cancelled'),
      last_order_at=(SELECT MAX(created_at) FROM orders o WHERE o.customer_id=customers.id) WHERE store_id=?`, [sid]);
    q.run(`UPDATE products SET sold_count=(SELECT COALESCE(SUM(oi.qty),0) FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.product_id=products.id AND o.status<>'cancelled') WHERE store_id=?`, [sid]);
  });

  const n = q.get('SELECT COUNT(*) AS c, SUM(total) AS t FROM orders WHERE store_id=?', [sid]);
  console.log(`✓ ${S.name[1]}: ${productRows.length} products, ${n.c} orders, EGP ${n.t.toLocaleString()}`);
}

console.timeEnd('seed');
const bytes = q.val('SELECT SUM(bytes) FROM media');
console.log(`media renditions: ${q.val('SELECT COUNT(*) FROM media')} images, ${(bytes / 1e6).toFixed(1)} MB`);
