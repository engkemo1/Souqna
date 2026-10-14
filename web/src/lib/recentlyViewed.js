const KEY = 'souqna.recently-viewed.v1';
const MAX = 12;

export const getRecentlyViewed = () => {
  try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v.filter((x) => Number.isInteger(x)).slice(0, MAX) : []; } catch { return []; }
};

/** Remember a product the shopper opened (newest first). Storage can be unavailable; then nothing is kept. */
export const rememberViewed = (id) => {
  if (!Number.isInteger(id)) return;
  try { localStorage.setItem(KEY, JSON.stringify([id, ...getRecentlyViewed().filter((x) => x !== id)].slice(0, MAX))); } catch { /* ignore */ }
};
