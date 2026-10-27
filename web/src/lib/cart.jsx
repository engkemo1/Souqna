import { createContext, useCallback, useContext, useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const CartContext = createContext(null);
const KEY = 'souqna.carts.v1';
const MARKET_KEY = 'souqna.market-cart.v1';
const FAV = 'souqna.favorites.v1';

const load = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
const persist = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

/** One basket for the whole marketplace: lines the shopper put in an old per-store cart are moved into it once. */
function loadMarketCart() {
  const market = load(MARKET_KEY);
  const old = load(KEY);
  let moved = false;
  for (const [slug, list] of Object.entries(old)) {
    if (!Array.isArray(list)) continue;
    for (const l of list) {
      const key = `${slug}:${l.productId}:${l.variantId || 0}`;
      if (!market[key]) { market[key] = { ...l, key, storeSlug: slug, storeName: l.storeName || { ar: slug, en: slug }, qty: l.qty || 1 }; moved = true; }
    }
  }
  if (Object.keys(old).length) { if (moved) persist(MARKET_KEY, market); persist(KEY, {}); }
  return market;
}

export function CartProvider({ children }) {
  const [carts, setCarts] = useState({});
  const [marketCart, setMarketCart] = useState(loadMarketCart);
  const storeNames = useRef({});
  const [favs, setFavs] = useState(() => load(FAV));
  const [drawer, setDrawer] = useState({ open: false, slug: null });
  const [bump, setBump] = useState(0);

    useEffect(() => persist(MARKET_KEY, marketCart), [marketCart]);
  useEffect(() => persist(FAV, favs), [favs]);

  const value = useMemo(() => ({ carts, setCarts, storeNames, marketCart, setMarketCart, favs, setFavs, drawer, setDrawer, bump, setBump }), [carts, marketCart, favs, drawer, bump]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useMarketCart() {
  const ctx = useContext(CartContext);
  const items = Object.values(ctx.marketCart || {});
  const count = items.reduce((sum, line) => sum + line.qty, 0);
  const subtotal = items.reduce((sum, line) => sum + line.qty * line.price, 0);
  const add = useCallback((line, store) => {
    const key = `${store.slug}:${line.productId}:${line.variantId || 0}`;
    ctx.setBump((b) => b + 1);
    ctx.setMarketCart((cart) => {
      const existing = cart[key];
      return { ...cart, [key]: existing
        ? { ...existing, qty: Math.min(20, existing.qty + (line.qty || 1)) }
        : { ...line, key, storeSlug: store.slug, storeName: store.name, qty: line.qty || 1, addedAt: Date.now() } };
    });
  }, [ctx]);
  const updateQty = useCallback((key, qty) => ctx.setMarketCart((cart) => ({ ...cart, [key]: { ...cart[key], qty: Math.max(1, Math.min(20, qty)) } })), [ctx]);
  const remove = useCallback((key) => ctx.setMarketCart((cart) => { const next = { ...cart }; delete next[key]; return next; }), [ctx]);
  const clear = useCallback(() => ctx.setMarketCart({}), [ctx]);
  return { items, count, subtotal, add, updateQty, remove, clear, bump: ctx.bump };
}

/** Lets the cart know a store's display name, so lines added from its pages are grouped under it. */
export function useRegisterStore(store) {
  const ctx = useContext(CartContext);
  if (store?.slug) ctx.storeNames.current[store.slug] = store.name;
}

const lineKey = (productId, variantId) => `${productId}:${variantId || 0}`;

/**
 * A store's view of the single Twist basket: the lines that belong to `slug`.
 * Everything a shopper adds from any store lives in the marketplace basket.
 */
export function useCart(slug) {
  const ctx = useContext(CartContext);
  const navigate = useNavigate();
  const all = ctx.marketCart || {};
  const items = useMemo(() => Object.values(all).filter((l) => l.storeSlug === slug).sort((x, y) => (y.addedAt || 0) - (x.addedAt || 0)), [all, slug]);
  const { setMarketCart, setBump } = ctx;

  const add = useCallback((line) => {
    const key = `${slug}:${line.productId}:${line.variantId || 0}`;
    const storeName = line.storeName || ctx.storeNames.current[slug] || { ar: slug, en: slug };
    setMarketCart((cart) => {
      const found = cart[key];
      return { ...cart, [key]: found
        ? { ...found, qty: Math.min(20, found.qty + (line.qty || 1)) }
        : { ...line, key, storeSlug: slug, storeName, qty: line.qty || 1, addedAt: Date.now() } };
    });
    setBump((b) => b + 1);
  }, [slug, ctx.storeNames, setMarketCart, setBump]);

  const updateQty = useCallback((key, qty) => setMarketCart((cart) => (cart[key] ? { ...cart, [key]: { ...cart[key], qty: Math.max(1, Math.min(20, qty)) } } : cart)), [setMarketCart]);
  const remove = useCallback((key) => {
    const removed = (ctx.marketCart || {})[key] || null;
    setMarketCart((cart) => { const next = { ...cart }; delete next[key]; return next; });
    return removed;
  }, [ctx.marketCart, setMarketCart]);
  const restore = useCallback((line) => setMarketCart((cart) => ({ ...cart, [line.key]: line })), [setMarketCart]);
  const clear = useCallback(() => setMarketCart((cart) => Object.fromEntries(Object.entries(cart).filter(([, l]) => l.storeSlug !== slug))), [setMarketCart, slug]);

  const open = useCallback(() => navigate('/market-cart'), [navigate]);
  const close = useCallback(() => {}, []);

  const count = items.reduce((s, l) => s + l.qty, 0);
  const subtotal = items.reduce((s, l) => s + l.qty * l.price, 0);

  return { items, count, subtotal, add, updateQty, remove, restore, clear, bump: ctx.bump, isOpen: false, open, close };
}

export function useFavorites(slug) {
  const ctx = useContext(CartContext);
  const allIds = useMemo(() => [...new Set(Object.values(ctx.favs || {}).flat().map(Number).filter(Boolean))], [ctx.favs]);
  const ids = slug ? (ctx.favs[slug] || []) : allIds;
  const toggle = useCallback((id) => {
    if (!slug) {
      // If no slug is specified, find the store that has this id and remove it
      ctx.setFavs((f) => {
        const next = { ...f };
        for (const [s, list] of Object.entries(next)) {
          if (list.includes(id)) next[s] = list.filter((x) => x !== id);
        }
        return next;
      });
      return false;
    }
    let added = false;
    ctx.setFavs((f) => {
      const list = f[slug] || [];
      added = !list.includes(id);
      return { ...f, [slug]: added ? [id, ...list] : list.filter((x) => x !== id) };
    });
    return !ids.includes(id);
  }, [ctx, slug, ids]);
  return { ids, has: (id) => (slug ? ids.includes(id) : allIds.includes(id)), toggle, count: ids.length };
}

export function useMarketFavorites() {
  const ctx = useContext(CartContext);
  const favs = ctx.favs || {};
  const items = useMemo(() => {
    const list = [];
    for (const [slug, ids] of Object.entries(favs)) {
      if (Array.isArray(ids)) {
        for (const id of ids) list.push({ slug, id: Number(id) });
      }
    }
    return list;
  }, [favs]);
  const ids = useMemo(() => [...new Set(items.map((x) => x.id))], [items]);
  const remove = useCallback((id, storeSlug) => {
    ctx.setFavs((f) => {
      if (storeSlug) {
        const list = f[storeSlug] || [];
        return { ...f, [storeSlug]: list.filter((x) => x !== id) };
      }
      const next = { ...f };
      for (const [s, list] of Object.entries(next)) {
        if (list.includes(id)) next[s] = list.filter((x) => x !== id);
      }
      return next;
    });
  }, [ctx]);
  const clear = useCallback(() => ctx.setFavs({}), [ctx]);
  return { items, ids, count: ids.length, remove, clear };
}
