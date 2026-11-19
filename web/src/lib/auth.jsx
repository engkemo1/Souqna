import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, tokenStore, setUnauthorizedHandler, setPasswordChangeRequiredHandler } from './api.js';
import { invalidate } from './hooks.js';
import { bioDisable } from './biometric.js';
import { keepStorage } from './pwa.js';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, store: null, ready: !tokenStore.get(), mustChangePassword: false });
  const lastRefreshedRef = useRef(Date.now());

  const logout = useCallback(() => {
    tokenStore.set(null);
    bioDisable();
    invalidate('/owner');
    setState({ user: null, store: null, ready: true, mustChangePassword: false });
  }, []);

  const refreshSession = useCallback(async () => {
    if (!tokenStore.get()) return null;
    try {
      const { user, store, token } = await api('/auth/me');
      if (token) tokenStore.set(token);
      lastRefreshedRef.current = Date.now();
      keepStorage();
      setState((prev) => ({
        ...prev,
        user,
        store,
        ready: true,
        mustChangePassword: !!user?.mustChangePassword,
      }));
      return { user, store, token };
    } catch (e) {
      if (e?.status === 401) logout();
      else setState((prev) => ({ ...prev, ready: true }));
      return null;
    }
  }, [logout]);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    setPasswordChangeRequiredHandler(() => setState((s) => ({ ...s, mustChangePassword: true })));

    if (!tokenStore.get()) return undefined;

    refreshSession();

    // Silent refresh at ~50% of 1h lifetime (every 30 minutes)
    const interval = setInterval(() => {
      refreshSession();
    }, 30 * 60 * 1000);

    // Refresh on tab focus if at least 5 minutes passed since last refresh
    const onFocus = () => {
      if (Date.now() - lastRefreshedRef.current >= 5 * 60 * 1000) {
        refreshSession();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') onFocus();
    });

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [logout, refreshSession]);

  const login = useCallback(async (email, password) => {
    const r = await api('/auth/login', { method: 'POST', body: { email, password } });
    tokenStore.set(r.token);
    setState({ user: r.user, store: r.store, ready: true, mustChangePassword: !!r.user?.mustChangePassword });
    return r;
  }, []);

  const register = useCallback(async (body) => {
    const r = await api('/auth/register', { method: 'POST', body });
    tokenStore.set(r.token);
    setState({ user: r.user, store: r.store, ready: true, mustChangePassword: false });
    return r;
  }, []);

  const changePassword = useCallback(async ({ current, password }) => {
    const r = await api('/auth/change-password', { method: 'POST', body: { current, password } });
    if (r.token) tokenStore.set(r.token);
    setState((s) => ({
      ...s,
      mustChangePassword: false,
      user: s.user ? { ...s.user, mustChangePassword: false } : s.user,
    }));
    return r;
  }, []);

  const setStore = useCallback((store) => setState((s) => ({ ...s, store })), []);

  const value = useMemo(
    () => ({ ...state, login, logout, register, changePassword, refreshSession, setStore }),
    [state, login, logout, register, changePassword, refreshSession, setStore]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
