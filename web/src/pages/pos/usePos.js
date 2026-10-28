import { useCallback, useEffect, useRef, useState } from 'react';
import { api, tokenStore } from '../../lib/api.js';
import { openPosDb } from '../../lib/pos/db.js';
import { applyLocalStock, buildSale, newUuid, stockItems, syncQueue } from '../../lib/pos/engine.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(4, '0');

/**
 * Owns everything the cashier needs to keep working without the internet:
 * the catalogue snapshot, the waiting sales, and the sync between them and the server.
 * Opening is instant from the saved snapshot; the server is asked afterwards.
 */
export function usePos() {
  const dbRef = useRef(null);
  const syncing = useRef(false);
  const numbers = useRef(new Map()); // uuid -> official number, learned during this session
  const [phase, setPhase] = useState('loading'); // loading | ready | signin | blocked | empty
  const [blocked, setBlocked] = useState(null);
  const [store, setStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [savedAt, setSavedAt] = useState(null);
  const [queue, setQueue] = useState([]);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [authExpired, setAuthExpired] = useState(false);
  const [safeStorage, setSafeStorage] = useState(true);
  const [busy, setBusy] = useState(false);
  const storeRef = useRef(null);
  const productsRef = useRef([]);
  const reservationsRef = useRef([]);
  const queueRef = useRef([]);

  const setQ = (list) => { queueRef.current = list; setQueue(list); };
  const setP = (list) => { productsRef.current = list; setProducts(list); };
  const setR = (list) => { reservationsRef.current = list; setReservations(list); };

  const persistCatalog = useCallback(async (s, list, when) => {
    const db = dbRef.current; if (!db || !s) return;
    await db.set(`catalog:${s.id}`, { store: s, products: list, reservations: reservationsRef.current, savedAt: when });
    await db.set('last', s.id);
  }, []);

  const loadQueue = useCallback(async (storeId) => {
    const list = (await dbRef.current.sales(storeId)).sort((a, b) => (a.body.createdAt < b.body.createdAt ? -1 : 1));
    setQ(list); return list;
  }, []);

  const pendingItems = () => queueRef.current.filter((e) => e.state === 'pending').flatMap((e) => e.stockItems || e.body.items);
  // a reservation sold on this device but not sent yet is already finished here
  const openOnly = (list) => { const done = new Set(queueRef.current.map((e) => e.body.reservationId).filter(Boolean)); return (list || []).filter((r) => !done.has(r.id)); };

  /** Ask the server for the catalogue. Sales that have not reached the server yet are re-applied on top of its stock. */
  const refresh = useCallback(async () => {
    try {
      const d = await api('/pos/bootstrap');
      if (!storeRef.current || storeRef.current.id !== d.store.id) { storeRef.current = d.store; setStore(d.store); await loadQueue(d.store.id); }
      const list = applyLocalStock(d.products, pendingItems());
      const when = d.serverTime;
      setR(openOnly(d.reservations));
      setP(list); setSavedAt(when); setAuthExpired(false); setBlocked(null); setPhase('ready');
      await persistCatalog(d.store, list, when);
      return true;
    } catch (e) {
      if (e.status === 401) { setAuthExpired(true); return false; }
      if (e.status === 403) { setBlocked({ code: e.code, message: e.message }); setPhase('blocked'); return false; }
      return false; // no network: keep working from the saved snapshot
    }
  }, [loadQueue, persistCatalog]);

  const sync = useCallback(async () => {
    if (syncing.current || !navigator.onLine || !storeRef.current) return null;
    const waiting = queueRef.current.filter((e) => e.state === 'pending');
    if (!waiting.length) return null;
    syncing.current = true; setBusy(true);
    try {
      const out = await syncQueue({
        entries: queueRef.current,
        send: (body) => api('/pos/sales', { method: 'POST', body }),
        onResult: async (entry, r) => {
          const db = dbRef.current;
          if (r.ok) { numbers.current.set(entry.uuid, r.sale.number); await db.deleteSale(entry.uuid); setQ(queueRef.current.filter((x) => x.uuid !== entry.uuid)); }
          else { const next = { ...entry, state: 'failed', error: { code: r.code, message: r.message } }; await db.putSale(next); setQ(queueRef.current.map((x) => (x.uuid === entry.uuid ? next : x))); }
        },
      });
      if (out.stopped === 'auth') setAuthExpired(true);
      if (out.done.length && !queueRef.current.some((e) => e.state === 'pending')) await refresh();
      return out;
    } finally { syncing.current = false; setBusy(false); }
  }, [refresh]);

  // open: snapshot first (works offline), then the server
  useEffect(() => {
    let dead = false;
    (async () => {
      const db = await openPosDb(); if (dead) return;
      dbRef.current = db; setSafeStorage(db.persistent);
      try { await navigator.storage?.persist?.(); } catch { /* best effort */ }
      const last = await db.get('last');
      const snap = last ? await db.get(`catalog:${last}`) : null;
      if (snap && !dead) {
        storeRef.current = snap.store; setStore(snap.store); setP(snap.products); setSavedAt(snap.savedAt);
        await loadQueue(snap.store.id); setR(openOnly(snap.reservations)); setPhase('ready');
      }
      if (!tokenStore.get() && !snap) { setPhase('signin'); return; }
      const ok = await refresh();
      if (dead) return;
      if (!ok && !snap) setPhase(navigator.onLine ? 'empty' : 'offline-empty');
      sync();
    })();
    return () => { dead = true; };
  }, [loadQueue, refresh, sync]);

  useEffect(() => {
    const on = () => { setOnline(true); sync(); };
    const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    const id = setInterval(() => { if (navigator.onLine) sync(); }, 20000);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(id); };
  }, [sync]);

  /**
   * Saves the sale on the device first (so it can never be lost), lowers the local stock, then tries to send it.
   * Waits a moment for the server's official number so the receipt can carry it; otherwise the receipt is temporary.
   */
  const checkout = useCallback(async ({ cart, discount, payments, customerName, customerPhone, reservation = null }) => {
    const db = dbRef.current; const s = storeRef.current;
    const counter = ((await db.get(`counter:${s.id}`)) || 0) + 1;
    await db.set(`counter:${s.id}`, counter);
    const uuid = newUuid();
    const { body, receipt } = buildSale({ uuid, localNo: `م-${pad(counter)}`, createdAt: new Date().toISOString(), cart, discount, payments, customerName, customerPhone, reservation });
    const moved = stockItems(body.items, reservation);
    const entry = { uuid, storeId: s.id, state: 'pending', body, receipt, error: null, ...(reservation ? { stockItems: moved } : {}) };
    await db.putSale(entry);
    setQ([...queueRef.current, entry]);
    if (reservation) setR(reservationsRef.current.filter((r) => r.id !== reservation.id));
    const next = applyLocalStock(productsRef.current, moved);
    setP(next); persistCatalog(s, next, savedAt);
    if (navigator.onLine) await Promise.race([sync(), sleep(2500)]);
    return { ...receipt, number: numbers.current.get(uuid) ?? null };
  }, [persistCatalog, savedAt, sync]);

  const retry = useCallback(async (uuid) => {
    const e = queueRef.current.find((x) => x.uuid === uuid); if (!e) return;
    const next = { ...e, state: 'pending', error: null };
    await dbRef.current.putSale(next); setQ(queueRef.current.map((x) => (x.uuid === uuid ? next : x)));
    sync();
  }, [sync]);

  const discard = useCallback(async (uuid) => {
    await dbRef.current.deleteSale(uuid); setQ(queueRef.current.filter((x) => x.uuid !== uuid));
  }, []);

  return { phase, blocked, store, products, reservations, savedAt, queue, online, authExpired, safeStorage, busy, checkout, sync, refresh, retry, discard, db: dbRef };
}
