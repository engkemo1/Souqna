import { decodeDepartments } from '@souqna/shared';
import { q, json } from '../db/index.js';
import { inferDepartment } from './departments.js';
import { deriveDepartment, sizeKindFor } from './product-types.js';
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
export function buildModerationContext() {
  const K = loadKnowledge();
  const deptRows = q.all('SELECT id, slug, name_ar, name_en, parent_slug, active, visibility FROM departments');
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

  return { K, deptsBySlug, activeDeptSlugs, candidateSlugs, chainOf, labelOf, rootOf };
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

  const deptIsWomen = root === 'women' || chain.some((s) => s.startsWith('women') || s === 'shoes_women' || s === 'maternity');
  const deptIsMen = root === 'men' || chain.some((s) => s.startsWith('men') || s === 'shoes_men');
  const deptIsKids = root === 'kids' || chain.some((s) => s.startsWith('kids') || s === 'shoes_kids');

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
  const deptIsShoes = root === 'shoes' || chainStr.includes('shoes');
  const deptIsBags = chainStr.includes('bags');
  const deptIsDresses = chainStr.includes('dress');
  const deptIsPants = chainStr.includes('pants') || chainStr.includes('denim');
  const deptIsTops = chainStr.includes('tops');
  const deptIsAbaya = chainStr.includes('abaya');
  const deptIsHijab = chainStr.includes('hijab');
  const deptIsSuits = chainStr.includes('suit');
  const deptIsUnderwear = chainStr.includes('underwear');
  const deptIsBeauty = root === 'perfume_makeup' || root === 'care';

  if (family === 'shoes') {
    if (!deptIsShoes && !chainStr.includes('sport')) {
      return `المنتج حذاء/كوتشي («${item?.ar || p.name_ar}») لكنه محطوط في قسم «${dept.name_ar}»`;
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

/**
 * Analyzes a single product row and returns its quality/moderation report.
 */
export function analyzeProduct(p, ctx = buildModerationContext()) {
  const nameText = `${p.name_ar || ''} ${p.name_en || ''}`.trim();
  const storeDepts = Array.isArray(p.store_departments) ? p.store_departments : decodeDepartments(p.store_departments);
  const storeRoots = new Set(storeDepts.map((s) => ctx.rootOf(s)).filter(Boolean));
  const storeDefaultGender = storeRoots.has('men') && !storeRoots.has('women')
    ? 'men'
    : storeRoots.has('women') && !storeRoots.has('men')
      ? 'women'
      : storeRoots.has('kids') && !storeRoots.has('men') && !storeRoots.has('women')
        ? 'kids'
        : null;

  const inferredKey = inferKey(nameText, ctx.K);
  const inferredGender = inferGender({ name_ar: p.name_ar, name_en: p.name_en, department: p.department, audience: p.audience || storeDefaultGender }, inferredKey || p.moda_key, ctx.K);
  const effectiveKey = inferredKey || p.moda_key || null;
  const effectiveGender = inferredGender === 'unisex' ? (p.audience || storeDefaultGender || 'unisex') : inferredGender;

  const storeCandidateSlugs = storeDepts.filter((s) => ctx.deptsBySlug.get(s)?.active);
  const suggestedDeptSlug = (effectiveKey && storeCandidateSlugs.length && deriveDepartment(effectiveKey, effectiveGender, storeCandidateSlugs, ctx.K))
    || (storeCandidateSlugs.length && inferDepartment(nameText, storeCandidateSlugs))
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
  };
}
