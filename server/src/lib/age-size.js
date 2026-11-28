// Kids' products often carry their size only in the TEXT («مقاس 0/3 شهور») while the variants have no size, so the size filter never finds them.
// This reads the name/description and returns ONE canonical size label — only when the text names exactly one age range (anything ambiguous returns null).
import { parseChildSizes } from './moda/childfit.js';

export function ageSizeFromText(text) {
  const found = parseChildSizes(String(text || ''), { source: 'description', confidence: 'low' });
  const uniq = new Map(found.map((r) => [`${r.minAgeMonths}-${r.maxAgeMonths}`, r]));
  if (uniq.size === 0 && /(?:^|[\s(\-])(?:نيو ?بورن|نيوبورن|new ?born|مواليد|حديث(?:ي)? الولاد[هة])(?:$|[\s)\-])/i.test(String(text || ''))) return '0-3 شهور'; // «نيو بورن» alone = newborn size
  if (uniq.size !== 1) return null;
  const { minAgeMonths: lo, maxAgeMonths: hi } = [...uniq.values()][0];
  if (hi - lo > 12 && hi < 36) return null; // not a size bucket («6 شهور الى 2 سنه») — leave it
  if (hi < 36 && lo % 12 === 0 && hi - lo === 11) { const y = lo / 12; return y === 1 ? 'سنة' : y === 2 ? 'سنتين' : `${y} سنين`; } // exactly one year
  if (hi < 36) return lo === hi ? `${lo} شهور` : `${lo}-${hi} شهور`; // under 3 years it is quoted in months
  if (lo % 12 === 0 && (hi + 1) % 12 === 0) { const a = lo / 12, b = (hi + 1) / 12 - 1; return a === b ? (a === 1 ? 'سنة' : a === 2 ? 'سنتين' : `${a} سنين`) : `${a}-${b} سنين`; }
  return null;
}
