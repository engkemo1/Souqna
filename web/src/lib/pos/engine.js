/**
 * Pure cashier logic — no React, no browser APIs — so it can be tested in Node.
 * Money is whole EGP (integers), the same as the rest of the platform.
 */

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export const normCode = (v) => String(v ?? '').trim().toLowerCase()
  .replace(/[٠-٩]/g, (d) => AR_DIGITS.indexOf(d))
  .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/\.0+$/, '');

export const normText = (v) => String(v ?? '').toLowerCase()
  .replace(/[ً-ٰٟـ]/g, '')
  .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/[٠-٩]/g, (d) => AR_DIGITS.indexOf(d));

/* ------------------------------------------------------------------ catalogue */

/** code -> every product/variant that carries it, so a duplicated code is detected instead of guessed. */
export function buildIndex(products) {
  const byCode = new Map();
  const add = (code, hit) => {
    const k = normCode(code); if (!k) return;
    const list = byCode.get(k); if (list) list.push(hit); else byCode.set(k, [hit]);
  };
  for (const p of products) {
    add(p.barcode, { product: p, variant: null }); add(p.sku, { product: p, variant: null });
    for (const v of p.variants || []) { add(v.barcode, { product: p, variant: v }); add(v.sku, { product: p, variant: v }); }
  }
  return byCode;
}

/** Exact scan/typed code. Returns { hit } | { ambiguous: true } | null. */
export function lookupCode(index, raw) {
  const list = index.get(normCode(raw));
  if (!list) return null;
  const uniq = [...new Map(list.map((h) => [`${h.product.id}:${h.variant?.id || 0}`, h])).values()];
  return uniq.length === 1 ? { hit: uniq[0] } : { ambiguous: true, hits: uniq };
}

export function searchProducts(products, text, limit = 60) {
  const tokens = normText(text).split(/\s+/).filter(Boolean);
  if (!tokens.length) return products.slice(0, limit);
  const out = [];
  for (const p of products) {
    const hay = normText([p.name, p.sku, p.barcode, ...(p.variants || []).flatMap((v) => [v.sku, v.barcode, v.color, v.size])].join(' '));
    if (!tokens.every((t) => hay.includes(t))) continue;
    out.push({ p, rank: normText(p.name).startsWith(tokens[0]) ? 0 : 1 });
  }
  return out.sort((a, b) => a.rank - b.rank).slice(0, limit).map((x) => x.p);
}

export const productStock = (p) => (p.variants?.length ? p.variants.reduce((s, v) => s + v.stock, 0) : p.stock);

/** Fill only blank listing fields from a photo suggestion and retain exactly what AI supplied for later correction. */
export function applyPhotoSuggestion(suggestion = {}, current = {}, previousDraft = {}) {
  const patch = {};
  for (const key of ['name_ar', 'name_en', 'description_ar', 'description_en', 'department']) {
    const value = String(suggestion[key] || '').trim();
    if (value && !String(current[key] || '').trim()) patch[key] = value;
  }
  const draft = { ...previousDraft, ...patch };
  return { patch, draft: Object.keys(draft).length ? draft : null };
}

/* ------------------------------------------------------------------ cart */

export const lineKey = (productId, variantId) => `${productId}:${variantId || 0}`;

export function addToCart(cart, product, variant = null, qty = 1) {
  const key = lineKey(product.id, variant?.id);
  const i = cart.findIndex((l) => l.key === key);
  if (i >= 0) return cart.map((l, j) => (j === i ? { ...l, qty: Math.min(1000, l.qty + qty) } : l));
  return [...cart, {
    key, productId: product.id, variantId: variant?.id ?? null, name: product.name,
    color: variant?.color || '', size: variant?.size || '', sku: variant?.sku || product.sku || '', barcode: variant?.barcode || product.barcode || '',
    price: product.price, qty: Math.min(1000, Math.max(1, Math.floor(qty))), discount: 0, track: !!product.track, stock: variant ? variant.stock : product.stock,
  }];
}
export const setQty = (cart, key, qty) => (qty < 1 ? cart.filter((l) => l.key !== key) : cart.map((l) => (l.key === key ? { ...l, qty: Math.min(1000, Math.floor(qty)) } : l)));
export const setLinePrice = (cart, key, price) => cart.map((l) => (l.key === key ? { ...l, price: Math.max(0, Math.round(price) || 0) } : l));
export const setLineDiscount = (cart, key, discount) => cart.map((l) => (l.key === key ? { ...l, discount: Math.max(0, Math.round(discount) || 0) } : l));

/** discount = { type: 'amount' | 'percent', value } */
export function totals(cart, discount = { type: 'amount', value: 0 }) {
  const subtotal = cart.reduce((s, l) => s + Math.max(0, l.price * l.qty - l.discount), 0);
  const raw = discount.type === 'percent' ? Math.round((subtotal * Math.min(100, Math.max(0, Number(discount.value) || 0))) / 100) : Math.round(Number(discount.value) || 0);
  const disc = Math.min(Math.max(0, raw), subtotal);
  return { subtotal, discount: disc, total: subtotal - disc, pieces: cart.reduce((s, l) => s + l.qty, 0) };
}

/** Keep the return confirmation preview identical to the server's integer-pound refund allocation. */
export function returnRefundPreview(items, invoice, selected = {}) {
  const baseSubtotal = items.reduce((sum, item) => sum + item.price * item.qty - item.discount, 0);
  const discountBudget = Math.min(invoice.discount || 0, baseSubtotal);
  const shares = items.map((item) => {
    const net = item.price * item.qty - item.discount;
    const exact = baseSubtotal > 0 ? (net * discountBudget) / baseSubtotal : 0;
    const floor = Math.floor(exact);
    return { id: item.id, net, share: floor, remainder: exact - floor };
  });
  const left = discountBudget - shares.reduce((sum, item) => sum + item.share, 0);
  for (const item of [...shares].sort((a, b) => b.remainder - a.remainder || a.id - b.id).slice(0, left)) item.share++;
  const byId = new Map(shares.map((item) => [item.id, item]));
  return items.reduce((sum, item) => {
    const qty = Math.min(item.qty - (item.returnedQty || 0), Math.max(0, selected[item.id] || 0));
    if (!qty) return sum;
    const line = byId.get(item.id);
    const refundable = Math.max(0, line.net - line.share);
    const before = item.returnedQty || 0;
    return sum + Math.round((refundable * (before + qty)) / item.qty) - Math.round((refundable * before) / item.qty);
  }, 0);
}

/* ------------------------------------------------------------------ payments */

export function settle(total, payments) {
  const paid = payments.reduce((s, p) => s + (Math.round(p.amount) || 0), 0);
  const cash = payments.filter((p) => p.method === 'cash').reduce((s, p) => s + (Math.round(p.amount) || 0), 0);
  const excess = Math.max(0, paid - total);
  const change = Math.min(excess, cash);
  return { paid, remaining: Math.max(0, total - paid), change, ok: paid >= total && excess <= cash };
}

/* ------------------------------------------------------------------ the sale record */

export function buildSale({ uuid, localNo, createdAt, cart, discount, payments, customerName = '', customerPhone = '', note = '', reservation = null, shiftId = null }) {
  const t = totals(cart, discount);
  const s = settle(t.total, payments);
  if (!cart.length) throw new Error('empty_cart');
  if (!s.ok) throw new Error('underpaid');
  const clean = payments.filter((p) => Math.round(p.amount) > 0).map((p) => ({ method: p.method, amount: Math.round(p.amount) }));
  return {
    body: {
      uuid, localNo, createdAt,
      ...(shiftId ? { shiftId } : {}),
      items: cart.map((l) => ({ productId: l.productId, variantId: l.variantId, qty: l.qty, price: l.price, discount: l.discount })),
      discount: t.discount, payments: clean,
      ...(customerName ? { customerName } : {}), ...(customerPhone ? { customerPhone } : {}), ...(note ? { note } : {}),
      ...(reservation ? { reservationId: reservation.id } : {}),
    },
    // what the receipt needs while the server has not numbered the invoice yet
    receipt: {
      uuid, localNo, createdAt, number: null,
      items: cart.map((l) => ({ name: l.name, color: l.color, size: l.size, price: l.price, qty: l.qty, discount: l.discount })),
      subtotal: t.subtotal, discount: t.discount, total: t.total, paid: s.paid, change: s.change, payments: clean, customerName,
      ...(reservation ? { reservationNumber: reservation.number } : {}),
    },
  };
}

/**
 * The lines of a sale that really leave the shelf now. Pieces bought for a reservation were already taken out of
 * stock when the shopper reserved them, so they are not taken out again.
 */
export function stockItems(items, reservation = null) {
  if (!reservation) return items;
  const left = new Map();
  for (const i of reservation.items || []) left.set(lineKey(i.productId, i.variantId), (left.get(lineKey(i.productId, i.variantId)) || 0) + i.qty);
  return items.map((i) => {
    const k = lineKey(i.productId, i.variantId);
    const covered = Math.min(i.qty, left.get(k) || 0);
    if (covered) left.set(k, left.get(k) - covered);
    return { ...i, qty: i.qty - covered };
  }).filter((i) => i.qty > 0);
}

/** Cart lines for a reservation the shopper came for, priced as reserved, using the catalogue when the item is there. */
export function reservationCart(products, reservation) {
  let cart = [];
  for (const i of reservation.items) {
    const p = products.find((x) => x.id === i.productId);
    const v = p && i.variantId ? p.variants?.find((x) => x.id === i.variantId) : null;
    const base = p || { id: i.productId, name: i.name, sku: '', barcode: '', price: i.price, track: false, stock: 0, variants: [] };
    cart = addToCart(cart, { ...base, price: i.price }, v || (i.variantId ? { id: i.variantId, color: i.color, size: i.size, sku: '', barcode: '', stock: 0 } : null), i.qty);
  }
  // reserved pieces are waiting in the shop, so "more than stock" does not apply to them
  return cart.map((l) => ({ ...l, stock: l.stock + l.qty, reserved: l.qty }));
}

/** Optimistic local stock so the screen shows what is left even before the server has heard about the sale. */
export function applyLocalStock(products, items, sign = -1) {
  const by = new Map(items.map((i) => [lineKey(i.productId, i.variantId), i]));
  const qtyFor = (pid, vid) => by.get(lineKey(pid, vid))?.qty || 0;
  return products.map((p) => {
    if (!p.track) return p;
    if (p.variants?.length) {
      let touched = false;
      const variants = p.variants.map((v) => { const q = qtyFor(p.id, v.id); if (!q) return v; touched = true; return { ...v, stock: Math.max(0, v.stock + sign * q) }; });
      return touched ? { ...p, variants, stock: variants.reduce((s, v) => s + v.stock, 0) } : p;
    }
    const q = qtyFor(p.id, null);
    return q ? { ...p, stock: Math.max(0, p.stock + sign * q) } : p;
  });
}

/* ------------------------------------------------------------------ queue sync */

/**
 * Sends waiting sales to the server, oldest first, one at a time.
 *  - success or "duplicate"         -> done, removed from the queue
 *  - no network / 5xx / 429 / 401   -> stop here and keep everything for the next try
 *  - any other refusal (422, 403…)  -> that sale is marked failed with the reason; the rest continue
 * `send(body)` resolves with the server's sale or throws { status, code, message }.
 */
export async function syncQueue({ entries, send, onResult }) {
  const waiting = entries.filter((e) => e.state === 'pending').sort((a, b) => (a.body.createdAt < b.body.createdAt ? -1 : 1));
  const done = []; const failed = []; let stopped = null;
  for (const e of waiting) {
    try {
      const sale = await send(e.body);
      done.push({ uuid: e.uuid, number: sale.number, sale });
      await onResult?.(e, { ok: true, sale });
    } catch (err) {
      const status = Number(err?.status) || 0;
      if (status === 0 || status >= 500 || status === 429 || status === 401) { stopped = status === 401 ? 'auth' : 'network'; break; }
      const info = { code: err.code || 'rejected', message: err.message || 'Rejected by the server' };
      failed.push({ uuid: e.uuid, ...info });
      await onResult?.(e, { ok: false, ...info });
    }
  }
  return { done, failed, stopped, left: waiting.length - done.length - failed.length };
}

/* ------------------------------------------------------------------ misc */

export const newUuid = () => (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);

/** Detects scanner-style typing: many characters in a row, a few ms apart, ending with Enter. */
export function createScanBuffer({ gapMs = 60, minLength = 4 } = {}) {
  let buf = ''; let last = 0;
  return {
    push(key, now = Date.now()) {
      if (key === 'Enter') { const out = buf; buf = ''; return out.length >= minLength ? out : null; }
      if (key.length !== 1) return null;
      buf = now - last > gapMs ? key : buf + key; last = now;
      return null;
    },
    reset() { buf = ''; },
  };
}
