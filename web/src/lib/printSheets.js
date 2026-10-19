import { qrSvg } from './qr/index.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Print a self-contained block without leaving the page: it is mounted in a #print-root that
 * the print stylesheet isolates, so the app's own fonts and styles stay available.
 */
export function printBlock(html, { page = 'A4', margin = '10mm' } = {}) {
  document.getElementById('print-root')?.remove();
  document.getElementById('print-style')?.remove();
  const style = document.createElement('style');
  style.id = 'print-style';
  style.textContent = `
    #print-root{display:none}
    @media print{
      @page{size:${page};margin:${margin}}
      html,body{background:#fff!important}
      body>*:not(#print-root){display:none!important}
      #print-root{display:block!important;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      #print-root *{box-sizing:border-box}
    }`;
  const root = document.createElement('div');
  root.id = 'print-root';
  root.setAttribute('dir', document.documentElement.dir || 'rtl');
  root.innerHTML = html;
  document.head.appendChild(style);
  document.body.appendChild(root);
  const cleanup = () => { root.remove(); style.remove(); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  // let the browser lay the block out (and the QR SVGs paint) before the dialog opens
  setTimeout(() => window.print(), 120);
}

const qr = (text, size) => qrSvg(text, { size, margin: 1 });

/** A4 window/counter poster: big QR + store name. */
export function storePosterHtml({ name, url, logo, headline, sub, brand = '#F8620A' }) {
  return `
  <div style="min-height:270mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-family:inherit;border:6px solid ${brand};border-radius:28px;padding:18mm 12mm">
    ${logo ? `<img src="${esc(logo)}" alt="" style="width:34mm;height:34mm;object-fit:cover;border-radius:50%;margin-bottom:8mm">` : ''}
    <div style="font-size:46pt;font-weight:800;line-height:1.2">${esc(name)}</div>
    <div style="font-size:22pt;margin-top:6mm;color:#444">${esc(headline)}</div>
    <div style="margin:12mm 0 8mm;padding:7mm;border-radius:20px;background:#fff;box-shadow:0 0 0 3px #eee">${qr(url, 380)}</div>
    <div style="font-size:16pt;color:#444;max-width:150mm">${esc(sub)}</div>
    <div dir="ltr" style="margin-top:8mm;font-size:13pt;color:#777;word-break:break-all">${esc(url)}</div>
  </div>`;
}

/** Small cards (8 per A4) to hand out with a parcel or stick on a shopping bag. */
export function storeCardsHtml({ name, url, headline }) {
  const card = `<div style="border:2px dashed #bbb;border-radius:14px;padding:6mm;display:flex;align-items:center;gap:5mm;height:61mm;break-inside:avoid">
      ${qr(url, 120)}
      <div style="flex:1;min-width:0"><div style="font-size:16pt;font-weight:800;line-height:1.25">${esc(name)}</div><div style="font-size:10.5pt;color:#555;margin-top:2mm">${esc(headline)}</div></div></div>`;
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:5mm;font-family:inherit">${card.repeat(8)}</div>`;
}

/** Product tags: name + price + QR to the product page, repeated `copies` times (3 per row). */
export function productTagsHtml({ store, name, price, url, scan, copies = 12 }) {
  const tag = `<div style="border:1.5px solid #999;border-radius:10px;padding:4mm;text-align:center;height:62mm;break-inside:avoid;display:flex;flex-direction:column;align-items:center;justify-content:space-between">
      <div style="font-size:9pt;color:#666">${esc(store)}</div>
      <div style="font-size:12pt;font-weight:700;line-height:1.25;max-height:15mm;overflow:hidden">${esc(name)}</div>
      ${qr(url, 92)}
      <div style="font-size:15pt;font-weight:800">${esc(price)}</div>
      <div style="font-size:7.5pt;color:#777">${esc(scan)}</div></div>`;
  return `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;font-family:inherit">${tag.repeat(copies)}</div>`;
}

/** Order slip for the parcel: customer, items, totals and a QR that opens the order in the dashboard. */
export function orderSlipHtml({ store, number, date, customer, items, totals, payment, notes, url, labels: L }) {
  const row = (it) => `<tr><td style="padding:4px 0;border-bottom:1px solid #ddd">${esc(it.name)}${it.variant ? `<div style="font-size:9pt;color:#666">${esc(it.variant)}</div>` : ''}</td><td style="padding:4px 8px;border-bottom:1px solid #ddd;text-align:center">${it.qty}</td><td style="padding:4px 0;border-bottom:1px solid #ddd;text-align:end">${esc(it.total)}</td></tr>`;
  const line = (k, v, bold) => `<div style="display:flex;justify-content:space-between;${bold ? 'font-weight:800;font-size:14pt;border-top:2px solid #111;margin-top:3px;padding-top:4px' : ''}"><span>${esc(k)}</span><span>${esc(v)}</span></div>`;
  return `
  <div style="max-width:140mm;margin:0 auto;font-family:inherit;font-size:11pt;line-height:1.5">
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #111;padding-bottom:4mm;margin-bottom:4mm">
      <div><div style="font-size:18pt;font-weight:800">${esc(store)}</div><div style="color:#555;font-size:10pt">${esc(date)}</div></div>
      <div style="text-align:end"><div style="font-size:9pt;color:#555">${esc(L.order)}</div><div dir="ltr" style="font-size:20pt;font-weight:800">#${esc(number)}</div></div>
    </div>
    <div style="background:#f3f3f3;border-radius:10px;padding:3mm 4mm;margin-bottom:4mm">
      <div style="font-weight:700">${esc(customer.name)}</div>
      <div dir="ltr" style="text-align:start">${esc(customer.phone)}</div>
      <div>${esc(customer.address)}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:4mm"><thead><tr style="font-size:9pt;color:#555"><th style="text-align:start;padding-bottom:3px">${esc(L.items)}</th><th>${esc(L.qty)}</th><th style="text-align:end">${esc(L.total)}</th></tr></thead><tbody>${items.map(row).join('')}</tbody></table>
    <div style="margin-bottom:4mm">${totals.map((x) => line(x[0], x[1], x[2])).join('')}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:6mm">
      <div style="flex:1"><div style="font-weight:700">${esc(payment)}</div>${notes ? `<div style="margin-top:2mm;font-size:10pt;color:#444">${esc(L.notes)}: ${esc(notes)}</div>` : ''}</div>
      <div style="text-align:center">${qr(url, 110)}<div style="font-size:8pt;color:#555;margin-top:1mm">${esc(L.scan)}</div></div>
    </div>
  </div>`;
}
