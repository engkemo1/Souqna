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

/**
 * "Banha Outfit must deliver this order" alert to the platform team number (config.platformWa).
 * Template variables: {{1}} store {{2}} order no. {{3}} store phone {{4}} store address
 *                     {{5}} customer {{6}} customer phone {{7}} customer address {{8}} cash to collect (EGP)
 */
export async function sendPlatformDeliveryAlert(orderId) {
  if (!isWhatsAppConfigured()) return { skipped: 'not_configured' };
  const o = q.get('SELECT o.*, s.name_ar AS store_name, s.phone AS store_phone, s.address_ar AS store_address FROM orders o JOIN stores s ON s.id=o.store_id WHERE o.id=?', [orderId]);
  if (!o) return { skipped: 'no_order' };
  const customerAddr = [o.address, o.city, o.governorate].filter(Boolean).join('، ');
  const params = [o.store_name, o.number, o.store_phone, o.store_address, o.customer_name, o.phone, customerAddr, String(o.total)]
    .map((text) => ({ type: 'text', text: String(text || '-').slice(0, 300) }));
  const res = await fetch(`${config.wa.apiBase}/${config.wa.phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.wa.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: config.platformWa, type: 'template',
      template: { name: config.wa.platformTemplate, language: { code: config.wa.lang }, components: [{ type: 'body', parameters: params }] } }),
  });
  if (!res.ok) throw new Error(`whatsapp ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
  return { sent: true, to: config.platformWa };
}

/** Fire-and-forget wrapper: never blocks or breaks the request. */
export function notifyPlatformDelivery(orderId, number) {
  sendPlatformDeliveryAlert(orderId)
    .then((r) => console.log(r.sent ? `[whatsapp] delivery request ${number} → team` : `[whatsapp] delivery request ${number} skipped: ${r.skipped}`))
    .catch((e) => console.error(`[whatsapp] delivery request ${number} failed: ${e.message}`));
}

/**
 * "A store asked for a service (professional photography)" alert to the platform team.
 * Template variables: {{1}} store {{2}} plan {{3}} items {{4}} preferred date {{5}} phone {{6}} notes
 */
export async function sendPlatformServiceAlert(requestId) {
  if (!isWhatsAppConfigured()) return { skipped: 'not_configured' };
  const r = q.get('SELECT r.*, s.name_ar AS store_name, s.phone AS store_phone FROM service_requests r JOIN stores s ON s.id=r.store_id WHERE r.id=?', [requestId]);
  if (!r) return { skipped: 'no_request' };
  const planLabel = r.type === 'design_banner' ? 'تصميم بنر' : r.type === 'design_cover' ? 'تصميم غلاف' : r.plan === 'monthly' ? 'اشتراك شهري' : 'مرة واحدة';
  const params = [r.store_name, planLabel, r.items_count ? String(r.items_count) : '-', r.preferred_date || 'أي وقت', r.phone || r.store_phone, r.notes || '-']
    .map((text) => ({ type: 'text', text: String(text || '-').slice(0, 300) }));
  const res = await fetch(`${config.wa.apiBase}/${config.wa.phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.wa.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: config.platformWa, type: 'template',
      template: { name: config.wa.serviceTemplate, language: { code: config.wa.lang }, components: [{ type: 'body', parameters: params }] } }),
  });
  if (!res.ok) throw new Error(`whatsapp ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
  return { sent: true, to: config.platformWa };
}
export function notifyPlatformService(requestId) {
  sendPlatformServiceAlert(requestId)
    .then((r) => console.log(r.sent ? `[whatsapp] service request ${requestId} → team` : `[whatsapp] service request ${requestId} skipped: ${r.skipped}`))
    .catch((e) => console.error(`[whatsapp] service request ${requestId} failed: ${e.message}`));
}
