/** Orders placed on this device (no account needed). Stored locally; the real data lives on the server under a private token. */
const KEY = 'bo.recentOrders.v1';
export function getRecentOrders() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function rememberOrder({ number, token, store }) {
  if (!number || !token) return;
  try {
    const list = getRecentOrders().filter((o) => o.token !== token);
    list.unshift({ number, token, store, at: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 10)));
  } catch { /* private mode: tracking still works via the link */ }
}
export const trackUrl = (token) => `${window.location.origin}/track/${token}`;
