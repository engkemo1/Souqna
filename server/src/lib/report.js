/** Weekly merchant report: real numbers from the database + (optional) a short AI write-up in Egyptian Arabic. */
import { q } from '../db/index.js';
import { callLlm, providerReady, stylistSettings } from './stylist.js';
import { unmetDemand, demandForOwnersEnabled } from './visual-demand.js';

const day = (offset = 0) => new Date(Date.now() + 3 * 3600e3 - offset * 864e5).toISOString().slice(0, 10);
const LOCAL = "date(created_at,'+3 hours')";

export function weeklyFacts(sid) {
  const from = day(6), prevFrom = day(13), prevTo = day(7);
  const per = (a, b) => q.get(`SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS sales FROM orders WHERE store_id=? AND status<>'cancelled' AND ${LOCAL} BETWEEN ? AND ?`, [sid, a, b]);
  const cur = per(from, day(0)), prev = per(prevFrom, prevTo);
  const cancelled = q.val(`SELECT COUNT(*) FROM orders WHERE store_id=? AND status='cancelled' AND ${LOCAL} BETWEEN ? AND ?`, [sid, from, day(0)]);
  const top = q.all(`SELECT oi.name_ar AS name, SUM(oi.qty) AS qty, SUM(oi.qty*oi.price) AS revenue FROM order_items oi JOIN orders o ON o.id=oi.order_id
    WHERE o.store_id=? AND o.status<>'cancelled' AND date(o.created_at,'+3 hours') BETWEEN ? AND ? GROUP BY oi.product_id ORDER BY revenue DESC LIMIT 3`, [sid, from, day(0)]);
  const lowStock = q.all("SELECT name_ar AS name, stock FROM products WHERE store_id=? AND status='active' AND track_stock=1 AND stock <= low_stock_at ORDER BY stock ASC LIMIT 5", [sid]);
  const viewedNoSale = q.all(`SELECT p.name_ar AS name, p.views FROM products p WHERE p.store_id=? AND p.status='active' AND p.views>=20
    AND NOT EXISTS (SELECT 1 FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.product_id=p.id AND o.status<>'cancelled' AND date(o.created_at,'+3 hours') >= ?)
    ORDER BY p.views DESC LIMIT 3`, [from]);
  const stale = q.val("SELECT COUNT(*) FROM orders WHERE store_id=? AND status='pending' AND created_at < datetime('now','-1 day')", [sid]);
  const rev = q.get("SELECT COUNT(*) AS n, COALESCE(AVG(rating),0) AS avg FROM reviews WHERE store_id=? AND status='published' AND created_at >= datetime('now','-7 days')", [sid]);
  const unmet = !demandForOwnersEnabled() ? [] : unmetDemand({ days: 7, limit: 3, storeId: sid }).map((x) => ({ item: `${x.label}${x.colorLabel ? ` ${x.colorLabel.ar}` : ''}`, people: x.people, have: x.have }));
  return { from, to: day(0), unmet, orders: cur.orders, sales: cur.sales, prevOrders: prev.orders, prevSales: prev.sales, cancelled, top, lowStock, viewedNoSale, stale, newReviews: rev.n, avgRating: Math.round(rev.avg * 10) / 10 };
}

/** rule-based advice used when no AI provider is configured (and as the fallback when the call fails) */
export function ruleTips(f) {
  const tips = [];
  if (f.stale > 0) tips.push(`في ${f.stale} طلب معلّق من أكتر من يوم — راجعهم وكلّم العملاء قبل ما يتلغوا.`);
  if (f.lowStock.length) tips.push(`المخزون قارب يخلص في: ${f.lowStock.map((x) => `${x.name} (${x.stock})`).join('، ')} — جدّد قبل ما تتفوتك مبيعات.`);
  if (f.viewedNoSale.length) tips.push(`ناس بتتفرج على ${f.viewedNoSale.map((x) => x.name).join('، ')} ومحدش اشترى — جرّب خصم صغير أو صور أوضح أو مقاسات أكتر.`);
  if (f.unmet?.length) tips.push(`ناس دوّرت بالصورة على ${f.unmet.map((x) => `${x.item} (${x.people})`).join('، ')} ومالقوش في بنها${f.unmet.some((x) => x.have) ? ' — عندك من النوع ده، شوف لو تقدر تضيف نفس الشكل أو اللون' : ' — لو بتبيع حاجة شبهها ضيفها بصور واضحة'}.`);
  if (f.top.length) tips.push(`أكتر حاجة بتتباع: ${f.top[0].name}. صوّرها تاني ورشّحها في الصفحة الرئيسية.`);
  if (f.orders === 0) tips.push('مفيش طلبات الأسبوع ده — فعّل توصيل نفس اليوم أو اعمل عرض لفترة محدودة وشارك لينك المتجر على واتساب.');
  if (f.cancelled > 0 && f.cancelled >= f.orders / 4) tips.push(`في ${f.cancelled} طلبات اتلغت — اتأكد من رقم العميل وأكد الطلب بمكالمة سريعة.`);
  return tips.slice(0, 5);
}

const cache = new Map(); // `${sid}:${day}` → report
export async function weeklyReport(sid, { refresh = false } = {}) {
  const key = `${sid}:${day(0)}`;
  if (!refresh && cache.has(key)) return cache.get(key);
  const facts = weeklyFacts(sid);
  let summary = '', tips = ruleTips(facts), ai = false;
  const { enabled, provider } = stylistSettings();
  if (enabled && providerReady[provider]?.()) {
    try {
      const sys = 'You are a friendly retail coach for a small fashion store in Banha, Egypt. Reply ONLY with JSON {"summary": string, "tips": string[]}. Write in Egyptian Arabic (عامية مصرية), warm and specific. summary = 2 sentences on the week vs the previous one. tips = 3 to 4 short concrete actions based ONLY on the numbers given. Never invent numbers.';
      const out = await callLlm(provider, sys, [{ role: 'user', content: JSON.stringify(facts) }]);
      const m = String(out).match(/\{[\s\S]*\}/);
      const j = m ? JSON.parse(m[0]) : null;
      if (j?.summary) { summary = String(j.summary).slice(0, 400); if (Array.isArray(j.tips) && j.tips.length) tips = j.tips.map((x) => String(x).slice(0, 220)).slice(0, 5); ai = true; }
    } catch (e) { console.error('[weekly-report]', e.message); }
  }
  if (!summary) {
    const d = facts.prevSales ? Math.round(((facts.sales - facts.prevSales) / facts.prevSales) * 100) : null;
    summary = `الأسبوع ده: ${facts.orders} طلب بمبيعات ${facts.sales} ج.م${d === null ? '' : d >= 0 ? ` (زيادة ${d}% عن الأسبوع اللي قبله)` : ` (نقص ${Math.abs(d)}% عن الأسبوع اللي قبله)`}.`;
  }
  const rep = { facts, summary, tips, ai };
  cache.set(key, rep);
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return rep;
}
