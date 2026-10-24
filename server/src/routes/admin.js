import { encodeDepartments, DEPT_SLUG_RE, decodeDepartments, ORDER_STATUSES } from '@souqna/shared';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { q, tx, insert, update } from '../db/index.js';
import { signToken } from '../lib/auth.js';
import { slugify, latinSlug } from '../lib/util.js';
import { config } from '../config.js';
import { h, AppError } from '../lib/errors.js';
import { listDepartments, assertDepartments, ensureDeptCategories, deptAncestors } from '../lib/departments.js';
import ownerRoutes from './owner.js';
import { purgeMediaFiles } from '../lib/media.js';
import { visualStatus, saveVisualSettings, triggerReindex } from '../lib/visual.js';
import { unmetDemand, demandTotals, demandForOwnersEnabled, setDemandForOwners } from '../lib/visual-demand.js';
import { testProvider, stylistStatus, saveStylistSettings, providerReady, stylistTrainingSettings, saveStylistTrainingGuidance, addStylistTrainingExample, deleteStylistTrainingExample, addStylistTrainingLesson, deleteStylistTrainingLesson, approveStylistTrainingLesson, stylistFeedback, deleteStylistFeedback, teachFromStylistFeedback, lookOfDayAdminSettings, saveLookOfDayAdminSettings, searchLookOfDayProducts, generateLookOfDayProposal, approveLookOfDayProposal, discardLookOfDayProposal, modaLabSettings, saveModaLabScenario, deleteModaLabScenario, runModaLabScenario, runAllModaLabScenarios } from '../lib/stylist.js';
import { llmChain } from '../lib/stylist.js';
import { adminModaPrompts, saveModaPrompts, resetModaPrompts, suggestPrompts } from '../lib/modaPrompts.js';
import { saveDeptImage, removeDeptImage, saveStylistAvatar, saveHomepageAdImage, saveLookOfDayImage } from '../lib/deptImage.js';
import { notifyBuyer, notifyOrderStatus } from '../lib/buyers.js';
import { serializeStore } from '../lib/serialize.js';
import { verifyTotp } from '../lib/totp.js';
import { snapshotDb, runBackup, lastBackup, runOffsiteBackup, lastOffsite } from '../lib/backup.js';
import { offsiteEnabled, r2Enabled } from '../lib/r2.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isWhatsAppConfigured, notifyPlatformDelivery } from '../lib/whatsapp.js';
import { mountCashierAdmin } from './admin-cashier.js';
import { cashierAccess } from '../lib/cashier-access.js';
import { CASHIER_SYSTEMS, CASHIER_IDS, CASHIER_LINK_STATUSES } from '../lib/cashier-catalog.js';
import { deliveryFeeForDistance, getDeliveryPricing, saveDeliveryPricing, getZonePolicy, saveZonePolicy, zoneKey } from '../lib/deliveryRates.js';

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

const subscriptionDateParts = (date) => String(date).split('-').map(Number);
const subscriptionToday = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
};
const subscriptionAddDays = (date, days) => {
  const [y, m, d] = subscriptionDateParts(date);
  const value = new Date(Date.UTC(y, m - 1, d + days));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
};
const subscriptionAddMonths = (date, months) => {
  const [year, month, day] = subscriptionDateParts(date);
  const monthIndex = month - 1 + months;
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const targetDay = Math.min(day, new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate());
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
};
const subscriptionSetting = (key, fallback) => q.get('SELECT value FROM app_settings WHERE key=?', [key])?.value ?? fallback;
const subscriptionWindow = (storeId, months, kind, amount, paymentMethod, note) => {
  const today = subscriptionToday();
  const current = q.get('SELECT covered_through FROM store_subscriptions WHERE store_id=?', [storeId]);
  const start = current?.covered_through && current.covered_through >= today ? subscriptionAddDays(current.covered_through, 1) : today;
  const through = subscriptionAddDays(subscriptionAddMonths(start, months), -1);
  q.run(`INSERT INTO store_subscriptions(store_id,covered_through,updated_at) VALUES(?,?,datetime('now'))
    ON CONFLICT(store_id) DO UPDATE SET covered_through=excluded.covered_through,updated_at=excluded.updated_at`, [storeId, through]);
  insert('subscription_periods', { store_id: storeId, kind, months, amount, covered_from: start, covered_through: through, payment_method: paymentMethod, note: note || null, created_at: new Date().toISOString().slice(0, 19).replace('T', ' ') });
  return { coveredFrom: start, coveredThrough: through };
};

r.get('/subscriptions', h((_req, res) => {
  const today = subscriptionToday();
  const monthlyFee = Number(subscriptionSetting('subscription_monthly_fee', '0')) || 0;
  const reminderDays = Number(subscriptionSetting('subscription_reminder_days', '5')) || 0;
  const reminderTemplate = subscriptionSetting('subscription_reminder_template', 'أهلاً {store}، اشتراك Twist مستحق بمبلغ {amount} ج.م. موعد التجديد {due_date}.');
  const stores = q.all(`SELECT s.id,s.slug,s.name_ar,s.phone,s.whatsapp,s.status,u.name AS owner_name,
      ss.monthly_fee_override,ss.covered_through
    FROM stores s JOIN users u ON u.id=s.owner_id LEFT JOIN store_subscriptions ss ON ss.store_id=s.id
    ORDER BY s.status,s.name_ar`);
  // Keep active entitlement lookup independent from the capped admin history.
  // A busy system can have more than 500 ledger entries while an older period
  // is still the current entitlement for a store.
  const periods = q.all('SELECT id,store_id,kind,months,amount,covered_from,covered_through,payment_method,note,created_at FROM subscription_periods ORDER BY id DESC LIMIT 500');
  const activePeriods = q.all(`SELECT id,store_id,kind,months,amount,covered_from,covered_through,payment_method,note,created_at
    FROM subscription_periods WHERE covered_from<=? AND covered_through>=? ORDER BY id DESC`, [today, today]);
  const currentPeriod = new Map();
  for (const period of activePeriods) if (!currentPeriod.has(period.store_id)) currentPeriod.set(period.store_id, period);
  const remindThrough = subscriptionAddDays(today, reminderDays);
  const items = stores.map((store) => {
    const current = currentPeriod.get(store.id);
    const unregistered = !store.covered_through && !current;
    const dueDate = unregistered ? null : store.covered_through ? subscriptionAddDays(store.covered_through, 1) : today;
    const status = unregistered ? 'unregistered' : current?.kind === 'free' ? 'free' : store.covered_through && store.covered_through >= today ? 'paid' : dueDate === today ? 'due' : 'overdue';
    const fee = store.monthly_fee_override == null ? monthlyFee : Number(store.monthly_fee_override);
    return { ...store, monthly_fee_override: store.monthly_fee_override == null ? null : Number(store.monthly_fee_override), monthlyFee: fee, coveredThrough: store.covered_through, dueDate, status, currentPeriod: current || null,
      dueSoon: status === 'paid' && dueDate <= remindThrough, reminderPhone: store.whatsapp || store.phone || null };
  });
  const history = periods.map((period) => ({ ...period, storeName: stores.find((store) => store.id === period.store_id)?.name_ar || 'محل محذوف' }));
  res.json({ settings: { monthlyFee, reminderDays, reminderTemplate }, items, history, today });
}));

r.put('/subscriptions/settings', h((req, res) => {
  const body = z.object({ monthlyFee: z.coerce.number().int().min(0).max(100000), reminderDays: z.coerce.number().int().min(0).max(90), reminderTemplate: z.string().trim().min(10).max(1000) }).parse(req.body);
  tx(() => {
    for (const [key, value] of [['subscription_monthly_fee', body.monthlyFee], ['subscription_reminder_days', body.reminderDays], ['subscription_reminder_template', body.reminderTemplate]]) {
      q.run('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, String(value)]);
    }
  });
  res.json({ settings: body });
}));

/* ---- staged cashier integration rollout (disabled until platform admin enables it) ---- */
const cashierPayload = () => ({
  enabled: subscriptionSetting('cashier_sync_enabled', '0') === '1',
  ready: CASHIER_SYSTEMS.some((c) => c.connector === 'ready'),
  supportedMethods: CASHIER_SYSTEMS.filter((c) => c.connector === 'ready').map((c) => c.id),
  systems: CASHIER_SYSTEMS,
  links: q.all(`SELECT s.id AS storeId, s.slug, s.name_ar AS storeName, l.cashier_id AS cashierId, COALESCE(l.status,'none') AS status, COALESCE(l.note,'') AS note, l.updated_at AS updatedAt,
      l.starts_at AS startsAt, l.ends_at AS endsAt, COALESCE(l.grace_days,7) AS graceDays
    FROM stores s LEFT JOIN store_cashier_links l ON l.store_id=s.id ORDER BY s.name_ar`).map(({ storeId, ...l }) => ({ ...l, state: cashierAccess(storeId).state })),
});
r.get('/cashier-sync', h((_req, res) => { res.json(cashierPayload()); }));
r.put('/cashier-sync/stores/:slug', h((req, res) => {
  const body = z.object({
    cashierId: z.enum(CASHIER_IDS).nullable(),
    status: z.enum(CASHIER_LINK_STATUSES).default('pending'),
    note: z.string().trim().max(300).default(''),
    startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    graceDays: z.coerce.number().int().min(0).max(60).optional(),
  }).parse(req.body);
  const store = q.get('SELECT id FROM stores WHERE slug=?', [req.params.slug]);
  if (!store) throw new AppError(404, 'not_found', 'Store not found.');
  if (!body.cashierId) q.run('DELETE FROM store_cashier_links WHERE store_id=?', [store.id]);
  else {
    q.run(`INSERT INTO store_cashier_links(store_id,cashier_id,status,note,updated_at) VALUES(?,?,?,?,datetime('now'))
      ON CONFLICT(store_id) DO UPDATE SET cashier_id=excluded.cashier_id,status=excluded.status,note=excluded.note,updated_at=excluded.updated_at`,
      [store.id, body.cashierId, body.status, body.note]);
    // dates are only touched when the client sent them (null clears)
    if (body.startsAt !== undefined) q.run('UPDATE store_cashier_links SET starts_at=? WHERE store_id=?', [body.startsAt, store.id]);
    if (body.endsAt !== undefined) q.run('UPDATE store_cashier_links SET ends_at=? WHERE store_id=?', [body.endsAt, store.id]);
    if (body.graceDays !== undefined) q.run('UPDATE store_cashier_links SET grace_days=? WHERE store_id=?', [body.graceDays, store.id]);
  }
  res.json(cashierPayload());
}));
mountCashierAdmin(r);
r.put('/cashier-sync', h((req, res) => {
  const body = z.object({ enabled: z.boolean() }).parse(req.body);
  q.run('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', ['cashier_sync_enabled', body.enabled ? '1' : '0']);
  res.json(cashierPayload());
}));

r.put('/subscriptions/:slug/fee', h((req, res) => {
  const body = z.object({ monthlyFeeOverride: z.union([z.number().int().min(0).max(100000), z.null()]) }).parse(req.body);
  const store = q.get('SELECT id FROM stores WHERE slug=?', [req.params.slug]);
  if (!store) throw new AppError(404, 'not_found', 'Store not found.');
  q.run(`INSERT INTO store_subscriptions(store_id,monthly_fee_override,updated_at) VALUES(?,?,datetime('now'))
    ON CONFLICT(store_id) DO UPDATE SET monthly_fee_override=excluded.monthly_fee_override,updated_at=excluded.updated_at`, [store.id, body.monthlyFeeOverride]);
  res.json({ ok: true });
}));

r.post('/subscriptions/:slug/payment', h((req, res) => {
  const body = z.object({ months: z.coerce.number().int().min(1).max(24), amount: z.coerce.number().int().min(1).max(1000000).optional(), method: z.enum(['cash','bank_transfer','wallet','instapay','other']), note: z.string().trim().max(300).optional().default('') }).parse(req.body);
  const store = q.get('SELECT id FROM stores WHERE slug=?', [req.params.slug]);
  if (!store) throw new AppError(404, 'not_found', 'Store not found.');
  const row = q.get('SELECT monthly_fee_override FROM store_subscriptions WHERE store_id=?', [store.id]);
  const fee = row?.monthly_fee_override == null ? Number(subscriptionSetting('subscription_monthly_fee', '0')) : Number(row.monthly_fee_override);
  const amount = body.amount ?? fee * body.months;
  if (amount < 1) throw new AppError(422, 'validation_failed', 'Set the monthly subscription price before recording payment.');
  const period = tx(() => subscriptionWindow(store.id, body.months, 'paid', amount, body.method, body.note));
  res.status(201).json({ ok: true, ...period, amount });
}));

r.post('/subscriptions/:slug/free-months', h((req, res) => {
  const body = z.object({ months: z.coerce.number().int().min(1).max(24), note: z.string().trim().max(300).optional().default('') }).parse(req.body);
  const store = q.get('SELECT id FROM stores WHERE slug=?', [req.params.slug]);
  if (!store) throw new AppError(404, 'not_found', 'Store not found.');
  const period = tx(() => subscriptionWindow(store.id, body.months, 'free', 0, null, body.note));
  res.status(201).json({ ok: true, ...period });
}));

/** Orders Twist has to collect from stores and deliver. */
r.get('/deliveries', h((_req, res) => {
  const rows = q.all(`SELECT o.id,o.number,o.status,o.total,o.subtotal,o.shipping,o.shipping_free,o.delivery_group,o.delivery_fee_status,o.delivery_fee_quote,o.track_token,o.delivery_sponsor_share,o.delivery_sponsor_collected,
      o.delivery_route_id,o.delivery_mode,o.delivery_person_id,o.courier_cost,o.customer_name,o.phone,o.governorate,o.city,o.address,o.notes,o.created_at,o.handoff_at,
      s.id AS store_id,s.slug,s.name_ar AS store_name,s.phone AS store_phone,s.whatsapp AS store_whatsapp,s.address_ar AS store_address,s.map_url AS store_map,s.delivery_zone
    FROM orders o JOIN stores s ON s.id=o.store_id
    WHERE o.delivery_by='platform' AND o.status NOT IN ('delivered','cancelled') ORDER BY o.created_at ASC,o.id ASC LIMIT 300`);
  const deliveryPeople = new Map(q.all('SELECT id,name FROM delivery_people').map((p) => [p.id, p.name]));
  const routeKey = (row) => row.delivery_route_id || row.delivery_group || `order:${row.id}`;
  const grouped = new Map(); const baskets = new Map();
  for (const row of rows) {
    const key = routeKey(row);
    if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(row);
    if (row.delivery_group) { if (!baskets.has(row.delivery_group)) baskets.set(row.delivery_group, []); baskets.get(row.delivery_group).push(row); }
  }
  const orders = rows.map((row) => {
    const siblings = grouped.get(routeKey(row));
    const basket = row.delivery_group ? (baskets.get(row.delivery_group) || []) : [row];
    const collectionLeader = [...basket].sort((a,b) => a.id-b.id)[0];
    const leaderRoute = collectionLeader ? grouped.get(routeKey(collectionLeader)) : siblings;
    const owner = [...siblings].sort((a,b) => a.id-b.id)[0];
    const cost = row.delivery_courier_cost == null ? null : Number(row.delivery_courier_cost);
    return { ...row,
      delivery_route_id: routeKey(row), delivery_run_owner_id: owner.id,
      delivery_route_count: siblings.length, delivery_route_ready_count: siblings.filter((x) => x.status === 'processing').length,
      delivery_route_shipped_count: siblings.filter((x) => x.status === 'shipped').length,
      delivery_route_cash: siblings.reduce((sum,x) => sum + x.total, 0),
      delivery_route_customer_fee: siblings.reduce((sum,x) => sum + x.shipping, 0),
      delivery_group_count: basket.length, delivery_group_total: basket.reduce((sum,x) => sum + x.total,0),
      delivery_group_shipped_count: basket.filter((x) => x.status === 'shipped').length,
      delivery_group_all_shipped: basket.length > 0 && basket.every((x) => x.status === 'shipped'),
      delivery_collection_route_id: leaderRoute?.[0] ? routeKey(leaderRoute[0]) : routeKey(row),
      delivery_customer_fee: basket.reduce((sum,x) => sum + x.shipping,0),
      delivery_fee_status: basket[0]?.delivery_fee_status || 'confirmed', delivery_fee_quote: basket[0]?.delivery_fee_quote ?? null,
      delivery_person_name: deliveryPeople.get(owner.delivery_person_id) || null,
      delivery_courier_cost: owner.courier_cost,
      delivery_person_id: owner.delivery_person_id,
      shop_delivery_sponsor_share: row.delivery_sponsor_share || 0,
      shop_delivery_sponsor_collected: Boolean(row.delivery_sponsor_collected),
      delivery_sponsored_total: siblings.reduce((sum,x) => sum + (x.delivery_sponsor_collected ? x.delivery_sponsor_share : 0),0),
      delivery_profit: cost == null ? null : siblings.reduce((sum,x) => sum+x.shipping + (x.delivery_sponsor_collected ? x.delivery_sponsor_share : 0),0)-cost };
  });
  const historyRows = q.all("SELECT id,delivery_group,delivery_route_id,shipping,shipping_free,delivery_sponsor_share,delivery_sponsor_collected,courier_cost,delivery_person_id,customer_name,city,created_at FROM orders WHERE delivery_by='platform' AND status='delivered' ORDER BY id DESC LIMIT 600");
  const historyGroups = new Map();
  for (const row of historyRows) {
    const key = row.delivery_route_id || row.delivery_group || `order:${row.id}`;
    if (!historyGroups.has(key)) historyGroups.set(key, []);
    historyGroups.get(key).push(row);
  }
  const deliveredRuns = [...historyGroups.entries()].map(([key, group]) => {
    const ordered = [...group].sort((a, b) => a.id - b.id);
    const owner = ordered[0];
    const cost = owner.courier_cost == null ? null : Number(owner.courier_cost);
    const fee = ordered.reduce((sum, row) => sum + row.shipping, 0);
    const collectedSponsors = ordered.reduce((sum,row) => sum + (row.delivery_sponsor_collected ? row.delivery_sponsor_share : 0),0);
    return { key, orderId: owner.id, customerName: owner.customer_name, city: owner.city, createdAt: owner.created_at, storeCount: ordered.length, customerFee: fee, courierCost: cost, collectedSponsors, profit: cost == null ? null : fee + collectedSponsors - cost, deliveryPersonName: deliveryPeople.get(owner.delivery_person_id) || null };
  });
  res.json({ orders, deliveredRuns });
}));

r.patch('/delivery-runs', h((req, res) => {
  const body = z.object({ orderId: z.coerce.number().int().positive(), courierCost: z.coerce.number().int().min(0).max(100000).nullable(), deliveryPersonId: z.coerce.number().int().positive().nullable().optional(), deliveryMode: z.enum(['pooled','split']).optional(), customerFee: z.coerce.number().int().min(0).max(5000).optional() }).parse(req.body);
  const order = q.get("SELECT id,store_id,delivery_group,delivery_route_id,status FROM orders WHERE id=? AND delivery_by='platform'", [body.orderId]);
  if (!order) throw new AppError(404, 'not_found', 'Delivery run not found.');
  const personId = body.deliveryPersonId ?? null;
  if (personId && !q.get('SELECT id FROM delivery_people WHERE id=? AND active=1', [personId])) throw new AppError(422, 'validation_failed', 'Choose an active delivery person.');
  if (body.deliveryMode && order.delivery_group && q.get("SELECT id FROM orders WHERE delivery_group=? AND status IN ('shipped','delivered') LIMIT 1", [order.delivery_group])) throw new AppError(409, 'route_locked', 'The delivery plan cannot change after a courier starts the route.');
  if (body.deliveryMode && order.delivery_group && q.get("SELECT id FROM orders WHERE delivery_group=? AND (delivery_fee_status='offered' OR (delivery_fee_status='confirmed' AND delivery_fee_quote IS NOT NULL)) LIMIT 1", [order.delivery_group])) throw new AppError(409, 'fee_offer_route_locked', 'The delivery plan cannot change after a fee offer is sent or accepted.');
  if (body.customerFee != null) {
    if (!order.delivery_group) throw new AppError(400, 'not_marketplace_basket', 'A customer fee can only be offered for a marketplace basket.');
    const basket = q.all("SELECT id,status,subtotal,discount,shipping_free,buyer_id,track_token FROM orders WHERE delivery_group=? AND status<>'cancelled' ORDER BY id", [order.delivery_group]);
    if (basket.some((item) => item.status !== 'processing')) throw new AppError(409, 'stores_not_ready', 'Wait until every store in the basket marks its order ready before offering a delivery fee.');
    if (basket.some((item) => q.val('SELECT delivery_fee_status FROM orders WHERE id=?', [item.id]) === 'confirmed')) throw new AppError(409, 'fee_already_confirmed', 'This delivery fee has already been confirmed.');
    const chargeable = basket.filter((item) => !item.shipping_free);
    const base = chargeable.length ? Math.floor(body.customerFee / chargeable.length) : 0;
    let remainder = chargeable.length ? body.customerFee % chargeable.length : 0;
    const shares = new Map(chargeable.map((item) => [item.id, base + (remainder-- > 0 ? 1 : 0)]));
    tx(() => {
      for (const item of basket) {
        const shipping = shares.get(item.id) || 0;
        q.run("UPDATE orders SET shipping=?,total=subtotal-discount+?,delivery_fee_quote=?,delivery_fee_status='offered',updated_at=? WHERE id=?", [shipping, shipping, body.customerFee, new Date().toISOString(), item.id]);
      }
    });
    const notified = new Set();
    for (const item of basket) if (item.buyer_id && !notified.has(item.buyer_id)) {
      notified.add(item.buyer_id);
      notifyBuyer(item.buyer_id, { kind: 'order', title: 'رسوم توصيل طلبك جاهزة', body: `رسوم توصيل سلة Twist: ${body.customerFee} ج.م. راجع رابط التتبع للموافقة.`, url: `/track/${item.track_token}` });
    }
  }
  if (body.deliveryMode && order.delivery_group) {
    const basket = q.all("SELECT o.id,s.delivery_zone FROM orders o JOIN stores s ON s.id=o.store_id WHERE o.delivery_group=? AND o.status<>'cancelled' ORDER BY o.id", [order.delivery_group]);
    const routed = new Map();
    for (const item of basket) {
      const zoneKey = String(item.delivery_zone || '').trim().toLocaleLowerCase('ar-EG') || `store:${item.id}`;
      const routeId = body.deliveryMode === 'pooled' ? order.delivery_group : `${order.delivery_group}:${zoneKey}`;
      if (!routed.has(routeId)) routed.set(routeId, []);
      routed.get(routeId).push(item.id);
    }
    for (const [routeId, ids] of routed) {
      const placeholders = ids.map(() => '?').join(',');
      q.run(`UPDATE orders SET delivery_route_id=?,delivery_mode=? WHERE id IN (${placeholders})`, [routeId, body.deliveryMode, ...ids]);
    }
    // Mode changes invalidate per-route assignments so no shop silently keeps the wrong courier.
    q.run("UPDATE orders SET courier_cost=NULL,delivery_person_id=NULL WHERE delivery_group=? AND status<>'cancelled'", [order.delivery_group]);
  }
  const activeRoute = body.deliveryMode && order.delivery_group
    ? (body.deliveryMode === 'pooled' ? order.delivery_group : (() => { const z = q.get('SELECT delivery_zone FROM stores WHERE id=?',[order.store_id])?.delivery_zone; return `${order.delivery_group}:${String(z || '').trim().toLocaleLowerCase('ar-EG') || `store:${order.id}`}`; })())
    : (order.delivery_route_id || order.delivery_group || `order:${order.id}`);
  const owner = q.get("SELECT id FROM orders WHERE COALESCE(delivery_route_id,delivery_group,'order:' || id)=? AND status<>'cancelled' ORDER BY id LIMIT 1", [activeRoute]);
  if (!owner) throw new AppError(404, 'not_found', 'No active order remains in this delivery run.');
  q.run('UPDATE orders SET courier_cost=?, delivery_person_id=? WHERE id=?', [body.courierCost, personId, owner.id]);
  if (body.courierCost != null) {
    const routeOrders = q.all("SELECT id,shipping_free,delivery_sponsor_share FROM orders WHERE COALESCE(delivery_route_id,delivery_group,'order:' || id)=? AND status<>'cancelled' ORDER BY id", [activeRoute]);
    routeOrders.forEach((item,index) => {
      const share = item.shipping_free ? Math.floor(body.courierCost / routeOrders.length) + (index < body.courierCost % routeOrders.length ? 1 : 0) : 0;
      q.run('UPDATE orders SET delivery_sponsor_share=?,delivery_sponsor_collected=CASE WHEN delivery_sponsor_share=? THEN delivery_sponsor_collected ELSE 0 END WHERE id=?', [share,share,item.id]);
    });
  }
  res.json({ ok: true, ownerOrderId: owner.id, deliveryRouteId: activeRoute });
}));

r.post('/delivery-runs/cancel-rejected', h((req, res) => {
  const { orderId } = z.object({ orderId: z.coerce.number().int().positive() }).parse(req.body);
  const order = q.get("SELECT id,delivery_group FROM orders WHERE id=? AND delivery_by='platform'", [orderId]);
  if (!order?.delivery_group) throw new AppError(404, 'not_found', 'Marketplace delivery basket not found.');
  const basket = q.all("SELECT id,status,delivery_fee_status,customer_id,buyer_id,track_token,subtotal FROM orders WHERE delivery_group=? AND status<>'cancelled'", [order.delivery_group]);
  if (!basket.length || basket.some((item) => item.delivery_fee_status !== 'rejected' || !['pending','confirmed','processing'].includes(item.status))) throw new AppError(409, 'cannot_cancel_basket', 'Only a rejected delivery offer can be cancelled before dispatch.');
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  tx(() => {
    for (const item of basket) {
      for (const line of q.all('SELECT product_id,variant_id,qty FROM order_items WHERE order_id=?', [item.id])) {
        if (line.variant_id) q.run('UPDATE variants SET stock=stock+? WHERE id=?', [line.qty, line.variant_id]);
        q.run('UPDATE products SET stock=stock+?,sold_count=MAX(0,sold_count-?) WHERE id=?', [line.qty, line.qty, line.product_id]);
      }
      if (item.customer_id) q.run('UPDATE customers SET orders_count=MAX(0,orders_count-1),total_spent=MAX(0,total_spent-?) WHERE id=?', [item.subtotal, item.customer_id]);
      q.run("UPDATE orders SET status='cancelled',updated_at=? WHERE id=?", [now, item.id]);
      insert('order_events', { order_id: item.id, status: 'cancelled', note: 'Customer rejected delivery fee', created_at: now });
    }
  });
  const notified = new Set();
  for (const item of basket) if (item.buyer_id && !notified.has(item.buyer_id)) {
    notified.add(item.buyer_id);
    notifyBuyer(item.buyer_id, { kind: 'order', title: 'تم إلغاء طلبات سلة Twist', body: 'تم إلغاء السلة بعد رفض رسوم التوصيل وإرجاع المنتجات للمخزون.', url: `/track/${item.track_token}` });
  }
  res.json({ ok: true, cancelled: basket.length });
}));

r.patch('/orders/:id/delivery-sponsor', h((req,res) => {
  const { collected } = z.object({ collected: z.boolean() }).parse(req.body);
  const order = q.get("SELECT id,shipping_free,delivery_sponsor_share FROM orders WHERE id=? AND delivery_by='platform'", [Number(req.params.id)]);
  if (!order) throw new AppError(404,'not_found','Delivery order not found.');
  if (!order.shipping_free) throw new AppError(409,'not_sponsored','Only a free-shipping store has a delivery contribution to reconcile.');
  q.run('UPDATE orders SET delivery_sponsor_collected=? WHERE id=?',[collected ? 1 : 0,order.id]);
  res.json({ ok:true, share:order.delivery_sponsor_share, collected });
}));

r.patch('/orders/:id/status', h((req, res) => {
  const { status } = z.object({ status: z.enum(['shipped', 'delivered']) }).parse(req.body);
  const o = q.get("SELECT * FROM orders WHERE id=? AND delivery_by='platform'", [Number(req.params.id)]);
  if (!o) throw new AppError(404, 'not_found', 'Order not found.');
  if (status === 'shipped' && o.delivery_group) {
    const unconfirmed = q.get("SELECT id FROM orders WHERE delivery_group=? AND status<>'cancelled' AND delivery_fee_status<>'confirmed' LIMIT 1", [o.delivery_group]);
    if (unconfirmed) throw new AppError(409, 'delivery_fee_not_accepted', 'Wait until the customer accepts the delivery fee.');
  }
  if (status === 'delivered' && o.delivery_group && o.delivery_mode === 'split') {
    const leader = q.get("SELECT delivery_route_id FROM orders WHERE delivery_group=? AND status<>'cancelled' ORDER BY id LIMIT 1", [o.delivery_group]);
    if (leader && (leader.delivery_route_id || o.delivery_group) !== (o.delivery_route_id || o.delivery_group)) throw new AppError(409, 'collection_lead_only', 'Only the primary delivery person can confirm the one-time basket collection.');
  }
  const routeId = o.delivery_route_id || o.delivery_group || `order:${o.id}`;
  const orders = o.delivery_group && status === 'delivered' && o.delivery_mode === 'split'
    ? q.all("SELECT * FROM orders WHERE delivery_group=? AND delivery_by='platform' AND status<>'cancelled'", [o.delivery_group])
    : o.delivery_group
      ? q.all("SELECT * FROM orders WHERE COALESCE(delivery_route_id,delivery_group,'order:' || id)=? AND delivery_by='platform' AND status<>'cancelled'", [routeId])
    : [o];
  const expected = status === 'shipped' ? 'processing' : 'shipped';
  if (!orders.length || orders.some((item) => item.status !== expected)) {
    const message = status === 'shipped'
      ? (o.delivery_group ? 'Wait until every shop assigned to this delivery route marks its order ready.' : 'The store has not marked this order ready yet.')
      : (o.delivery_group && o.delivery_mode === 'split' ? 'Wait until every delivery route is on the way, then confirm one basket handoff.' : o.delivery_group ? 'All orders assigned to this delivery route must be picked up before delivery.' : 'Pick the order up first.');
    throw new AppError(400, 'invalid_transition', message);
  }
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  tx(() => {
    for (const item of orders) {
      q.run('UPDATE orders SET status=?, updated_at=? WHERE id=?', [status, now, item.id]);
      insert('order_events', { order_id: item.id, status, note: null, created_at: now });
    }
  });
  if (status === 'delivered' && o.delivery_group && o.delivery_mode === 'split') {
    const notified = new Set();
    for (const item of orders) {
      const buyer = item.buyer_id;
      if (buyer && !notified.has(buyer)) {
        notified.add(buyer);
        const first = orders.find((candidate) => candidate.buyer_id === buyer) || item;
        notifyBuyer(buyer, { kind: 'order', title: 'سلة Twist وصلتك 🎉', body: 'تم تسليم كل طلبات السلة والتحصيل مرة واحدة.', url: `/track/${first.track_token}` });
      }
    }
  } else for (const item of orders) notifyOrderStatus(item.id, status);
  res.json({ id: o.id, status, updated: orders.length });
}));

const deliveryRateSchema = z.object({
  governorate: z.union([z.literal('*'), z.string().trim().min(2).max(40)]),
  city: z.string().trim().max(60).optional().default(''),
  fee: z.coerce.number().int().min(0).max(5000).optional(),
  distanceKm: z.coerce.number().min(0).max(300).optional().nullable(),
}).refine((r) => r.fee != null || r.distanceKm != null, { path: ['fee'], message: 'fee_or_distance_required' });
const normalizedDeliveryRate = (parsed) => {
  const distanceKm = parsed.distanceKm == null ? null : Math.round(parsed.distanceKm * 10) / 10;
  return {
    governorate: parsed.governorate,
    city: parsed.governorate === '*' ? '*' : parsed.city,
    distance_km: distanceKm,
    fee: distanceKm == null ? parsed.fee : deliveryFeeForDistance(distanceKm),
  };
};
r.get('/delivery-rates', h((_req, res) => {
  const pricing = getDeliveryPricing();
  const items = q.all('SELECT id, governorate, city, fee, distance_km FROM delivery_rates ORDER BY governorate, city').map((item) => ({
    ...item, distanceKm: item.distance_km == null ? null : Number(item.distance_km),
    fee: item.distance_km == null ? item.fee : deliveryFeeForDistance(Number(item.distance_km), pricing),
  }));
  res.json({ items, pricing });
}));
r.put('/delivery-rates/pricing', h((req, res) => {
  const pricing = z.object({ baseFee: z.coerce.number().int().min(0).max(5000), includedKm: z.coerce.number().min(0).max(100), perKm: z.coerce.number().int().min(0).max(1000), extraPickupStopFee: z.coerce.number().int().min(0).max(1000).default(0), extraPickupZoneFee: z.coerce.number().int().min(0).max(2000).default(0) }).parse(req.body);
  res.json({ pricing: saveDeliveryPricing(pricing) });
}));
r.post('/delivery-rates', h((req, res) => {
  const rate = normalizedDeliveryRate(deliveryRateSchema.parse(req.body));
  if (q.get('SELECT id FROM delivery_rates WHERE lower(governorate)=lower(?) AND lower(city)=lower(?)', [rate.governorate, rate.city])) throw new AppError(422, 'validation_failed', 'A delivery fee is already set for this area.', { city: 'area_taken' });
  const id = insert('delivery_rates', rate);
  res.status(201).json({ id, ...rate });
}));
r.patch('/delivery-rates/:id', h((req, res) => {
  const id = Number(req.params.id);
  const rate = normalizedDeliveryRate(deliveryRateSchema.parse(req.body));
  if (!q.get('SELECT id FROM delivery_rates WHERE id=?', [id])) throw new AppError(404, 'not_found', 'Delivery fee not found.');
  if (q.get('SELECT id FROM delivery_rates WHERE lower(governorate)=lower(?) AND lower(city)=lower(?) AND id<>?', [rate.governorate, rate.city, id])) throw new AppError(422, 'validation_failed', 'A delivery fee is already set for this area.', { city: 'area_taken' });
  update('delivery_rates', id, rate);
  res.json({ id, ...rate });
}));
r.delete('/delivery-rates/:id', h((req, res) => {
  const result = q.run('DELETE FROM delivery_rates WHERE id=?', [Number(req.params.id)]);
  if (!result.changes) throw new AppError(404, 'not_found', 'Delivery fee not found.');
  res.json({ ok: true });
}));
/* ---- pickup zones: price per zone + multi-zone discount + profit guard ---- */
const zoneList = () => {
  const saved = new Map(q.all('SELECT key, name, fee, courier_cost FROM pickup_zones').map((z) => [z.key, z]));
  const groups = new Map();
  for (const s of q.all("SELECT id, slug, name_ar, delivery_zone, lat, lng FROM stores WHERE status='active' ORDER BY sort_order, id")) {
    const key = zoneKey(s.delivery_zone, s.id);
    if (!groups.has(key)) { const row = saved.get(key); groups.set(key, { key, name: String(s.delivery_zone || '').trim() || s.name_ar, fee: row?.fee || 0, courierCost: row?.courier_cost || 0, stores: [] }); }
    groups.get(key).stores.push({ slug: s.slug, name: s.name_ar, lat: s.lat, lng: s.lng });
  }
  return [...groups.values()];
};
r.get('/delivery-zones', h((_req, res) => {
  res.json({ zones: zoneList(), policy: getZonePolicy(), fallbackFee: getDeliveryPricing().baseFee });
}));
r.put('/delivery-zones', h((req, res) => {
  const body = z.object({
    zones: z.array(z.object({ key: z.string().trim().min(1).max(120), name: z.string().trim().max(80).default(''), fee: z.coerce.number().int().min(0).max(5000), courierCost: z.coerce.number().int().min(0).max(5000).default(0) })).max(200),
    policy: z.object({ tiers: z.array(z.object({ zones: z.coerce.number().int().min(2).max(10), percent: z.coerce.number().min(0).max(90) })).max(9), extraStopCost: z.coerce.number().int().min(0).max(5000).default(0), minMargin: z.coerce.number().int().min(0).max(5000).default(0) }),
  }).parse(req.body);
  tx(() => {
    for (const zn of body.zones) {
      q.run('INSERT INTO pickup_zones(key,name,fee,courier_cost) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET name=excluded.name, fee=excluded.fee, courier_cost=excluded.courier_cost', [zn.key, zn.name, zn.fee, zn.courierCost]);
    }
    saveZonePolicy(body.policy);
  });
  res.json({ zones: zoneList(), policy: getZonePolicy() });
}));


const deliveryPersonSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.preprocess((v) => {
    const digits = String(v || '').replace(/\D/g, '');
    return digits.startsWith('20') && digits.length === 12 ? `0${digits.slice(2)}` : digits;
  }, z.string().regex(/^01[0125]\d{8}$/, 'phone_invalid')),
});
r.get('/delivery-people', h((_req, res) => {
  res.json({ items: q.all('SELECT id, name, phone, active, created_at FROM delivery_people ORDER BY active DESC, name COLLATE NOCASE') });
}));
r.post('/delivery-people', h((req, res) => {
  const person = deliveryPersonSchema.parse(req.body);
  if (q.get('SELECT id FROM delivery_people WHERE phone=?', [person.phone])) throw new AppError(422, 'validation_failed', 'Phone number already registered.', { phone: 'phone_taken' });
  const id = insert('delivery_people', { ...person, active: 1 });
  res.status(201).json({ id, ...person, active: 1 });
}));
r.patch('/delivery-people/:id', h((req, res) => {
  const id = Number(req.params.id);
  if (!q.get('SELECT id FROM delivery_people WHERE id=?', [id])) throw new AppError(404, 'not_found', 'Delivery person not found.');
  const person = deliveryPersonSchema.parse(req.body);
  if (q.get('SELECT id FROM delivery_people WHERE phone=? AND id<>?', [person.phone, id])) throw new AppError(422, 'validation_failed', 'Phone number already registered.', { phone: 'phone_taken' });
  update('delivery_people', id, person);
  res.json({ id, ...person });
}));
r.delete('/delivery-people/:id', h((req, res) => {
  const id = Number(req.params.id);
  const result = q.run('DELETE FROM delivery_people WHERE id=?', [id]);
  if (!result.changes) throw new AppError(404, 'not_found', 'Delivery person not found.');
  res.json({ deleted: true });
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

/* ---------------------------------------------------------- platform coupons (funded by Twist) */

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
    backup: lastBackup(), backupDir: !!config.backupDir, offsite: { enabled: offsiteEnabled, last: lastOffsite() }, mediaR2Enabled: r2Enabled,
    whatsappConfigured: isWhatsAppConfigured(), template: config.wa.template, registrationOpen: config.allowRegister,
    env: config.env, node: process.version, uptimeSec: Math.round(process.uptime()),
    checks: [
      { id: 'jwt', ok: !insecureJwt, label: 'JWT_SECRET قوي ومتغيّر', fix: 'اضبط JWT_SECRET بقيمة عشوائية طويلة (32+ حرف).' },
      { id: 'admin', ok: config.adminKey.length >= 16, label: 'ADMIN_KEY قوي (16+ حرف)', fix: 'اضبط ADMIN_KEY بقيمة طويلة.' },
      { id: 'totp', ok: !!config.adminTotpSecret, label: 'تأكيد خطوتين لدخول الأدمن', fix: 'شغّل npm run admin-totp -w server واضبط ADMIN_TOTP_SECRET.' },
      { id: 'backup', ok: !!lastBackup() && Date.now() - Date.parse(lastBackup().at) < 36 * 3600e3, label: 'نسخة احتياطية يومية (قاعدة البيانات + الصور)', fix: 'اضبط BACKUP_DIR على مجلد على قرص دائم.' },
      { id: 'offsite', ok: offsiteEnabled && !!lastOffsite() && Date.now() - Date.parse(lastOffsite().at) < 36 * 3600e3, label: 'نسخة احتياطية خارج Railway (Cloudflare R2 خاص)', fix: 'اضبط R2_ACCOUNT_ID وBACKUP_R2_BUCKET وR2_ACCESS_KEY_ID وR2_SECRET_ACCESS_KEY (أو مفاتيح النسخ المخصصة)، وتأكد أن الـ bucket خاص والمفاتيح لها صلاحية الكتابة عليه. CF_AI_TOKEN ليس مفتاح R2.' },
      { id: 'media-r2', ok: r2Enabled, optional: true, label: 'تخزين صور المنتجات على Cloudflare R2', fix: 'لو رفع الصور بيفشل، راجع R2_ACCOUNT_ID وR2_BUCKET وR2_ACCESS_KEY_ID وR2_SECRET_ACCESS_KEY وR2_PUBLIC_URL. استخدم bucket الصور العام banha-media، وخلي BACKUP_R2_BUCKET خاصاً للنسخ فقط.' },
      { id: 'demo-pw', ok: !demoPasswordsUnchanged(), label: 'باسورد حساب تاون ستايل التجريبي اتغيّر', fix: 'npm run set-password -w server -- townstyle@banhalook.app' },
      { id: 'register', ok: !config.allowRegister, label: 'التسجيل العام مقفول', fix: 'شيل ALLOW_REGISTER=1.' },
      { id: 'prod', ok: config.env === 'production', label: 'NODE_ENV=production', fix: 'اضبط NODE_ENV=production.' },
      { id: 'wa', ok: isWhatsAppConfigured(), label: 'واتساب API متوصل (اختياري)', optional: true, fix: 'اضبط WA_TOKEN و WA_PHONE_ID.' },
    ],
  });
}));

// Hosting/storage snapshot for admins. Cloudflare R2 metrics cover the account and may lag recent writes.
let r2MetricsCache = { at: 0, value: null };
r.get('/resources', h(async (_req, res) => {
  let disk = null;
  let database = null;
  const root = path.dirname(path.resolve(config.dbFile));
  try {
    const stat = fs.statfsSync(root);
    const totalBytes = Number(stat.blocks) * Number(stat.bsize);
    const freeBytes = Number(stat.bavail) * Number(stat.bsize);
    disk = { path: root, totalBytes, freeBytes, usedBytes: Math.max(0, totalBytes - freeBytes), source: 'database-volume' };
  } catch (error) { disk = { path: root, error: error.message }; }
  try {
    const stat = fs.statSync(config.dbFile);
    database = { bytes: stat.size, modifiedAt: stat.mtime.toISOString() };
  } catch (error) { database = { error: error.message }; }

  const memory = process.memoryUsage();
  const accountId = process.env.CF_ACCOUNT_ID || config.r2.accountId;
  const token = process.env.CF_R2_METRICS_TOKEN || '';
  let r2 = { configured: false, accountId: !!accountId, error: null };
  if (accountId && token) {
    if (!r2MetricsCache.value || Date.now() - r2MetricsCache.at > 5 * 60e3) {
      try {
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/r2/metrics`, {
          headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000),
        });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.errors?.[0]?.message || `Cloudflare API ${response.status}`);
        const standard = payload.result?.standard?.published || {};
        const infrequent = payload.result?.infrequentAccess?.published || {};
        r2MetricsCache = { at: Date.now(), value: {
          standardBytes: Number(standard.payloadSize || 0) + Number(standard.metadataSize || 0),
          standardObjects: Number(standard.objects || 0),
          infrequentAccessBytes: Number(infrequent.payloadSize || 0) + Number(infrequent.metadataSize || 0),
          infrequentAccessObjects: Number(infrequent.objects || 0),
        } };
      } catch (error) { r2 = { configured: true, accountId: true, error: error.message }; }
    }
    if (r2MetricsCache.value) r2 = { configured: true, accountId: true, ...r2MetricsCache.value, measuredAt: new Date(r2MetricsCache.at).toISOString() };
  }
  res.json({ disk, database, memory: { rssBytes: memory.rss, heapUsedBytes: memory.heapUsed, heapTotalBytes: memory.heapTotal }, r2, checkedAt: new Date().toISOString() });
}));

/* ---- stylist chat settings ---- */
r.get('/stylist', h((_req, res) => res.json(stylistStatus())));
r.get('/stylist/test/:provider', h(async (req, res) => {
  if (!['anthropic', 'gemini', 'cloudflare'].includes(req.params.provider)) throw new AppError(400, 'bad_provider', 'Unknown provider');
  res.json(await testProvider(req.params.provider));
}));
r.put('/stylist', h((req, res) => {
  const b = z.object({ enabled: z.boolean().optional(), provider: z.enum(['anthropic', 'cloudflare']).optional(), dailyFree: z.coerce.number().int().min(0).max(1000).optional(), nameAr: z.string().trim().min(2).max(20).optional(), nameEn: z.string().trim().min(2).max(20).optional() }).parse(req.body);
  const current = stylistStatus().provider;
  if (b.provider && b.provider !== current && !providerReady[b.provider]()) {
    throw new AppError(400, 'stylist_provider_not_configured', 'Configure the selected AI provider credentials before switching to it.');
  }
  saveStylistSettings(b);
  res.json(stylistStatus());
}));

/* ---- Moda's admin-taught style memory ---- */
const trainingPieceSchema = z.object({ label: z.string().trim().min(1).max(50), productId: z.coerce.number().int().positive() });
const trainingExampleSchema = z.object({
  audience: z.enum(['women', 'men', 'kids']), age: z.string().trim().max(40).optional().default(''),
  occasion: z.string().trim().min(2).max(80), lesson: z.string().trim().max(300).optional().default(''),
  pieces: z.array(trainingPieceSchema).min(2).max(8),
});
const trainingLessonSchema = z.object({
  topic: z.string().trim().max(80).optional().default(''), question: z.string().trim().min(4).max(400),
  answer: z.string().trim().min(10).max(1000), tags: z.string().trim().max(160).optional().default(''),
});
r.get('/stylist/training', h((_req, res) => res.json(stylistTrainingSettings())));
r.put('/stylist/training', h((req, res) => {
  const body = z.object({ guidance: z.string().trim().max(1600) }).parse(req.body);
  res.json(saveStylistTrainingGuidance(body.guidance));
}));
r.post('/stylist/training/examples', h((req, res) => {
  const body = trainingExampleSchema.parse(req.body);
  try {
    const saved = addStylistTrainingExample(body);
    res.status(saved.added ? 201 : 200).json(saved);
  } catch (error) {
    if (error.code === 'training_products_unavailable') throw new AppError(422, 'validation_failed', 'One or more selected products are no longer available. Refresh the product list.');
    throw error;
  }
}));
r.delete('/stylist/training/examples/:id', h((req, res) => res.json(deleteStylistTrainingExample(String(req.params.id).slice(0, 80)))));
r.post('/stylist/training/lessons', h((req, res) => {
  const lesson = trainingLessonSchema.parse(req.body);
  const saved = addStylistTrainingLesson(lesson);
  res.status(saved.added ? 201 : 200).json(saved);
}));
r.delete('/stylist/training/lessons/:id', h((req, res) => res.json(deleteStylistTrainingLesson(String(req.params.id).slice(0, 80)))));
r.post('/stylist/training/lessons/:id/approve', h((req, res) => {
  const lesson = approveStylistTrainingLesson(String(req.params.id).slice(0, 80));
  if (!lesson) throw new AppError(404, 'lesson_not_found', 'Training lesson not found.');
  res.json({ lesson });
}));

/* ---- deterministic Moda test studio (no external model/API calls) ---- */
const modaLabScenarioSchema = z.object({
  id: z.string().max(80).optional(), name: z.string().trim().max(80).optional().default(''),
  message: z.string().trim().min(2).max(400), expectedGarment: z.string().max(80).optional().default(''),
  expectedAudience: z.enum(['women', 'men', 'boys', 'girls', 'women_hijab']).or(z.literal('')).optional().default(''),
  expectedContext: z.string().max(80).optional().default(''), expectedQuestions: z.array(z.string().max(80)).max(3).optional().default([]),
  forbiddenGarments: z.array(z.string().max(80)).max(12).optional().default([]),
  maxBudget: z.coerce.number().int().positive().max(1000000).nullable().optional().default(null),
  answers: z.record(z.union([z.string().max(100), z.number().int(), z.array(z.union([z.string().max(100), z.number().int()])).max(4)])).optional().default({}),
});
r.get('/stylist/lab', h((_req, res) => res.json(modaLabSettings())));
r.post('/stylist/lab/run', h(async (req, res) => {
  const body = modaLabScenarioSchema.omit({ id: true, name: true, answers: true }).extend({
    session: z.record(z.any()).nullable().optional(), answers: modaLabScenarioSchema.shape.answers,
    replayAnswers: z.boolean().optional().default(false),
  }).parse(req.body || {});
  const { message, expectedGarment, expectedAudience, maxBudget, expectedContext, expectedQuestions, forbiddenGarments, session, answers, replayAnswers } = body;
  const result = await runModaLabScenario({ message, expectedGarment, expectedAudience, maxBudget, expectedContext, expectedQuestions, forbiddenGarments, session, answers, replayAnswers });
  res.json(result);
}));
r.post('/stylist/lab/run-all', h(async (_req, res) => res.json(await runAllModaLabScenarios())));
r.post('/stylist/lab/scenarios', h((req, res) => {
  const body = modaLabScenarioSchema.parse(req.body || {});
  const settings = modaLabSettings();
  if (body.expectedGarment && !settings.garments.some((item) => item.key === body.expectedGarment)) throw new AppError(422, 'validation_failed', 'Unknown garment type.');
  if (body.expectedContext && !settings.contexts.some((item) => item.key === body.expectedContext)) throw new AppError(422, 'validation_failed', 'Unknown occasion.');
  if (body.expectedQuestions.some((item) => !settings.questionIds.includes(item)) || body.forbiddenGarments.some((item) => !settings.garments.some((garment) => garment.key === item))) throw new AppError(422, 'validation_failed', 'Unknown test expectation.');
  res.status(201).json(saveModaLabScenario(body));
}));
r.delete('/stylist/lab/scenarios/:id', h((req, res) => res.json(deleteModaLabScenario(String(req.params.id).slice(0, 80)))));

r.get('/stylist/feedback', h((_req, res) => res.json({ items: stylistFeedback() })));
r.delete('/stylist/feedback/:id', h((req, res) => res.json({ items: deleteStylistFeedback(String(req.params.id).slice(0, 80)) })));
r.post('/stylist/feedback/:id/lesson', h((req, res) => {
  const body = z.object({ answer: z.string().trim().min(10).max(1000) }).parse(req.body);
  const result = teachFromStylistFeedback(String(req.params.id).slice(0, 80), body.answer);
  if (!result) throw new AppError(404, 'feedback_not_found', 'Feedback not found.');
  res.status(201).json(result);
}));

/* ---- look of the day: AI-picked, manually curated, or hidden ---- */
// صور اللوك بتترفع على /look-of-day/ (saveLookOfDayImage) والقديمة على /homepage-ads/، الاتنين مقبولين.
const lookImageOk = (value) => !value || /\/(look-of-day|homepage-ads)\//.test(value);
const lookPieceSchema = z.object({ label: z.string().trim().min(1).max(50), productId: z.coerce.number().int().positive() });
const lookOutfitSchema = z.object({
  audience: z.enum(['women', 'men', 'kids']),
  age: z.string().trim().max(40).optional().default(''),
  say: z.string().max(700).optional().default(''),
  tips: z.string().max(300).optional().default(''),
  coverImage: z.string().trim().max(500).optional().default('').refine(lookImageOk, 'Invalid look image.'),
  images: z.array(z.string().trim().max(500).refine(lookImageOk, 'Invalid look image.')).max(6).optional().default([]),
  occasion: z.string().trim().min(2).max(80),
  pieces: z.array(lookPieceSchema).min(2).max(8),
});
const manualLookSchema = z.object({
  showOthers: z.boolean().optional().default(false),
  outfits: z.array(lookOutfitSchema).max(12).default([]),
  coverImage: z.string().trim().max(500).optional().default('').refine(lookImageOk, 'Invalid look image.'), title: z.string().trim().max(100).optional().default(''),
  description: z.string().trim().max(240).optional().default(''), badge: z.string().trim().max(40).optional().default(''),
});
/* ---- اقتراحات مودة الجاهزة: الأزرار السريعة + الرسائل المثال ---- */
const promptsSchema = z.object({
  hero: z.array(z.object({ ar: z.string().max(60), en: z.string().max(80).optional().default(''), askAr: z.string().max(300), askEn: z.string().max(300).optional().default('') })).max(8),
  chips: z.array(z.object({ ar: z.string().max(300), en: z.string().max(300).optional().default('') })).max(6),
});
r.get('/moda-prompts', h((_req, res) => res.json(adminModaPrompts())));
r.put('/moda-prompts', h((req, res) => res.json(saveModaPrompts(promptsSchema.parse(req.body)))));
r.delete('/moda-prompts', h((_req, res) => res.json(resetModaPrompts())));
r.post('/moda-prompts/ai-suggest', h(async (_req, res) => {
  const call = llmChain();
  if (!call) throw new AppError(503, 'stylist_unavailable', 'الذكاء الاصطناعي مش متاح دلوقتي.');
  try { res.json(await suggestPrompts(call)); }
  catch { throw new AppError(502, 'ai_failed', 'الذكاء الاصطناعي ماطلعش اقتراحات سليمة. جرّب تاني.'); }
}));
r.get('/look-of-day', h((_req, res) => res.json(lookOfDayAdminSettings())));
r.get('/look-of-day/products', h((req, res) => res.json({ items: searchLookOfDayProducts(req.query.q) })));
r.post('/look-of-day/ai-proposal', h(async (_req, res) => {
  try { res.json(await generateLookOfDayProposal()); }
  catch (e) {
    if (e.code === 'look_of_day_no_suggestions') throw new AppError(422, e.code, 'الذكاء الاصطناعي ماطلعش اقتراحات مكتملة للمراجعة. جرّب تاني أو استخدم الاختيار اليدوي.');
    if (e.code === 'stylist_unavailable') throw new AppError(503, e.code, 'الذكاء الاصطناعي مش متاح دلوقتي. مفيش اقتراحات هتتنشر تلقائيًا.');
    throw e;
  }
}));
r.post('/look-of-day/approve-ai', h((_req, res) => {
  try { res.json(approveLookOfDayProposal()); }
  catch (e) {
    if (e.code === 'look_of_day_no_suggestions') throw new AppError(422, e.code, 'مفيش اقتراحات صالحة للاعتماد. ولّد اقتراحات جديدة أو اختار اللوك يدويًا.');
    throw e;
  }
}));
r.delete('/look-of-day/ai-proposal', h((_req, res) => res.json(discardLookOfDayProposal())));
r.put('/look-of-day', h(async (req, res) => {
  const body = z.object({ mode: z.enum(['ai', 'manual', 'off']), manual: manualLookSchema.optional() }).parse(req.body);
  if (body.mode === 'manual') {
    if (!body.manual?.outfits.length) throw new AppError(422, 'validation_failed', 'Add at least one complete outfit.');
    const ids = [...new Set(body.manual.outfits.flatMap((outfit) => outfit.pieces.map((piece) => piece.productId)))];
    const valid = q.all(`SELECT p.id FROM products p JOIN stores s ON s.id=p.store_id
      WHERE p.id IN (${ids.map(() => '?').join(',')}) AND p.status='active' AND s.status='active' AND s.hidden=0
        AND (p.track_stock=0 OR p.stock>0)`, ids).map((row) => row.id);
    if (valid.length !== ids.length) throw new AppError(422, 'validation_failed', 'One or more selected products are no longer available. Refresh the product list.');
  }
  const imagesOf = (m) => [m?.coverImage, ...(m?.outfits || []).flatMap((o) => [o.coverImage, ...(o.images || [])])].filter(Boolean);
  const previousImages = imagesOf(lookOfDayAdminSettings().manual);
  const saved = saveLookOfDayAdminSettings({ mode: body.mode, manual: body.manual });
  if (body.manual) { const keep = new Set(imagesOf(body.manual)); for (const img of new Set(previousImages)) if (!keep.has(img)) await removeDeptImage(img); }
  res.json(saved);
}));

/* ---- visual search settings (on/off, model, free daily quota) ---- */
r.get('/visual', h((_req, res) => res.json(visualStatus())));
r.get('/visual/demand', h((req, res) => {
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  res.json({ items: unmetDemand({ days, limit: 20 }), totals: demandTotals({ days }), ownersEnabled: demandForOwnersEnabled() });
}));
r.put('/visual/demand/owners', h((req, res) => {
  const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
  res.json({ ownersEnabled: setDemandForOwners(enabled) });
}));
r.put('/visual', h((req, res) => {
  const body = z.object({ enabled: z.boolean().optional(), model: z.enum(['color', 'jina', 'clip']).optional(), dailyFree: z.coerce.number().int().min(0).max(1000).optional(), minSimilarity: z.coerce.number().int().min(0).max(100).optional() }).parse(req.body);
  if (body.model === 'jina' && !process.env.JINA_API_KEY) throw new AppError(422, 'jina_key_required', 'أضف مفتاح JINA_API_KEY في Railway أولًا.');
  saveVisualSettings(body);
  if (body.model) triggerReindex(1000);
  res.json(visualStatus());
}));

/** One-click download of a consistent database copy (for off-site safekeeping). Photos are covered by `npm run backup` / BACKUP_DIR. */
r.get('/backup/db', h((_req, res, next) => {
  const tmp = path.join(os.tmpdir(), `bo-dl-${crypto.randomBytes(6).toString('hex')}.db`);
  snapshotDb(tmp);
  res.download(tmp, `banha-outfit-${new Date().toISOString().slice(0, 10)}.db`, (err) => { fs.rm(tmp, { force: true }, () => {}); if (err) next(err); });
}));
r.post('/backup/offsite', h(async (_req, res) => {
  if (!offsiteEnabled) throw new AppError(400, 'backup_not_configured', 'Configure R2_ACCOUNT_ID, BACKUP_R2_BUCKET, and R2 S3 access key and secret with write access to the private bucket.');
  res.json(await runOffsiteBackup());
}));
r.post('/backup/run', h((_req, res) => {
  if (!config.backupDir) throw new AppError(400, 'backup_not_configured', 'BACKUP_DIR is not set on the server.');
  res.json(runBackup());
}));

/* ---------------------------------------------------------- shopper accounts (support: look up by phone, set a temporary password) */
r.get('/buyers', h((req, res) => {
  const term = String(req.query.q || '').replace(/\D/g, '');
  const items = q.all(`SELECT b.id, b.name, b.phone, b.created_at, (SELECT COUNT(*) FROM orders o WHERE o.buyer_id=b.id) AS orders FROM buyers b ${term ? 'WHERE b.phone LIKE ?' : ''} ORDER BY b.id DESC LIMIT 50`, term ? [`%${term}%`] : []);
  res.json({ items, total: q.val('SELECT COUNT(*) FROM buyers') });
}));
r.post('/buyers/:id/reset-password', h((req, res) => {
  const b = q.get('SELECT id FROM buyers WHERE id=?', [Number(req.params.id)]);
  if (!b) throw new AppError(404, 'not_found', 'Account not found.');
  const temp = crypto.randomBytes(5).toString('hex');
  q.run('UPDATE buyers SET password_hash=? WHERE id=?', [bcrypt.hashSync(temp, 10), b.id]);
  res.json({ password: temp });
}));

/* ---------------------------------------------------------- sourcing requests ("not in Banha — we bring it") */
const SRC_STATUSES = ['new', 'quoted', 'approved', 'ordered', 'arrived', 'delivered', 'cancelled'];
r.get('/sourcing', h((req, res) => {
  const status = SRC_STATUSES.includes(String(req.query.status)) ? String(req.query.status) : null;
  const items = q.all(`SELECT * FROM sourcing_requests ${status ? 'WHERE status=?' : ''} ORDER BY (status IN ('new','approved')) DESC, created_at DESC LIMIT 200`, status ? [status] : []);
  const counts = Object.fromEntries(q.all('SELECT status, COUNT(*) AS c FROM sourcing_requests GROUP BY status').map((x) => [x.status, x.c]));
  counts.all = Object.values(counts).reduce((a, b) => a + b, 0);
  res.json({ items, counts });
}));
r.patch('/sourcing/:id', h((req, res) => {
  const b = z.object({ status: z.enum(SRC_STATUSES).optional(), quote_price: z.coerce.number().int().min(0).max(1e6).nullable().optional(), admin_note: z.string().max(600).optional() }).parse(req.body);
  const row = q.get('SELECT id FROM sourcing_requests WHERE id=?', [Number(req.params.id)]);
  if (!row) throw new AppError(404, 'not_found', 'Request not found.');
  update('sourcing_requests', row.id, { ...b, updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ') });
  res.json({ ok: true });
}));

/** Polled by the admin UI: new delivery requests since a timestamp + live counters. */
r.get('/notifications', h((req, res) => {
  const since = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(req.query.since || '')) ? String(req.query.since) : '1970-01-01 00:00:00';
  const items = q.all(`SELECT o.id, o.number, o.total, o.status, o.handoff_at AS at, 'handoff' AS kind, s.name_ar AS store_name
    FROM orders o JOIN stores s ON s.id=o.store_id WHERE o.delivery_by='platform' AND o.handoff_at > ? ORDER BY at DESC LIMIT 10`, [since]);
  const readyItems = q.all(`SELECT e.id AS event_id, o.id, o.number, o.total, o.status, e.created_at AS at, 'ready' AS kind, s.name_ar AS store_name,
      o.delivery_mode AS route_mode,
      CASE WHEN o.delivery_group IS NULL THEN 1 ELSE (SELECT COUNT(*) FROM orders g WHERE COALESCE(g.delivery_route_id,g.delivery_group,'order:' || g.id)=COALESCE(o.delivery_route_id,o.delivery_group,'order:' || o.id) AND g.status<>'cancelled') END AS group_count,
      CASE WHEN o.delivery_group IS NULL THEN 1 ELSE (SELECT COUNT(*) FROM orders g WHERE COALESCE(g.delivery_route_id,g.delivery_group,'order:' || g.id)=COALESCE(o.delivery_route_id,o.delivery_group,'order:' || o.id) AND g.status IN ('processing','shipped','delivered')) END AS group_ready_count
    FROM order_events e JOIN orders o ON o.id=e.order_id JOIN stores s ON s.id=o.store_id
    WHERE o.delivery_by='platform' AND e.status='processing' AND e.created_at >= ? ORDER BY e.created_at DESC, e.id DESC LIMIT 10`, [since]);
  const services = q.all("SELECT r.id, r.plan, r.type, r.created_at AS at, s.name_ar AS store_name FROM service_requests r JOIN stores s ON s.id=r.store_id WHERE r.created_at > ? ORDER BY r.created_at DESC LIMIT 10", [since]);
  res.json({
    services, servicesNew: q.val("SELECT COUNT(*) FROM service_requests WHERE status='new'"),
    sourcing: q.all("SELECT id, number, title, created_at AS at FROM sourcing_requests WHERE created_at > ? ORDER BY created_at DESC LIMIT 10", [since]), sourcingNew: q.val("SELECT COUNT(*) FROM sourcing_requests WHERE status IN ('new','approved')"),
    items, readyItems, now: new Date().toISOString().slice(0, 19).replace('T', ' '),
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
  const topStores = q.all(`SELECT s.slug, s.name_ar, COUNT(o.id) AS orders, COALESCE(SUM(CASE WHEN o.delivery_group IS NULL THEN o.total ELSE o.subtotal-o.discount END),0) AS revenue FROM stores s JOIN orders o ON o.store_id=s.id
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
  if (o.delivery_group && delivery_by !== 'platform') throw new AppError(400, 'marketplace_delivery', 'Twist handles delivery for the whole marketplace basket.');
  if (!['pending', 'confirmed', 'processing'].includes(o.status)) throw new AppError(400, 'invalid_transition', 'Too late to change delivery for this order.');
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  tx(() => {
    q.run('UPDATE orders SET delivery_by=?, handoff_at=?, updated_at=? WHERE id=?', [delivery_by, delivery_by === 'platform' ? now : null, now, o.id]);
    insert('order_events', { order_id: o.id, status: o.status, note: delivery_by === 'platform' ? '@handoff' : '@store_delivery', created_at: now });
  });
  if (delivery_by === 'platform' && o.status === 'processing') notifyPlatformDelivery(o.id, o.number);
  res.json({ id: o.id, delivery_by });
}));

r.get('/stores', h((_req, res) => {
  const stores = q.all(`
    SELECT s.id, s.slug, s.name_ar, s.name_en, s.phone, s.whatsapp, s.auto_whatsapp, s.hidden, s.show_when_empty, s.featured, s.sort_order, s.status, s.delivery_mode, s.delivery_zone, s.lat, s.lng, s.departments, s.category, s.logo_initials, s.logo_color, s.created_at,
      u.email AS owner_email, u.name AS owner_name, u.role,
      (SELECT COUNT(*) FROM products p WHERE p.store_id = s.id) AS products_count,
      (SELECT COUNT(*) FROM orders o WHERE o.store_id = s.id) AS orders_count,
      (SELECT COALESCE(SUM(CASE WHEN o.delivery_group IS NULL THEN o.total ELSE o.subtotal-o.discount END),0) FROM orders o WHERE o.store_id = s.id AND o.status <> 'cancelled') AS revenue,
      (SELECT MAX(created_at) FROM orders o WHERE o.store_id = s.id) AS last_order_at
    FROM stores s JOIN users u ON u.id = s.owner_id ORDER BY s.sort_order, s.id`);
  res.json({ stores: stores.map((s) => ({ ...s, departments: decodeDepartments(s.departments), auto_whatsapp: Boolean(s.auto_whatsapp), hidden: Boolean(s.hidden), show_when_empty: Boolean(s.show_when_empty), featured: Boolean(s.featured), owner_disabled: s.role === 'disabled' })) });
}));

r.patch('/stores/:slug', h((req, res) => {
  const body = z.object({
    auto_whatsapp: z.boolean().optional(), hidden: z.boolean().optional(), show_when_empty: z.boolean().optional(), featured: z.boolean().optional(),
    delivery_zone: z.string().trim().max(80).optional(),
    lat: z.coerce.number().min(-90).max(90).nullable().optional(), lng: z.coerce.number().min(-180).max(180).nullable().optional(),
    sort_order: z.coerce.number().int().min(0).max(9999).optional(), delivery_mode: z.enum(['store', 'platform']).optional(),
    status: z.enum(['active', 'suspended']).optional(), owner_disabled: z.boolean().optional(),
    departments: z.array(z.string().max(31)).min(1).optional(),
    name_ar: z.string().trim().min(2).max(60).optional(), name_en: z.string().trim().min(2).max(60).optional(),
    phone: z.string().trim().regex(/^01[0125][0-9]{8}$/, 'phone_invalid').optional(),
    logo_initials: z.string().trim().max(2).optional(), logo_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug_invalid').min(2).max(40).optional(),
  }).parse(req.body);
  const store = q.get('SELECT id, owner_id FROM stores WHERE slug=?', [req.params.slug]);
  if (!store) throw new AppError(404, 'not_found', 'Store not found.');
  const patch = {};
  if (body.slug && body.slug !== req.params.slug) {
    if (q.get('SELECT id FROM stores WHERE slug=?', [body.slug])) throw new AppError(422, 'validation_failed', 'This store link is already used.', { slug: 'slug_taken' });
    if (q.get('SELECT 1 FROM store_slug_aliases WHERE old_slug=? AND store_id<>?', [body.slug, store.id])) throw new AppError(422, 'validation_failed', 'This store link is already used.', { slug: 'slug_taken' });
    patch.slug = body.slug;
  }
  for (const k of ['hidden', 'show_when_empty', 'featured', 'auto_whatsapp']) if (body[k] !== undefined) patch[k] = body[k] ? 1 : 0;
  for (const k of ['sort_order', 'delivery_zone', 'lat', 'lng', 'status', 'name_ar', 'name_en', 'phone', 'logo_initials', 'logo_color']) if (body[k] !== undefined) patch[k] = body[k];
  if (body.departments) { assertDepartments(body.departments); patch.departments = encodeDepartments(body.departments); patch.category = body.departments.length === 1 ? body.departments[0] : 'mixed'; }
  update('stores', store.id, patch);
  if (body.departments) ensureDeptCategories(store.id, body.departments);
  if (patch.slug) {
    q.run('INSERT OR REPLACE INTO store_slug_aliases (old_slug, store_id) VALUES (?, ?)', [req.params.slug, store.id]);
    q.run('DELETE FROM store_slug_aliases WHERE old_slug=?', [patch.slug]);
  }
  if (body.owner_disabled !== undefined) q.run("UPDATE users SET role=? WHERE id=? AND role<>'demo'", [body.owner_disabled ? 'disabled' : 'owner', store.owner_id]);
  res.json({ slug: patch.slug || req.params.slug });
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
  lat: z.coerce.number().min(-90).max(90).optional(), lng: z.coerce.number().min(-180).max(180).optional(),
  opens_at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  closes_at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  auto_whatsapp: z.boolean().default(false),
});

const PW_CHARS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const genPassword = (n = 10) => Array.from({ length: n }, () => PW_CHARS[crypto.randomInt(PW_CHARS.length)]).join('');
const origin = (req) => `${req.protocol}://${req.get('host')}`;
const credentials = (req, slug, email, password) => ({ slug, email, password, storeUrl: `${origin(req)}/s/${slug}`, loginUrl: `${origin(req)}/login` });

r.post('/stores', h((req, res) => {
  const d = createSchema.parse(req.body);
  assertDepartments(d.departments);
  if (q.get('SELECT id FROM users WHERE email=?', [d.email])) throw new AppError(422, 'validation_failed', 'Email already in use', { email: 'email_taken' });
  const password = d.password || genPassword();
  const out = tx(() => {
    const uid = insert('users', { name: d.owner_name, email: d.email, password_hash: bcrypt.hashSync(password, 10) });
    let slug = latinSlug(d.store_name);
    if (!slug || slug.length < 2) slug = `store-${uid}`;
    let i = 1;
    const base = slug;
    while (q.get('SELECT id FROM stores WHERE slug=?', [slug])) slug = `${base}-${++i}`;
    const code = d.store_name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'SQ';
    const sid = insert('stores', {
      show_when_empty: 1,
      owner_id: uid, slug, code, delivery_mode: 'platform', name_ar: d.store_name, name_en: d.store_name, category: d.departments.length === 1 ? d.departments[0] : 'mixed', departments: encodeDepartments(d.departments),
      phone: d.phone, whatsapp: d.whatsapp || d.phone, city: 'Banha', auto_whatsapp: d.auto_whatsapp ? 1 : 0,
      address_ar: d.address || null, address_en: d.address || null, map_url: d.map_url || null, lat: d.lat ?? null, lng: d.lng ?? null,
      opens_at: d.opens_at || '10:00', closes_at: d.closes_at || '23:00',
      tagline_ar: 'أهلاً بيك في متجرنا', tagline_en: 'Welcome to our store',
      theme_json: JSON.stringify({ primary: '#1B1B1B', secondary: '#F3F0EA', accent: '#B4532A', background: '#FFFFFF', text: '#0F172A', button: '#1B1B1B', header: '#FFFFFF', footer: '#0F172A' }),
    });
    // A category per department the store sells (e.g. "فساتين"); the owner adds sub-categories under them.
    ensureDeptCategories(sid, d.departments);
    return { slug, sid, uid };
  });
  res.status(201).json({ ...credentials(req, out.slug, d.email, password), setup: makeSetupLink(req, out.uid) });
}));

r.post('/stores/:slug/login-as', h((req, res) => {
  const store = q.get('SELECT s.id, u.id AS uid, u.name, u.email, u.role FROM stores s JOIN users u ON u.id = s.owner_id WHERE s.slug=?', [req.params.slug]);
  if (!store) throw new AppError(404, 'not_found', 'Store not found.');
  if (store.role === 'disabled') throw new AppError(403, 'account_disabled', 'This account is disabled.');
  res.json({ token: signToken({ id: store.uid }), user: { id: store.uid, name: store.name, email: store.email } });
}));

r.delete('/stores/:slug', h(async (req, res) => {
  const body = z.object({ confirm: z.string() }).parse(req.body);
  const store = q.get('SELECT id, owner_id FROM stores WHERE slug=?', [req.params.slug]);
  if (!store) throw new AppError(404, 'not_found', 'Store not found.');
  if (body.confirm !== req.params.slug) throw new AppError(422, 'validation_failed', 'Type the store slug to confirm.', { confirm: 'mismatch' });
  const files = q.all('SELECT * FROM media WHERE store_id=?', [store.id]);
  tx(() => {
    q.run('DELETE FROM stores WHERE id=?', [store.id]); // cascades products, orders, customers, media rows, etc.
    q.run('DELETE FROM users WHERE id=?', [store.owner_id]);
  });
  // free the disk space the store's photos were using (DB rows alone don't release it)
  for (const m of files) { try { await purgeMediaFiles(m); } catch { /* ignore */ } }
  try { fs.rmSync(path.join(config.mediaDir, String(store.id)), { recursive: true, force: true }); } catch { /* ignore */ }
  res.json({ deleted: req.params.slug });
}));

/* ------------------------------------------------ departments (managed by the team) */
const deptSchema = z.object({
  name_ar: z.string().trim().min(2).max(40), name_en: z.string().trim().min(2).max(40),
  sizes: z.array(z.string().trim().min(1).max(12)).max(40).default([]),
  sort: z.coerce.number().int().min(0).max(999).optional(), active: z.boolean().optional(),
  parent: z.string().trim().toLowerCase().nullable().optional(),
});
function checkDeptParent(parent, self) {
  if (!parent) return null;
  const p = q.get('SELECT slug FROM departments WHERE slug=?', [parent]);
  if (!p || p.slug === self) throw new AppError(422, 'validation_failed', 'Main section not found.', { parent: 'parent_invalid' });
  if (deptAncestors(p.slug).length >= 2) throw new AppError(422, 'validation_failed', 'Sections can be nested at most 3 levels deep.', { parent: 'parent_too_deep' });
  return p.slug;
}
r.get('/departments', h((_req, res) => res.json({ departments: listDepartments({ all: true }) })));
r.post('/departments', h((req, res) => {
  const body = deptSchema.extend({ slug: z.string().trim().toLowerCase().optional() }).parse(req.body);
  let slug = (body.slug || body.name_en).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);
  if (!DEPT_SLUG_RE.test(slug)) throw new AppError(422, 'validation_failed', 'Use an English key like "perfumes".', { slug: 'slug_invalid' });
  if (q.get('SELECT id FROM departments WHERE slug=?', [slug])) throw new AppError(422, 'validation_failed', 'This department already exists.', { slug: 'slug_taken' });
  const sort = body.sort ?? (q.val('SELECT COALESCE(MAX(sort),0)+1 FROM departments'));
  insert('departments', { slug, name_ar: body.name_ar, name_en: body.name_en, sizes_json: JSON.stringify([...new Set(body.sizes)]), sort, active: 1, parent_slug: checkDeptParent(body.parent, slug) });
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
    parent_slug: body.parent === undefined ? undefined : (body.parent && deptAncestors(body.parent).includes(d.slug)) ? (() => { throw new AppError(422, 'validation_failed', 'A section cannot sit under its own sub-section.', { parent: 'parent_invalid' }); })() : checkDeptParent(body.parent, d.slug),
  });
  res.json({ departments: listDepartments({ all: true }) });
}));
const deptUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
r.post('/look-of-day/image', deptUpload.single('file'), h(async (req, res) => {
  if (!req.file) throw new AppError(422, 'validation_failed', 'Pick an image.', { file: 'required' });
  res.json({ image: await saveLookOfDayImage(req.file.buffer) });
}));
r.post('/departments/:id/image', deptUpload.single('file'), h(async (req, res) => {
  const d = q.get('SELECT * FROM departments WHERE id=?', [Number(req.params.id)]);
  if (!d) throw new AppError(404, 'not_found', 'Department not found.');
  if (!req.file) throw new AppError(422, 'validation_failed', 'Pick an image.', { file: 'required' });
  const url = await saveDeptImage(req.file.buffer, d.slug);
  update('departments', d.id, { image: url });
  await removeDeptImage(d.image);
  res.json({ departments: listDepartments({ all: true }) });
}));
r.post('/stylist/avatar', deptUpload.single('file'), h(async (req, res) => {
  if (!req.file) throw new AppError(422, 'validation_failed', 'Pick an image.', { file: 'required' });
  const prev = stylistStatus().avatar;
  saveStylistSettings({ avatar: await saveStylistAvatar(req.file.buffer) });
  await removeDeptImage(prev);
  res.json(stylistStatus());
}));
r.delete('/stylist/avatar', h(async (_req, res) => {
  const prev = stylistStatus().avatar;
  saveStylistSettings({ avatar: '' });
  await removeDeptImage(prev);
  res.json(stylistStatus());
}));
r.delete('/departments/:id/image', h(async (req, res) => {
  const d = q.get('SELECT * FROM departments WHERE id=?', [Number(req.params.id)]);
  if (!d) throw new AppError(404, 'not_found', 'Department not found.');
  update('departments', d.id, { image: null });
  await removeDeptImage(d.image);
  res.json({ departments: listDepartments({ all: true }) });
}));

/* ---- platform homepage advertisements ---- */
r.post('/homepage-ads/image', deptUpload.single('file'), h(async (req, res) => {
  if (!req.file) throw new AppError(422, 'validation_failed', 'Pick an image.', { file: 'required' });
  res.json({ image: await saveHomepageAdImage(req.file.buffer) });
}));
r.delete('/homepage-ads/image', h(async (req, res) => {
  const body = z.object({ image: z.string().trim().min(1).max(500) }).parse(req.body);
  if (!body.image.includes('/homepage-ads/')) throw new AppError(422, 'validation_failed', 'Invalid campaign image.');
  await removeDeptImage(body.image);
  res.json({ removed: true });
}));
const homepageAdSchema = z.object({
  image: z.string().trim().min(1).max(500),
  title_ar: z.string().trim().min(2).max(80), title_en: z.string().trim().min(2).max(80),
  subtitle_ar: z.string().trim().max(160).optional().default(''), subtitle_en: z.string().trim().max(160).optional().default(''),
  cta_ar: z.string().trim().max(30).optional().default(''), cta_en: z.string().trim().max(30).optional().default(''),
  link: z.string().trim().min(1).max(200).refine((value) => value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !/[\r\n]/.test(value), 'Use a safe internal page link.'),
  starts_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  ends_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  position: z.coerce.number().int().min(0).max(999).default(0), active: z.boolean().default(true),
}).refine((value) => !value.starts_at || !value.ends_at || value.ends_at >= value.starts_at, { message: 'End date must be after start date.', path: ['ends_at'] });
const homepageAdOut = (ad) => ({
  id: ad.id, image: ad.image_url, title: { ar: ad.title_ar, en: ad.title_en },
  subtitle: { ar: ad.subtitle_ar, en: ad.subtitle_en }, cta: { ar: ad.cta_ar, en: ad.cta_en },
  link: ad.link, startsAt: ad.starts_at, endsAt: ad.ends_at, position: ad.position, active: !!ad.active,
});
const homepageAdsOut = () => q.all('SELECT * FROM homepage_ads ORDER BY position, id').map(homepageAdOut);
const homepageAdWrite = (ad) => ({
  image_url: ad.image, title_ar: ad.title_ar, title_en: ad.title_en,
  subtitle_ar: ad.subtitle_ar, subtitle_en: ad.subtitle_en, cta_ar: ad.cta_ar, cta_en: ad.cta_en,
  link: ad.link, starts_at: ad.starts_at || null, ends_at: ad.ends_at || null,
  position: ad.position, active: Number(ad.active),
});
r.get('/homepage-ads', h((_req, res) => res.json({ items: homepageAdsOut() })));
r.post('/homepage-ads', h((req, res) => {
  const ad = homepageAdSchema.parse(req.body);
  const id = insert('homepage_ads', homepageAdWrite(ad));
  res.status(201).json({ ad: homepageAdOut(q.get('SELECT * FROM homepage_ads WHERE id=?', [id])), items: homepageAdsOut() });
}));
r.put('/homepage-ads/:id', h(async (req, res) => {
  const existing = q.get('SELECT * FROM homepage_ads WHERE id=?', [Number(req.params.id)]);
  if (!existing) throw new AppError(404, 'not_found', 'Homepage ad not found.');
  const ad = homepageAdSchema.parse(req.body);
  update('homepage_ads', existing.id, homepageAdWrite(ad));
  if (existing.image_url !== ad.image) await removeDeptImage(existing.image_url);
  res.json({ ad: homepageAdOut(q.get('SELECT * FROM homepage_ads WHERE id=?', [existing.id])), items: homepageAdsOut() });
}));
r.patch('/homepage-ads/:id', h((req, res) => {
  const { active } = z.object({ active: z.boolean() }).parse(req.body);
  const changed = q.run('UPDATE homepage_ads SET active=? WHERE id=?', [Number(active), Number(req.params.id)]).changes;
  if (!changed) throw new AppError(404, 'not_found', 'Homepage ad not found.');
  res.json({ items: homepageAdsOut() });
}));
r.delete('/homepage-ads/:id', h(async (req, res) => {
  const existing = q.get('SELECT * FROM homepage_ads WHERE id=?', [Number(req.params.id)]);
  if (!existing) throw new AppError(404, 'not_found', 'Homepage ad not found.');
  q.run('DELETE FROM homepage_ads WHERE id=?', [existing.id]);
  await removeDeptImage(existing.image_url);
  res.json({ items: homepageAdsOut() });
}));

r.delete('/departments/:id', h((req, res) => {
  const d = q.get('SELECT * FROM departments WHERE id=?', [Number(req.params.id)]);
  if (!d) throw new AppError(404, 'not_found', 'Department not found.');
  const used = q.val("SELECT COUNT(*) FROM stores WHERE departments LIKE '%,' || ? || ',%'", [d.slug]);
  if (q.val('SELECT COUNT(*) FROM departments WHERE parent_slug=?', [d.slug])) throw new AppError(409, 'department_has_children', 'Delete or move the sections under it first.');
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

/** Set a new password for the store owner (typed by the admin, or generated). Returned once so it can be handed over; only a hash is stored. */
r.post('/stores/:slug/reset-password', h((req, res) => {
  const { password } = z.object({ password: z.string().min(8).max(100).optional() }).parse(req.body || {});
  const row = q.get('SELECT u.id, u.email FROM stores s JOIN users u ON u.id=s.owner_id WHERE s.slug=?', [req.params.slug]);
  if (!row) throw new AppError(404, 'not_found', 'Store not found.');
  const pw = password || genPassword();
  update('users', row.id, { password_hash: bcrypt.hashSync(pw, 10), setup_token_hash: null, setup_expires: null });
  res.json(credentials(req, req.params.slug, row.email, pw));
}));

r.post('/stores/:slug/setup-link', h((req, res) => {
  const user = q.get('SELECT u.id FROM stores s JOIN users u ON u.id=s.owner_id WHERE s.slug=?', [req.params.slug]);
  if (!user) throw new AppError(404, 'not_found', 'Store not found.');
  res.json(makeSetupLink(req, user.id));
}));

export default r;
