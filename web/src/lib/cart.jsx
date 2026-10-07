import { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react';

const CartContext = createContext(null);
const KEY = 'souqna.carts.v1';
const FAV = 'souqna.favorites.v1';

const load = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
const persist = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

export function CartProvider({ children }) {
  const [carts, setCarts] = useState(() => load(KEY));
  const [favs, setFavs] = useState(() => load(FAV));
  const [drawer, setDrawer] = useState({ open: false, slug: null });
  const [bump, setBump] = useState(0);

  useEffect(() => persist(KEY, carts), [carts]);
  useEffect(() => persist(FAV, favs), [favs]);

  const value = useMemo(() => ({ carts, setCarts, favs, setFavs, drawer, setDrawer, bump, setBump }), [carts, favs, drawer, bump]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
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

  const count = items.reduce((s, l) => s + l.qty, 0);
  const subtotal = items.reduce((s, l) => s + l.qty * l.price, 0);

  return {
    items, count, subtotal, add, updateQty, remove, restore, clear, bump: ctx.bump,
    isOpen: ctx.drawer.open && ctx.drawer.slug === slug,
    open: () => ctx.setDrawer({ open: true, slug }),
    close: () => ctx.setDrawer({ open: false, slug }),
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
