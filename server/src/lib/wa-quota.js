/**
 * Monthly cap on products added by WhatsApp, per store. Every product costs us about two WhatsApp messages, so the cap keeps the bill predictable.
 * Default comes from app_settings `wa_quota_default` (10 when unset); an admin can raise (or lower) one store's cap with `wa_quota_store_<id>`,
 * which is how a paid plan is applied: the store pays, the admin raises its number. Cancelled products still count: their messages were spent.
 */
import { q } from '../db/index.js';
import { cairoNow } from './sameDay.js';

export const DEFAULT_QUOTA = 10;
const getNum = (key) => { const v = q.get('SELECT value FROM app_settings WHERE key=?', [key])?.value; const n = Number(v); return v != null && v !== '' && Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null; };
const put = (key, v) => q.run('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, String(v)]);

/** Optional subscription price text the admin types (e.g. «49 ج.م/شهر»); shown in the owner's card and the limit message. */
export const planPrice = () => String(q.get("SELECT value FROM app_settings WHERE key='wa_plan_price'")?.value || '').trim();
export const defaultQuota = () => getNum('wa_quota_default') ?? DEFAULT_QUOTA;
export const quotaFor = (storeId) => getNum(`wa_quota_store_${Number(storeId)}`) ?? defaultQuota();
export const usedThisMonth = (storeId) => q.val("SELECT COUNT(*) FROM products WHERE store_id=? AND source='whatsapp' AND created_at >= date('now','start of month')", [Number(storeId)]) || 0;
/** Kill switches: one for the whole feature (default on), one per store (default on). */
export const productsEnabled = () => (q.get("SELECT value FROM app_settings WHERE key='wa_products_enabled'")?.value ?? '1') !== '0';
export const storeEnabled = (storeId) => !q.get('SELECT 1 AS x FROM app_settings WHERE key=?', [`wa_products_off_${Number(storeId)}`]);
const COMPANY_WA = '+201206928670'; // Twist company WhatsApp (shown to store owners)
export const DEFAULT_MSG = {
  limit: `وصلت للحد الشهري لإضافة المنتجات بواتساب ({limit} منتجات). محلك شغال كويس 👏\nزوّد حدك باشتراك بسيط كل شهر{price} وضيف كل منتجاتك من واتساب من غير حد. اضغط الزرار وهنكلمك، أو كلّمنا على واتساب الشركة: ${COMPANY_WA}\nأو كمّل من لوحة التحكم على الموقع بدون حد.`,
  upg: `استلمنا طلبك ✓ هنكلمك قريب بتفاصيل الاشتراك وإزاي نزوّد حد محلك.\nولو مستعجل كلّمنا على واتساب الشركة: ${COMPANY_WA}`,
  off: 'إضافة المنتجات بواتساب موقوفة حاليًا. تقدر تضيف منتجاتك من لوحة التحكم على الموقع، أو كلّمنا لتفعيلها.',
};
/** The text sent when a store hits its cap («limit») or the feature is off («off»). {limit} is replaced by the store's cap. */
export const messageFor = (kind, vars = {}) => {
  const saved = q.get('SELECT value FROM app_settings WHERE key=?', [`wa_msg_${kind}`])?.value;
  return String(saved && saved.trim() ? saved : DEFAULT_MSG[kind]).replace(/\{limit\}/g, String(vars.limit ?? '')).replace(/\{price\}/g, planPrice() ? ` (${planPrice()})` : '');
};
/** The owner pressed «عايز أزوّد الحد»: remember it so the admin sees who is asking. */
export const requestUpgrade = (storeId) => put(`wa_upgrade_${Number(storeId)}`, new Date().toISOString().slice(0, 19).replace('T', ' '));
/** The WhatsApp Business number store owners message to add products (digits, no +). Set by the admin. */
const DEFAULT_BOT = '201132736725'; // Twist's WhatsApp Business (Cloud API) number; the admin can override it
export const botNumber = () => String(q.get("SELECT value FROM app_settings WHERE key='wa_bot_number'")?.value || DEFAULT_BOT).replace(/\D/g, '');
export const COMPANY_NUMBER = COMPANY_WA.replace(/\D/g, '');
/** What the store owner's dashboard card shows. */
export function ownerView(store) {
  const limit = quotaFor(store.id); const used = usedThisMonth(store.id);
  return { enabled: productsEnabled() && storeEnabled(store.id), used, limit, left: Math.max(0, limit - used), requested: Boolean(q.get('SELECT 1 AS x FROM app_settings WHERE key=?', [`wa_upgrade_${store.id}`])), botNumber: botNumber(), company: COMPANY_NUMBER, price: planPrice() };
}
/** A photo was refused (screenshot / not clothing). Counted per store per Cairo day, only to feed the team's daily report. */
export function noteRejected(storeId) {
  const key = `wa_rej_${cairoNow().date}_${Number(storeId)}`;
  const n = Number(q.get('SELECT value FROM app_settings WHERE key=?', [key])?.value) || 0;
  put(key, n + 1);
}
/** Hard cap on immediate team alerts per day, so a burst can never turn into a bill. */
export function alertCapOk(kind, max) {
  const key = `wa_alert_cap_${kind}_${cairoNow().date}`;
  const n = Number(q.get('SELECT value FROM app_settings WHERE key=?', [key])?.value) || 0;
  if (n >= max) return false;
  put(key, n + 1);
  return true;
}
/**
 * Lines added to the team's existing morning report (so they cost no extra message): products added by WhatsApp, refused photos,
 * stores at or near their cap, and stores asking to raise it. Empty when there is nothing to say.
 */
export function waDigestLines(day, mod = '+0 hours') {
  const lines = [];
  const added = q.val("SELECT COUNT(*) FROM products WHERE source='whatsapp' AND date(created_at, ?)=?", [mod, day]) || 0;
  const rej = q.all("SELECT key, value FROM app_settings WHERE key LIKE ?", [`wa_rej_${day}_%`]);
  const rejected = rej.reduce((s, r) => s + (Number(r.value) || 0), 0);
  const heavy = rej.filter((r) => Number(r.value) >= 3).map((r) => q.get('SELECT name_ar FROM stores WHERE id=?', [Number(r.key.split('_').pop())])?.name_ar).filter(Boolean);
  const hit = []; const near = [];
  for (const s of q.all("SELECT DISTINCT s.id, s.name_ar FROM stores s JOIN products p ON p.store_id=s.id WHERE p.source='whatsapp' AND p.created_at >= date('now','start of month')")) {
    const used = usedThisMonth(s.id); const cap = quotaFor(s.id);
    if (cap > 0 && used >= cap) hit.push(s.name_ar); else if (cap > 0 && used / cap >= 0.8) near.push(`${s.name_ar} (${used}/${cap})`);
  }
  const asks = q.all("SELECT s.name_ar AS name FROM app_settings a JOIN stores s ON a.key = 'wa_upgrade_' || s.id").map((x) => x.name);
  if (!added && !rejected && !hit.length && !near.length && !asks.length) return lines;
  lines.push(`واتساب المنتجات: اتضاف ${added}${rejected ? ` · صور مرفوضة ${rejected}${heavy.length ? ` (كتير من: ${heavy.join('، ')})` : ''}` : ''}`);
  if (hit.length) lines.push(`وصلوا للحد: ${hit.join('، ')}`);
  if (near.length) lines.push(`قرّبوا من الحد: ${near.join('، ')}`);
  if (asks.length) lines.push(`طالبين زيادة: ${asks.join('، ')}`);
  return lines;
}
export const quotaLeft = (storeId) => Math.max(0, quotaFor(storeId) - usedThisMonth(storeId));

/** Admin view: the default plus every store that used WhatsApp this month or has its own cap. */
export function quotaView() {
  const stores = q.all(
    `SELECT s.id, s.name_ar AS name, (SELECT COUNT(*) FROM products p WHERE p.store_id=s.id AND p.source='whatsapp' AND p.created_at >= date('now','start of month')) AS used
       FROM stores s
      WHERE EXISTS (SELECT 1 FROM products p WHERE p.store_id=s.id AND p.source='whatsapp') OR EXISTS (SELECT 1 FROM app_settings a WHERE a.key IN ('wa_quota_store_' || s.id, 'wa_products_off_' || s.id, 'wa_upgrade_' || s.id))
      ORDER BY used DESC, s.id`);
  const all = q.all('SELECT id, name_ar AS name FROM stores ORDER BY name_ar LIMIT 500');
  return { botNumber: botNumber(), planPrice: planPrice(), messages: { upg: q.get("SELECT value FROM app_settings WHERE key='wa_msg_upg'")?.value || '', limit: q.get("SELECT value FROM app_settings WHERE key='wa_msg_limit'")?.value || '', off: q.get("SELECT value FROM app_settings WHERE key='wa_msg_off'")?.value || '' }, defaults: DEFAULT_MSG, enabled: productsEnabled(), default: defaultQuota(), all, stores: stores.map((s) => ({ ...s, limit: quotaFor(s.id), custom: getNum(`wa_quota_store_${s.id}`) != null, enabled: storeEnabled(s.id), requested: q.get('SELECT value FROM app_settings WHERE key=?', [`wa_upgrade_${s.id}`])?.value || null })) };
}

/** { enabled: bool } switches the feature for everyone; { store_id, store_enabled: bool } for one store. { default: n } sets the shared cap; { store_id, limit: n } sets one store's cap; { store_id, limit: null } goes back to the default. */
export function setQuota({ planPrice: price, botNumber: bot, message, default: def, store_id: storeId, limit, enabled, store_enabled: storeOn } = {}) {
  for (const kind of ['limit', 'upg', 'off']) if (message && message[kind] !== undefined) { const t = String(message[kind]).trim().slice(0, 600); if (t) put(`wa_msg_${kind}`, t); else q.run('DELETE FROM app_settings WHERE key=?', [`wa_msg_${kind}`]); }
  if (price !== undefined) { const t = String(price).trim().slice(0, 40); if (t) put('wa_plan_price', t); else q.run("DELETE FROM app_settings WHERE key='wa_plan_price'"); }
  if (bot !== undefined) { const d = String(bot).replace(/\D/g, '').slice(0, 15); if (d) put('wa_bot_number', d); else q.run("DELETE FROM app_settings WHERE key='wa_bot_number'"); }
  if (enabled !== undefined) put('wa_products_enabled', enabled ? '1' : '0');
  if (def !== undefined && def !== null) put('wa_quota_default', Math.trunc(def));
  if (storeId && storeOn !== undefined) { if (storeOn) q.run('DELETE FROM app_settings WHERE key=?', [`wa_products_off_${Number(storeId)}`]); else put(`wa_products_off_${Number(storeId)}`, '1'); }
  if (storeId && limit !== undefined) {
    if (limit === null || limit === undefined) q.run('DELETE FROM app_settings WHERE key=?', [`wa_quota_store_${Number(storeId)}`]);
    else { put(`wa_quota_store_${Number(storeId)}`, Math.trunc(limit)); q.run('DELETE FROM app_settings WHERE key=?', [`wa_upgrade_${Number(storeId)}`]); } // a new cap answers the request
  }
  return quotaView();
}
