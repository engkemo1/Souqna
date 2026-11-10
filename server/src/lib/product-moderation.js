import { decodeDepartments } from '@souqna/shared';
import { q, json } from '../db/index.js';
import { inferDepartment } from './departments.js';
import { deriveDepartment, sizeKindFor, SIZE_KINDS, AUDIENCES } from './product-types.js';
import { inferKey, inferGender } from './moda/products.js';
import { loadKnowledge } from './moda/knowledge.js';

export const ISSUE_TYPES = [
  { code: 'no_department', label: 'مش متضاف القسم', severity: 'critical', manual: true },
  { code: 'dept_mismatch', label: 'القسم ملهوش علاقة بالمنتج', severity: 'critical', manual: true },
  { code: 'irrelevant_photo', label: 'صور ملهاش علاقة بالمنتج', severity: 'critical', manual: true },
  { code: 'no_photo', label: 'بدون صور', severity: 'critical', manual: false },
  { code: 'weak_photo', label: 'صورة ضعيفة الجودة', severity: 'warning', manual: true },
  { code: 'unclear_name', label: 'الاسم مش واضح', severity: 'warning', manual: true },
  { code: 'missing_details', label: 'ناقص وصف أو مقاسات', severity: 'info', manual: true },
];

export const ISSUE_CODES = ISSUE_TYPES.map((i) => i.code);
const ISSUE_BY_CODE = new Map(ISSUE_TYPES.map((i) => [i.code, i]));

const FILLER_WORDS = new Set([
  'موديل', 'كود', 'قطعه', 'قطعة', 'منتج', 'جديد', 'عرض', 'خصم', 'سعر', 'فقط', 'اصلي', 'أصلي',
  'مستورد', 'لوكس', 'سوبر', 'مميز', 'شيك', 'تريند', 'ترند', 'حصري', 'تست', 'تجربه', 'تجربة',
  'test', 'item', 'product', 'model', 'new', 'code', 'sale',
]);

const normAr = (s) => String(s || '')
  .toLowerCase()
  .replace(/[\u064B-\u065F\u0640]/g, '')
  .replace(/[أإآ]/g, 'ا')
  .replace(/ة/g, 'ه')
  .replace(/ى/g, 'ي')
  .trim();

const WOMEN_STRICT_KEYS = new Set([
  'dress_any', 'dress_casual', 'dress_work', 'dress_party', 'dress_evening', 'dress_bridal', 'dress_beach',
  'jumpsuit', 'skirt', 'blouse', 'abaya', 'hijab_set', 'tarha', 'heels_low', 'heels_high', 'womens_suit',
]);
const MEN_STRICT_KEYS = new Set(['tuxedo', 'tie', 'bow_tie', 'pocket_square', 'waistcoat', 'classic_set']);

/**
 * Builds a fast in-memory lookup context for department hierarchy and product knowledge.
 */
export function buildModerationContext(customDeptRows = null) {
  const K = loadKnowledge();
  const deptRows = customDeptRows || q.all('SELECT id, slug, name_ar, name_en, parent_slug, active, visibility FROM departments');
  const deptsBySlug = new Map(deptRows.map((d) => [d.slug, d]));
  const activeDeptSlugs = deptRows.filter((d) => d.active).map((d) => d.slug);
  // Leaf active departments preferred for suggestions
  const parentSlugs = new Set(deptRows.filter((d) => d.active && d.parent_slug).map((d) => d.parent_slug));
  const leafActiveDeptSlugs = activeDeptSlugs.filter((s) => !parentSlugs.has(s));
  const candidateSlugs = [...leafActiveDeptSlugs, ...activeDeptSlugs];

  const chainOf = (slug) => {
    const out = [];
    for (let s = slug, i = 0; s && i < 8; s = deptsBySlug.get(s)?.parent_slug, i++) out.push(s);
    return out; // [leaf, ..., root]
  };
  const labelOf = (slug) => {
    if (!slug) return '';
    return chainOf(slug).reverse().map((s) => deptsBySlug.get(s)?.name_ar || s).join(' › ');
  };
  const rootOf = (slug) => {
    const ch = chainOf(slug);
    return ch[ch.length - 1] || null;
  };
  const deptGender = (slug) => {
    if (!slug) return null;
    const ch = chainOf(slug);
    const text = normAr(ch.map((s) => `${s} ${deptsBySlug.get(s)?.name_ar || ''} ${deptsBySlug.get(s)?.name_en || ''}`).join(' '));
    if (/\b(اطفال|ولادي|بناتي|رضع|مواليد|بيبي|kids|boys|girls|baby)\b/.test(text) || ch.some((s) => s.startsWith('kids') || s.includes('_kids'))) return 'kids';
    if (/\b(رجالي|رجال|شبابي|men|mens)\b/.test(text) || ch.some((s) => s === 'men' || s.startsWith('men_') || s.endsWith('_men'))) return 'men';
    if (/\b(حريمي|نسائي|محجبات|طرح|عبايات|فساتين|لانجيري|مكياج|women|modest|hijab|abaya)\b/.test(text) || ch.some((s) => s === 'women' || s.startsWith('women_') || s.endsWith('_women') || s === 'modest' || s.startsWith('modest_') || s.startsWith('hijab'))) return 'women';
    return null;
  };
  const expandStoreSlugs = (slugs) => {
    const base = new Set(slugs);
    if (!base.size) return [];
    const expanded = candidateSlugs.filter((s) => chainOf(s).some((anc) => base.has(anc)));
    return expanded.length ? expanded : [...base].filter((s) => deptsBySlug.get(s)?.active);
  };

  return { K, deptsBySlug, activeDeptSlugs, leafActiveDeptSlugs, candidateSlugs, chainOf, labelOf, rootOf, deptGender, expandStoreSlugs };
}

function checkUnclearName(nameAr, nameEn, inferredKey) {
  const raw = String(nameAr || nameEn || '').trim();
  if (!raw || raw.length < 4) {
    return 'الاسم قصير جداً (أقل من ٤ حروف)';
  }
  // Remove numbers, codes, symbols
  const cleaned = normAr(raw)
    .replace(/[#0-9٠-٩۰-۹_./\\|+\-*()[\]{}:;,'"!?~$%^&<>]+/g, ' ')
    .trim();
  const words = cleaned.split(/\s+/).filter((w) => w.length >= 2);
  const meaningful = words.filter((w) => !FILLER_WORDS.has(w));

  if (words.length === 0) {
    return 'الاسم عبارة عن أرقام أو رموز بس من غير وصف للقطعة';
  }
  if (words.some((w) => ['تست', 'تجربه', 'test'].includes(w))) {
    return 'الاسم يبدو كمنتج تجريبي (تست)';
  }
  if (meaningful.length === 0) {
    return `الاسم («${raw}») عام ومبيوضحش نوع المنتج (زي: موديل / كود بس)`;
  }
  if (words.length === 1 && !inferredKey) {
    return `الاسم كلمة واحدة غير واضحة («${raw}») — يفضل إضافة نوع القطعة ووصفها`;
  }
  if (words.length === 1 && raw.length < 7) {
    return `الاسم كلمة واحدة قصيرة («${raw}») — يفضل توضيح الموديل أو الخامة أو الفئة`;
  }
  return null;
}

function detectDeptMismatch(p, ctx, inferredKey, inferredGender, suggestedDeptSlug) {
  const slug = p.department;
  if (!slug || !ctx.deptsBySlug.has(slug)) return null;
  const dept = ctx.deptsBySlug.get(slug);
  if (!dept.active) return null;

  const chain = ctx.chainOf(slug);
  const chainStr = chain.join(' ');
  const root = ctx.rootOf(slug);
  const nameNorm = normAr(`${p.name_ar || ''} ${p.name_en || ''}`);
  const key = inferredKey || p.moda_key || null;
  const item = key ? ctx.K.items.get(key) : null;
  const family = item?.family || null;

  // 1) Check explicit conflict between saved moda_key and inferredKey from name
  if (p.moda_key && inferredKey && p.moda_key !== inferredKey) {
    const savedItem = ctx.K.items.get(p.moda_key);
    const infItem = ctx.K.items.get(inferredKey);
    if (savedItem && infItem && savedItem.family !== infItem.family) {
      return `الاسم بيقول «${infItem.ar}» لكن نوع القطعة متسجل «${savedItem.ar}»`;
    }
  }

  // 2) Check gender / audience vs department branch conflict
  const hasExplicitMen = /\b(رجالي|للرجال|شبابي|men|mens)\b/i.test(nameNorm) && !/\b(حريمي|نسائي|بناتي|اطفال|ولادي)\b/i.test(nameNorm);
  const hasExplicitWomen = /\b(حريمي|نسائي|للنساء|مدامات|women|ladies)\b/i.test(nameNorm) && !/\b(رجالي|ولادي|اطفال)\b/i.test(nameNorm);
  const hasExplicitKids = /\b(اطفال|طفل|ولادي|بناتي|بيبي|حديثي الولاده|كيدز|kids|baby|boys|girls)\b/i.test(nameNorm);

  const dg = ctx.deptGender(slug);
  const deptIsWomen = dg === 'women' || root === 'women' || chain.some((s) => s.startsWith('women') || s === 'shoes_women' || s === 'maternity');
  const deptIsMen = dg === 'men' || root === 'men' || chain.some((s) => s.startsWith('men') || s === 'shoes_men');
  const deptIsKids = dg === 'kids' || root === 'kids' || chain.some((s) => s.startsWith('kids') || s === 'shoes_kids');

  if ((hasExplicitMen || MEN_STRICT_KEYS.has(inferredKey)) && deptIsWomen) {
    return `المنتج رجالي («${item?.ar || p.name_ar}») لكنه محطوط في قسم حريمي «${dept.name_ar}»`;
  }
  if ((hasExplicitWomen || WOMEN_STRICT_KEYS.has(inferredKey)) && deptIsMen) {
    return `المنتج حريمي («${item?.ar || p.name_ar}») لكنه محطوط في قسم رجالي «${dept.name_ar}»`;
  }
  if (WOMEN_STRICT_KEYS.has(inferredKey) && chain.includes('kids_boys')) {
    return `المنتج «${item?.ar || p.name_ar}» لكنه محطوط في قسم أولاد «${dept.name_ar}»`;
  }
  if (hasExplicitKids && (deptIsMen || (deptIsWomen && !WOMEN_STRICT_KEYS.has(inferredKey))) && !deptIsKids) {
    return `المنتج للأطفال لكنه محطوط في قسم الكبار «${dept.name_ar}»`;
  }

  // 3) Check garment family vs department branch conflict
  const chainArNorm = normAr(chain.map((s) => ctx.deptsBySlug.get(s)?.name_ar || '').join(' '));
  const deptIsShoes = root === 'shoes' || chainStr.includes('shoes') || /(احذيه|حذاء|جزم|كوتشي|صندل|صنادل|شباشب)/.test(chainArNorm);
  const deptIsBags = chainStr.includes('bags') || /(شنط|حقائب)/.test(chainArNorm);
  const deptIsDresses = chainStr.includes('dress') || /فساتين/.test(chainArNorm);
  const deptIsPants = chainStr.includes('pants') || chainStr.includes('denim') || /(بناطيل|جينز)/.test(chainArNorm);
  const deptIsTops = chainStr.includes('tops');
  const deptIsAbaya = chainStr.includes('abaya') || /عباي/.test(chainArNorm);
  const deptIsHijab = (chainStr.includes('hijab') || /(طرح|ايشارب)/.test(chainArNorm)) && !deptIsAbaya;
  const deptIsSuits = chainStr.includes('suit');
  const deptIsUnderwear = chainStr.includes('underwear');
  const deptIsBeauty = root === 'perfume_makeup' || root === 'care';

  if (family === 'shoes') {
    if (!deptIsShoes && !chainStr.includes('sport')) {
      return `المنتج حذاء/كوتشي («${item?.ar || p.name_ar}») لكنه محطوط في قسم «${dept.name_ar}»`;
    }
    const deptNameNorm = normAr(dept.name_ar || '');
    if ((inferredKey === 'sandals' || inferredKey === 'slippers') && /(كلاسيك|رسمي|كوتش|رياض|بوت|كعب)/.test(deptNameNorm)) {
      return `المنتج «${item?.ar || p.name_ar}» لكنه محطوط في قسم «${dept.name_ar}»`;
    }
    if ((inferredKey === 'sneakers' || inferredKey === 'sport_shoes') && /(كلاسيك|رسمي|صندل|صنادل|شبشب|شباشب|بوت|كعب)/.test(deptNameNorm)) {
      return `المنتج «${item?.ar || p.name_ar}» لكنه محطوط في قسم «${dept.name_ar}»`;
    }
    if ((inferredKey === 'formal_shoes' || inferredKey === 'loafers') && /(صندل|صنادل|شبشب|شباشب|كوتش|رياض|بوت|كعب)/.test(deptNameNorm)) {
      return `المنتج «${item?.ar || p.name_ar}» لكنه محطوط في قسم «${dept.name_ar}»`;
    }
    if (inferredKey === 'boots' && /(صندل|صنادل|شبشب|شباشب|كوتش|رياض|كلاسيك)/.test(deptNameNorm)) {
      return `المنتج «${item?.ar || p.name_ar}» لكنه محطوط في قسم «${dept.name_ar}»`;
    }
  } else if (deptIsShoes && family && family !== 'shoes') {
    return `المنتج «${item?.ar || p.name_ar}» محطوط في قسم الأحذية «${dept.name_ar}»`;
  }

  if (family === 'bags') {
    if (!deptIsBags && !chainStr.includes('accessories') && chain.length > 1) {
      return `المنتج شنطة/حقيبة لكنه محطوط في قسم «${dept.name_ar}»`;
    }
  } else if (deptIsBags && family && family !== 'bags' && family !== 'accessories') {
    return `المنتج «${item?.ar || p.name_ar}» محطوط في قسم الشنط «${dept.name_ar}»`;
  }

  if (family === 'dresses') {
    if (deptIsPants || deptIsShoes || deptIsBags || deptIsHijab || deptIsAbaya || deptIsTops || deptIsUnderwear || deptIsSuits || deptIsBeauty) {
      return `المنتج فستان («${item?.ar || p.name_ar}») لكنه محطوط في قسم «${dept.name_ar}»`;
    }
  } else if (deptIsDresses && family && !['dresses', 'suiting'].includes(family)) {
    return `المنتج «${item?.ar || p.name_ar}» محطوط في قسم الفساتين «${dept.name_ar}»`;
  }

  if (inferredKey === 'abaya') {
    if (deptIsPants || deptIsShoes || deptIsBags || deptIsTops || deptIsHijab || deptIsDresses || deptIsUnderwear || deptIsBeauty) {
      return `المنتج عباية لكنه محطوط في قسم «${dept.name_ar}»`;
    }
  } else if (deptIsAbaya && inferredKey && !['abaya', 'jalabiya', 'long_cardigan', 'hijab_set'].includes(inferredKey)) {
    return `المنتج «${item?.ar || p.name_ar}» محطوط في قسم العبايات «${dept.name_ar}»`;
  }

  if (inferredKey === 'tarha' || inferredKey === 'shawl' || inferredKey === 'hijab_set') {
    if (deptIsPants || deptIsShoes || deptIsBags || deptIsDresses || deptIsTops || deptIsUnderwear || deptIsBeauty) {
      return `المنتج طرحة/حجاب لكنه محطوط في قسم «${dept.name_ar}»`;
    }
  } else if (deptIsHijab && inferredKey && !['tarha', 'shawl', 'hijab_set', 'abaya', 'tunic'].includes(inferredKey)) {
    return `المنتج «${item?.ar || p.name_ar}» محطوط في قسم الطرح والحجاب «${dept.name_ar}»`;
  }

  if (family === 'bottoms') {
    if (inferredKey === 'skirt') {
      if (deptIsPants || deptIsShoes || deptIsBags || deptIsTops || deptIsAbaya || deptIsHijab || deptIsSuits) {
        return `المنتج جيبة لكنه محطوط في قسم «${dept.name_ar}»`;
      }
    } else if (deptIsDresses || deptIsShoes || deptIsBags || deptIsTops || deptIsAbaya || deptIsHijab || deptIsSuits || deptIsUnderwear || deptIsBeauty) {
      return `المنتج بنطلون/جينز («${item?.ar || p.name_ar}») لكنه محطوط في قسم «${dept.name_ar}»`;
    }
  } else if (deptIsPants && family && !['bottoms', 'sport'].includes(family)) {
    return `المنتج «${item?.ar || p.name_ar}» محطوط في قسم البناطيل «${dept.name_ar}»`;
  }

  if (family === 'tops' || family === 'outerwear') {
    if (deptIsPants || deptIsDresses || deptIsShoes || deptIsBags || deptIsHijab || deptIsAbaya || deptIsUnderwear || deptIsBeauty) {
      return `المنتج «${item?.ar || p.name_ar}» محطوط في قسم «${dept.name_ar}»`;
    }
  } else if (deptIsTops && family && !['tops', 'outerwear', 'sport', 'suiting'].includes(family)) {
    return `المنتج «${item?.ar || p.name_ar}» محطوط في قسم البلوزات/التيشيرتات «${dept.name_ar}»`;
  }

  if (inferredKey === 'perfume' || /\b(عطر|برفان|سبلاش|مكياج|روج|كريم|سيروم|شامبو)\b/i.test(nameNorm)) {
    if (!deptIsBeauty && root !== 'perfume_makeup' && root !== 'care') {
      return `المنتج عطور/عناية لكنه محطوط في قسم «${dept.name_ar}»`;
    }
  } else if (deptIsBeauty && family && !['accessories'].includes(family)) {
    return `المنتج ملابس/أحذية («${item?.ar || p.name_ar}») لكنه محطوط في قسم «${dept.name_ar}»`;
  }

  void suggestedDeptSlug;
  return null;
}

function matchCustomSubDepartment(nameText, effectiveKey, candidates, ctx) {
  const tokens = normAr(`${nameText} ${effectiveKey ? (ctx.K.items.get(effectiveKey)?.ar || '') : ''}`)
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !FILLER_WORDS.has(w) && !['رجالي', 'حريمي', 'نسائي', 'اطفال', 'ولادي', 'بناتي'].includes(w));
  if (!tokens.length) return null;
  let best = null;
  for (const slug of candidates) {
    const d = ctx.deptsBySlug.get(slug);
    if (!d?.active || !d.parent_slug) continue;
    const dNorm = normAr(d.name_ar || '');
    let hits = 0;
    for (const tok of tokens) {
      const stem = tok.replace(/^ال/, '');
      if (stem.length >= 3 && (dNorm.includes(stem) || (stem === 'صندل' && dNorm.includes('صنادل')) || (stem === 'شبشب' && dNorm.includes('شباشب')) || (stem === 'عبايه' && dNorm.includes('عبايات')) || (stem === 'فستان' && dNorm.includes('فساتين')) || (stem === 'تراك' && /(رياض|جيم|تراك|ترينج)/.test(dNorm)))) {
        hits++;
      }
    }
    if (hits > 0) {
      const depth = ctx.chainOf(slug).length;
      const score = hits * 10 + depth;
      if (!best || score > best.score) best = { slug, score };
    }
  }
  return best?.slug || null;
}

function inferKeyFromDepartment(deptSlug, categoryName, ctx) {
  const ch = deptSlug ? ctx.chainOf(deptSlug) : [];
  const text = normAr(`${ch.join(' ')} ${ch.map((s) => ctx.deptsBySlug.get(s)?.name_ar || '').join(' ')} ${categoryName || ''}`);
  if (!text) return null;
  if (/(عباي|abaya)/.test(text)) return 'abaya';
  if (/(طرح|ايشارب|اسكارف)/.test(text)) return 'tarha';
  if (/(زفاف|عروسه|wedding_dress)/.test(text)) return 'dress_bridal';
  if (/(سهره|سواريه|خطوبه|soiree)/.test(text)) return 'dress_evening';
  if (/(فساتين|فستان|dress)/.test(text)) return 'dress_casual';
  if (/(جينز|دنيم|denim)/.test(text)) return 'jeans';
  if (/(جيبات|جيبه|skirt)/.test(text)) return 'skirt';
  if (/(بناطيل|بنطلون|pants)/.test(text)) return 'trousers';
  if (/(بدل|بدله|suits)/.test(text)) return 'suit';
  if (/(جلابيه|عبايات رجالي|jalabiya)/.test(text)) return 'jalabiya';
  if (/(صنادل|صندل|شباشب|شبشب|sandal)/.test(text)) return 'sandals';
  if (/(بوت|هاف بوت|boot)/.test(text)) return 'boots';
  if (/(كوتش|سنيكر|sneaker)/.test(text)) return 'sneakers';
  if (/(كلاسيك|رسمي|classic)/.test(text) && /(احذيه|حذاء|shoes)/.test(text)) return 'formal_shoes';
  if (/(شنط|حقيبه|حقائب|bags)/.test(text)) return 'handbag';
  if (/(بيجام|لانجيري|ملابس داخليه|sleep|underwear)/.test(text)) return 'sleepwear';
  if (/(رياض|ترينج|تراك|جيم|sport)/.test(text)) return 'tracksuit';
  return null;
}

const AUDIENCE_AR_LABEL = new Map(AUDIENCES.map((a) => [a.key, a.ar]));

const DEFAULT_SIZES_BY_KIND = {
  letters: ['M', 'L', 'XL', 'XXL'],
  length: ['L', 'XL', 'XXL', '3XL'],
  waist_men: ['30', '32', '34', '36', '38'],
  waist_women: ['36', '38', '40', '42', '44'],
  suit: ['48', '50', '52', '54', '56'],
  shoes_men: ['40', '41', '42', '43', '44', '45'],
  shoes_women: ['37', '38', '39', '40', '41'],
  shoes_kids: ['26', '28', '30', '32', '34'],
  kids: ['4Y', '6Y', '8Y', '10Y', '12Y'],
  belt: ['95', '100', '105', '110'],
  free: ['Free size'],
  none: [],
};

const FABRIC_PHRASES = [
  { re: /قطيفه/, ar: 'بخامة قطيفة', en: 'Velvet' },
  { re: /جلد طبيعي/, ar: 'بخامة جلد طبيعي', en: 'Genuine Leather' },
  { re: /\bجلد\b/, ar: 'بخامة جلد', en: 'Leather' },
  { re: /قطن/, ar: 'بخامة قطن', en: 'Cotton' },
  { re: /كتان/, ar: 'بخامة كتان', en: 'Linen' },
  { re: /ستان|ساتان/, ar: 'بخامة ستان', en: 'Satin' },
  { re: /شيفون/, ar: 'بخامة شيفون', en: 'Chiffon' },
  { re: /كريب/, ar: 'بخامة كريب', en: 'Crepe' },
  { re: /جينز|دنيم/, ar: 'بخامة جينز', en: 'Denim' },
  { re: /ميلتون/, ar: 'بخامة ميلتون', en: 'Melton' },
  { re: /صوف|تريكو/, ar: 'بخامة تريكو', en: 'Knitwear' },
  { re: /حرير/, ar: 'بخامة حرير', en: 'Silk' },
  { re: /ليكرا/, ar: 'بخامة ليكرا', en: 'Stretch' },
];

const FEATURE_PHRASES = [
  { re: /استراس/, ar: 'مزينة بالاستراس', en: 'Rhinestone' },
  { re: /مطرز|تطريز/, ar: 'مطرزة', en: 'Embroidered' },
  { re: /فرنساوي/, ar: 'خامة فرنساوي', en: 'French Fabric' },
  { re: /تركي/, ar: 'موديل تركي', en: 'Turkish Style' },
  { re: /مستورد/, ar: 'خامة مستوردة', en: 'Imported' },
  { re: /مبطن/, ar: 'مبطن', en: 'Lined' },
  { re: /اوفر\s*سايز|oversize/i, ar: 'بقصة أوفر سايز', en: 'Oversized' },
  { re: /(?:^|\s)طبي(?:\s|$)/, ar: 'بنعل طبي', en: 'Comfort Sole' },
];

const FAMILY_CLOSING_AR = {
  shoes: 'تصميم مريح للقدم مع نعل عملي متين مناسب للمشي والاستخدام اليومي.',
  sport: 'تصميم عملي يمنحك حرية الحركة والراحة في الرياضة والخروجات الكاجوال.',
  modest: 'قصة مريحة وأنيقة بتقفيل متقن مناسبة للخروجات والمناسبات.',
  dresses: 'تصميم أنيق يبرز جمال الإطلالة ومناسب للمناسبات والخروجات المميزة.',
  suiting: 'قصة كلاسيكية متقنة تمنحك إطلالة رسمية أنيقة ومميزة.',
  bags: 'تصميم عملي وأنيق بتقسيم مريح لحمل احتياجاتك اليومية.',
  outerwear: 'تصميم أنيق يمنحك الدفء والراحة مع تقفيل عالي الجودة.',
  bottoms: 'قصة مريحة ومضبوطة في اللبس مع خامة عملية تتحمل الاستخدام اليومي.',
  tops: 'قصة مريحة وعملية مناسبة للتنسيق في الإطلالات اليومية والخروجات.',
};

/**
 * Generates a 100% deterministic, factual Smart Fix proposal for a product.
 * Only proposes changes grounded in the product's actual title, department, store profile, and knowledge base.
 */
export function buildSmartFixProposal(p, ctx, analysis) {
  const {
    inferredKey,
    deptInferredKey,
    effectiveKey,
    effectiveGender,
    missingDept,
    mismatchReason,
    suggestedDepartment,
    nameProblem,
    descLen,
    needsSizes,
    sizeKind,
    sizes,
  } = analysis;

  const item = effectiveKey ? ctx.K.items.get(effectiveKey) : null;
  const rawNameAr = String(p.name_ar || '').trim();
  const rawNameEn = String(p.name_en || '').trim();
  const normTitle = normAr(rawNameAr);

  const audAr = effectiveGender === 'women'
    ? 'حريمي'
    : effectiveGender === 'men'
      ? 'رجالي'
      : effectiveGender === 'boys'
        ? 'ولادي'
        : effectiveGender === 'girls'
          ? 'بناتي'
          : effectiveGender === 'kids'
            ? 'أطفال'
            : '';

  const fields = {};
  const summary = [];

  // 1) Department fix (if missing or mismatched and a confident suggestion exists)
  if ((missingDept || mismatchReason) && suggestedDepartment?.slug) {
    fields.department = suggestedDepartment.slug;
    fields.department_label = suggestedDepartment.label;
    summary.push(`تحديد القسم الصحيح: «${suggestedDepartment.label}»`);
  }

  // 2) Moda key & audience enrichment (helps search & Twayila)
  if (effectiveKey && !item?.virtual && effectiveKey !== p.moda_key) {
    fields.moda_key = effectiveKey;
    fields.moda_label = item?.ar || effectiveKey;
    summary.push(`تحديد نوع القطعة: «${item?.ar || effectiveKey}»`);
  }
  if (effectiveGender && effectiveGender !== 'unisex' && effectiveGender !== p.audience) {
    fields.audience = effectiveGender;
    fields.audience_label = AUDIENCE_AR_LABEL.get(effectiveGender) || effectiveGender;
  }

  // 3) Name cleanup & garment noun completion (when name is unclear or missing garment noun)
  const cleanRawAr = rawNameAr
    .replace(/[_#*~|+=<>]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const pieceAr = item?.ar ? item.ar.split('/')[0].trim() : '';
  const missingPieceInTitle = !inferredKey && Boolean(deptInferredKey && pieceAr && !normTitle.includes(normAr(pieceAr)));

  if (nameProblem || missingPieceInTitle || cleanRawAr !== rawNameAr) {
    let nextNameAr = cleanRawAr;
    // Strip test words if any
    nextNameAr = nextNameAr.replace(/\b(تست|تجربه|تجربة|test)\b/gi, '').replace(/\s{2,}/g, ' ').trim();

    if (pieceAr && !normAr(nextNameAr).includes(normAr(pieceAr))) {
      nextNameAr = nextNameAr ? `${pieceAr} ${nextNameAr}` : `${pieceAr}${audAr ? ` ${audAr}` : ''}`;
    }
    // If still a single short word, append audience or department leaf name
    if (nextNameAr.split(/\s+/).filter(Boolean).length < 2) {
      const deptLeaf = (fields.department ? ctx.deptsBySlug.get(fields.department) : ctx.deptsBySlug.get(p.department))?.name_ar || '';
      if (audAr && !normAr(nextNameAr).includes(normAr(audAr))) {
        nextNameAr = `${nextNameAr} ${audAr}`.trim();
      } else if (deptLeaf && !normAr(nextNameAr).includes(normAr(deptLeaf))) {
        nextNameAr = `${nextNameAr} - ${deptLeaf}`.trim();
      } else {
        nextNameAr = `${nextNameAr} موديل مميز`.trim();
      }
    }
    if (nextNameAr && nextNameAr !== rawNameAr && nextNameAr.length >= 5) {
      fields.name_ar = nextNameAr;
      summary.push(`توضيح اسم المنتج: «${nextNameAr}»`);
    }
  }

  // Also generate clean English title if missing or identical to Arabic
  const finalNameAr = fields.name_ar || rawNameAr;
  const hasArabicInEn = /[\u0600-\u06FF]/.test(rawNameEn);
  if ((!rawNameEn || hasArabicInEn || fields.name_ar) && item?.en) {
    const audEn = effectiveGender === 'women'
      ? "Women's"
      : effectiveGender === 'men'
        ? "Men's"
        : ['kids', 'boys', 'girls'].includes(effectiveGender)
          ? "Kids'"
          : '';
    const normFull = normAr(finalNameAr);
    const fabEn = FABRIC_PHRASES.find((f) => f.re.test(normFull))?.en || '';
    const featEn = FEATURE_PHRASES.find((f) => f.re.test(normFull))?.en || '';
    const partsEn = [audEn, featEn, fabEn, item.en].filter(Boolean);
    const builtEn = [...new Set(partsEn)].join(' ');
    if (builtEn && builtEn !== rawNameEn) {
      fields.name_en = builtEn;
    }
  }

  // 4) Standard Sizes suggestion when missing
  const effectiveSizes = Array.isArray(sizes) && sizes.length > 0 ? sizes : null;
  if (needsSizes) {
    const defaultSizes = DEFAULT_SIZES_BY_KIND[sizeKind] || DEFAULT_SIZES_BY_KIND.letters;
    if (defaultSizes.length > 0) {
      fields.sizes = defaultSizes;
      summary.push(`إضافة المقاسات القياسية المناسبة: (${defaultSizes.join(' - ')})`);
    }
  }

  // 5) Factual Arabic Description generation when missing or too short (< 15 chars)
  if (descLen < 15) {
    const normFull = normAr(finalNameAr);
    const matchedFabrics = FABRIC_PHRASES.filter((f) => f.re.test(normFull)).map((f) => f.ar);
    const matchedFeatures = FEATURE_PHRASES.filter((f) => f.re.test(normFull)).map((f) => f.ar);

    const leadTitle = pieceAr && !normAr(finalNameAr).startsWith(normAr(pieceAr))
      ? `${pieceAr}${audAr ? ` ${audAr}` : ''} (${finalNameAr})`
      : `${finalNameAr}${audAr && !normAr(finalNameAr).includes(normAr(audAr)) ? ` ${audAr}` : ''}`;

    const descClauses = [leadTitle];
    if (matchedFabrics.length > 0) {
      descClauses.push(matchedFabrics.slice(0, 2).join(' و'));
    }
    if (matchedFeatures.length > 0) {
      descClauses.push(matchedFeatures.slice(0, 2).join(' و'));
    }

    const firstSentence = `${descClauses.join('، ')}.`;
    const familyClosing = ''; // only facts from the store's own data: no quality or comfort claims

    const sizeList = effectiveSizes || []; // real sizes only: a suggested default list is never written into the description
    const sizeSentence = sizeList.length > 0 && sizeList[0] !== 'Free size'
      ? ` متوفر بمقاسات (${sizeList.join('، ')}).`
      : sizeList[0] === 'Free size'
        ? ' متوفر بمقاس موحد (Free Size).'
        : '';

    const generatedDesc = `${firstSentence} ${familyClosing}${sizeSentence}`.replace(/\s{2,}/g, ' ').trim();
    if (generatedDesc.length >= 20) {
      fields.description_ar = generatedDesc;
      summary.push('كتابة وصف تفصيلي للمنتج تلقائياً من بياناته');
    }
  }

  const canAutoFix = Object.keys(fields).length > 0;
  return {
    canAutoFix,
    actionsCount: summary.length,
    summary,
    fields,
  };
}
export function analyzeProduct(p, ctx = buildModerationContext()) {
  const nameText = `${p.name_ar || ''} ${p.name_en || ''}`.trim();
  const storeDepts = Array.isArray(p.store_departments) ? p.store_departments : decodeDepartments(p.store_departments);
  const storeGenders = new Set(storeDepts.map((s) => ctx.deptGender(s)).filter(Boolean));
  const storeDefaultGender = storeGenders.has('men') && !storeGenders.has('women')
    ? 'men'
    : storeGenders.has('women') && !storeGenders.has('men')
      ? 'women'
      : storeGenders.has('kids') && !storeGenders.has('men') && !storeGenders.has('women')
        ? 'kids'
        : null;

  const inferredKey = inferKey(nameText, ctx.K);
  const deptInferredKey = !inferredKey ? inferKeyFromDepartment(p.department, p.category_name_ar, ctx) : null;
  const effectiveKey = inferredKey || p.moda_key || deptInferredKey || null;
  const currentDeptGender = p.department ? ctx.deptGender(p.department) : null;
  const inferredGender = inferGender({ name_ar: p.name_ar, name_en: p.name_en, department: p.department, audience: p.audience || storeDefaultGender || currentDeptGender }, effectiveKey, ctx.K);
  const effectiveGender = inferredGender === 'unisex' ? (p.audience || storeDefaultGender || currentDeptGender || 'unisex') : inferredGender;

  const fitsGender = (slug) => {
    const dg = ctx.deptGender(slug);
    if (!dg || !effectiveGender || effectiveGender === 'unisex') return true;
    if (effectiveGender === 'men') return dg === 'men';
    if (effectiveGender === 'women') return dg === 'women';
    if (['kids', 'boys', 'girls'].includes(effectiveGender)) return dg === 'kids';
    return true;
  };

  const storeCandidateSlugs = ctx.expandStoreSlugs(storeDepts).filter(fitsGender);
  const genderCandidateSlugs = ctx.candidateSlugs.filter(fitsGender);

  const suggestedDeptSlug = matchCustomSubDepartment(nameText, effectiveKey, storeCandidateSlugs, ctx)
    || (effectiveKey && storeCandidateSlugs.length && deriveDepartment(effectiveKey, effectiveGender, storeCandidateSlugs, ctx.K))
    || (storeCandidateSlugs.length && inferDepartment(nameText, storeCandidateSlugs))
    || matchCustomSubDepartment(nameText, effectiveKey, genderCandidateSlugs, ctx)
    || (effectiveKey && deriveDepartment(effectiveKey, effectiveGender, genderCandidateSlugs, ctx.K))
    || inferDepartment(nameText, genderCandidateSlugs)
    || (effectiveKey && deriveDepartment(effectiveKey, effectiveGender, ctx.candidateSlugs, ctx.K))
    || inferDepartment(nameText, ctx.candidateSlugs)
    || null;

  const manualFlags = new Set(Array.isArray(p.admin_flags) ? p.admin_flags : json(p.admin_flags_json, []));
  const issues = [];
  const addIssue = (code, detail, manual = false) => {
    if (issues.some((i) => i.code === code)) return;
    const meta = ISSUE_BY_CODE.get(code) || { code, label: code, severity: 'warning' };
    issues.push({
      code,
      label: meta.label,
      severity: meta.severity,
      detail: detail || meta.label,
      manual,
    });
  };

  // 1. Photos check
  const photoCount = Number(p.photo_count ?? 0);
  const primaryQuality = p.primary_quality == null ? null : Number(p.primary_quality);
  const minQuality = p.min_quality == null ? null : Number(p.min_quality);

  if (photoCount === 0) {
    addIssue('no_photo', 'المنتج نازل من غير أي صورة');
  } else if ((primaryQuality != null && primaryQuality < 50) || (minQuality != null && minQuality < 42)) {
    const qScore = primaryQuality != null && primaryQuality < 50 ? primaryQuality : minQuality;
    addIssue('weak_photo', `جودة الصورة ضعيفة (${qScore} من ١٠٠) — محتاجة صورة أوضح أو إضاءة أحسن`, manualFlags.has('weak_photo'));
  }

  // 2. Irrelevant photo (manual flag by admin)
  if (manualFlags.has('irrelevant_photo')) {
    addIssue('irrelevant_photo', 'الأدمن علّم إن الصور المضافة ملهاش علاقة بالمنتج', true);
  }

  // 3. Name clarity check
  const nameProblem = checkUnclearName(p.name_ar, p.name_en, inferredKey);
  if (nameProblem) {
    addIssue('unclear_name', nameProblem, manualFlags.has('unclear_name'));
  }

  // 4. Missing department check (platform department is the source of truth)
  const deptObj = p.department ? ctx.deptsBySlug.get(p.department) : null;
  const missingDept = !p.department || !deptObj || !deptObj.active;
  if (missingDept) {
    const sugLabel = suggestedDeptSlug ? ctx.labelOf(suggestedDeptSlug) : null;
    addIssue(
      'no_department',
      !p.department
        ? `مش متضاف له قسم على المنصة${sugLabel ? ` (المقترح: ${sugLabel})` : ''}`
        : `القسم الحالي (${p.department}) غير مفعّل أو قديم${sugLabel ? ` (المقترح: ${sugLabel})` : ''}`,
      manualFlags.has('no_department'),
    );
  }

  // 5. Department mismatch check
  const mismatchReason = detectDeptMismatch(p, ctx, inferredKey, inferredGender, suggestedDeptSlug);
  if (mismatchReason) {
    const sugLabel = suggestedDeptSlug && suggestedDeptSlug !== p.department ? ctx.labelOf(suggestedDeptSlug) : null;
    addIssue(
      'dept_mismatch',
      `${mismatchReason}${sugLabel ? ` — المقترح: «${sugLabel}»` : ''}`,
      manualFlags.has('dept_mismatch'),
    );
  }

  // 6. Missing details check (description or sizes)
  const descLen = String(p.description_ar || p.description_en || '').trim().length;
  const sizes = json(p.sizes_json, []);
  const variantCount = Number(p.variant_count ?? 0);
  const sizeKind = effectiveKey ? sizeKindFor(effectiveKey, effectiveGender, ctx.K) : 'letters';
  const needsSizes = !['none', 'free'].includes(sizeKind) && (!Array.isArray(sizes) || sizes.length === 0) && variantCount === 0;

  if (descLen < 10 || needsSizes) {
    const parts = [];
    if (descLen < 10) parts.push('من غير وصف');
    if (needsSizes) parts.push('مش متحدد مقاسات');
    addIssue('missing_details', parts.join(' · '), manualFlags.has('missing_details'));
  }

  // 7. Merge any remaining manual flags the admin explicitly set
  for (const code of manualFlags) {
    if (!issues.some((i) => i.code === code) && ISSUE_BY_CODE.has(code)) {
      addIssue(code, `${ISSUE_BY_CODE.get(code).label} (ملاحظة من الأدمن)`, true);
    }
  }

  const reviewStatus = p.admin_review_status === 'approved'
    ? 'approved'
    : p.admin_review_status === 'flagged'
      ? 'flagged'
      : 'pending';

  // Significant issues (everything except info-level missing_details unless manually flagged)
  const majorIssues = issues.filter((i) => i.severity !== 'info' || i.manual);
  const needsReview = reviewStatus === 'flagged' || (reviewStatus !== 'approved' && majorIssues.length > 0);

  // Only suggest changing department when the product is missing a valid department or has a detected mismatch
  const currentChain = p.department ? ctx.chainOf(p.department) : [];
  const suggestedDepartment = (missingDept || mismatchReason)
    && suggestedDeptSlug
    && suggestedDeptSlug !== p.department
    && !currentChain.includes(suggestedDeptSlug)
    ? { slug: suggestedDeptSlug, label: ctx.labelOf(suggestedDeptSlug) }
    : null;

  const inferredItem = effectiveKey ? ctx.K.items.get(effectiveKey) : null;
  const suggestedModa = effectiveKey && !inferredItem?.virtual && effectiveKey !== p.moda_key
    ? { key: effectiveKey, label: inferredItem?.ar || effectiveKey }
    : null;

  const smartFix = buildSmartFixProposal(p, ctx, {
    inferredKey,
    deptInferredKey,
    effectiveKey,
    effectiveGender,
    missingDept,
    mismatchReason,
    suggestedDepartment,
    nameProblem,
    descLen,
    needsSizes,
    sizeKind,
    sizes,
  });

  return {
    issues,
    issueCodes: issues.map((i) => i.code),
    majorIssueCount: majorIssues.length,
    hasIssues: issues.length > 0,
    hasMajorIssues: majorIssues.length > 0,
    needsReview,
    reviewStatus,
    suggestedDepartment,
    suggestedModa,
    suggestedAudience: !p.audience && effectiveGender ? effectiveGender : null,
    smartFix,
  };
}
