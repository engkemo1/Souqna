/**
 * WhatsApp order buttons.
 *  Store owner (buttons on the "new order" message):
 *    ord:confirm  → confirms the order (pending → confirmed) and offers the next step button
 *    ord:ready    → marks it ready / handed over (confirmed → processing | delivered for in-store pickup)
 *    ord:help     → the steps, in plain Arabic
 *    ord:nope     → how to cancel (cancelling stays in the dashboard: it returns stock and re-prices delivery)
 *  Customer (buttons on the order message): cust:track | address | cancel | store — answered from the real order data only.
 * Only the number registered for the store (owner) or the order's phone (customer) can use them. Dormant unless WA_ENABLED=1.
 */
import { q, tx, insert } from '../db/index.js';
import { ORDER_FLOW } from '@souqna/shared';
import { config } from '../config.js';
import { nowIso } from './util.js';
import { notifyOrderStatus } from './buyers.js';
import { notifyPlatformDelivery } from './whatsapp.js';
import { notifyStore } from './push.js';
import { onWhatsAppMessage } from '../routes/wa.js';
import { sendText, sendButtons, waNumber, waReady } from './wa.js';
import { PICKUP_FLOW } from '../routes/owner.js';

const SITE = config.siteUrl;
const LABEL = { pending: 'بانتظار تأكيد المحل', confirmed: 'المحل أكّد طلبك وبيجهّزه', processing: 'الطلب جاهز ومستني التسليم', shipped: 'الطلب خرج للتوصيل', delivered: 'الطلب اتسلّم', cancelled: 'الطلب اتلغى' };
const flowFor = (o) => (o.delivery_by === 'pickup' ? PICKUP_FLOW : ORDER_FLOW);
const orderUrl = (o) => `${SITE}/dashboard/orders/${o.id}`;

/** The simple, stock-neutral status moves the owner can make from WhatsApp (cancelling is not one of them). */
function moveStatus(o, status) {
  if (!(flowFor(o)[o.status] || []).includes(status)) return false;
  tx(() => {
    const now = nowIso();
    q.run('UPDATE orders SET status=?, updated_at=? WHERE id=?', [status, now, o.id]);
    if (o.delivery_by === 'pickup' && status === 'confirmed') {
      const hrs = q.val('SELECT reserve_hours FROM stores WHERE id=?', [o.store_id]) || 24;
      q.run('UPDATE orders SET reserve_until=? WHERE id=?', [new Date(Date.now() + hrs * 3600e3).toISOString(), o.id]);
    }
    insert('order_events', { order_id: o.id, status, note: 'من واتساب', created_at: now });
  });
  notifyOrderStatus(o.id, status);
  if (o.delivery_by === 'platform' && status === 'processing') {
    if (o.delivery_group) {
      const batch = q.all("SELECT id, number, status FROM orders WHERE delivery_group=? AND status<>'cancelled'", [o.delivery_group]);
      if (batch.length && batch.every((i) => i.status === 'processing')) for (const i of batch) notifyPlatformDelivery(i.id, i.number);
    } else notifyPlatformDelivery(o.id, o.number);
  }
  return true;
}

const nextButton = (o) => {
  if (o.status === 'confirmed') return o.delivery_by === 'pickup' ? [{ id: `ord:ready:${o.id}`, title: 'العميل استلم' }] : [{ id: `ord:ready:${o.id}`, title: 'الطلب جاهز' }];
  return [];
};

async function owner(m, act, o, store) {
  const to = m.from;
  const where = `افتح الطلب من لوحتك: ${orderUrl(o)}`;
  if (act === 'help') {
    await sendButtons(to, `إزاي تأكّد الطلب ${o.number}؟\n1) راجع المنتجات والمقاس واللون وإنها موجودة عندك.\n2) لو كله تمام اضغط «تأكيد الطلب» وهنبلّغ العميل.\n3) جهّز الطلب واضغط «الطلب جاهز».\n4) لو في مشكلة اضغط «مش هقدر ألبّيه».\n\n${where}`, [{ id: `ord:confirm:${o.id}`, title: 'تأكيد الطلب' }, { id: `ord:nope:${o.id}`, title: 'مش هقدر ألبّيه' }]);
  } else if (act === 'confirm') {
    if (o.status !== 'pending') return sendText(to, `الطلب ${o.number} حالته دلوقتي: ${LABEL[o.status] || o.status}. ${where}`);
    if (!moveStatus(o, 'confirmed')) return sendText(to, `مقدرتش أأكّد الطلب من هنا. ${where}`);
    const fresh = { ...o, status: 'confirmed' };
    const nb = nextButton(fresh);
    const msg = `تم تأكيد الطلب ${o.number} ✅ والعميل اتبلّغ.\nالخطوة الجاية: جهّز الطلب${o.delivery_by === 'platform' ? ' وهنبعت المندوب ياخده' : ''}${nb.length ? ` واضغط «${nb[0].title}»` : ''}.`;
    if (nb.length) await sendButtons(to, msg, nb); else await sendText(to, msg);
  } else if (act === 'ready') {
    const to2 = o.delivery_by === 'pickup' ? 'delivered' : 'processing';
    if (o.status !== 'confirmed' || !moveStatus(o, to2)) return sendText(to, `الطلب ${o.number} حالته دلوقتي: ${LABEL[o.status] || o.status}. ${where}`);
    await sendText(to, o.delivery_by === 'platform' ? `تمام ✅ بلّغنا فريق تويست عشان يستلم الطلب ${o.number} منك.` : `تمام ✅ اتسجّل إن الطلب ${o.number} ${o.delivery_by === 'pickup' ? 'اتسلّم للعميل' : 'جاهز'}.`);
  } else if (act === 'nope') {
    await sendText(to, `لو مش هتقدر تلبّي الطلب ${o.number}: افتحه من لوحتك واختار «إلغاء» وهنرجّع المخزون ونبلّغ العميل.\n${where}`);
  }
}

async function customer(m, act, o, store) {
  const to = m.from;
  const track = `${SITE}/track/${o.track_token}`;
  if (act === 'track') return sendText(to, `طلبك ${o.number}: ${LABEL[o.status] || o.status}.\nتابعه من هنا: ${track}`);
  const contact = [store.phone && `تليفون: ${store.phone}`, store.whatsapp && `واتساب: https://wa.me/${waNumber(store.whatsapp)}`].filter(Boolean).join('\n');
  if (act === 'store') return sendText(to, `المحل: ${store.name_ar}\n${contact || 'مفيش رقم للمحل متسجّل، تابع طلبك من هنا: ' + track}`);
  if (act === 'address') {
    if (['shipped', 'delivered', 'cancelled'].includes(o.status)) return sendText(to, `الطلب ${o.number} حالته: ${LABEL[o.status]}، فمش هينفع نغيّر العنوان من هنا.\n${track}`);
    return sendText(to, `لتغيير العنوان كلّم المحل مباشرة قبل ما الطلب يخرج للتوصيل:\n${contact || track}`);
  }
  if (act === 'cancel') {
    if (o.status === 'pending') {
      notifyStore(o.store_id, { title: `العميل عايز يلغي ${o.number}`, body: `${o.customer_name || 'عميل'} طلب إلغاء الطلب من واتساب`, url: `/dashboard/orders/${o.id}`, tag: `cancel-${o.id}` });
      return sendText(to, `سجّلنا طلب إلغاء ${o.number} وبلّغنا المحل. هيتواصلوا معاك لو احتاجوا حاجة، وتقدر تتابع من هنا: ${track}`);
    }
    return sendText(to, `الطلب ${o.number} حالته: ${LABEL[o.status] || o.status}، فالإلغاء محتاج تكلّم المحل مباشرة.\n${contact || track}`);
  }
}

onWhatsAppMessage(async (m) => {
  if (!waReady()) return;
  const mm = /^(ord|cust):(\w+):(\d+)$/.exec(m.button?.payload || m.interactive?.button_reply?.id || '');
  if (!mm) return;
  const [, kind, act, id] = mm;
  const o = q.get('SELECT * FROM orders WHERE id=?', [Number(id)]);
  const store = o && q.get('SELECT * FROM stores WHERE id=?', [o.store_id]);
  const who = kind === 'ord' ? store?.whatsapp : o?.phone;
  if (!o || !store || !who || waNumber(who) !== m.from) return sendText(m.from, 'مقدرتش أتعرّف على الطلب ده من رقمك.').catch(() => {});
  try { await (kind === 'ord' ? owner : customer)(m, act, o, store); } catch (e) { console.error(`[wa] order button ${kind}:${act} failed: ${e.message}`); }
});
