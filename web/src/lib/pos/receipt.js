const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = new Intl.NumberFormat('en-EG', { maximumFractionDigits: 0 });
export const egp = (n) => `${nf.format(Math.round(n || 0))} ج.م`;
const METHOD = { cash: 'نقدي', card: 'بطاقة', wallet: 'محفظة' };

const when = (iso) => new Intl.DateTimeFormat('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));

/** 80mm thermal receipt. `sale.number` is the official number; until the server gives one we print the temporary one and say so. */
export function receiptHtml({ storeName, sale, copy = false }) {
  const official = sale.number != null;
  const ref = official ? `فاتورة رقم ${sale.number}` : `فاتورة مؤقتة ${sale.localNo || ''}`;
  const rows = sale.items.map((i) => {
    const net = i.price * i.qty - (i.discount || 0);
    const opts = [i.color, i.size].filter(Boolean).join(' / ');
    return `<tr><td class="n">${esc(i.name)}${opts ? `<div class="o">${esc(opts)}</div>` : ''}<div class="o">${i.qty} × ${nf.format(i.price)}${i.discount ? ` − ${nf.format(i.discount)}` : ''}</div></td><td class="a">${nf.format(net)}</td></tr>`;
  }).join('');
  const pay = (sale.payments || []).map((p) => `<div class="r"><span>${METHOD[p.method] || p.method}</span><span>${egp(p.amount)}</span></div>`).join('');
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(ref)}</title><style>
@page{size:80mm auto;margin:0}*{box-sizing:border-box}
body{margin:0;width:72mm;padding:3mm 4mm;font:12px/1.45 "IBM Plex Sans Arabic",Tahoma,Arial,sans-serif;color:#000}
h1{font-size:16px;text-align:center;margin:0 0 2px}.c{text-align:center}.s{font-size:11px;color:#333}
hr{border:0;border-top:1px dashed #000;margin:6px 0}table{width:100%;border-collapse:collapse}td{vertical-align:top;padding:2px 0}
.n{width:78%}.a{text-align:left;white-space:nowrap;direction:ltr}.o{font-size:10.5px;color:#333}
.r{display:flex;justify-content:space-between}.t{font-size:15px;font-weight:700}.tmp{border:1px solid #000;padding:2px 4px;margin-top:4px;font-size:10.5px;text-align:center}
</style></head><body>
<h1>${esc(storeName)}</h1><div class="c s">${esc(ref)}${copy ? ' — نسخة' : ''}</div><div class="c s">${esc(when(sale.createdAt))}</div>
${sale.customerName ? `<div class="c s">العميل: ${esc(sale.customerName)}</div>` : ''}
${sale.reservationNumber ? `<div class="c s">حجز رقم ${esc(sale.reservationNumber)}</div>` : ''}
<hr><table>${rows}</table><hr>
<div class="r"><span>الإجمالي قبل الخصم</span><span>${egp(sale.subtotal)}</span></div>
${sale.discount ? `<div class="r"><span>الخصم</span><span>− ${egp(sale.discount)}</span></div>` : ''}
<div class="r t"><span>المطلوب</span><span>${egp(sale.total)}</span></div><hr>
${pay}${sale.change ? `<div class="r"><span>الباقي للعميل</span><span>${egp(sale.change)}</span></div>` : ''}
<hr><div class="c">شكراً لزيارتكم</div>
${official ? '' : '<div class="tmp">الفاتورة دي اتسجلت على الجهاز وهتاخد رقمها الرسمي أول ما النت يرجع</div>'}
</body></html>`;
}

/** Prints through a hidden iframe so the cashier screen stays where it is. */
export function printHtml(html) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;inset-inline-end:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const clean = () => setTimeout(() => frame.remove(), 1500);
  frame.onload = () => {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch { /* the browser blocked printing; the receipt is still on screen */ }
    clean();
  };
  frame.srcdoc = html;
}
