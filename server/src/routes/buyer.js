import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { q, insert } from '../db/index.js';
import { h, AppError, notFound } from '../lib/errors.js';
import { signBuyer, requireBuyer } from '../lib/buyers.js';
import { vapidPublicKey } from '../lib/push.js';
import { mediaMap } from '../lib/media.js';
import { bi } from '../lib/serialize.js';

const r = Router();
const normPhone = (v) => { const d = String(v || '').replace(/\D/g, ''); return d.startsWith('20') && d.length === 12 ? `0${d.slice(2)}` : d; };

const attempts = new Map();
function throttle(key, max = 10) {
  const now = Date.now(); const a = (attempts.get(key) || []).filter((t) => now - t < 10 * 60e3);
  if (a.length >= max) throw new AppError(429, 'too_many_attempts', 'Too many attempts. Please wait a few minutes.');
  attempts.set(key, [...a, now]);
}
const phoneSchema = z.string().trim().transform(normPhone).refine((p) => /^01[0-9]{9}$/.test(p), 'phone_invalid');
const out = (b) => ({ id: b.id, name: b.name, phone: b.phone });
const unread = (id) => q.val('SELECT COUNT(*) FROM buyer_notifications WHERE buyer_id=? AND read=0', [id]);

r.post('/register', h((req, res) => {
  const b = z.object({ name: z.string().trim().min(2, 'required').max(60), phone: phoneSchema, password: z.string().min(6, 'password_short').max(100) }).parse(req.body);
  throttle(`reg:${req.ip}`, 8);
  if (q.get('SELECT 1 AS x FROM buyers WHERE phone=?', [b.phone])) throw new AppError(409, 'phone_taken', 'This number already has an account. Sign in instead.', { phone: 'phone_taken' });
  const id = insert('buyers', { phone: b.phone, name: b.name, password_hash: bcrypt.hashSync(b.password, 10) });
  const buyer = q.get('SELECT * FROM buyers WHERE id=?', [id]);
  res.status(201).json({ token: signBuyer(buyer), buyer: out(buyer), unread: 0 });
}));

r.post('/login', h((req, res) => {
  const b = z.object({ phone: phoneSchema, password: z.string().min(1).max(100) }).parse(req.body);
  throttle(`login:${req.ip}:${b.phone}`);
  const buyer = q.get('SELECT * FROM buyers WHERE phone=?', [b.phone]);
  if (!buyer || !bcrypt.compareSync(b.password, buyer.password_hash)) throw new AppError(401, 'invalid_credentials', 'Number or password is incorrect.');
  res.json({ token: signBuyer(buyer), buyer: out(buyer), unread: unread(buyer.id) });
}));

r.use(requireBuyer);

r.get('/me', h((req, res) => res.json({ buyer: out(req.buyer), unread: unread(req.buyer.id) })));

/* ------------------------------------------------ Twila chat history (signed-in buyers only; photos are never persisted) */
const chatMessagesSchema = z.array(z.record(z.any())).min(2).max(40);
function cleanChatMessages(messages) {
  return messages.map((message) => {
    if (message.role === 'user') return { role: 'user', content: String(message.content || '').slice(0, 700) };
    if (message.role !== 'assistant') return null;
    return {
      role: 'assistant', say: String(message.say || '').slice(0, 1400),
      ...(message.tips ? { tips: message.tips } : {}),
      ...(message.styleTips ? { styleTips: message.styleTips } : {}),
      ...(['intent', 'state', 'total', 'budget', 'overBudget', 'weatherSource', 'feedbackQuestion'].reduce((out, key) => (message[key] !== undefined ? { ...out, [key]: message[key] } : out), {})),
      ...(Array.isArray(message.looks) ? { looks: message.looks.slice(0, 4) } : {}),
      ...(Array.isArray(message.questions) ? { questions: message.questions.slice(0, 4) } : {}),
      ...(Array.isArray(message.missingItems) ? { missingItems: message.missingItems.slice(0, 12) } : {}),
      ...(Array.isArray(message.missing) ? { missing: message.missing.slice(0, 12) } : {}),
      ...(Array.isArray(message.tabs) ? { tabs: message.tabs.slice(0, 4) } : {}),
      ...(Array.isArray(message.palette) ? { palette: message.palette.slice(0, 8) } : {}),
    };
  }).filter(Boolean);
}
const chatTitle = (messages) => String(messages.find((m) => m.role === 'user')?.content || 'محادثة تويلا').replace(/[\r\n]+/g, ' ').trim().slice(0, 64) || 'محادثة تويلا';
const chatSession = (value) => {
  if (value == null) return null;
  const encoded = JSON.stringify(value);
  if (encoded.length > 20000) throw new AppError(422, 'validation_failed', 'Chat session is too large.');
  return encoded;
};
r.get('/chats', h((req, res) => {
  const items = q.all('SELECT id, title, updated_at AS updatedAt, created_at AS createdAt FROM buyer_stylist_chats WHERE buyer_id=? ORDER BY updated_at DESC, id DESC LIMIT 20', [req.buyer.id]);
  res.json({ items });
}));
r.get('/chats/:id', h((req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const row = q.get('SELECT id, title, messages_json, session_json, updated_at AS updatedAt FROM buyer_stylist_chats WHERE id=? AND buyer_id=?', [id, req.buyer.id]);
  if (!row) throw notFound('Chat');
  let messages = []; let session = null;
  try { messages = JSON.parse(row.messages_json); session = row.session_json ? JSON.parse(row.session_json) : null; } catch { throw new AppError(500, 'server_error', 'Saved chat could not be read.'); }
  res.json({ chat: { id: row.id, title: row.title, updatedAt: row.updatedAt, messages, session } });
}));
const saveChat = (req, res, create) => {
  const body = z.object({ id: z.number().int().positive().optional(), messages: chatMessagesSchema, session: z.record(z.any()).optional().nullable() }).parse(req.body);
  const messages = cleanChatMessages(body.messages);
  if (messages.length < 2 || !messages.some((message) => message.role === 'user') || !messages.some((message) => message.role === 'assistant')) throw new AppError(422, 'validation_failed', 'A saved chat needs a shopper message and a Twila reply.');
  const encoded = JSON.stringify(messages);
  if (encoded.length > 300000) throw new AppError(413, 'payload_too_large', 'This conversation is too long to save.');
  const session = chatSession(body.session);
  const title = chatTitle(messages);
  let id = create ? body.id : z.coerce.number().int().positive().parse(req.params.id);
  if (create) {
    id = insert('buyer_stylist_chats', { buyer_id: req.buyer.id, title, messages_json: encoded, session_json: session, updated_at: new Date().toISOString() });
    q.run('DELETE FROM buyer_stylist_chats WHERE buyer_id=? AND id NOT IN (SELECT id FROM buyer_stylist_chats WHERE buyer_id=? ORDER BY updated_at DESC, id DESC LIMIT 20)', [req.buyer.id, req.buyer.id]);
    return res.status(201).json({ id });
  }
  const owned = q.get('SELECT id FROM buyer_stylist_chats WHERE id=? AND buyer_id=?', [id, req.buyer.id]);
  if (!owned) throw notFound('Chat');
  q.run('UPDATE buyer_stylist_chats SET title=?, messages_json=?, session_json=?, updated_at=? WHERE id=? AND buyer_id=?', [title, encoded, session, new Date().toISOString(), id, req.buyer.id]);
  res.json({ id });
};
r.post('/chats', h((req, res) => saveChat(req, res, true)));
r.put('/chats/:id', h((req, res) => saveChat(req, res, false)));
r.delete('/chats/:id', h((req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  q.run('DELETE FROM buyer_stylist_chats WHERE id=? AND buyer_id=?', [id, req.buyer.id]);
  res.json({ ok: true });
}));

r.put('/me', h((req, res) => {
  const b = z.object({ name: z.string().trim().min(2).max(60).optional(), password: z.string().min(6).max(100).optional(), current: z.string().max(100).optional() }).parse(req.body);
  if (b.password) {
    const row = q.get('SELECT password_hash FROM buyers WHERE id=?', [req.buyer.id]);
    if (!bcrypt.compareSync(b.current || '', row.password_hash)) throw new AppError(401, 'invalid_credentials', 'Current password is incorrect.');
    q.run('UPDATE buyers SET password_hash=? WHERE id=?', [bcrypt.hashSync(b.password, 10), req.buyer.id]);
  }
  if (b.name) q.run('UPDATE buyers SET name=? WHERE id=?', [b.name, req.buyer.id]);
  res.json({ buyer: out(q.get('SELECT id, name, phone FROM buyers WHERE id=?', [req.buyer.id])) });
}));

/* ------------------------------------------------ orders (placed while signed in, or claimed with number + phone) */
const orderRows = (buyerId) => {
  const rows = q.all(`SELECT o.*, s.name_ar AS s_ar, s.name_en AS s_en, s.slug AS s_slug,
      (SELECT COUNT(*) FROM orders g WHERE g.delivery_group=o.delivery_group AND g.status<>'cancelled') AS delivery_group_count,
      (SELECT g.delivery_fee_status FROM orders g WHERE g.delivery_group=o.delivery_group AND g.status<>'cancelled' ORDER BY g.id LIMIT 1) AS delivery_group_fee_status,
      (SELECT g.delivery_fee_quote FROM orders g WHERE g.delivery_group=o.delivery_group AND g.status<>'cancelled' ORDER BY g.id LIMIT 1) AS delivery_group_fee_quote,
      CASE WHEN EXISTS(SELECT 1 FROM orders g WHERE g.delivery_group=o.delivery_group AND g.delivery_fee_status='rejected' AND g.status<>'cancelled')
        THEN (SELECT COALESCE(SUM(g.subtotal-g.discount),0) FROM orders g WHERE g.delivery_group=o.delivery_group AND g.status<>'cancelled')
        ELSE (SELECT COALESCE(SUM(g.total),0) FROM orders g WHERE g.delivery_group=o.delivery_group AND g.status<>'cancelled') END AS delivery_group_total
    FROM orders o JOIN stores s ON s.id=o.store_id WHERE o.buyer_id=? ORDER BY o.id DESC LIMIT 50`, [buyerId]);
  const items = rows.length ? q.all(`SELECT * FROM order_items WHERE order_id IN (${rows.map(() => '?').join(',')})`, rows.map((x) => x.id)) : [];
  const media = mediaMap(items.map((i) => i.media_id));
  return rows.map((o) => ({
    number: o.number, token: o.track_token, status: o.status, total: o.delivery_fee_status === 'rejected' ? o.subtotal - o.discount : o.total, createdAt: o.created_at,
    deliveryGroup: o.delivery_group, deliveryGroupCount: o.delivery_group && o.delivery_group_count ? o.delivery_group_count : null, deliveryGroupTotal: o.delivery_group && o.delivery_group_count ? o.delivery_group_total : null,
    deliveryFeeStatus: o.delivery_group_fee_status || o.delivery_fee_status, deliveryFeeQuote: o.delivery_group_fee_quote ?? o.delivery_fee_quote,
    store: { slug: o.s_slug, name: { ar: o.s_ar, en: o.s_en } },
    items: items.filter((i) => i.order_id === o.id).map((i) => ({ name: bi(i, 'name'), qty: i.qty, image: media.get(i.media_id) || null })),
  }));
};
r.get('/orders', h((req, res) => res.json({ items: orderRows(req.buyer.id) })));

r.post('/orders/claim', h((req, res) => {
  throttle(`claim:${req.ip}`, 15);
  const b = z.object({ number: z.string().trim().min(3).max(30), phone: z.string().trim().min(8).max(20) }).parse(req.body);
  const o = q.get('SELECT * FROM orders WHERE UPPER(number)=UPPER(?)', [b.number]);
  if (!o || normPhone(o.phone) !== normPhone(b.phone)) throw notFound('Order');
  if (o.buyer_id && o.buyer_id !== req.buyer.id) throw new AppError(409, 'order_claimed', 'This order belongs to another account.');
  if (o.delivery_group) q.run('UPDATE orders SET buyer_id=? WHERE delivery_group=? AND buyer_id IS NULL AND phone=?', [req.buyer.id, o.delivery_group, o.phone]);
  else q.run('UPDATE orders SET buyer_id=? WHERE id=?', [req.buyer.id, o.id]);
  res.json({ items: orderRows(req.buyer.id) });
}));

/** "Order again": the lines of an old order, re-priced and re-checked against today's stock. Out-of-stock pieces are listed in `skipped`. */
r.post('/orders/:number/reorder', h((req, res) => {
  const o = q.get('SELECT o.id, s.slug AS s_slug, s.name_ar AS s_ar, s.name_en AS s_en FROM orders o JOIN stores s ON s.id=o.store_id WHERE UPPER(o.number)=UPPER(?) AND o.buyer_id=?', [req.params.number, req.buyer.id]);
  if (!o) throw notFound('Order');
  const items = q.all('SELECT * FROM order_items WHERE order_id=?', [o.id]);
  const lines = [];
  const skipped = [];
  for (const it of items) {
    const p = it.product_id ? q.get("SELECT * FROM products WHERE id=? AND status='active'", [it.product_id]) : null;
    const v = p && it.variant_id ? q.get('SELECT * FROM variants WHERE id=? AND product_id=?', [it.variant_id, p.id]) : null;
    const available = !p ? 0 : it.variant_id && !v ? 0 : p.track_stock ? (v ? v.stock : p.stock) : 99;
    if (available <= 0) { skipped.push({ ar: it.name_ar, en: it.name_en }); continue; }
    const mediaId = q.val('SELECT media_id FROM product_media WHERE product_id=? ORDER BY is_primary DESC, position LIMIT 1', [p.id]) || it.media_id;
    lines.push({ productId: p.id, variantId: v?.id ?? null, slug: p.slug, name: { ar: p.name_ar, en: p.name_en }, price: p.price, compareAt: p.compare_at_price || null,
      mediaId, color: it.color || null, size: it.size || null, qty: Math.min(it.qty, available, 20) });
  }
  const media = mediaMap(lines.map((l) => l.mediaId));
  res.json({ store: { slug: o.s_slug, name: { ar: o.s_ar, en: o.s_en } }, lines: lines.map(({ mediaId, ...l }) => ({ ...l, image: media.get(mediaId) || null })), skipped });
}));

/* ------------------------------------------------ wardrobe: what this shopper actually bought (delivered orders) */
r.get('/wardrobe', h((req, res) => {
  const rows = q.all(`SELECT oi.product_id, oi.name_ar, oi.name_en, oi.color, oi.size, oi.media_id, o.created_at, p.slug AS pslug, p.department, s.slug AS sslug, s.name_ar AS s_ar, s.name_en AS s_en
    FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN stores s ON s.id=o.store_id LEFT JOIN products p ON p.id=oi.product_id
    WHERE o.buyer_id=? AND o.status='delivered' ORDER BY o.id DESC LIMIT 120`, [req.buyer.id]);
  const media = mediaMap(rows.map((x) => x.media_id));
  res.json({ items: rows.map((x) => ({ productId: x.product_id, name: bi(x, 'name'), color: x.color, size: x.size, department: x.department, boughtAt: x.created_at, image: media.get(x.media_id) || null, store: { slug: x.sslug, name: { ar: x.s_ar, en: x.s_en } }, slug: x.pslug })) });
}));

/* ------------------------------------------------ notifications, watches, follows, push */
r.get('/notifications', h((req, res) => {
  res.json({ items: q.all('SELECT id, kind, title, body, url, read, created_at AS createdAt FROM buyer_notifications WHERE buyer_id=? ORDER BY id DESC LIMIT 60', [req.buyer.id]).map((n) => ({ ...n, read: !!n.read })), unread: unread(req.buyer.id) });
}));
r.post('/notifications/read', h((req, res) => { q.run('UPDATE buyer_notifications SET read=1 WHERE buyer_id=?', [req.buyer.id]); res.json({ unread: 0 }); }));

r.get('/watches', h((req, res) => res.json({ productIds: q.all('SELECT product_id FROM buyer_watches WHERE buyer_id=?', [req.buyer.id]).map((x) => x.product_id) })));
r.post('/watches', h((req, res) => {
  const { productId } = z.object({ productId: z.coerce.number().int().positive() }).parse(req.body);
  if (!q.get("SELECT 1 AS x FROM products WHERE id=? AND status='active'", [productId])) throw notFound('Product');
  q.run('INSERT OR IGNORE INTO buyer_watches (buyer_id, product_id) VALUES (?,?)', [req.buyer.id, productId]);
  res.status(201).json({ ok: true });
}));
r.delete('/watches/:id', h((req, res) => { q.run('DELETE FROM buyer_watches WHERE buyer_id=? AND product_id=?', [req.buyer.id, Number(req.params.id)]); res.json({ ok: true }); }));

r.get('/follows', h((req, res) => res.json({ stores: q.all('SELECT s.slug, s.name_ar, s.name_en FROM buyer_follows f JOIN stores s ON s.id=f.store_id WHERE f.buyer_id=?', [req.buyer.id]).map((s) => ({ slug: s.slug, name: { ar: s.name_ar, en: s.name_en } })) })));
r.post('/follows', h((req, res) => {
  const { slug } = z.object({ slug: z.string().max(60) }).parse(req.body);
  const s = q.get("SELECT id FROM stores WHERE slug=? AND status='active'", [slug]);
  if (!s) throw notFound('Store');
  q.run('INSERT OR IGNORE INTO buyer_follows (buyer_id, store_id) VALUES (?,?)', [req.buyer.id, s.id]);
  res.status(201).json({ ok: true });
}));
r.delete('/follows/:slug', h((req, res) => { q.run('DELETE FROM buyer_follows WHERE buyer_id=? AND store_id=(SELECT id FROM stores WHERE slug=?)', [req.buyer.id, req.params.slug]); res.json({ ok: true }); }));

r.get('/push/key', h((_req, res) => res.json({ key: vapidPublicKey() })));
r.post('/push/subscribe', h((req, res) => {
  const b = z.object({ endpoint: z.string().url().max(600), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) }).parse(req.body);
  q.run('INSERT OR REPLACE INTO buyer_push (buyer_id, endpoint, p256dh, auth) VALUES (?,?,?,?)', [req.buyer.id, b.endpoint, b.keys.p256dh, b.keys.auth]);
  res.status(201).json({ ok: true });
}));
r.post('/push/unsubscribe', h((req, res) => {
  const { endpoint } = z.object({ endpoint: z.string().max(600) }).parse(req.body);
  q.run('DELETE FROM buyer_push WHERE buyer_id=? AND endpoint=?', [req.buyer.id, endpoint]); res.json({ ok: true });
}));

export default r;
