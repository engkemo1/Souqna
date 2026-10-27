import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { q, tx, insert, update } from '../db/index.js';
import { config } from '../config.js';
import { notifyPlatformAlert } from '../lib/whatsapp.js';
import { h, AppError } from '../lib/errors.js';
import { signToken, requireOwner } from '../lib/auth.js';
import { slugify, latinSlug } from '../lib/util.js';
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
  const user = q.get('SELECT * FROM users WHERE lower(email)=?', [email]);
  // Phones often add a stray space before/after a pasted or auto-completed password, so accept the trimmed one too.
  const okPw = !!user && (bcrypt.compareSync(password, user.password_hash) || (password.trim() !== password && bcrypt.compareSync(password.trim(), user.password_hash)));
  if (!okPw) throw new AppError(401, 'invalid_credentials', 'Email or password is incorrect.');
  if (user.role === 'disabled') throw new AppError(403, 'account_disabled', 'This account is disabled. Contact Twist.');
  const store = q.get('SELECT * FROM stores WHERE owner_id=? LIMIT 1', [user.id]);
  res.json({ token: signToken(user), user: { id: user.id, name: user.name, email: user.email, role: user.role }, store: store ? serializeStore(store) : null });
}));

const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
function userByToken(token) {
  const u = q.get('SELECT id, name, email, setup_expires FROM users WHERE setup_token_hash=?', [hashToken(token)]);
  if (!u || !u.setup_expires || new Date(u.setup_expires) < new Date()) throw new AppError(410, 'link_expired', 'This link has expired or was already used. Ask Twist for a new one.');
  return u;
}

r.get('/setup/:token', h((req, res) => {
  const u = userByToken(req.params.token);
  const store = q.get('SELECT name_ar FROM stores WHERE owner_id=? LIMIT 1', [u.id]);
  res.json({ email: u.email, name: u.name, store: store?.name_ar || '' });
}));

r.post('/setup/:token', h((req, res) => {
  const { password } = z.object({ password: z.string().trim().min(8, 'password_short').max(100) }).parse(req.body);
  const u = userByToken(req.params.token);
  update('users', u.id, { password_hash: bcrypt.hashSync(password, 10), setup_token_hash: null, setup_expires: null });
  const user = q.get('SELECT id, name, email FROM users WHERE id=?', [u.id]);
  const store = q.get('SELECT * FROM stores WHERE owner_id=? LIMIT 1', [u.id]);
  res.json({ token: signToken(user), user, store: store ? serializeStore(store) : null });
}));

r.post('/register', h((req, res) => {
  if (!config.allowRegister) throw new AppError(403, 'registration_closed', 'Store accounts are created by the Twist team. Contact us to open your store.');
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
    const baseSlug = latinSlug(d.store_name).length >= 2 ? latinSlug(d.store_name) : `store-${uid}`;
    let slug = baseSlug;
    let i = 1;
    while (q.get('SELECT id FROM stores WHERE slug=?', [slug])) slug = `${baseSlug}-${++i}`;
    const code = d.store_name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'SQ';
    const sid = insert('stores', {
      show_when_empty: 1, free_shipping_over: 0,
      owner_id: uid, slug, code, name_ar: d.store_name, name_en: d.store_name, phone: d.phone, whatsapp: d.phone,
      tagline_ar: 'أحدث صيحات الموضة في بنها', tagline_en: 'The latest fashion in Banha',
      theme_json: JSON.stringify(THEME_PRESETS.noir),
    });
    [['new-in', 'وصل حديثاً', 'New In'], ['tops', 'تيشيرتات وقمصان', 'Tops'], ['bottoms', 'بناطيل', 'Bottoms']].forEach(([slug, ar, en], idx) =>
      insert('categories', { store_id: sid, slug, name_ar: ar, name_en: en, sort: idx }));
    return { uid, sid };
  });
  notifyPlatformAlert(`محل جديد سجّل: ${d.store_name} - ${d.phone}`);
  const user = q.get('SELECT id, name, email FROM users WHERE id=?', [out.uid]);
  res.status(201).json({ token: signToken(user), user, store: serializeStore(q.get('SELECT * FROM stores WHERE id=?', [out.sid])) });
}));

/** "Forgot my password": no automatic reset (anyone could trigger it). It opens WhatsApp to the Twist team with the store's email filled in; the team sends a fresh activation link. */
r.post('/forgot', h((req, res) => {
  const { email } = z.object({ email: z.string().trim().toLowerCase().email('email_invalid') }).parse(req.body);
  throttle(`${req.ip}:forgot`);
  const text = `أهلاً Twist، نسيت باسورد لوحة المحل. الإيميل: ${email}. محتاج لينك باسورد جديد.`;
  res.json({ wa: `https://wa.me/${config.platformWa}?text=${encodeURIComponent(text)}` });
}));

r.post('/change-password', requireOwner, h((req, res) => {
  const { current, password } = z.object({ current: z.string().min(1, 'required').max(100), password: z.string().trim().min(8, 'password_short').max(100) }).parse(req.body);
  throttle(`${req.ip}:pw:${req.user.id}`);
  if (req.user.role === 'demo') throw new AppError(403, 'demo_readonly', 'This is a demo store — changes are disabled.');
  const row = q.get('SELECT password_hash FROM users WHERE id=?', [req.user.id]);
  if (!row || !bcrypt.compareSync(current, row.password_hash)) throw new AppError(422, 'validation_failed', 'Current password is incorrect.', { current: 'password_wrong' });
  update('users', req.user.id, { password_hash: bcrypt.hashSync(password, 10), setup_token_hash: null, setup_expires: null });
  res.json({ ok: true });
}));

r.get('/me', requireOwner, h((req, res) => {
  // Every time the app opens, the session is renewed, so an owner who keeps using it is never signed out.
  res.json({ user: req.user, store: serializeStore(req.store), token: signToken(req.user) });
}));

export default r;
