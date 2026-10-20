/**
 * Pure helpers for reading a cashier export (CSV or Excel) and guessing which column is which.
 * No database access here, so it can be unit-tested on its own.
 */

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export const toAsciiDigits = (s) => String(s ?? '').replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

export const FIELDS = ['sku', 'barcode', 'name', 'color', 'size', 'stock', 'price'];

const HEADER_WORDS = {
  sku: ['sku', 'code', 'item code', 'itemcode', 'product code', 'productcode', 'ref', 'reference', 'كود', 'الكود', 'كود الصنف', 'كود المنتج', 'رقم الصنف', 'كود الصنف الداخلي', 'productcode'],
  barcode: ['barcode', 'bar code', 'upc', 'ean', 'gtin', 'باركود', 'الباركود', 'بار كود'],
  name: ['name', 'item', 'item name', 'itemname', 'product', 'product name', 'productname', 'description', 'الاسم', 'اسم الصنف', 'اسم المنتج', 'الصنف', 'المنتج', 'البيان'],
  color: ['color', 'colour', 'اللون', 'لون'],
  size: ['size', 'المقاس', 'مقاس'],
  stock: ['stock', 'qty', 'quantity', 'balance', 'on hand', 'onhand', 'in stock', 'inventory', 'stock balance', 'stockbalance', 'الكمية', 'كمية', 'الرصيد', 'رصيد', 'المخزون', 'المتاح', 'الكميه'],
  price: ['price', 'selling price', 'sale price', 'سعر', 'السعر', 'سعر البيع'],
};

const normHeader = (h) => String(h ?? '').toLowerCase().replace(/[ً-ٟـ]/g, '').replace(/[_\-./]+/g, ' ').replace(/\s+/g, ' ').trim();

/** headers[] -> { sku: columnIndex|null, ... } using exact then partial matching; each column used once. */
export function guessMapping(headers) {
  const hs = headers.map(normHeader);
  const mapping = Object.fromEntries(FIELDS.map((f) => [f, null]));
  const used = new Set();
  for (const pass of ['exact', 'partial']) {
    for (const f of FIELDS) {
      if (mapping[f] !== null) continue;
      const idx = hs.findIndex((h, i) => !used.has(i) && h && HEADER_WORDS[f].some((w) => (pass === 'exact' ? h === w : h.length > 2 && (h.includes(w) || w.includes(h)))));
      if (idx >= 0) { mapping[f] = idx; used.add(idx); }
    }
  }
  return mapping;
}

function decodeText(buf) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { text = new TextDecoder('windows-1256').decode(buf); } // old Arabic Windows programs export CSV in this code page
  return text.replace(/^﻿/, '');
}

export function parseCsv(buf) {
  const text = decodeText(buf);
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; } else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export async function parseXlsx(buf) {
  let readXlsxFile;
  try { ({ default: readXlsxFile } = await import('read-excel-file/node')); }
  catch { const e = new Error('Excel support is not installed. Run "npm install" in the project, or save the file as CSV.'); e.code = 'xlsx_unavailable'; throw e; }
  return readXlsxFile(buf);
}

/** Buffer + filename -> { headers: string[], rows: string[][] } (all values as trimmed strings). */
export async function readTable(buf, filename = '') {
  const isXlsx = /\.xlsx$/i.test(filename) || (buf.length > 3 && buf[0] === 0x50 && buf[1] === 0x4B);
  const raw = isXlsx ? await parseXlsx(buf) : parseCsv(buf);
  const cleaned = raw
    .map((r) => r.map((v) => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim())))
    .filter((r) => r.some((v) => v !== ''));
  if (cleaned.length < 2) { const e = new Error('The file has no data rows.'); e.code = 'empty_file'; throw e; }
  return { headers: cleaned[0], rows: cleaned.slice(1) };
}

/** "١٢٫٥" / "12" / "1,200" -> integer or null. Fractions are floored. */
export function parseQty(v) {
  const s = toAsciiDigits(v).replace(/[٬,\s]/g, '').replace('٫', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

/** Codes from spreadsheets: strip spaces, drop a trailing ".0" that Excel adds to numeric codes. */
export const normCode = (v) => toAsciiDigits(v).trim().replace(/\.0+$/, '').toLowerCase();
