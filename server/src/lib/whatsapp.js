/**
 * New-order alert to the store's WhatsApp number via the WhatsApp Cloud API.
 * Business-initiated messages must use an approved template (config.wa.template).
 * Template body variables, in order:
 *   {{1}} store name  {{2}} order number  {{3}} customer name  {{4}} phone
 *   {{5}} address     {{6}} total (EGP)   {{7}} items summary
 * Failures never break checkout: they are logged and the order is still saved.
 */
import { config } from '../config.js';
import { q } from '../db/index.js';

/** 01012345678 -> 201012345678 */
export function toWaNumber(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('20')) return digits;
  return `20${digits.replace(/^0/, '')}`;
}

export function isWhatsAppConfigured() {
  return Boolean(config.wa.token && config.wa.phoneId);
}

export async function sendNewOrderAlert(store, orderId) {
  const to = toWaNumber(store.whatsapp);
  if (!to) return { skipped: 'no_store_whatsapp' };
  if (!isWhatsAppConfigured()) return { skipped: 'not_configured' };

  const o = q.get('SELECT * FROM orders WHERE id=?', [orderId]);
  const items = q.all('SELECT name_ar, qty FROM order_items WHERE order_id=?', [orderId]);
  const summary = items.map((i) => `${i.qty}x ${i.name_ar}`).join('، ').slice(0, 300) || '-';
  const address = [o.address, o.city, o.governorate].filter(Boolean).join('، ').slice(0, 300);
  const params = [store.name_ar, o.number, o.customer_name, o.phone, address, String(o.total), summary]
    .map((text) => ({ type: 'text', text: String(text || '-').slice(0, 1000) }));

  const res = await fetch(`${config.wa.apiBase}/${config.wa.phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.wa.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: { name: config.wa.template, language: { code: config.wa.lang }, components: [{ type: 'body', parameters: params }] },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`whatsapp ${res.status}: ${detail.slice(0, 300)}`);
  }
  return { sent: true, to };
}
