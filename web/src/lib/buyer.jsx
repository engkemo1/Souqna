import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, buyerTokenStore } from './api.js';

const Ctx = createContext(null);

/** Optional shopper account. Everything works signed out; signing in adds orders, wardrobe and alerts. */
export function BuyerProvider({ children }) {
  const [state, setState] = useState({ buyer: null, unread: 0, ready: !buyerTokenStore.get() });
  const refresh = useCallback(async () => {
    if (!buyerTokenStore.get()) return setState({ buyer: null, unread: 0, ready: true });
    try { const r = await api('/buyer/me'); setState({ buyer: r.buyer, unread: r.unread, ready: true }); }
    catch (e) { if (e.status === 401) buyerTokenStore.set(null); setState((s) => ({ buyer: e.status === 401 ? null : s.buyer, unread: 0, ready: true })); }
  }, []);
  useEffect(() => { refresh(); const f = () => { if (!document.hidden) refresh(); }; document.addEventListener('visibilitychange', f); const id = setInterval(f, 90000); return () => { document.removeEventListener('visibilitychange', f); clearInterval(id); }; }, [refresh]);
  const done = useCallback((r) => { buyerTokenStore.set(r.token); setState({ buyer: r.buyer, unread: r.unread || 0, ready: true }); }, []);
  const login = useCallback(async (body) => done(await api('/buyer/login', { method: 'POST', body })), [done]);
  const register = useCallback(async (body) => done(await api('/buyer/register', { method: 'POST', body })), [done]);
  const logout = useCallback(() => { buyerTokenStore.set(null); setState({ buyer: null, unread: 0, ready: true }); }, []);
  const value = useMemo(() => ({ ...state, login, register, logout, refresh, acceptSession: done, setUnread: (n) => setState((s) => ({ ...s, unread: n })) }), [state, login, register, logout, refresh, done]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useBuyer = () => useContext(Ctx);
