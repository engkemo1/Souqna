// Meta Pixel events. Every call is safe: nothing happens if the pixel didn't load (blocked / admin pages / preview) and it can never break the page.
const SKIP = /^\/(admin|dashboard|pos|scan|setup)(\/|$)/;
const CUR = 'EGP';
let firstView = true;

export function px(event, data) {
  try {
    if (typeof window.fbq !== 'function' || SKIP.test(window.location.pathname)) return;
    if (new URLSearchParams(window.location.search).get('preview')) return;
    window.fbq('track', event, data);
  } catch { /* tracking must never break the page */ }
}

/** The pixel file already sent the first PageView; this one is for every later in-app navigation. */
export function pxPageView() {
  if (firstView) { firstView = false; return; }
  px('PageView');
}

export const pxPurchase = (key, orders) => {
  try {
    if (!orders?.length || sessionStorage.getItem(`souqna.px.${key}`)) return;
    sessionStorage.setItem(`souqna.px.${key}`, '1');
    px('Purchase', { value: orders.reduce((s, o) => s + (Number(o.total) || 0), 0), currency: CUR, content_type: 'product', num_items: orders.length });
  } catch { /* ignore */ }
};
