/**
 * Promotions pricing engine - pure and deterministic (no database, no clock, no floats).
 *
 *   evaluateCart({ lines, promotions, settings, giftStock }) -> { promotions: [...applied], lines: [...with discounts], gifts: [...], hints: [...] }
 *
 * `lines`: [{ key, productId, variantId, price (whole EGP), qty, catChain: [categoryId + ancestors], excluded }]
 * `promotions`: eligible (already filtered for schedule / usage / audience), each { id, priority, stacking, def, ... }
 *
 * Rules that make the result safe:
 *  - amounts are integer piasters inside; results are whole EGP integers whose per-line parts add up exactly;
 *  - a unit can never be discounted below zero; a promotion can never exceed what its units still cost;
 *  - a unit discounted by a non-stackable offer is invisible to every other offer (no double discounting);
 *  - the same promotion is never applied twice for the same units, and a gift is given once per promotion.
 */
import { distribute, pctOf, toP, toEgp } from './money.js';
import { effectsOf } from './definition.js';

const desc = (a, b) => b.rem - a.rem || a.idx - b.idx;
const asc = (a, b) => a.rem - b.rem || a.idx - b.idx;

function matcher(sel) {
  if (!sel) return () => false;
  if (sel.all) return () => true;
  const prod = new Set(sel.products || []);
  const cats = new Set(sel.categories || []);
  return (u) => prod.has(u.productId) || u.catChain.some((c) => cats.has(c));
}

function expand(lines) {
  const units = [];
  lines.forEach((l, lineIdx) => {
    for (let k = 0; k < l.qty; k++) units.push({ idx: units.length, lineIdx, productId: l.productId, catChain: l.catChain || [], price: toP(l.price), rem: toP(l.price), claims: [], noPromo: !!l.excluded });
  });
  return units;
}

/* ------------------------------------------------------------------ conditions */

function evalGroup(g, env) {
  if (!g || !g.items?.length) return true;
  const rs = g.items.map((it) => (it.items ? evalGroup(it, env) : evalCond(it, env)));
  return g.logic === 'or' ? rs.some(Boolean) : rs.every(Boolean);
}

function evalCond(c, env) {
  if (c.kind === 'min_qty') return (c.scope === 'cart' ? env.cart : env.Q).length >= c.value;
  if (c.kind === 'min_subtotal') return (c.scope === 'cart' ? env.cart : env.Q).reduce((s, u) => s + u.rem, 0) >= toP(c.value);
  if (c.kind === 'has_products') { const m = matcher(c.selector); return env.all.filter(m).length >= c.min_qty; }
  return false;
}

/** How far is the cart from satisfying a group? Returns { qty, amount } still missing for the cheapest single failing AND-branch, or null. */
function conditionGap(g, env) {
  if (!g || !g.items?.length) return null;
  const gaps = g.items.map((it) => {
    if (it.items) return conditionGap(it, env);
    if (evalCond(it, env)) return { qty: 0, amount: 0 };
    if (it.kind === 'min_qty') return { qty: it.value - (it.scope === 'cart' ? env.cart : env.Q).length, amount: 0 };
    if (it.kind === 'min_subtotal') return { qty: 0, amount: toEgp(toP(it.value) - (it.scope === 'cart' ? env.cart : env.Q).reduce((s, u) => s + u.rem, 0)) };
    if (it.kind === 'has_products') return { qty: it.min_qty - env.all.filter(matcher(it.selector)).length, amount: 0, product: true };
    return null;
  }).filter(Boolean);
  if (!gaps.length) return null;
  if (g.logic === 'or') { if (gaps.some((x) => !x.qty && !x.amount)) return { qty: 0, amount: 0 }; return gaps.sort((a, b) => (a.qty || 1e9) - (b.qty || 1e9) || a.amount - b.amount)[0]; }
  return gaps.reduce((a, b) => ({ qty: Math.max(a.qty, b.qty), amount: Math.max(a.amount, b.amount), product: a.product || b.product }), { qty: 0, amount: 0 });
}

/* ------------------------------------------------------------------ effects
 * Each handler returns { discounts: Map(unitIdx -> piasters), apps, gifts: [], used: Set(unitIdx) } or null when it does not apply.
 * `rem` (what a unit still costs after earlier stackable offers) is always the base, so nothing can go negative. */

function addDiscount(map, u, amount) {
  const d = Math.max(0, Math.min(u.rem - (map.get(u.idx) || 0), Math.floor(amount)));
  if (d > 0) map.set(u.idx, (map.get(u.idx) || 0) + d);
  return d;
}

function pickFrom(sortedDesc, pick, count, offset = 0) {
  // sortedDesc: units of ONE group, most expensive first
  if (pick === 'most_expensive') return sortedDesc.slice(0, count);
  if (pick === 'second_most_expensive') return sortedDesc.slice(1, 1 + count);
  if (pick === 'second_cheapest') { const n = sortedDesc.length; return sortedDesc.slice(Math.max(0, n - 1 - count), Math.max(0, n - 1)); }
  return sortedDesc.slice(Math.max(0, sortedDesc.length - count)); // cheapest
}

function fx_percent_off(e, env, def) {
  const Q = env.Q;
  if (!Q.length) return null;
  const map = new Map(); const used = new Set();
  if (e.apply_to === 'all') {
    for (const u of Q) if (addDiscount(map, u, pctOf(u.rem, e.percent))) used.add(u.idx);
    return map.size ? { discounts: map, apps: 1, used } : null;
  }
  const sorted = [...Q].sort(desc);
  const size = e.group_size || sorted.length;
  let apps = 0;
  for (let i = 0; i + size <= sorted.length; i += size) {
    if (def.max_applications && apps >= def.max_applications) break;
    const grp = sorted.slice(i, i + size);
    if (e.group_size == null && i > 0) break; // without a group size the rule applies once to the whole eligible set
    for (const u of pickFrom(grp, e.apply_to, 1)) { if (addDiscount(map, u, pctOf(u.rem, e.percent))) { used.add(u.idx); } }
    apps++;
  }
  return map.size ? { discounts: map, apps, used } : null;
}

function fx_fixed_off(e, env) {
  const Q = env.Q; if (!Q.length) return null;
  const map = new Map(); const used = new Set();
  if (e.per === 'unit') { for (const u of Q) if (addDiscount(map, u, toP(e.amount))) used.add(u.idx); }
  else {
    const total = Math.min(toP(e.amount), Q.reduce((s, u) => s + u.rem, 0));
    const parts = distribute(total, Q.map((u) => u.rem), Q.map((u) => u.rem));
    Q.forEach((u, i) => { if (addDiscount(map, u, parts[i])) used.add(u.idx); });
  }
  return map.size ? { discounts: map, apps: 1, used } : null;
}

function fx_buy_x_get_y(e, env, def) {
  const map = new Map(); const used = new Set(); let apps = 0;
  const cap = def.max_applications || Infinity;
  const rewardDiscount = (u) => (e.reward_mode === 'percent' ? pctOf(u.rem, e.reward_value) : e.reward_mode === 'fixed_off' ? toP(e.reward_value) : Math.max(0, u.rem - toP(e.reward_value)));
  if (!def.reward) {
    const sorted = [...env.Q].sort(desc);
    const size = e.buy + e.get;
    for (let i = 0; i + size <= sorted.length && apps < cap; i += size) {
      const grp = sorted.slice(i, i + size);
      for (const u of pickFrom(grp, e.reward_pick, e.get)) addDiscount(map, u, rewardDiscount(u));
      grp.forEach((u) => used.add(u.idx));
      apps++;
    }
  } else {
    const isR = matcher(def.reward);
    const R = env.avail.filter((u) => isR(u) && !env.excl(u));
    const qSet = new Set(env.Q.map((u) => u.idx));
    const rSet = new Set(R.map((u) => u.idx));
    const poolQ = env.Q.filter((u) => !rSet.has(u.idx)).sort(asc);       // qualifiers that cannot be rewards first
    const both = env.Q.filter((u) => rSet.has(u.idx)).sort(desc);        // overlap: keep the cheaper ones available as rewards
    let poolR = R.filter((u) => !qSet.has(u.idx) || both.includes(u));
    const taken = new Set();
    while (apps < cap) {
      const quals = [];
      for (const u of poolQ) { if (quals.length >= e.buy) break; if (!taken.has(u.idx)) quals.push(u); }
      for (const u of both) { if (quals.length >= e.buy) break; if (!taken.has(u.idx)) quals.push(u); }
      if (quals.length < e.buy) break;
      const qIds = new Set(quals.map((u) => u.idx));
      const cands = poolR.filter((u) => !taken.has(u.idx) && !qIds.has(u.idx)).sort(desc);
      if (cands.length < e.get) break;
      const rewards = pickFrom(cands, e.reward_pick, e.get);
      if (rewards.length < e.get) break;
      let gave = 0;
      for (const u of rewards) gave += addDiscount(map, u, rewardDiscount(u));
      quals.forEach((u) => { taken.add(u.idx); used.add(u.idx); });
      rewards.forEach((u) => { taken.add(u.idx); used.add(u.idx); });
      apps++;
      if (!gave && apps > 50) break;
    }
  }
  return map.size ? { discounts: map, apps, used } : null;
}

function fx_group_price(e, env, def) {
  const sorted = [...env.Q].sort(e.pick === 'cheapest' ? asc : desc);
  const map = new Map(); const used = new Set(); let apps = 0;
  const cap = def.max_applications || Infinity;
  for (let i = 0; i + e.qty <= sorted.length && apps < cap; i += e.qty) {
    const grp = sorted.slice(i, i + e.qty);
    const sum = grp.reduce((s, u) => s + u.rem, 0);
    const off = Math.max(0, sum - toP(e.price)); // never raises a price
    if (off > 0) { const parts = distribute(off, grp.map((u) => u.rem), grp.map((u) => u.rem)); grp.forEach((u, k) => addDiscount(map, u, parts[k])); apps++; }
    grp.forEach((u) => used.add(u.idx));
  }
  return map.size ? { discounts: map, apps, used } : null;
}

function fx_tiers(e, env) {
  const Q = [...env.Q].sort(desc); const n = Q.length;
  if (!n) return null;
  const tiers = [...e.tiers].sort((a, b) => a.qty - b.qty);
  const map = new Map(); const used = new Set(); let apps = 0;
  if (e.mode === 'total_price') {
    // best partition of the sorted units into groups priced by tier (a group never costs more than its list price)
    const pre = [0]; Q.forEach((u) => pre.push(pre[pre.length - 1] + u.rem));
    const f = new Array(n + 1).fill(Infinity); const choice = new Array(n + 1).fill(0); f[0] = 0;
    for (let i = 1; i <= n; i++) {
      f[i] = f[i - 1] + Q[i - 1].rem; choice[i] = 1; // a lone unit at list price (no tier needed)
      for (const t of tiers) {
        if (t.qty > i) continue;
        const list = pre[i] - pre[i - t.qty];
        const c = f[i - t.qty] + Math.min(list, toP(t.value));
        if (c < f[i] || (c === f[i] && choice[i] === 1 && t.qty > 1)) { f[i] = c; choice[i] = t.qty; }
      }
    }
    let i = n; const groups = [];
    while (i > 0) { const k = choice[i]; groups.unshift(Q.slice(i - k, i)); i -= k; }
    for (const g of groups) {
      const tier = tiers.find((t) => t.qty === g.length);
      if (!tier) continue;
      const sum = g.reduce((s, u) => s + u.rem, 0);
      const off = Math.max(0, sum - toP(tier.value));
      if (off > 0) { const parts = distribute(off, g.map((u) => u.rem), g.map((u) => u.rem)); g.forEach((u, k) => addDiscount(map, u, parts[k])); apps++; }
      g.forEach((u) => used.add(u.idx));
    }
  } else {
    const reached = [...tiers].reverse().find((t) => n >= t.qty);
    if (!reached) return null;
    if (e.mode === 'percent') { for (const u of Q) if (addDiscount(map, u, pctOf(u.rem, reached.value))) used.add(u.idx); }
    else {
      const off = Math.min(toP(reached.value), Q.reduce((s, u) => s + u.rem, 0));
      const parts = distribute(off, Q.map((u) => u.rem), Q.map((u) => u.rem));
      Q.forEach((u, k) => { if (addDiscount(map, u, parts[k])) used.add(u.idx); });
    }
    apps = map.size ? 1 : 0;
  }
  return map.size ? { discounts: map, apps, used } : null;
}

function fx_bundle(e, env, def) {
  const slots = e.slots.map((s) => ({ ...s, m: matcher(s.sel) }));
  const pool = env.avail.filter((u) => !env.excl(u));
  const taken = new Set(); const map = new Map(); const used = new Set(); let apps = 0;
  const cap = def.max_applications || Infinity;
  const order = slots.map((s, i) => ({ s, i, n: pool.filter((u) => s.m(u)).length })).sort((a, b) => a.n - b.n || a.i - b.i);
  while (apps < cap) {
    const pick = [];
    let ok = true;
    for (const { s } of order) {
      const c = pool.filter((u) => !taken.has(u.idx) && !pick.includes(u) && s.m(u)).sort(desc);
      if (c.length < s.qty) { ok = false; break; }
      pick.push(...c.slice(0, s.qty));
    }
    if (!ok) break;
    pick.forEach((u) => taken.add(u.idx));
    const sum = pick.reduce((s, u) => s + u.rem, 0);
    const off = Math.max(0, sum - toP(e.price));
    if (off > 0) { const parts = distribute(off, pick.map((u) => u.rem), pick.map((u) => u.rem)); pick.forEach((u, k) => addDiscount(map, u, parts[k])); apps++; pick.forEach((u) => used.add(u.idx)); }
    else break; // bundle price is not cheaper than buying the pieces: do not claim the units
  }
  return map.size ? { discounts: map, apps, used } : null;
}

function fx_gift(e, env, def, promo, ctx) {
  const n = env.Q.length;
  const times = e.repeat ? Math.max(1, Math.floor(n / Math.max(1, e.every || 1))) : 1;
  const count = Math.min(times, def.max_applications || times) * e.qty;
  const options = e.gifts.filter((id) => (ctx.giftStock?.get(id) ?? 0) > 0);
  if (!options.length) return { discounts: new Map(), apps: 0, used: new Set(), gifts: [], giftUnavailable: true };
  const wanted = ctx.selections?.[promo.id];
  const productId = options.includes(wanted) ? wanted : options[0];
  return { discounts: new Map(), apps: 1, used: new Set(), gifts: [{ promotionId: promo.id, productId, qty: count, options }] };
}

const HANDLERS = { percent_off: fx_percent_off, fixed_off: fx_fixed_off, buy_x_get_y: fx_buy_x_get_y, group_price: fx_group_price, tiers: fx_tiers, bundle: fx_bundle, gift: fx_gift };

/* ------------------------------------------------------------------ one promotion */

/** Evaluate one promotion against the units still available to it. Does not mutate units. */
function evaluate(promo, units, ctx) {
  const def = promo.def;
  const inQ = matcher(def.qualify);
  const isEx = matcher(def.exclude);
  const stackable = promo.stacking === 'stackable';
  const avail = units.filter((u) => !u.noPromo && u.rem > 0 && (!u.claims.length || (stackable && u.claims.every((c) => c.stackable))));
  const excl = (u) => isEx(u);
  const Q = avail.filter((u) => (def.qualify.all || inQ(u)) && !excl(u));
  const cart = units.filter((u) => !u.noPromo && !excl(u));
  const env = { Q, avail, excl, cart, all: units };
  if (!evalGroup(def.when, env)) return { env, none: true };
  const effs = effectsOf(def);
  const total = new Map(); const used = new Set(); let apps = 0; const gifts = []; let giftUnavailable = false;
  for (const e of effs) {
    // later steps only see what earlier steps left; this keeps a multi-step rule from discounting a unit twice
    const adj = (u) => ({ ...u, rem: u.rem - (total.get(u.idx) || 0) });
    const keep = (u) => e.kind === 'gift' || (!used.has(u.idx) && u.rem - (total.get(u.idx) || 0) > 0);
    const stepEnv = { ...env, Q: Q.filter(keep).map(adj), avail: avail.filter(keep).map(adj) };
    const res = HANDLERS[e.kind](e, stepEnv, def, promo, ctx);
    if (!res) continue;
    for (const [k, v] of res.discounts) total.set(k, (total.get(k) || 0) + v);
    res.used?.forEach((k) => used.add(k));
    apps += res.apps || 0;
    if (res.gifts) gifts.push(...res.gifts);
    if (res.giftUnavailable) giftUnavailable = true;
  }
  // max discount: scale the whole promotion down proportionally, never above the cap
  let sum = [...total.values()].reduce((s, v) => s + v, 0);
  if (def.max_discount && sum > toP(def.max_discount)) {
    const keys = [...total.keys()];
    const parts = distribute(toP(def.max_discount), keys.map((k) => total.get(k)), keys.map((k) => total.get(k)));
    keys.forEach((k, i) => (parts[i] > 0 ? total.set(k, parts[i]) : total.delete(k)));
    sum = [...total.values()].reduce((s, v) => s + v, 0);
  }
  if (!sum && !gifts.length) return { env, none: true, giftUnavailable };
  return { env, discounts: total, used, apps, gifts, sum, giftUnavailable };
}

/* ------------------------------------------------------------------ whole cart */

/**
 * @param {object} p
 * @param {Array}  p.lines        cart lines (see file header)
 * @param {Array}  p.promotions   eligible promotions
 * @param {object} p.settings     { resolution: 'priority'|'best_savings', maxPerCart: number|null }
 * @param {Map}    p.giftStock    productId -> units a gift can still use
 * @param {object} p.selections   { [promotionId]: giftProductId } the shopper's gift choices
 */
export function evaluateCart({ lines, promotions = [], settings = {}, giftStock = new Map(), selections = {} }) {
  const ctx = { giftStock, selections };
  const empty = { applied: [], lines: lines.map(() => ({ promoDiscount: 0, promotions: [] })), gifts: [], hints: [], promoDiscount: 0 };
  if (!lines.length || !promotions.length) return empty;

  const byPriority = (a, b) => b.priority - a.priority || a.id - b.id;

  /** Apply promotions in the given order, each against what is left of the cart. */
  const run = (order) => {
    const units = expand(lines);
    const perPromo = []; let locked = false;
    for (const promo of order) {
      if (locked) break;
      const appliedCount = perPromo.filter((x) => !x.skipped).length;
      if (settings.maxPerCart && appliedCount >= settings.maxPerCart) break;
      if (promo.stacking === 'exclusive' && appliedCount) continue; // cannot join other offers
      const r = evaluate(promo, units, ctx);
      if (r.none) { if (r.giftUnavailable) perPromo.push({ promo, skipped: 'gift_unavailable' }); continue; }
      for (const [idx, d] of r.discounts) units[idx].rem -= d;
      for (const idx of r.used) units[idx].claims.push({ id: promo.id, stackable: promo.stacking === 'stackable' });
      perPromo.push({ promo, r });
      if (promo.stacking === 'exclusive') locked = true;
    }
    return { units, perPromo, total: perPromo.reduce((s, x) => s + (x.r?.sum || 0), 0) };
  };

  let chosen;
  if (settings.resolution === 'priority') chosen = run([...promotions].sort(byPriority));
  else {
    // highest customer savings: best combination of the normal offers vs. each exclusive offer on its own
    const fresh = expand(lines);
    const standalone = new Map(promotions.map((p) => [p.id, evaluate(p, fresh, ctx)?.sum || 0]));
    const bySavings = (a, b) => standalone.get(b.id) - standalone.get(a.id) || byPriority(a, b);
    const normal = promotions.filter((p) => p.stacking !== 'exclusive').sort(bySavings);
    const candidates = [run(normal), ...promotions.filter((p) => p.stacking === 'exclusive').sort(bySavings).map((p) => run([p]))];
    chosen = candidates.reduce((best, c) => (c.total > best.total || (c.total === best.total && c.perPromo.length < best.perPromo.length) ? c : best));
  }
  const { units, perPromo } = chosen;

  // back to whole EGP, per line, with every promotion's total rounded once
  const result = { applied: [], lines: lines.map(() => ({ promoDiscount: 0, promotions: [] })), gifts: [], hints: [] };
  const lineTotalEgp = lines.map((l) => l.price * l.qty);
  for (const x of perPromo) {
    if (x.skipped) continue;
    const { promo, r } = x;
    const byLine = new Map();
    for (const [idx, d] of r.discounts) byLine.set(units[idx].lineIdx, (byLine.get(units[idx].lineIdx) || 0) + d);
    const idxs = [...byLine.keys()];
    const egp = toEgp([...byLine.values()].reduce((s, v) => s + v, 0));
    const caps = idxs.map((i) => lineTotalEgp[i] - result.lines[i].promoDiscount);
    const parts = distribute(egp, idxs.map((i) => byLine.get(i)), caps);
    const got = parts.reduce((s, v) => s + v, 0);
    idxs.forEach((li, k) => { if (parts[k] > 0) { result.lines[li].promoDiscount += parts[k]; result.lines[li].promotions.push({ id: promo.id, discount: got ? parts[k] : 0 }); } });
    if (got > 0 || r.gifts.length) {
      result.applied.push({ id: promo.id, discount: got, applications: r.apps, gifts: r.gifts });
      result.gifts.push(...r.gifts);
    }
  }
  result.promoDiscount = result.lines.reduce((s, l) => s + l.promoDiscount, 0);
  result.hints = buildHints([...promotions].sort(byPriority), units, perPromo, ctx);
  return result;
}

/* ------------------------------------------------------------------ hints (progress toward an offer) */

function buildHints(order, units, perPromo, ctx) {
  const appliedIds = new Set(perPromo.filter((x) => !x.skipped).map((x) => x.promo.id));
  const hints = [];
  for (const promo of order) {
    const def = promo.def;
    const inQ = matcher(def.qualify); const isEx = matcher(def.exclude);
    const Q = units.filter((u) => !u.noPromo && (def.qualify.all || inQ(u)) && !isEx(u));
    if (!Q.length) continue; // only when relevant: nothing in the cart belongs to this offer yet
    const env = { Q, avail: units, excl: isEx, cart: units.filter((u) => !u.noPromo), all: units };
    const eff = effectsOf(def)[0];
    const n = Q.length;
    const gap = conditionGap(def.when, env);
    let h = null;
    if (gap && (gap.qty > 0 || gap.amount > 0)) {
      h = gap.amount > 0 ? { kind: 'add_amount', amount: gap.amount } : { kind: 'add_qty', qty: gap.qty, product: !!gap.product };
    } else if (eff.kind === 'buy_x_get_y') {
      const s = eff.buy + eff.get;
      if (!def.reward) { const m = n % s; if (m !== 0) h = { kind: 'add_qty', qty: s - m, reward: true }; }
      else if (n >= eff.buy) h = { kind: 'add_reward', qty: eff.get };
      else h = { kind: 'add_qty', qty: eff.buy - n };
    } else if (eff.kind === 'group_price') {
      const m = n % eff.qty; if (m !== 0) h = { kind: 'add_qty', qty: eff.qty - m, price: eff.price };
    } else if (eff.kind === 'tiers') {
      const next = [...eff.tiers].sort((a, b) => a.qty - b.qty).find((t) => t.qty > n);
      if (next) h = { kind: 'add_qty', qty: next.qty - n, value: next.value, mode: eff.mode };
    } else if (eff.kind === 'bundle' && !appliedIds.has(promo.id)) {
      let missing = 0;
      for (const sl of eff.slots) missing += Math.max(0, sl.qty - units.filter((u) => matcher(sl.sel)(u) && !u.noPromo).length);
      if (missing > 0) h = { kind: 'add_qty', qty: missing, bundle: true, price: eff.price };
    }
    if (h && (h.qty > 0 || h.amount > 0)) hints.push({ promotionId: promo.id, ...h });
  }
  return hints;
}
