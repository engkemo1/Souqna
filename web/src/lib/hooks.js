import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

/* Tiny stale-while-revalidate cache: instant back-navigation, fresh data after. */
const cache = new Map();
export const invalidate = (prefix = '') => { for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k); };
export const primeCache = (key, data) => cache.set(key, data);

export function useApi(path, { enabled = true, keepPrevious = true } = {}) {
  const [state, setState] = useState(() => ({ data: path ? cache.get(path) : undefined, error: null, loading: !!path && enabled && !cache.has(path) }));
  const [tick, setTick] = useState(0);
  const prev = useRef(state.data);

  useEffect(() => {
    if (!path || !enabled) return undefined;
    const ctrl = new AbortController();
    const cached = cache.get(path);
    setState((s) => ({ data: cached ?? (keepPrevious ? s.data : undefined), error: null, loading: !cached }));
    api(path, { signal: ctrl.signal })
      .then((data) => { cache.set(path, data); prev.current = data; setState({ data, error: null, loading: false }); })
      .catch((error) => { if (error.name !== 'AbortError') setState((s) => ({ ...s, error, loading: false })); });
    return () => ctrl.abort();
  }, [path, enabled, tick, keepPrevious]);

  const reload = useCallback(() => { if (path) cache.delete(path); setTick((x) => x + 1); }, [path]);
  const mutate = useCallback((updater) => setState((s) => {
    const data = typeof updater === 'function' ? updater(s.data) : updater;
    if (path) cache.set(path, data);
    return { ...s, data };
  }), [path]);

  return { ...state, reload, mutate, isRefreshing: state.loading && state.data !== undefined };
}

export function useMediaQuery(query) {
  const get = () => typeof window !== 'undefined' && window.matchMedia(query).matches;
  const [match, setMatch] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const fn = () => setMatch(mq.matches);
    fn();
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [query]);
  return match;
}

export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
export const useCanHover = () => useMediaQuery('(hover: hover) and (pointer: fine)');

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}

export function useLockBody(locked) {
  useEffect(() => {
    if (!locked) return undefined;
    const { overflow, paddingRight } = document.body.style;
    const sw = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (sw) document.body.style.paddingRight = `${sw}px`;
    return () => { document.body.style.overflow = overflow; document.body.style.paddingRight = paddingRight; };
  }, [locked]);
}

export function useLocalState(key, initial) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } }, [key, v]);
  return [v, setV];
}

export function useScrolled(offset = 8) {
  const [s, setS] = useState(false);
  useEffect(() => {
    const fn = () => setS(window.scrollY > offset);
    fn();
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, [offset]);
  return s;
}

/** Hides on scroll down, shows on scroll up — for sticky mobile headers. */
export function useScrollDirection() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    let ticking = false;
    const fn = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (Math.abs(y - last) > 6) { setHidden(y > last && y > 120); last = y; }
        ticking = false;
      });
    };
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);
  return hidden;
}
