import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { q, tx, insert, update } from '../db/index.js';
import { signToken } from '../lib/auth.js';
import { slugify } from '../lib/util.js';
import { serializeStore } from '../lib/serialize.js';
import { config } from '../config.js';
import { h, AppError } from '../lib/errors.js';
import { isWhatsAppConfigured } from '../lib/whatsapp.js';

function makeSetupLink(req, uid) {
  const token = crypto.randomBytes(24).toString('base64url');
  const expires = new Date(Date.now() + 7 * 864e5).toISOString();
  update('users', uid, { setup_token_hash: crypto.createHash('sha256').update(token).digest('hex'), setup_expires: expires });
  return { url: `${req.protocol}://${req.get('host')}/setup/${token}`, expires };
}

/** Platform-admin API. Every request must carry the x-admin-key header (env ADMIN_KEY). */
const r = Router();

r.use((req, _res, next) => {
  const key = req.headers['x-admin-key'];
  if (!config.adminKey) return next(new AppError(503, 'admin_disabled', 'ADMIN_KEY is not set on the server.'));
  if (key !== config.adminKey) return next(new AppError(401, 'unauthorized', 'Wrong admin key.'));
  next();
});

r.get('/status', h((_req, res) => {
  res.json({ whatsappConfigured: isWhatsAppConfigured(), template: config.wa.template, registrationOpen: config.allowRegister });
}));

r.get('/stores', h((_req, res) => {
  const stores = q.all(`
    SELECT s.slug, s.name_ar, s.name_en, s.whatsapp, s.auto_whatsapp, s.hidden, s.featured, s.sort_order, u.email AS owner_email, u.name AS owner_name, u.role,
      (SELECT COUNT(*) FROM products p WHERE p.store_id = s.id) AS products_count,
      (SELECT COUNT(*) FROM orders o WHERE o.store_id = s.id) AS orders_count
    FROM stores s JOIN users u ON u.id = s.owner_id ORDER BY s.sort_order, s.id`);
  res.json({ stores: stores.map((s) => ({ ...s, auto_whatsapp: Boolean(s.auto_whatsapp), hidden: Boolean(s.hidden), featured: Boolean(s.featured) })) });
}));

r.patch('/stores/:slug', h((req, res) => {
  const body = z.object({ auto_whatsapp: z.boolean().optional(), hidden: z.boolean().optional(), featured: z.boolean().optional(), sort_order: z.coerce.number().int().min(0).max(9999).optional() }).parse(req.body);
  const store = q.get('SELECT id FROM stores WHERE slug=?', [req.params.slug]);
  if (!store) throw new AppError(404, 'not_found', 'Store not found.');
  const patch = {};
  if (body.auto_whatsapp !== undefined) patch.auto_whatsapp = body.auto_whatsapp ? 1 : 0;
  if (body.hidden !== undefined) patch.hidden = body.hidden ? 1 : 0;
  if (body.featured !== undefined) patch.featured = body.featured ? 1 : 0;
  if (body.sort_order !== undefined) patch.sort_order = body.sort_order;
  update('stores', store.id, patch);
  res.json({ slug: req.params.slug, ...body });
}));

const createSchema = z.object({
  store_name: z.string().trim().min(2).max(60),
  owner_name: z.string().trim().min(2).max(60),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(100).optional(),
  phone: z.string().trim().regex(/^01[0125][0-9]{8}$/, 'phone_invalid'),
  whatsapp: z.string().trim().regex(/^01[0125][0-9]{8}$/, 'phone_invalid').optional(),
  category: z.enum(['men', 'women', 'kids', 'mixed', 'denim', 'sports', 'accessories']).default('mixed'),
  address: z.string().trim().max(160).optional(),
  map_url: z.string().trim().url().max(400).optional(),
  opens_at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  closes_at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  auto_whatsapp: z.boolean().default(false),
});

r.post('/stores', h((req, res) => {
  const d = createSchema.parse(req.body);
  if (q.get('SELECT id FROM users WHERE email=?', [d.email])) throw new AppError(422, 'validation_failed', 'Email already in use', { email: 'email_taken' });
  const out = tx(() => {
    const uid = insert('users', { name: d.owner_name, email: d.email, password_hash: bcrypt.hashSync(d.password || crypto.randomBytes(18).toString('base64url'), 10) });
    let slug = slugify(d.store_name);
    if (!/^[a-z0-9-]+$/.test(slug) || !slug) slug = `store-${uid}`;
    let i = 1;
    const base = slug;
    while (q.get('SELECT id FROM stores WHERE slug=?', [slug])) slug = `${base}-${++i}`;
    const code = d.store_name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'SQ';
    const sid = insert('stores', {
      owner_id: uid, slug, code, name_ar: d.store_name, name_en: d.store_name, category: d.category,
      phone: d.phone, whatsapp: d.whatsapp || d.phone, city: 'Banha', auto_whatsapp: d.auto_whatsapp ? 1 : 0,
      address_ar: d.address || null, address_en: d.address || null, map_url: d.map_url || null,
      opens_at: d.opens_at || '10:00', closes_at: d.closes_at || '23:00',
      tagline_ar: 'أهلاً بيك في متجرنا', tagline_en: 'Welcome to our store',
      theme_json: JSON.stringify({ primary: '#1B1B1B', secondary: '#F3F0EA', accent: '#B4532A', background: '#FFFFFF', text: '#0F172A', button: '#1B1B1B', header: '#FFFFFF', footer: '#0F172A' }),
    });
    [['new-in', 'وصل حديثاً', 'New In'], ['tops', 'تيشيرتات وقمصان', 'Tops'], ['bottoms', 'بناطيل', 'Bottoms']].forEach(([cs, ar, en], idx) =>
      insert('categories', { store_id: sid, slug: cs, name_ar: ar, name_en: en, sort: idx }));
    return { slug, sid, uid };
  });
  res.status(201).json({ slug: out.slug, setup: makeSetupLink(req, out.uid) });
}));

r.post('/stores/:slug/login-as', h((req, res) => {
  const store = q.get('SELECT s.id, u.id AS uid, u.name, u.email, u.role FROM stores s JOIN users u ON u.id = s.owner_id WHERE s.slug=?', [req.params.slug]);
  if (!store) throw new AppError(404, 'not_found', 'Store not found.');
  if (store.role === 'disabled') throw new AppError(403, 'account_disabled', 'This account is disabled.');
  res.json({ token: signToken({ id: store.uid }), user: { id: store.uid, name: store.name, email: store.email } });
}));

r.delete('/stores/:slug', h((req, res) => {
  const body = z.object({ confirm: z.string() }).parse(req.body);
  const store = q.get('SELECT id, owner_id FROM stores WHERE slug=?', [req.params.slug]);
  if (!store) throw new AppError(404, 'not_found', 'Store not found.');
  if (body.confirm !== req.params.slug) throw new AppError(422, 'validation_failed', 'Type the store slug to confirm.', { confirm: 'mismatch' });
  tx(() => {
    q.run('DELETE FROM stores WHERE id=?', [store.id]); // cascades products, orders, customers, media rows, etc.
    q.run('DELETE FROM users WHERE id=?', [store.owner_id]);
  });
  res.json({ deleted: req.params.slug });
}));

r.get('/stores/:slug/products', h((req, res) => {
  const store = q.get('SELECT id FROM stores WHERE slug=?', [req.params.slug]);
  if (!store) throw new AppError(404, 'not_found', 'Store not found.');
  const rows = q.all('SELECT id, name_ar, name_en, price, stock, status, featured FROM products WHERE store_id=? ORDER BY featured DESC, id DESC', [store.id]);
  res.json({ products: rows.map((p) => ({ ...p, featured: Boolean(p.featured) })) });
}));

r.patch('/stores/:slug/products/:id', h((req, res) => {
  const body = z.object({ featured: z.boolean() }).parse(req.body);
  const p = q.get('SELECT p.id FROM products p JOIN stores s ON s.id=p.store_id WHERE s.slug=? AND p.id=?', [req.params.slug, Number(req.params.id)]);
  if (!p) throw new AppError(404, 'not_found', 'Product not found.');
  update('products', p.id, { featured: body.featured ? 1 : 0 });
  res.json({ id: p.id, featured: body.featured });
}));

r.post('/stores/:slug/setup-link', h((req, res) => {
  const user = q.get('SELECT u.id FROM stores s JOIN users u ON u.id=s.owner_id WHERE s.slug=?', [req.params.slug]);
  if (!user) throw new AppError(404, 'not_found', 'Store not found.');
  res.json(makeSetupLink(req, user.id));
}));

export default r;
