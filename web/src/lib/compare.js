import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'twist.compare.v1';
export const COMPARE_MAX = 4;
const listeners = new Set();
let memo = null;

const read = () => {
  if (memo) return memo;
  try { const v = JSON.parse(localStorage.getItem(KEY)); memo = Array.isArray(v) ? v.filter((x) => Number.isInteger(x) && x > 0).slice(0, COMPARE_MAX) : []; } catch { memo = []; }
  return memo;
};
const write = (list) => {
  memo = list;
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage blocked: the list still works for this tab */ }
  listeners.forEach((fn) => fn());
};
const subscribe = (fn) => {
  listeners.add(fn);
  const onStorage = (e) => { if (e.key === KEY) { memo = null; fn(); } }; // another tab changed the list
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(fn); window.removeEventListener('storage', onStorage); };
};

/** Products picked for side-by-side comparison (ids only, kept on this device, max 4). */
export function useCompare() {
  const ids = useSyncExternalStore(subscribe, read, () => []);
  const has = useCallback((id) => ids.includes(id), [ids]);
  /** @returns {'added'|'removed'|'full'} */
  const toggle = useCallback((id) => {
    const cur = read();
    if (cur.includes(id)) { write(cur.filter((x) => x !== id)); return 'removed'; }
    if (cur.length >= COMPARE_MAX) return 'full';
    write([...cur, id]); return 'added';
  }, []);
  const remove = useCallback((id) => write(read().filter((x) => x !== id)), []);
  const clear = useCallback(() => write([]), []);
  return { ids, has, toggle, remove, clear, full: ids.length >= COMPARE_MAX };
}
