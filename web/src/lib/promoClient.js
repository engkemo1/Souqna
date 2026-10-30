import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

/**
 * Customer-side helpers for offers. The browser only ASKS the server (POST /stores/:slug/quote) and displays the answer;
 * it never computes a discount itself.
 */
const KEY = 'twist.gifts.v1';
const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch { return {}; } };
export const loadGifts = (slug) => read()[slug] || {};
export const saveGifts = (slug, gifts) => { try { sessionStorage.setItem(KEY, JSON.stringify({ ...read(), [slug]: gifts })); } catch { /* ignore */ } };

export const toQuoteItems = (items) => items.map((l) => ({ productId: l.productId, variantId: l.variantId ?? null, qty: l.qty }));

/** Live server quote for one store's lines (debounced). Returns { quote, gifts, setGifts }. */
export function useStoreQuote(slug, items, { phone = null, coupon = null } = {}) {
  const [gifts, setGiftsState] = useState(() => loadGifts(slug));
  const [quote, setQuote] = useState(null);
  const payload = useMemo(() => toQuoteItems(items), [items]);
  const key = JSON.stringify([slug, payload, phone, coupon, gifts]);
  useEffect(() => {
    if (!slug || !payload.length) { setQuote(null); return undefined; }
    let alive = true;
    const t = setTimeout(() => {
      api(`/stores/${slug}/quote`, { method: 'POST', body: { items: payload, phone: phone || null, coupon: coupon || null, gifts } })
        .then((q) => { if (alive) setQuote(q); }).catch(() => { if (alive) setQuote(null); });
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const setGifts = (g) => { saveGifts(slug, g); setGiftsState(g); };
  return { quote, gifts, setGifts };
}

/** The quote line for a basket line (paid lines only; gifts are separate). */
export const quoteLineFor = (quote, line) => quote?.lines?.find((l) => !l.gift && l.productId === line.productId && (l.variantId ?? null) === (line.variantId ?? null));
