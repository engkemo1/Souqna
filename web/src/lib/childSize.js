// Display helper: a generic word ("أطفال", "kids") is never shown as if it were a size.
// When the size label is generic we use the explicit age the shop wrote in the description (e.g. "مقاس ٦ سنه" -> "6 سنين").
const toAscii = (s) => String(s || '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
const GENERIC = /^(?:اطفال|أطفال|طفل|اطفالي|kids?|child(?:ren)?|صغار)$/i;
const RANGE = /(\d{1,2})\s*(?:-|–|—|الي|الى|إلى|ل|to)\s*(\d{1,2})\s*(?:سنه|سنة|سنين|سنوات|years?|yrs?|y)(?![a-z])/i;
const SINGLE = /(?:^|[^\d])(\d{1,2})\s*(?:سنه|سنة|سنين|سنوات|years?|yrs?|y)(?![a-z])|(?:سن|عمر)\s*(\d{1,2})(?!\d)/i;

export const isGenericSizeLabel = (s) => GENERIC.test(String(s || '').trim());
export function ageFromText(text, ar = true) {
  const t = toAscii(text);
  const r = t.match(RANGE); if (r && +r[1] <= +r[2] && +r[2] <= 16) return ar ? `${r[1]}–${r[2]} سنين` : `${r[1]}–${r[2]} years`;
  const m = t.match(SINGLE); const n = m && (m[1] || m[2]); if (n && +n <= 16) return ar ? `${n} سنين` : `${n} years`;
  return '';
}
/** The label to show for a size button / message. Generic words are replaced by the explicit age when the product states one, else by a neutral "size not specified". */
export function displaySize(product, size, lang = 'ar') {
  if (!isGenericSizeLabel(size)) return size;
  const ar = lang === 'ar';
  const desc = [product?.description?.ar, product?.description?.en, typeof product?.description === 'string' ? product.description : ''].filter(Boolean).join(' . ');
  return ageFromText(desc, ar) || (ar ? 'مقاس غير محدد' : 'Size not specified');
}

/** The size text for a basket / checkout line: the label saved at add-to-cart time, else the raw size unless it is the generic word. */
export function cartSizeText(line, lang = 'ar') {
  if (line?.sizeLabel) return line.sizeLabel;
  if (isGenericSizeLabel(line?.size)) return lang === 'ar' ? 'مقاس غير محدد' : 'Size not specified';
  return line?.size || '';
}
