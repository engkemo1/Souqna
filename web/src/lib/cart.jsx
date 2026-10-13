import { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react';

const CartContext = createContext(null);
const KEY = 'souqna.carts.v1';
const MARKET_KEY = 'souqna.market-cart.v1';
const FAV = 'souqna.favorites.v1';

const load = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
const persist = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

export function CartProvider({ children }) {
  const [carts, setCarts] = useState(() => load(KEY));
  const [marketCart, setMarketCart] = useState(() => load(MARKET_KEY));
  const [favs, setFavs] = useState(() => load(FAV));
  const [drawer, setDrawer] = useState({ open: false, slug: null });
  const [bump, setBump] = useState(0);

  useEffect(() => persist(KEY, carts), [carts]);
  useEffect(() => persist(MARKET_KEY, marketCart), [marketCart]);
  useEffect(() => persist(FAV, favs), [favs]);

  const value = useMemo(() => ({ carts, setCarts, marketCart, setMarketCart, favs, setFavs, drawer, setDrawer, bump, setBump }), [carts, marketCart, favs, drawer, bump]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useMarketCart() {
  const ctx = useContext(CartContext);
  const items = Object.values(ctx.marketCart || {});
  const count = items.reduce((sum, line) => sum + line.qty, 0);
  const subtotal = items.reduce((sum, line) => sum + line.qty * line.price, 0);
  const add = useCallback((line, store) => {
    const key = `${store.slug}:${line.productId}:${line.variantId || 0}`;
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
  return { items, count, subtotal, add, updateQty, remove, clear };
}

const lineKey = (productId, variantId) => `${productId}:${variantId || 0}`;

export function useCart(slug) {
  const ctx = useContext(CartContext);
  const items = ctx.carts[slug] || [];
  const set = useCallback((fn) => ctx.setCarts((c) => ({ ...c, [slug]: fn(c[slug] || []) })), [ctx, slug]);

  const add = useCallback((line) => {
    const key = lineKey(line.productId, line.variantId);
    set((list) => {
      const found = list.find((l) => l.key === key);
      if (found) return list.map((l) => (l.key === key ? { ...l, qty: Math.min(20, l.qty + (line.qty || 1)) } : l));
      return [{ ...line, key, qty: line.qty || 1, addedAt: Date.now() }, ...list];
    });
    ctx.setBump((b) => b + 1);
  }, [set, ctx]);

  const updateQty = useCallback((key, qty) => set((list) => list.map((l) => (l.key === key ? { ...l, qty: Math.max(1, Math.min(20, qty)) } : l))), [set]);
  const remove = useCallback((key) => {
    let removed = null;
    set((list) => { removed = list.find((l) => l.key === key); return list.filter((l) => l.key !== key); });
    return removed;
  }, [set]);
  const restore = useCallback((line) => set((list) => [line, ...list.filter((l) => l.key !== line.key)]), [set]);
  const clear = useCallback(() => set(() => []), [set]);

  const { setDrawer } = ctx;
  const open = useCallback(() => setDrawer({ open: true, slug }), [setDrawer, slug]);
  const close = useCallback(() => setDrawer({ open: false, slug }), [setDrawer, slug]);

  const count = items.reduce((s, l) => s + l.qty, 0);
  const subtotal = items.reduce((s, l) => s + l.qty * l.price, 0);

  return {
    items, count, subtotal, add, updateQty, remove, restore, clear, bump: ctx.bump,
    isOpen: ctx.drawer.open && ctx.drawer.slug === slug,
    open,
    close,
  };
}

export function useFavorites(slug) {
  const ctx = useContext(CartContext);
  const ids = ctx.favs[slug] || [];
  const toggle = useCallback((id) => {
    let added = false;
    ctx.setFavs((f) => {
      const list = f[slug] || [];
      added = !list.includes(id);
      return { ...f, [slug]: added ? [id, ...list] : list.filter((x) => x !== id) };
    });
    return !ids.includes(id);
  }, [ctx, slug, ids]);
  return { ids, has: (id) => ids.includes(id), toggle, count: ids.length };
}
