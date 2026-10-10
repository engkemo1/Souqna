import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore, setUnauthorizedHandler } from './api.js';
import { invalidate } from './hooks.js';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, store: null, ready: !tokenStore.get() });

  const logout = useCallback(() => {
    tokenStore.set(null);
    invalidate('/owner');
    setState({ user: null, store: null, ready: true });
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!tokenStore.get()) return;
    api('/auth/me')
      .then(({ user, store }) => setState({ user, store, ready: true }))
      .catch(() => logout());
  }, [logout]);

  const login = useCallback(async (email, password) => {
    const r = await api('/auth/login', { method: 'POST', body: { email, password } });
    tokenStore.set(r.token);
    setState({ user: r.user, store: r.store, ready: true });
    return r;
  }, []);

  const register = useCallback(async (body) => {
    const r = await api('/auth/register', { method: 'POST', body });
    tokenStore.set(r.token);
    setState({ user: r.user, store: r.store, ready: true });
    return r;
  }, []);

  const setStore = useCallback((store) => setState((s) => ({ ...s, store })), []);

  const value = useMemo(() => ({ ...state, login, logout, register, setStore }), [state, login, logout, register, setStore]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
