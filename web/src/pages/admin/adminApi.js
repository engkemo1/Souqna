import { useCallback, useEffect, useRef, useState } from 'react';

const KEY = 'bo.adminKey';
export const adminKey = {
  get() { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } },
  set(v) { try { v ? sessionStorage.setItem(KEY, v) : sessionStorage.removeItem(KEY); if (!v) sessionStorage.removeItem('bo.adminSession'); } catch { /* ignore */ } },
};

export const adminSession = {
  get() { try { return sessionStorage.getItem('bo.adminSession') || ''; } catch { return ''; } },
  set(v) { try { v ? sessionStorage.setItem('bo.adminSession', v) : sessionStorage.removeItem('bo.adminSession'); } catch { /* ignore */ } },
};

export class AdminError extends Error {
  constructor(status, code, message, fields) { super(message); this.status = status; this.code = code; this.fields = fields; }
}

let onAuthFail = () => {};
export const setAdminAuthFail = (fn) => { onAuthFail = fn; };

export async function adminApi(path, { method = 'GET', body, signal, key, session } = {}) {
  let res;
  try {
    res = await fetch(`/api/admin${path}`, {
      method, signal,
      headers: { 'Content-Type': 'application/json', 'x-admin-key': key ?? adminKey.get(), 'x-admin-session': session ?? adminSession.get() },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new AdminError(0, 'network', 'مفيش اتصال بالسيرفر');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.error || {};
    if (res.status === 401) onAuthFail();
    throw new AdminError(res.status, err.code || 'error', err.message || 'حصل خطأ', err.fields);
  }
  return data;
}

/** GET with loading/error/reload and optional polling. */
export function useAdminApi(path, { every = 0 } = {}) {
  const [state, setState] = useState({ data: undefined, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    const ctrl = new AbortController();
    if (first.current || path) setState((s) => ({ ...s, loading: s.data === undefined, error: null }));
    first.current = false;
    adminApi(path, { signal: ctrl.signal })
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => { if (error.name !== 'AbortError') setState((s) => ({ ...s, error, loading: false })); });
    return () => ctrl.abort();
  }, [path, tick]);
  useEffect(() => {
    if (!every) return undefined;
    const id = setInterval(() => setTick((x) => x + 1), every);
    return () => clearInterval(id);
  }, [every]);
  const reload = useCallback(() => setTick((x) => x + 1), []);
  return { ...state, reload };
}

export const fmtMoney = (n) => `${new Intl.NumberFormat('ar-EG').format(Math.round(n || 0))} ج.م`;
export const fmtNum = (n) => new Intl.NumberFormat('ar-EG').format(Math.round(n || 0));
export const fmtDateTime = (s) => {
  if (!s) return '—';
  const d = new Date(`${String(s).replace(' ', 'T')}Z`);
  return d.toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};
export const ORDER_STATUS_AR = { pending: 'جديد', confirmed: 'متأكد', processing: 'جاهز / قيد التجهيز', shipped: 'في الطريق', delivered: 'تم التسليم', cancelled: 'ملغي' };
/** Departments are managed in admin → الأقسام. */
export function useAdminDepartments() {
  const { data, reload, loading } = useAdminApi('/departments');
  const list = data?.departments || [];
  const label = (slug) => list.find((d) => d.slug === slug)?.name_ar || slug;
  return { list, label, reload, loading };
}
export const waLink = (phone, text) => {
  const d = String(phone || '').replace(/\D/g, '');
  const n = d.startsWith('20') ? d : `2${d}`;
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
};
