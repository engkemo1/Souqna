import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { q, tx, insert, update } from '../db/index.js';
import { config } from '../config.js';
import { notifyPlatformAlert } from '../lib/whatsapp.js';
import { h, AppError } from '../lib/errors.js';
import {
  signToken,
  requireOwner,
  hashPassword,
  verifyPassword,
  setAuthCookie,
  clearAuthCookie,
  revokeUserSessions,
} from '../lib/auth.js';
import { checkRateLimit, recordRateLimitHit, clearRateLimit } from '../lib/rate-limit.js';
import { latinSlug } from '../lib/util.js';
import { serializeStore } from '../lib/serialize.js';
import { THEME_PRESETS } from '@souqna/shared';

const r = Router();

r.post('/login', h(async (req, res) => {
  const { email, password } = z.object({ email: z.string().trim().toLowerCase().email('email_invalid'), password: z.string().min(1, 'required') }).parse(req.body);
  const bucket = `auth:login:${req.ip}:${email}`;
  checkRateLimit(bucket, { max: 10, windowMs: 10 * 60e3, record: false });
  const user = q.get('SELECT * FROM users WHERE lower(email)=?', [email]);
  const { valid, needsRehash, matched } = user ? await verifyPassword(password, user.password_hash) : { valid: false, needsRehash: false, matched: '' };
  if (!valid) {
    recordRateLimitHit(bucket);
    throw new AppError(401, 'invalid_credentials', 'Email or password is incorrect.');
  }
  if (user.role === 'disabled') throw new AppError(403, 'account_disabled', 'This account is disabled. Contact Twist.');
  clearRateLimit(bucket);
  if (needsRehash) {
    const newHash = await hashPassword(matched);
    update('users', user.id, { password_hash: newHash });
  }
  const store = q.get('SELECT * FROM stores WHERE owner_id=? LIMIT 1', [user.id]);
  const token = signToken(user);
  setAuthCookie(res, token);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, mustChangePassword: !!user.must_change_password },
    store: store ? serializeStore(store) : null,
  });
}));

const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
function userByToken(token) {
  const u = q.get('SELECT id, name, email, setup_expires, token_version FROM users WHERE setup_token_hash=?', [hashToken(token)]);
  if (!u || !u.setup_expires || new Date(u.setup_expires) < new Date()) throw new AppError(410, 'link_expired', 'This link has expired or was already used. Ask Twist for a new one.');
  return u;
}

r.get('/setup/:token', h((req, res) => {
  checkRateLimit(`auth:setup-get:${req.ip}`, { max: 20, windowMs: 10 * 60e3 });
  const u = userByToken(req.params.token);
  const store = q.get('SELECT name_ar FROM stores WHERE owner_id=? LIMIT 1', [u.id]);
  res.json({ email: u.email, name: u.name, store: store?.name_ar || '' });
}));

r.post('/setup/:token', h(async (req, res) => {
  checkRateLimit(`auth:setup-post:${req.ip}`, { max: 10, windowMs: 10 * 60e3 });
  const { password } = z.object({ password: z.string().trim().min(8, 'password_short').max(100) }).parse(req.body);
  const u = userByToken(req.params.token);
  const passwordHash = await hashPassword(password);
  const nextTv = Number(u.token_version ?? 1) + 1;
  update('users', u.id, {
    password_hash: passwordHash,
    setup_token_hash: null,
    setup_expires: null,
    must_change_password: 0,
    token_version: nextTv,
  });
  const user = q.get('SELECT id, name, email, role, token_version, must_change_password FROM users WHERE id=?', [u.id]);
  const store = q.get('SELECT * FROM stores WHERE owner_id=? LIMIT 1', [u.id]);
  const token = signToken(user);
  setAuthCookie(res, token);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, mustChangePassword: false },
    store: store ? serializeStore(store) : null,
  });
}));

r.post('/register', h(async (req, res) => {
  if (!config.allowRegister) throw new AppError(403, 'registration_closed', 'Store accounts are created by the Twist team. Contact us to open your store.');
  const d = z.object({
    name: z.string().trim().min(2, 'required').max(60),
    email: z.string().trim().toLowerCase().email('email_invalid'),
    password: z.string().min(8, 'password_short').max(100),
    store_name: z.string().trim().min(2, 'required').max(60),
    phone: z.string().trim().regex(/^01[0125][0-9]{8}$/, 'phone_invalid'),
  }).parse(req.body);
  checkRateLimit(`auth:register:${req.ip}`, { max: 8, windowMs: 10 * 60e3 });
  if (q.get('SELECT id FROM users WHERE email=?', [d.email])) throw new AppError(422, 'validation_failed', 'Email already registered', { email: 'email_taken' });
  const passwordHash = await hashPassword(d.password);
  const out = tx(() => {
    const uid = insert('users', { name: d.name, email: d.email, password_hash: passwordHash, token_version: 1, must_change_password: 0 });
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
    [['new-in', 'وصل حديثاً', 'New In'], ['tops', 'تيشيرتات وقمصان', 'Tops'], ['bottoms', 'بناطيل', 'Bottoms']].forEach(([catSlug, ar, en], idx) =>
      insert('categories', { store_id: sid, slug: catSlug, name_ar: ar, name_en: en, sort: idx }));
    return { uid, sid };
  });
  notifyPlatformAlert(`محل جديد سجّل: ${d.store_name} - ${d.phone}`);
  const user = q.get('SELECT id, name, email, role, token_version FROM users WHERE id=?', [out.uid]);
  const token = signToken(user);
  setAuthCookie(res, token);
  res.status(201).json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, mustChangePassword: false },
    store: serializeStore(q.get('SELECT * FROM stores WHERE id=?', [out.sid])),
  });
}));

/** "Forgot my password": no automatic reset (anyone could trigger it). It opens WhatsApp to the Twist team with the store's email filled in; the team sends a fresh activation link. */
r.post('/forgot', h((req, res) => {
  const { email } = z.object({ email: z.string().trim().toLowerCase().email('email_invalid') }).parse(req.body);
  checkRateLimit(`auth:forgot:${req.ip}`, { max: 10, windowMs: 10 * 60e3 });
  const text = `أهلاً Twist، نسيت باسورد لوحة المحل. الإيميل: ${email}. محتاج لينك باسورد جديد.`;
  res.json({ wa: `https://wa.me/${config.platformWa}?text=${encodeURIComponent(text)}` });
}));

r.post('/change-password', requireOwner, h(async (req, res) => {
  const { current, password } = z.object({ current: z.string().min(1, 'required').max(100), password: z.string().trim().min(8, 'password_short').max(100) }).parse(req.body);
  const bucket = `auth:pw:${req.ip}:${req.user.id}`;
  checkRateLimit(bucket, { max: 10, windowMs: 10 * 60e3, record: false });
  if (req.user.role === 'demo') throw new AppError(403, 'demo_readonly', 'This is a demo store — changes are disabled.');
  const row = q.get('SELECT password_hash, token_version FROM users WHERE id=?', [req.user.id]);
  const { valid } = row ? await verifyPassword(current, row.password_hash) : { valid: false };
  if (!valid) {
    recordRateLimitHit(bucket);
    throw new AppError(422, 'validation_failed', 'Current password is incorrect.', { current: 'password_wrong' });
  }
  clearRateLimit(bucket);
  const passwordHash = await hashPassword(password);
  const nextTv = Number(row.token_version ?? 1) + 1;
  update('users', req.user.id, {
    password_hash: passwordHash,
    setup_token_hash: null,
    setup_expires: null,
    must_change_password: 0,
    token_version: nextTv,
  });
  const updatedUser = q.get('SELECT id, name, email, role, token_version FROM users WHERE id=?', [req.user.id]);
  const token = signToken(updatedUser);
  setAuthCookie(res, token);
  res.json({ ok: true, token });
}));

r.post('/logout-all', requireOwner, h((req, res) => {
  if (req.user.role === 'demo') throw new AppError(403, 'demo_readonly', 'This is a demo store — changes are disabled.');
  revokeUserSessions(req.user.id);
  clearAuthCookie(res);
  res.json({ ok: true });
}));

r.post('/logout', h((_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
}));

r.get('/me', requireOwner, h((req, res) => {
  const token = signToken(req.user);
  setAuthCookie(res, token);
  res.json({ user: req.user, store: serializeStore(req.store), token });
}));

export default r;
