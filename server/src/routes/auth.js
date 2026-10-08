import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { q, tx, insert, update } from '../db/index.js';
import { config } from '../config.js';
import { h, AppError } from '../lib/errors.js';
import { signToken, requireOwner } from '../lib/auth.js';
import { slugify } from '../lib/util.js';
import { serializeStore } from '../lib/serialize.js';
import { THEME_PRESETS } from '@souqna/shared';

const r = Router();

// tiny in-memory brute-force guard
const attempts = new Map();
function throttle(key) {
  const now = Date.now();
  const a = (attempts.get(key) || []).filter((t) => now - t < 10 * 60e3);
  if (a.length >= 10) throw new AppError(429, 'too_many_attempts', 'Too many attempts. Please wait a few minutes.');
  a.push(now);
  attempts.set(key, a);
}

r.post('/login', h((req, res) => {
  const { email, password } = z.object({ email: z.string().trim().toLowerCase().email('email_invalid'), password: z.string().min(1, 'required') }).parse(req.body);
  throttle(`${req.ip}:${email}`);
  const user = q.get('SELECT * FROM users WHERE email=?', [email]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) throw new AppError(401, 'invalid_credentials', 'Email or password is incorrect.');
  if (user.role === 'disabled') throw new AppError(403, 'account_disabled', 'This account is disabled. Contact BanhaLook.');
  const store = q.get('SELECT * FROM stores WHERE owner_id=? LIMIT 1', [user.id]);
  res.json({ token: signToken(user), user: { id: user.id, name: user.name, email: user.email }, store: store ? serializeStore(store) : null });
}));

const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
function userByToken(token) {
  const u = q.get('SELECT id, name, email, setup_expires FROM users WHERE setup_token_hash=?', [hashToken(token)]);
  if (!u || !u.setup_expires || new Date(u.setup_expires) < new Date()) throw new AppError(410, 'link_expired', 'This link has expired or was already used. Ask BanhaLook for a new one.');
  return u;
}

r.get('/setup/:token', h((req, res) => {
  const u = userByToken(req.params.token);
  const store = q.get('SELECT name_ar FROM stores WHERE owner_id=? LIMIT 1', [u.id]);
  res.json({ email: u.email, name: u.name, store: store?.name_ar || '' });
}));

r.post('/setup/:token', h((req, res) => {
  const { password } = z.object({ password: z.string().min(8, 'password_short').max(100) }).parse(req.body);
  const u = userByToken(req.params.token);
  update('users', u.id, { password_hash: bcrypt.hashSync(password, 10), setup_token_hash: null, setup_expires: null });
  const user = q.get('SELECT id, name, email FROM users WHERE id=?', [u.id]);
  const store = q.get('SELECT * FROM stores WHERE owner_id=? LIMIT 1', [u.id]);
  res.json({ token: signToken(user), user, store: store ? serializeStore(store) : null });
}));

r.post('/register', h((req, res) => {
  if (!config.allowRegister) throw new AppError(403, 'registration_closed', 'Store accounts are created by the BanhaLook team. Contact us to open your store.');
  const d = z.object({
    name: z.string().trim().min(2, 'required').max(60),
    email: z.string().trim().toLowerCase().email('email_invalid'),
    password: z.string().min(8, 'password_short').max(100),
    store_name: z.string().trim().min(2, 'required').max(60),
    phone: z.string().trim().regex(/^01[0125][0-9]{8}$/, 'phone_invalid'),
  }).parse(req.body);
  throttle(`${req.ip}:register`);
  if (q.get('SELECT id FROM users WHERE email=?', [d.email])) throw new AppError(422, 'validation_failed', 'Email already registered', { email: 'email_taken' });
  const out = tx(() => {
    const uid = insert('users', { name: d.name, email: d.email, password_hash: bcrypt.hashSync(d.password, 10) });
    let slug = slugify(d.store_name);
    if (!/^[a-z0-9-]+$/.test(slug)) slug = `store-${uid}`;
    let i = 1;
    while (q.get('SELECT id FROM stores WHERE slug=?', [slug])) slug = `${slugify(d.store_name)}-${++i}`;
    const code = d.store_name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'SQ';
    const sid = insert('stores', {
      owner_id: uid, slug, code, name_ar: d.store_name, name_en: d.store_name, phone: d.phone, whatsapp: d.phone,
      tagline_ar: 'أحدث صيحات الموضة في بنها', tagline_en: 'The latest fashion in Banha',
      theme_json: JSON.stringify(THEME_PRESETS.noir),
    });
    [['new-in', 'وصل حديثاً', 'New In'], ['tops', 'تيشيرتات وقمصان', 'Tops'], ['bottoms', 'بناطيل', 'Bottoms']].forEach(([slug, ar, en], idx) =>
      insert('categories', { store_id: sid, slug, name_ar: ar, name_en: en, sort: idx }));
    return { uid, sid };
  });
  const user = q.get('SELECT id, name, email FROM users WHERE id=?', [out.uid]);
  res.status(201).json({ token: signToken(user), user, store: serializeStore(q.get('SELECT * FROM stores WHERE id=?', [out.sid])) });
}));

r.get('/me', requireOwner, h((req, res) => {
  res.json({ user: req.user, store: serializeStore(req.store) });
}));

export default r;
