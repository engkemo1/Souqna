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

/** Runtime overrides saved from the admin screen (app_settings wa_*) win over the .env values. */
const WA_KEYS = { wa_token: 'token', wa_phone_id: 'phoneId', wa_template: 'template', wa_customer_template: 'customerTemplate', wa_platform_template: 'platformTemplate', wa_service_template: 'serviceTemplate', wa_alert_template: 'alertTemplate', wa_owner_btn_template: 'ownerBtnTemplate', wa_customer_btn_template: 'customerBtnTemplate', wa_lang: 'lang' };
export function applyWaSettings() {
  try {
    for (const r of q.all("SELECT key, value FROM app_settings WHERE key LIKE 'wa\\_%' ESCAPE '\\'")) {
      const k = WA_KEYS[r.key]; if (k && String(r.value || '').trim()) config.wa[k] = String(r.value).trim();
    }
  } catch { /* table not ready yet: .env values stay */ }
}
applyWaSettings();
export function saveWaSettings(b) {
  const put = (k, v) => q.run('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, String(v).trim()]);
  const map = { token: 'wa_token', phoneId: 'wa_phone_id', template: 'wa_template', customerTemplate: 'wa_customer_template', platformTemplate: 'wa_platform_template', serviceTemplate: 'wa_service_template', alertTemplate: 'wa_alert_template', ownerBtnTemplate: 'wa_owner_btn_template', customerBtnTemplate: 'wa_customer_btn_template', lang: 'wa_lang' };
  for (const [k, key] of Object.entries(map)) if (typeof b[k] === 'string' && (k !== 'token' || b[k].trim())) put(key, b[k]);
  applyWaSettings();
}
export function waSettingsView() {
  const w = config.wa;
  return { configured: isWhatsAppConfigured(), tokenSet: !!w.token, tokenHint: w.token ? `…${w.token.slice(-4)}` : '', phoneId: w.phoneId, template: w.template, customerTemplate: w.customerTemplate, platformTemplate: w.platformTemplate, serviceTemplate: w.serviceTemplate, alertTemplate: w.alertTemplate, ownerBtnTemplate: w.ownerBtnTemplate || '', customerBtnTemplate: w.customerBtnTemplate || '', lang: w.lang, platformWa: config.platformWa };
}
/** Sends Meta's built-in hello_world template to a number, to prove token + phone id work. */
export async function sendWaTest(rawTo) {
  const to = toWaNumber(rawTo); if (!to) throw new Error('رقم غير صالح');
  if (!isWhatsAppConfigured()) throw new Error('التوكن أو Phone ID مش مضبوطين');
  const res = await fetch(`${config.wa.apiBase}/${config.wa.phoneId}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${config.wa.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'template', template: { name: 'hello_world', language: { code: 'en_US' } } }) });
  const txt = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`Meta ${res.status}: ${txt.slice(0, 300)}`);
  return { sent: true, to };
}

export function isWhatsAppConfigured() {
  return Boolean(config.wa.token && config.wa.phoneId);
}

/** Buttons of the store-owner template: 3 quick replies (confirm / can't / how) + a link that opens the order in the dashboard. Order must match the template in Meta. */
const qr = (i, payload) => ({ type: 'button', sub_type: 'quick_reply', index: String(i), parameters: [{ type: 'payload', payload }] });
const ownerButtons = (orderId) => [qr(0, `ord:confirm:${orderId}`), qr(1, `ord:nope:${orderId}`), qr(2, `ord:help:${orderId}`), { type: 'button', sub_type: 'url', index: '3', parameters: [{ type: 'text', text: String(orderId) }] }];
const customerButtons = (orderId) => [qr(0, `cust:track:${orderId}`), qr(1, `cust:address:${orderId}`), qr(2, `cust:cancel:${orderId}`), qr(3, `cust:store:${orderId}`)];

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
      template: { name: config.wa.ownerBtnTemplate || config.wa.template, language: { code: config.wa.lang }, components: [{ type: 'body', parameters: params }, ...(config.wa.ownerBtnTemplate ? ownerButtons(orderId) : [])] },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`whatsapp ${res.status}: ${detail.slice(0, 300)}`);
  }
  return { sent: true, to };
}

/**
 * "Twist must deliver this order" alert to the platform team number (config.platformWa).
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

/** Short team alert (new store, new section request). Needs an approved one-variable template named in WA_ALERT_TEMPLATE; skipped otherwise. */
export async function sendPlatformAlert(text) {
  if (!isWhatsAppConfigured() || !config.wa.alertTemplate) return { skipped: 'not_configured' };
  const res = await fetch(`${config.wa.apiBase}/${config.wa.phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.wa.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: config.platformWa, type: 'template',
      template: { name: config.wa.alertTemplate, language: { code: config.wa.lang }, components: [{ type: 'body', parameters: [{ type: 'text', text: String(text).replace(/\s+/g, ' ').slice(0, 300) }] }] } }),
  });
  if (!res.ok) throw new Error(`whatsapp ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
  return { sent: true, to: config.platformWa };
}
export function notifyPlatformAlert(text) {
  sendPlatformAlert(text).catch((e) => console.error(`[whatsapp] team alert failed: ${e.message}`));
}

/**
 * Order update to a customer who ordered without an account (signed-in shoppers get an in-app/push notice instead).
 * Needs an approved template named in WA_CUSTOMER_TEMPLATE; does nothing until it is set. Never throws.
 */
export function notifyGuestOrderWhatsApp({ phone, name, number, text, token, orderId }) {
  try {
    if (!isWhatsAppConfigured() || !config.wa.customerTemplate) return;
    const to = toWaNumber(phone);
    if (!to) return;
    const params = [name || 'عميلنا', number, text, `${config.siteUrl}/track/${token}`].map((v) => ({ type: 'text', text: String(v || '-').replace(/\s+/g, ' ').slice(0, 900) }));
    fetch(`${config.wa.apiBase}/${config.wa.phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.wa.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'template', template: { name: (orderId && config.wa.customerBtnTemplate) || config.wa.customerTemplate, language: { code: config.wa.lang }, components: [{ type: 'body', parameters: params }, ...(orderId && config.wa.customerBtnTemplate ? customerButtons(orderId) : [])] } }),
    }).then(async (res) => { if (!res.ok) console.error(`[whatsapp] customer update ${number} failed: ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`); })
      .catch((e) => console.error(`[whatsapp] customer update ${number} failed: ${e.message}`));
  } catch (e) { console.error(`[whatsapp] customer update failed: ${e.message}`); }
}

/** Order received → the customer (account or guest) gets a WhatsApp saying the store will confirm it. Needs WA_CUSTOMER_TEMPLATE; never throws. */
export function notifyCustomerOrderPlaced({ phone, name, number, token, orderId }) {
  notifyGuestOrderWhatsApp({ phone, name, number, token, orderId, text: 'وصلنا طلبك وبانتظار تأكيد المحل. هنبلغك أول ما يتأكد' });
}
