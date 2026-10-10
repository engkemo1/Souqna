import { encodeDepartments, DEPT_SLUG_RE, decodeDepartments, ORDER_STATUSES } from '@souqna/shared';
import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { q, tx, insert, update } from '../db/index.js';
import { signToken } from '../lib/auth.js';
import { slugify } from '../lib/util.js';
import { config } from '../config.js';
import { h, AppError } from '../lib/errors.js';
import { listDepartments, assertDepartments } from '../lib/departments.js';
import ownerRoutes from './owner.js';
import { serializeStore } from '../lib/serialize.js';
import { verifyTotp } from '../lib/totp.js';
import { snapshotDb, runBackup, lastBackup } from '../lib/backup.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isWhatsAppConfigured, notifyPlatformDelivery } from '../lib/whatsapp.js';

function makeSetupLink(req, uid) {
  const token = crypto.randomBytes(24).toString('base64url');
  const expires = new Date(Date.now() + 7 * 864e5).toISOString();
  update('users', uid, { setup_token_hash: crypto.createHash('sha256').update(token).digest('hex'), setup_expires: expires });
  return { url: `${req.protocol}://${req.get('host')}/setup/${token}`, expires };
}

/** Platform-admin API. Every request must carry the x-admin-key header (env ADMIN_KEY). */
const r = Router();

const failed = new Map();
const SESSION_MS = 12 * 3600e3;
const sign = (exp) => crypto.createHmac('sha256', `${config.jwtSecret}|${config.adminKey}|${config.adminTotpSecret}`).update(`admin-session:${exp}`).digest('base64url');
const makeSession = () => { const exp = Date.now() + SESSION_MS; return `${exp}.${sign(exp)}`; };
const validSession = (tok) => {
  const [exp, mac] = String(tok || '').split('.');
  if (!exp || !mac || !(Number(exp) > Date.now())) return false;
  const a = Buffer.from(mac), b = Buffer.from(sign(exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const sameKey = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
r.use((req, _res, next) => {
  if (!config.adminKey) return next(new AppError(503, 'admin_disabled', 'ADMIN_KEY is not set on the server.'));
  const recent = (failed.get(req.ip) || []).filter((t) => Date.now() - t < 10 * 60e3);
  if (recent.length >= 15) return next(new AppError(429, 'too_many_attempts', 'Too many wrong keys. Wait a few minutes.'));
  if (!sameKey(req.headers['x-admin-key'], config.adminKey)) {
    failed.set(req.ip, [...recent, Date.now()]);
    return next(new AppError(401, 'unauthorized', 'Wrong admin key.'));
  }
  if (config.adminTotpSecret && req.path !== '/login' && !validSession(req.headers['x-admin-session'])) {
    return next(new AppError(401, 'totp_required', 'Two-step confirmation required.'));
  }
  next();
});

/** Step 2 of admin sign-in. The key (checked above) + a 6-digit authenticator code → a 12-hour session proof. */
let lastStep = 0;
r.post('/login', h((req, res) => {
  if (!config.adminTotpSecret) return res.json({ session: null, twoStep: false });
  const { code } = z.object({ code: z.string().max(12).optional() }).parse(req.body || {});
  if (!code) throw new AppError(401, 'totp_required', 'Two-step confirmation required.');
  const recent = (failed.get(`t:${req.ip}`) || []).filter((t) => Date.now() - t < 10 * 60e3);
  if (recent.length >= 6) throw new AppError(429, 'too_many_attempts', 'Too many wrong codes. Wait a few minutes.');
  const step = verifyTotp(config.adminTotpSecret, code);
  if (step == null || step <= lastStep) {
    failed.set(`t:${req.ip}`, [...recent, Date.now()]);
    throw new AppError(401, 'bad_code', step == null ? 'Wrong code.' : 'That code was already used. Wait for the next one.');
  }
  lastStep = step;
  res.json({ session: makeSession(), twoStep: true });
}));

/** Orders Banha Outfit has to collect from stores and deliver. */
r.get('/deliveries', h((_req, res) => {
  const rows = q.all(`SELECT o.id, o.number, o.status, o.total, o.customer_name, o.phone, o.governorate, o.city, o.address, o.notes, o.created_at, o.handoff_at,
      s.slug, s.name_ar AS store_name, s.phone AS store_phone, s.address_ar AS store_address, s.map_url AS store_map
    FROM orders o JOIN stores s ON s.id=o.store_id
    WHERE o.delivery_by='platform' AND o.status NOT IN ('delivered','cancelled') ORDER BY o.created_at ASC LIMIT 300`);
  res.json({ orders: rows });
}));

r.patch('/orders/:id/status', h((req, res) => {
  const { status } = z.object({ status: z.enum(['shipped', 'delivered']) }).parse(req.body);
  const o = q.get("SELECT * FROM orders WHERE id=? AND delivery_by='platform'", [Number(req.params.id)]);
  if (!o) throw new AppError(404, 'not_found', 'Order not found.');
  const ok = (status === 'shipped' && o.status === 'processing') || (status === 'delivered' && o.status === 'shipped');
  if (!ok) throw new AppError(400, 'invalid_transition', status === 'shipped' ? 'The store has not marked this order ready yet.' : 'Pick the order up first.');
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  tx(() => {
    q.run('UPDATE orders SET status=?, updated_at=? WHERE id=?', [status, now, o.id]);
    insert('order_events', { order_id: o.id, status, note: null, created_at: now });
  });
  res.json({ id: o.id, status });
}));

/**
 * Manage any store from the admin: the whole store-owner API (products, media, categories, …) re-mounted here,
 * guarded by the admin key above — no owner login or token is ever created.
 */
function asStore(req, _res, next) {
  const store = q.get('SELECT * FROM stores WHERE slug=?', [req.params.slug]);
  if (!store) return next(new AppError(404, 'not_found', 'Store not found.'));
  const user = q.get('SELECT id, name, email, role FROM users WHERE id=?', [store.owner_id]);
  req.adminStore = true;
  req.store = store;
  req.user = user;
  next();
}
r.get('/stores/:slug/me', (req, res, next) => asStore(req, res, (e) => (e ? next(e) : res.json({ store: serializeStore(req.store) }))));
r.use('/stores/:slug/as', asStore, ownerRoutes);

/* ---------------------------------------------------------- store performance report */

const ts = (s) => (s ? Date.parse(String(s).replace(' ', 'T') + 'Z') : NaN);
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

r.get('/reports/stores', h((req, res) => {
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 19).replace('T', ' ');
  const stores = q.all("SELECT s.id, s.slug, s.name_ar, s.phone, s.created_at, s.status, u.name AS owner_name FROM stores s LEFT JOIN users u ON u.id=s.owner_id");
  const orders = q.all(`SELECT o.store_id, o.status, o.total, o.platform_discount, o.delivery_by, o.created_at,
      (SELECT MIN(e.created_at) FROM order_events e WHERE e.order_id=o.id AND e.status='confirmed') AS confirmed_at,
      (SELECT MIN(e.created_at) FROM order_events e WHERE e.order_id=o.id AND e.status='delivered') AS delivered_at
    FROM orders o WHERE o.created_at >= ?`, [since]);
  const by = new Map(stores.map((s) => [s.id, []]));
  for (const o of orders) by.get(o.store_id)?.push(o);
  const now = Date.now();
  const rows = stores.map((s) => {
    const os = by.get(s.id) || [];
    const live = os.filter((o) => o.status !== 'cancelled');
    const cancelled = os.length - live.length;
    const confirmMin = avg(os.filter((o) => o.confirmed_at).map((o) => (ts(o.confirmed_at) - ts(o.created_at)) / 60000).filter((m) => m >= 0));
    const deliverHrs = avg(os.filter((o) => o.delivered_at).map((o) => (ts(o.delivered_at) - ts(o.created_at)) / 3600000).filter((m) => m >= 0));
    const overdue = os.filter((o) => o.status === 'pending' && now - ts(o.created_at) > 2 * 3600e3).length;
    const revenue = live.reduce((a, o) => a + o.total, 0);
    const out = {
      id: s.id, slug: s.slug, name: s.name_ar, owner: s.owner_name, phone: s.phone, status: s.status,
      orders: os.length, revenue, avgOrder: live.length ? Math.round(revenue / live.length) : 0,
      cancelled, cancelRate: os.length ? Math.round((cancelled / os.length) * 100) : 0,
      confirmMinutes: confirmMin == null ? null : Math.round(confirmMin), deliverHours: deliverHrs == null ? null : Math.round(deliverHrs * 10) / 10,
      overdue, platformOrders: os.filter((o) => o.delivery_by === 'platform').length,
      owed: os.filter((o) => o.status !== 'cancelled').reduce((a, o) => a + (o.platform_discount || 0), 0),
    };
    const flags = [];
    if (overdue > 0) flags.push('overdue');
    else if (out.confirmMinutes != null && out.confirmMinutes > 60) flags.push('slow');
    if (out.orders >= 5 && out.cancelRate >= 20) flags.push('cancels');
    if (out.orders === 0 && now - ts(s.created_at) > 7 * 864e5) flags.push('quiet');
    return { ...out, flags };
  });
  const all = rows.reduce((a, r2) => ({ orders: a.orders + r2.orders, revenue: a.revenue + r2.revenue, cancelled: a.cancelled + r2.cancelled, owed: a.owed + r2.owed }), { orders: 0, revenue: 0, cancelled: 0, owed: 0 });
  const mins = rows.filter((r2) => r2.confirmMinutes != null);
  res.json({
    days,
    totals: { ...all, cancelRate: all.orders ? Math.round((all.cancelled / all.orders) * 100) : 0, confirmMinutes: mins.length ? Math.round(mins.reduce((a, r2) => a + r2.confirmMinutes, 0) / mins.length) : null, stores: rows.length, needAttention: rows.filter((r2) => r2.flags.length).length },
    items: rows.sort((a, b) => b.revenue - a.revenue),
  });
}));

/* ---------------------------------------------------------- platform coupons (funded by Banha Outfit) */

const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,20}$/, 'code_invalid'),
  type: z.enum(['percentage', 'fixed', 'free_shipping']),
  value: z.coerce.number().int().min(0).max(100000).default(0),
  max_discount: z.coerce.number().int().min(1).max(100000).nullable().optional(),
  min_subtotal: z.coerce.number().int().min(0).max(1_000_000).default(0),
  first_order_only: z.boolean().default(false),
  per_phone_limit: z.coerce.number().int().min(1).max(100).default(1),
  title_ar: z.string().trim().min(2).max(80),
  title_en: z.string().trim().min(2).max(80),
  starts_at: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).nullable().optional(),
  ends_at: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).nullable().optional(),
  usage_limit: z.coerce.number().int().min(1).max(1_000_000).nullable().optional(),
  promoted: z.boolean().default(false),
  active: z.boolean().default(true),
}).superRefine((d, ctx) => {
  if (d.type === 'percentage' && (d.value < 1 || d.value > 100)) ctx.addIssue({ code: 'custom', path: ['value'], message: 'percent_range' });
  if (d.type === 'fixed' && d.value < 1) ctx.addIssue({ code: 'custom', path: ['value'], message: 'value_required' });
});
const couponRow = (d) => ({
  code: d.code, type: d.type, value: d.type === 'free_shipping' ? 0 : d.value, max_discount: d.type === 'percentage' ? d.max_discount || null : null, min_subtotal: d.min_subtotal,
  first_order_only: d.first_order_only ? 1 : 0, per_phone_limit: d.per_phone_limit, title_ar: d.title_ar, title_en: d.title_en,
  starts_at: d.starts_at || null, ends_at: d.ends_at || null, usage_limit: d.usage_limit || null, promoted: d.promoted ? 1 : 0, active: d.active ? 1 : 0,
});

r.get('/coupons', h((_req, res) => {
  const rows = q.all(`SELECT c.*, (SELECT COUNT(*) FROM orders o WHERE UPPER(o.coupon_code)=UPPER(c.code) AND o.platform_discount>0 AND o.status<>'cancelled') AS orders_count,
      (SELECT COALESCE(SUM(o.platform_discount),0) FROM orders o WHERE UPPER(o.coupon_code)=UPPER(c.code) AND o.platform_discount>0 AND o.status<>'cancelled') AS discount_total
    FROM platform_coupons c ORDER BY c.active DESC, c.id DESC`);
  res.json({ items: rows.map((c) => ({ ...c, first_order_only: !!c.first_order_only, promoted: !!c.promoted, active: !!c.active })) });
}));
r.post('/coupons', h((req, res) => {
  const d = couponSchema.parse(req.body);
  if (q.val('SELECT id FROM platform_coupons WHERE UPPER(code)=?', [d.code])) throw new AppError(422, 'validation_failed', 'Code already used', { code: 'code_taken' });
  if (d.promoted) q.run('UPDATE platform_coupons SET promoted=0');
  res.status(201).json({ id: insert('platform_coupons', couponRow(d)) });
}));
r.put('/coupons/:id', h((req, res) => {
  const c = q.get('SELECT id FROM platform_coupons WHERE id=?', [Number(req.params.id)]);
  if (!c) throw new AppError(404, 'not_found', 'Coupon not found.');
  const d = couponSchema.parse(req.body);
  if (q.val('SELECT id FROM platform_coupons WHERE UPPER(code)=? AND id<>?', [d.code, c.id])) throw new AppError(422, 'validation_failed', 'Code already used', { code: 'code_taken' });
  if (d.promoted) q.run('UPDATE platform_coupons SET promoted=0 WHERE id<>?', [c.id]);
  update('platform_coupons', c.id, couponRow(d));
  res.json({ id: c.id });
}));
r.delete('/coupons/:id', h((req, res) => {
  const c = q.get('SELECT id, usage_count FROM platform_coupons WHERE id=?', [Number(req.params.id)]);
  if (!c) throw new AppError(404, 'not_found', 'Coupon not found.');
  if (c.usage_count > 0) { update('platform_coupons', c.id, { active: 0, promoted: 0 }); return res.json({ deactivated: true }); } // keep history for settlement
  q.run('DELETE FROM platform_coupons WHERE id=?', [c.id]);
  res.json({ deleted: true });
}));

const SERVICE_STATUSES = ['new', 'contacted', 'scheduled', 'done', 'cancelled'];
r.get('/services', h((req, res) => {
  const status = String(req.query.status || 'all');
  const where = SERVICE_STATUSES.includes(status) ? 'WHERE r.status=?' : '';
  const rows = q.all(`SELECT r.*, s.name_ar AS store_name, s.slug, s.phone AS store_phone, s.address_ar AS store_address
    FROM service_requests r JOIN stores s ON s.id=r.store_id ${where} ORDER BY (r.status='new') DESC, r.created_at DESC LIMIT 200`, where ? [status] : []);
  const counts = Object.fromEntries(q.all('SELECT status, COUNT(*) AS c FROM service_requests GROUP BY status').map((x) => [x.status, x.c]));
  counts.all = Object.values(counts).reduce((a, b) => a + b, 0);
  res.json({ items: rows, counts });
}));
r.patch('/services/:id', h((req, res) => {
  const body = z.object({ status: z.enum(SERVICE_STATUSES).optional(), admin_note: z.string().trim().max(500).optional() }).parse(req.body);
  const row = q.get('SELECT id FROM service_requests WHERE id=?', [Number(req.params.id)]);
  if (!row) throw new AppError(404, 'not_found', 'Request not found.');
  update('service_requests', row.id, { status: body.status, admin_note: body.admin_note, updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ') });
  res.json({ id: row.id });
}));

const demoPasswordsUnchanged = () => {
  const u = q.get("SELECT password_hash FROM users WHERE LOWER(email)='townstyle@banhalook.app'");
  return !!u && ['TownStyle#2026', 'demo1234'].some((p) => bcrypt.compareSync(p, u.password_hash));
};

r.get('/status', h((_req, res) => {
  const insecureJwt = config.jwtSecret.startsWith('dev-only') || config.jwtSecret.length < 24;
  res.json({
    backup: lastBackup(), backupDir: !!config.backupDir,
    whatsappConfigured: isWhatsAppConfigured(), template: config.wa.template, registrationOpen: config.allowRegister,
    env: config.env, node: process.version, uptimeSec: Math.round(process.uptime()),
    checks: [
      { id: 'jwt', ok: !insecureJwt, label: 'JWT_SECRET قوي ومتغيّر', fix: 'اضبط JWT_SECRET بقيمة عشوائية طويلة (32+ حرف).' },
      { id: 'admin', ok: config.adminKey.length >= 16, label: 'ADMIN_KEY قوي (16+ حرف)', fix: 'اضبط ADMIN_KEY بقيمة طويلة.' },
      { id: 'totp', ok: !!config.adminTotpSecret, label: 'تأكيد خطوتين لدخول الأدمن', fix: 'شغّل npm run admin-totp -w server واضبط ADMIN_TOTP_SECRET.' },
      { id: 'backup', ok: !!lastBackup() && Date.now() - Date.parse(lastBackup().at) < 36 * 3600e3, label: 'نسخة احتياطية يومية (قاعدة البيانات + الصور)', fix: 'اضبط BACKUP_DIR على مجلد على قرص دائم.' },
      { id: 'demo-pw', ok: !demoPasswordsUnchanged(), label: 'باسورد حساب تاون ستايل التجريبي اتغيّر', fix: 'npm run set-password -w server -- townstyle@banhalook.app' },
      { id: 'register', ok: !config.allowRegister, label: 'التسجيل العام مقفول', fix: 'شيل ALLOW_REGISTER=1.' },
      { id: 'prod', ok: config.env === 'production', label: 'NODE_ENV=production', fix: 'اضبط NODE_ENV=production.' },
      { id: 'wa', ok: isWhatsAppConfigured(), label: 'واتساب API متوصل (اختياري)', optional: true, fix: 'اضبط WA_TOKEN و WA_PHONE_ID.' },
    ],
  });
}));

/** One-click download of a consistent database copy (for off-site safekeeping). Photos are covered by `npm run backup` / BACKUP_DIR. */
r.get('/backup/db', h((_req, res, next) => {
  const tmp = path.join(os.tmpdir(), `bo-dl-${crypto.randomBytes(6).toString('hex')}.db`);
  snapshotDb(tmp);
  res.download(tmp, `banha-outfit-${new Date().toISOString().slice(0, 10)}.db`, (err) => { fs.rm(tmp, { force: true }, () => {}); if (err) next(err); });
}));
r.post('/backup/run', h((_req, res) => {
  if (!config.backupDir) throw new AppError(400, 'backup_not_configured', 'BACKUP_DIR is not set on the server.');
  res.json(runBackup());
}));

/** Polled by the admin UI: new delivery requests since a timestamp + live counters. */
r.get('/notifications', h((req, res) => {
  const since = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(req.query.since || '')) ? String(req.query.since) : '1970-01-01 00:00:00';
  const items = q.all(`SELECT o.id, o.number, o.total, o.status, COALESCE(o.handoff_at, o.created_at) AS at, CASE WHEN o.handoff_at IS NULL THEN 'new' ELSE 'handoff' END AS kind, s.name_ar AS store_name
    FROM orders o JOIN stores s ON s.id=o.store_id WHERE o.delivery_by='platform' AND COALESCE(o.handoff_at, o.created_at) > ? ORDER BY at DESC LIMIT 10`, [since]);
  const services = q.all("SELECT r.id, r.plan, r.type, r.created_at AS at, s.name_ar AS store_name FROM service_requests r JOIN stores s ON s.id=r.store_id WHERE r.created_at > ? ORDER BY r.created_at DESC LIMIT 10", [since]);
  res.json({
    services, servicesNew: q.val("SELECT COUNT(*) FROM service_requests WHERE status='new'"),
    items, now: new Date().toISOString().slice(0, 19).replace('T', ' '),
    open: q.val("SELECT COUNT(*) FROM orders WHERE delivery_by='platform' AND status NOT IN ('delivered','cancelled')"),
    ready: q.val("SELECT COUNT(*) FROM orders WHERE delivery_by='platform' AND status='processing'"),
  });
}));

const LOCAL_DAY = "date(created_at, '+3 hours')";
r.get('/overview', h((_req, res) => {
  const cairo = new Date(Date.now() + 3 * 3600e3);
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(new Date(cairo.getTime() - i * 864e5).toISOString().slice(0, 10));
  const byDay = new Map(q.all(`SELECT ${LOCAL_DAY} AS d, COUNT(*) AS orders, COALESCE(SUM(CASE WHEN status<>'cancelled' THEN total END),0) AS revenue FROM orders WHERE ${LOCAL_DAY} >= ? GROUP BY d`, [days[0]]).map((x) => [x.d, x]));
  const series = days.map((d) => ({ date: d, orders: byDay.get(d)?.orders || 0, sales: byDay.get(d)?.revenue || 0 }));
  const today = days[days.length - 1];
  const t = byDay.get(today) || { orders: 0, revenue: 0 };
  const totals = {
    stores: q.val("SELECT COUNT(*) FROM stores WHERE status='active'"), storesHidden: q.val("SELECT COUNT(*) FROM stores WHERE status='active' AND hidden=1"), storesSuspended: q.val("SELECT COUNT(*) FROM stores WHERE status<>'active'"),
    products: q.val("SELECT COUNT(*) FROM products WHERE status='active'"),
    orders: q.val('SELECT COUNT(*) FROM orders'), revenue: q.val("SELECT COALESCE(SUM(total),0) FROM orders WHERE status<>'cancelled'"),
    customers: q.val('SELECT COUNT(*) FROM customers'),
    ordersToday: t.orders, revenueToday: t.revenue,
    pending: q.val("SELECT COUNT(*) FROM orders WHERE status='pending'"),
    servicesNew: q.val("SELECT COUNT(*) FROM service_requests WHERE status='new'"),
    deliveriesOpen: q.val("SELECT COUNT(*) FROM orders WHERE delivery_by='platform' AND status NOT IN ('delivered','cancelled')"),
    deliveriesReady: q.val("SELECT COUNT(*) FROM orders WHERE delivery_by='platform' AND status='processing'"),
    deliveriesDone: q.val("SELECT COUNT(*) FROM orders WHERE delivery_by='platform' AND status='delivered'"),
    cashToCollect: q.val("SELECT COALESCE(SUM(total),0) FROM orders WHERE delivery_by='platform' AND status='shipped'"),
  };
  const topStores = q.all(`SELECT s.slug, s.name_ar, COUNT(o.id) AS orders, COALESCE(SUM(o.total),0) AS revenue FROM stores s JOIN orders o ON o.store_id=s.id
    WHERE o.status<>'cancelled' AND date(o.created_at,'+3 hours') >= ? GROUP BY s.id ORDER BY revenue DESC LIMIT 5`, [days[0]]);
  const statusCounts = Object.fromEntries(q.all('SELECT status, COUNT(*) AS c FROM orders GROUP BY status').map((x) => [x.status, x.c]));
  const deptCount = new Map();
  for (const row of q.all("SELECT departments FROM stores WHERE status='active'")) for (const d of decodeDepartments(row.departments)) deptCount.set(d, (deptCount.get(d) || 0) + 1);
  const recent = q.all(`SELECT o.id, o.number, o.status, o.total, o.delivery_by, o.customer_name, o.created_at, s.name_ar AS store_name, s.slug FROM orders o JOIN stores s ON s.id=o.store_id ORDER BY o.created_at DESC LIMIT 8`);
  res.json({ totals, series, topStores, statusCounts, departments: [...deptCount].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count), recent });
}));

r.get('/orders', h((req, res) => {
  const { status = 'all', delivery = 'all', store = '', q: term = '', page = '1' } = req.query;
  const where = ['1=1']; const params = [];
  if (status !== 'all' && ORDER_STATUSES.includes(String(status))) { where.push('o.status=?'); params.push(String(status)); }
  if (delivery === 'platform' || delivery === 'store') { where.push('o.delivery_by=?'); params.push(String(delivery)); }
  if (store) { where.push('s.slug=?'); params.push(String(store)); }
  if (term) { const like = `%${String(term).slice(0, 60)}%`; where.push('(o.number LIKE ? OR o.customer_name LIKE ? OR o.phone LIKE ?)'); params.push(like, like, like); }
  const limit = 25; const pg = Math.max(1, Math.min(1000, parseInt(page, 10) || 1));
  const from = `FROM orders o JOIN stores s ON s.id=o.store_id WHERE ${where.join(' AND ')}`;
  const total = q.val(`SELECT COUNT(*) ${from}`, params);
  const items = q.all(`SELECT o.id, o.number, o.status, o.total, o.delivery_by, o.customer_name, o.phone, o.governorate, o.city, o.address, o.notes, o.created_at, o.handoff_at, s.name_ar AS store_name, s.slug, s.phone AS store_phone
    ${from} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, (pg - 1) * limit]);
  const counts = Object.fromEntries(q.all('SELECT status, COUNT(*) AS c FROM orders GROUP BY status').map((x) => [x.status, x.c]));
  counts.all = Object.values(counts).reduce((a, b) => a + b, 0);
  res.json({ items, total, page: pg, pages: Math.max(1, Math.ceil(total / limit)), counts });
}));

r.get('/orders/:id', h((req, res) => {
  const o = q.get('SELECT o.*, s.name_ar AS store_name, s.slug, s.phone AS store_phone, s.address_ar AS store_address, s.map_url AS store_map FROM orders o JOIN stores s ON s.id=o.store_id WHERE o.id=?', [Number(req.params.id)]);
  if (!o) throw new AppError(404, 'not_found', 'Order not found.');
  res.json({ order: o, items: q.all('SELECT name_ar, color, size, price, qty FROM order_items WHERE order_id=?', [o.id]), events: q.all('SELECT status, note, created_at FROM order_events WHERE order_id=? ORDER BY id', [o.id]) });
}));

r.patch('/orders/:id/delivery', h((req, res) => {
  const { delivery_by } = z.object({ delivery_by: z.enum(['platform', 'store']) }).parse(req.body);
  const o = q.get('SELECT * FROM orders WHERE id=?', [Number(req.params.id)]);
  if (!o) throw new AppError(404, 'not_found', 'Order not found.');
  if (!['pending', 'confirmed', 'processing'].includes(o.status)) throw new AppError(400, 'invalid_transition', 'Too late to change delivery for this order.');
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  tx(() => {
    q.run('UPDATE orders SET delivery_by=?, handoff_at=?, updated_at=? WHERE id=?', [delivery_by, delivery_by === 'platform' ? now : null, now, o.id]);
    insert('order_events', { order_id: o.id, status: o.status, note: delivery_by === 'platform' ? '@handoff' : '@store_delivery', created_at: now });
  });
  if (delivery_by === 'platform') notifyPlatformDelivery(o.id, o.number);
  res.json({ id: o.id, delivery_by });
}));

r.get('/stores', h((_req, res) => {
  const stores = q.all(`
    SELECT s.id, s.slug, s.name_ar, s.name_en, s.phone, s.whatsapp, s.auto_whatsapp, s.hidden, s.featured, s.sort_order, s.status, s.delivery_mode, s.departments, s.category, s.created_at,
      u.email AS owner_email, u.name AS owner_name, u.role,
      (SELECT COUNT(*) FROM products p WHERE p.store_id = s.id) AS products_count,
      (SELECT COUNT(*) FROM orders o WHERE o.store_id = s.id) AS orders_count,
      (SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.store_id = s.id AND o.status <> 'cancelled') AS revenue,
      (SELECT MAX(created_at) FROM orders o WHERE o.store_id = s.id) AS last_order_at
    FROM stores s JOIN users u ON u.id = s.owner_id ORDER BY s.sort_order, s.id`);
  res.json({ stores: stores.map((s) => ({ ...s, departments: decodeDepartments(s.departments), auto_whatsapp: Boolean(s.auto_whatsapp), hidden: Boolean(s.hidden), featured: Boolean(s.featured), owner_disabled: s.role === 'disabled' })) });
}));

r.patch('/stores/:slug', h((req, res) => {
  const body = z.object({
    auto_whatsapp: z.boolean().optional(), hidden: z.boolean().optional(), featured: z.boolean().optional(),
    sort_order: z.coerce.number().int().min(0).max(9999).optional(), delivery_mode: z.enum(['store', 'platform']).optional(),
    status: z.enum(['active', 'suspended']).optional(), owner_disabled: z.boolean().optional(),
    departments: z.array(z.string().max(31)).min(1).optional(),
    name_ar: z.string().trim().min(2).max(60).optional(), name_en: z.string().trim().min(2).max(60).optional(),
    phone: z.string().trim().regex(/^01[0125][0-9]{8}$/, 'phone_invalid').optional(),
  }).parse(req.body);
  const store = q.get('SELECT id, owner_id FROM stores WHERE slug=?', [req.params.slug]);
  if (!store) throw new AppError(404, 'not_found', 'Store not found.');
  const patch = {};
  for (const k of ['hidden', 'featured', 'auto_whatsapp']) if (body[k] !== undefined) patch[k] = body[k] ? 1 : 0;
  for (const k of ['sort_order', 'delivery_mode', 'status', 'name_ar', 'name_en', 'phone']) if (body[k] !== undefined) patch[k] = body[k];
  if (body.departments) { assertDepartments(body.departments); patch.departments = encodeDepartments(body.departments); patch.category = body.departments.length === 1 ? body.departments[0] : 'mixed'; }
  update('stores', store.id, patch);
  if (body.owner_disabled !== undefined) q.run("UPDATE users SET role=? WHERE id=? AND role<>'demo'", [body.owner_disabled ? 'disabled' : 'owner', store.owner_id]);
  res.json({ slug: req.params.slug });
}));

const createSchema = z.object({
  store_name: z.string().trim().min(2).max(60),
  owner_name: z.string().trim().min(2).max(60),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(100).optional(),
  phone: z.string().trim().regex(/^01[0125][0-9]{8}$/, 'phone_invalid'),
  whatsapp: z.string().trim().regex(/^01[0125][0-9]{8}$/, 'phone_invalid').optional(),
  departments: z.array(z.string().max(31)).min(1, 'departments_required'),
  address: z.string().trim().max(160).optional(),
  map_url: z.string().trim().url().max(400).optional(),
  opens_at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  closes_at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  auto_whatsapp: z.boolean().default(false),
});

r.post('/stores', h((req, res) => {
  const d = createSchema.parse(req.body);
  assertDepartments(d.departments);
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
      owner_id: uid, slug, code, name_ar: d.store_name, name_en: d.store_name, category: d.departments.length === 1 ? d.departments[0] : 'mixed', departments: encodeDepartments(d.departments),
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

/* ------------------------------------------------ departments (managed by the team) */
const deptSchema = z.object({
  name_ar: z.string().trim().min(2).max(40), name_en: z.string().trim().min(2).max(40),
  sizes: z.array(z.string().trim().min(1).max(12)).max(40).default([]),
  sort: z.coerce.number().int().min(0).max(999).optional(), active: z.boolean().optional(),
});
r.get('/departments', h((_req, res) => res.json({ departments: listDepartments({ all: true }) })));
r.post('/departments', h((req, res) => {
  const body = deptSchema.extend({ slug: z.string().trim().toLowerCase().optional() }).parse(req.body);
  let slug = (body.slug || body.name_en).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);
  if (!DEPT_SLUG_RE.test(slug)) throw new AppError(422, 'validation_failed', 'Use an English key like "perfumes".', { slug: 'slug_invalid' });
  if (q.get('SELECT id FROM departments WHERE slug=?', [slug])) throw new AppError(422, 'validation_failed', 'This department already exists.', { slug: 'slug_taken' });
  const sort = body.sort ?? (q.val('SELECT COALESCE(MAX(sort),0)+1 FROM departments'));
  insert('departments', { slug, name_ar: body.name_ar, name_en: body.name_en, sizes_json: JSON.stringify([...new Set(body.sizes)]), sort, active: 1 });
  res.status(201).json({ departments: listDepartments({ all: true }) });
}));
r.patch('/departments/:id', h((req, res) => {
  const body = deptSchema.partial().parse(req.body);
  const d = q.get('SELECT * FROM departments WHERE id=?', [Number(req.params.id)]);
  if (!d) throw new AppError(404, 'not_found', 'Department not found.');
  update('departments', d.id, {
    name_ar: body.name_ar, name_en: body.name_en, sort: body.sort,
    sizes_json: body.sizes ? JSON.stringify([...new Set(body.sizes)]) : undefined,
    active: body.active === undefined ? undefined : body.active ? 1 : 0,
  });
  res.json({ departments: listDepartments({ all: true }) });
}));
r.delete('/departments/:id', h((req, res) => {
  const d = q.get('SELECT * FROM departments WHERE id=?', [Number(req.params.id)]);
  if (!d) throw new AppError(404, 'not_found', 'Department not found.');
  const used = q.val("SELECT COUNT(*) FROM stores WHERE departments LIKE '%,' || ? || ',%'", [d.slug]);
  if (used) throw new AppError(409, 'department_in_use', `${used} stores use this department — deactivate it instead, or move the stores first.`);
  q.run('DELETE FROM departments WHERE id=?', [d.id]);
  res.json({ departments: listDepartments({ all: true }) });
}));

r.get('/stores/:slug/products', h((req, res) => {
  const store = q.get('SELECT id FROM stores WHERE slug=?', [req.params.slug]);
  if (!store) throw new AppError(404, 'not_found', 'Store not found.');
  const rows = q.all('SELECT id, name_ar, name_en, price, stock, status, featured, (SELECT COUNT(*) FROM variants v WHERE v.product_id=products.id) AS variants FROM products WHERE store_id=? ORDER BY featured DESC, id DESC', [store.id]);
  res.json({ products: rows.map((p) => ({ ...p, featured: Boolean(p.featured) })) });
}));

r.patch('/stores/:slug/products/:id', h((req, res) => {
  const body = z.object({
    featured: z.boolean().optional(),
    price: z.coerce.number().int().min(1).max(1_000_000).optional(),
    stock: z.coerce.number().int().min(0).max(100000).optional(),
    status: z.enum(['active', 'draft', 'archived']).optional(),
  }).parse(req.body);
  const p = q.get('SELECT p.id, p.price, p.compare_at_price FROM products p JOIN stores s ON s.id=p.store_id WHERE s.slug=? AND p.id=?', [req.params.slug, Number(req.params.id)]);
  if (!p) throw new AppError(404, 'not_found', 'Product not found.');
  if (body.price !== undefined && p.compare_at_price && p.compare_at_price <= body.price) throw new AppError(422, 'validation_failed', 'Compare-at price must be higher than price.', { price: 'compare_gt_price' });
  if (body.stock !== undefined && q.val('SELECT COUNT(*) FROM variants WHERE product_id=?', [p.id]) > 0) throw new AppError(400, 'has_variants', 'This product has variants — edit stock per variant in the full editor.');
  update('products', p.id, {
    featured: body.featured === undefined ? undefined : body.featured ? 1 : 0, price: body.price, stock: body.stock, status: body.status,
    updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
  });
  const np = q.get('SELECT id, price, stock, status, featured FROM products WHERE id=?', [p.id]);
  res.json({ ...np, featured: !!np.featured });
}));

r.post('/stores/:slug/setup-link', h((req, res) => {
  const user = q.get('SELECT u.id FROM stores s JOIN users u ON u.id=s.owner_id WHERE s.slug=?', [req.params.slug]);
  if (!user) throw new AppError(404, 'not_found', 'Store not found.');
  res.json(makeSetupLink(req, user.id));
}));

export default r;
