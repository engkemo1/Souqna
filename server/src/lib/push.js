/**
 * Web Push for store owners (new-order alerts on their phone/computer) — free, no per-message cost.
 * VAPID keys: set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, or leave them empty and a key pair is generated once and
 * kept in the database (so it survives restarts). Never breaks the request that triggered it.
 */
import webpush from 'web-push';
import { q } from '../db/index.js';

let ready = null;
function init() {
  if (ready) return ready;
  let pub = process.env.VAPID_PUBLIC_KEY;
  let priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    pub = q.val("SELECT value FROM app_settings WHERE key='vapid_public'");
    priv = q.val("SELECT value FROM app_settings WHERE key='vapid_private'");
    if (!pub || !priv) {
      const k = webpush.generateVAPIDKeys();
      pub = k.publicKey; priv = k.privateKey;
      q.run("INSERT OR REPLACE INTO app_settings(key,value) VALUES('vapid_public',?),('vapid_private',?)", [pub, priv]);
    }
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@banhaoutfit.app', pub, priv);
  ready = { pub };
  return ready;
}

export const vapidPublicKey = () => init().pub;

async function sendTo(sub, payload) {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 24, urgency: 'high' });
    return true;
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) q.run('DELETE FROM push_subscriptions WHERE id=?', [sub.id]); // expired / unsubscribed
    else console.error(`[push] ${e.statusCode || ''} ${e.message}`);
    return false;
  }
}

/** Fire-and-forget: notify every device a store owner has enabled. */
export function notifyStore(storeId, payload) {
  try {
    init();
    const subs = q.all('SELECT * FROM push_subscriptions WHERE store_id=?', [storeId]);
    for (const s of subs) sendTo(s, payload);
  } catch (e) { console.error(`[push] ${e.message}`); }
}

export async function sendTest(storeId) {
  init();
  const subs = q.all('SELECT * FROM push_subscriptions WHERE store_id=?', [storeId]);
  const results = await Promise.all(subs.map((s) => sendTo(s, { title: 'بنها أوتفيت ✅', body: 'الإشعارات شغالة. هتوصلك هنا أول ما يجيلك أوردر جديد.', url: '/dashboard/orders', tag: 'test' })));
  return { devices: subs.length, delivered: results.filter(Boolean).length };
}
