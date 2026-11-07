/** ردود تويلا عن العروض والعنايه بالقطع: بتعتمد على بيانات حقيقيه (عروض المحلات المفعّله + خصومات المنتجات + كلام صاحب المحل) ومبتخترعش حاجه. */
const money = (n) => `${Number(n).toLocaleString('en-US')} جنيه`;
const dateAr = (iso) => { try { const d = new Date(iso); return Number.isNaN(+d) ? '' : d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', timeZone: 'Africa/Cairo' }); } catch { return ''; } };

/** عروض المحلات الشغالة دلوقتي + أكبر خصومات على القطع. بترجّع null لو مفيش أي حاجه حقيقيه نعرضها. */
export function offersAnswer({ offers = [], products = [], intro = '' } = {}) {
  const lines = [];
  const seen = new Set();
  for (const o of offers.slice(0, 40)) {
    const head = String(o.headline || '').trim();
    if (!head) continue;
    const key = `${o.store}|${head}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const until = o.endsAt ? dateAr(o.endsAt) : '';
    const soon = o.endsAt && new Date(o.endsAt) - Date.now() < 3 * 86400e3 && new Date(o.endsAt) > Date.now();
    lines.push(`• ${o.store}: ${o.name ? `${o.name} — ` : ''}${head}${until ? ` (لحد ${until}${soon ? '، ينتهي قريب' : ''})` : ''}`);
    if (lines.length >= 6) break;
  }
  const disc = products
    .filter((p) => p.compare_at_price > p.price && p.price > 0 && (p.stock > 0 || !p.track_stock))
    .map((p) => ({ p, pct: Math.round((1 - p.price / p.compare_at_price) * 100) }))
    .filter((x) => x.pct >= 5)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5);
  const dl = disc.map(({ p, pct }) => `• ${p.name_ar}${p.store_name_ar ? ` (${p.store_name_ar})` : ''}: بقى ${money(p.price)} بدل ${money(p.compare_at_price)} (خصم ${pct}%)`);
  if (!lines.length && !dl.length) return null;
  const parts = [];
  if (intro && dl.length && !lines.length) parts.push(intro);
  if (lines.length) parts.push(`دي العروض الشغالة دلوقتي في محلات بنها:\n${lines.join('\n')}`);
  if (dl.length) parts.push(intro && !lines.length ? dl.join('\n') : `وأكبر خصومات على قطع متاحة:\n${dl.join('\n')}`);
  parts.push('الشروط والتفاصيل بتظهر على المنتج نفسه وفي سلة المشتريات، وكل محل بيغيّر عروضه، فالأرقام دي حسب اللحظة دي.');
  return parts.join('\n\n');
}

/** لو القطع اللي اتعرضت للعميل فيها «طريقة العنايه» مكتوبه من المحل، بنضيفها حرفيًا. */
export function careForShown(shownIds = [], products = []) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const out = [];
  for (const id of shownIds) {
    const p = byId.get(id);
    const care = p?.care_ar && String(p.care_ar).trim();
    if (care) out.push(`• ${p.name_ar}: ${care}`);
    if (out.length >= 4) break;
  }
  return out.length ? `وتعليمات المحل للقطع اللي عرضتها عليك:\n${out.join('\n')}` : '';
}
