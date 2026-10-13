/** Helpers for building a public test set (fashion product photos grouped by garment family) for `npm run testset:visual`. */

/** Keyword → garment family (first match wins, order matters). Labels come from a public dataset's article-type column. */
const RULES = [
  [/shoe|sneaker|heel|sandal|flip|boot|loafer|flat|sport shoe|slipper|floater/i, 'shoes'],
  [/sport|track ?pant|tracksuit|jersey|sports bra/i, 'sport'],
  [/night|pyjama|pajama|lounge|brief|boxer|bra\b|innerwear|vest|camisole|trunk|robe/i, 'underwear_sleep'],
  [/suit|blazer|waistcoat|tuxedo/i, 'suiting'],
  [/dress|jumpsuit|gown|romper/i, 'dresses'],
  [/jacket|coat|cardigan|shrug|shawl|poncho|windcheater|blazers/i, 'outerwear'],
  [/jean|trouser|pant|short|skirt|legging|capri|jegging|churidar|salwar|dhoti|patiala/i, 'bottoms'],
  [/bag|backpack|clutch|handbag|wallet|tote|duffel|satchel/i, 'bags'],
  [/watch|belt|cap|hat|tie|sunglass|jewel|ring|earring|necklace|bracelet|scarf|scarve|muffler|stole|bangle|pendant|cufflink/i, 'accessories'],
  [/t-?shirt|shirt|top|blouse|sweater|sweatshirt|hoodie|polo|kurta|tunic|kurti|tank|pullover/i, 'tops'],
];

export function familyForLabel(label) {
  const s = String(label || '');
  for (const [re, fam] of RULES) if (re.test(s)) return fam;
  return null;
}

/** Pick the first existing column of `names` in a row object. */
export const pick = (row, names) => names.map((n) => row[n]).find((v) => v != null && v !== '');

/** datasets-server image cell → url (HF returns { src, height, width }). */
export const imageUrl = (cell) => (typeof cell === 'string' ? cell : cell?.src || null);

/** Row → { id, family, url } or null (unmapped type / no image). */
export function parseRow(r, labelCols = ['articleType', 'subCategory', 'masterCategory', 'category', 'label']) {
  const row = r?.row || r || {};
  const url = imageUrl(row.image ?? row.img ?? row.photo);
  let family = null;
  for (const c of labelCols) { if (row[c] == null) continue; family = familyForLabel(row[c]); if (family) break; }
  if (!url || !family) return null;
  return { id: String(row.id ?? r.row_idx ?? Math.random().toString(36).slice(2, 9)), family, url };
}
