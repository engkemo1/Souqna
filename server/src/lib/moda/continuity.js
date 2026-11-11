/**
 * تتبع واستمرار سياق المحادثة وتثبيت القطع (Pinning):
 * لما العميل يطلب قطعة تكمل طقمه السابق ("عاوز عليها جزمة"، "معاها كوتشي"، "تليق عليها"، "البدلة اللي قولتلك عليها"):
 * بنحتفظ بنفس القطعة المختارة سابقاً (زي البدلة) وما نغيرهاش، وننسق القطعة الجديدة عليها بس.
 * ولو القطعة المطلوبة مش متاحة بثقة، ما بنخترعش ولا نخمن: بنقول بصراحة ونحط زرار "اطلبها".
 */
import { norm } from './text.js';

export const CONTINUATION_RE = /(^|\s)(عليها|عليه|عليهم|معاها|معاه|معاهم|فوقها|فوقه|تحتها|تحته|تليق عليها|تليق عليه|يليق عليها|يليق عليه|يمشي معاها|يمشي معاه|تمشي معاها|تمشي معاه|تركب عليها|يركب عليها|يركب معاه|مناسب[هة] ليها|مناسب ليه|مع البدل[هة]|علي البدل[هة]|على البدل[هة]|مع الفستان|علي الفستان|على الفستان|مع الطقم|علي الطقم|على الطقم|مع القميص|علي القميص|على القميص|مع البنطلون|علي البنطلون|على البنطلون|نفس البدل[هة]|نفس الفستان|نفس الطقم|نفس الشوز|نفس الجزم[هة]|نفس القميص|البدل[هة] اللي|البدل[هة] دي|الفستان ده|الطقم ده|اللي فاتت|الاول[يى]|اللي اخترناها|اللي كانت معروض[هة])(\s|$)/i;

const ADDITIVE_PREFIX_RE = /^(طب|و|وعاوز|وعايز|عاوز|عايز|هاتلي|رشحلي|ضيف|مع)\s*(جزم[هة]|كوتشي|شوز|حذاء|طرح[هة]|شنط[هة]|كرافت[هة]|حزام|جاكيت|بليزر|ساع[هة]|نظار[هة])(\s|$)/i;

const SAME_GARMENT_RE = /(^|\s)(نفس البدل[هة]|نفس الفستان|نفس الطقم|نفس الشوز|نفس الجزم[هة]|نفس القميص|البدل[هة] اللي|البدل[هة] دي|الفستان ده|اللي فاتت|الاول[يى]|اللي اخترناها)(\s|$)/i;

/** هل رسالة العميل بتطلب تنسيق/إضافة على القطعة أو اللوك السابق؟ */
export function isContinuationRequest(text, session) {
  if (!text) return false;
  const n = norm(text);
  if (CONTINUATION_RE.test(n)) return true;
  if (session?.activeLook?.items?.length && ADDITIVE_PREFIX_RE.test(n)) return true;
  return false;
}

const FAM = [
  ['dress', /(فستان|فساتين|دريس)/, /dress|abaya|gown/i],
  ['suit', /(بدل[هة]|بدل)/, /suit|tuxedo/i],
  ['shirt', /(قميص|قمصان|بلوز[هة])/, /shirt|blouse|polo/i],
  ['trousers', /(بنطلون|بنطال|شينو)/, /trouser|chino|pants/i],
  ['skirt', /(جيب[هة])/, /skirt/i],
  ['jacket', /(جاكيت|بليزر)/, /jacket|blazer/i],
  ['abaya', /(عباي[هة])/, /abaya/i],
  ['shoes', /(جزم[هة]|جزم|حذاء|احذي[هة]|كوتشي|كوتشيات|صندل|شوز|بوت|لوفر|كعب)/, /shoe|sneaker|loafer|boot|sandal|heel|flat|slipper/i],
  ['bag', /(شنط[هة]|شنط|حقيب[هة])/, /bag|tote|clutch/i],
];
const FEM_PRON_RE = /(^|\s)(عليها|معاها|ليها|لها|تحتها|فوقها|تليق عليها|عليهاا)(\s|$)/;
const MASC_PRON_RE = /(^|\s)(عليه|معاه|ليه|له|تحته|فوقه|يليق عليه)(\s|$)/;
const FEM_AUD = new Set(['women', 'women_hijab', 'girls']);
const MASC_AUD = new Set(['men', 'boys']);

/** العميل بيشاور على قطعة موجودة في اللوك الحالي كمرجع ("على الفستان"، "مع البدلة"، "تحت الفستان"). بيرجّع {item, fam} أو null. */
export function resolveAnchor(text, session) {
  const items = session?.activeLook?.items || [];
  if (!items.length) return null;
  const n = norm(text || '');
  const words = n.split(' ').filter(Boolean);
  const wanted = (session?.parsed?.garments || []).map((g) => String(g.key || ''));
  for (const [fam, re, keyRe] of FAM) {
    const strong = new RegExp(`(^|\\s)(علي|على|عل|ع|مع|معا|تحت|فوق|ل|لل|ب|وعلي|وعلى)\\s*(ال)?${re.source}`).test(n);
    const bare = words.length <= 3 && new RegExp(`^(ال)?${re.source}$`).test(words.join(' '));
    if (!strong && !bare) continue;
    const hits = items.filter((it) => keyRe.test(String(it.key || '')) || keyRe.test(String(it.slotKey || '')) || re.test(norm(it.name || '')));
    // لو القطعة المذكورة هي نفسها المطلوبة («عاوز جزمة» واللوك فيه جزمة) فده طلب مش إشارة
    if (hits.length && wanted.some((k) => keyRe.test(k)) && !/(علي|على|عل|ع|مع|معا|تحت|فوق)\s*(ال)?/.test(n)) continue;
    if (hits.length === 1) return { item: hits[0], fam, keyRe };
    if (hits.length > 1) return { ambiguous: hits, fam, keyRe };
  }
  // إشارة بالإصبع: «القطعة دي»، «اللي فوق»، «الأولى» — لو في قطعة واحدة نثبّتها، لو أكتر نسأل
  if (words.length <= 5 && /(^|\s)(القطع[هة] (دي|ده|دا)|اللي (فوق|فات|قبل|اخترناه[ا]?)|الاول[يى]|الاخير[هة]?)(\s|$)/.test(n) && items.length) {
    const free = items.filter((it) => !wanted.some((k) => k && (String(it.key || '').includes(k) || String(it.slotKey || '').includes(k))));
    const pool = free.length ? free : items;
    if (pool.length === 1) { const k = String(pool[0].key || pool[0].slotKey || ''); return { item: pool[0], fam: 'ref', keyRe: new RegExp(k.replace(/[^a-z_]/gi, '') || 'zzz') }; }
    return { ambiguous: pool, fam: 'ref', keyRe: /(?!)/ };
  }
  return null;
}

/** ضمير جمع («عليهم»، «معاهم») = الاتنين → لو اللوك فيه أكتر من شخص لازم نسأل ليك ولا ليها ولا الاتنين. */
export const PLURAL_PRON_RE = /(^|\s)(عليهم|معاهم|ليهم|لهم|عليهما|معاهما|فوقهم|تحتهم)(\s|$)/;
export function needsWhoPart(text, session) {
  const auds = new Set((session?.activeLook?.items || []).map((x) => x.aud).filter(Boolean));
  return auds.size > 1 && PLURAL_PRON_RE.test(norm(text || ''));
}

/** ضمير مؤنث/مذكر في الكلام ("عليها" = السيدة، "عليه" = الراجل) → مجموعة aud المقصودة أو null. */
export function pronounAuds(text) {
  const n = norm(text || '');
  if (FEM_PRON_RE.test(n)) return FEM_AUD;
  if (MASC_PRON_RE.test(n)) return MASC_AUD;
  return null;
}

/** هل العميل بيشير لقطعة سابقة معينة بالاسم ("نفس البدلة"، "البدلة اللي قولتلك عليها")؟ */
export function isSameGarmentReference(text) {
  return SAME_GARMENT_RE.test(norm(text || ''));
}

/**
 * استخراج القطع المثبتة (Pinned) من الجلسة السابقة التي يجب الحفاظ عليها وعدم استبدالها:
 */
export function resolvePinnedItems(text, session, requestedGarments = [], products = [], anchor = null, audFilter = null) {
  if (!session) return [];
  if (anchor?.item) { const row = new Map((products || []).map((p) => [p.id, p])).get(anchor.item.id); return row ? [{ ...anchor.item, product: row }] : []; }
  const activeItems = session.activeLook?.items || [];
  const history = session.lookHistory || [];
  const n = norm(text || '');

  const byId = new Map((products || []).map((p) => [p.id, p]));

  // لو العميل بيطلب استرجاع قطعة أولى/سابقة ("البدلة اللي قولتلك عليها" أو "البدلة الأولى"):
  if (isSameGarmentReference(n)) {
    // دوّر في كل اللوكات من الأقدم للأحدث على القطعة المذكورة (بدلة/فستان)
    const allLooks = [...history, session.activeLook].filter(Boolean);
    for (const look of allLooks) {
      for (const it of look.items || []) {
        if (/بدل/i.test(n) && (it.key === 'suit' || it.slotKey === 'suit' || /بدل/.test(it.name || ''))) {
          const row = byId.get(it.id);
          if (row) return [{ ...it, product: row }];
        }
        if (/فستان|دريس/i.test(n) && (it.key?.startsWith('dress') || it.slotKey?.startsWith('dress') || /فستان|دريس/.test(it.name || ''))) {
          const row = byId.get(it.id);
          if (row) return [{ ...it, product: row }];
        }
      }
    }
  }

  // في حالة التنسيق الإضافي ("عاوز عليها جزمة" أو "معاها كوتشي"):
  // القطع السابقة التي لا تتعارض مع القطعة المطلوبة تظل مثبتة
  if (activeItems.length && isContinuationRequest(n, session)) {
    const requestedKeys = new Set(requestedGarments.map((g) => g.key));
    const isShoeRequest = [...requestedKeys].some((k) => /shoe|sneaker|loafer|boot|sandal|flat|heel/i.test(k));
    const isAccessoryRequest = [...requestedKeys].some((k) => /bag|tote|clutch|tie|bow_tie|pocket_square|belt|tarha|shawl/i.test(k));

    const pinned = [];
    for (const it of activeItems) {
      const itIsShoe = /shoe|sneaker|loafer|boot|sandal|flat|heel/i.test(it.key || it.slotKey);
      const itIsAccessory = /bag|tote|clutch|tie|bow_tie|pocket_square|belt|tarha|shawl/i.test(it.key || it.slotKey);

      // لو المطلوب شوز، نثبت الهدوم (البدلة/الفستان/البنطلون/القميص)
      if (isShoeRequest && !itIsShoe) {
        const row = byId.get(it.id);
        if (row) pinned.push({ ...it, product: row });
      }
      // لو المطلوب إكسسوار، نثبت الهدوم والشوز
      else if (isAccessoryRequest && !itIsAccessory) {
        const row = byId.get(it.id);
        if (row) pinned.push({ ...it, product: row });
      }
      // في الحالات العامة: لو القطعة ليست من نفس نوع المطلوب، ثبّتها
      else if (!requestedKeys.has(it.key) && !requestedKeys.has(it.slotKey)) {
        const row = byId.get(it.id);
        if (row) pinned.push({ ...it, product: row });
      }
    }
    const pa = audFilter || pronounAuds(n);
    const mine = pa && new Set(activeItems.map((x) => x.aud)).size > 1 ? pinned.filter((x) => pa.has(x.aud)) : pinned;
    if (mine.length) return mine;
  }

  return [];
}

/**
 * فحص صارم ومحدد لعدم التخمين (Zero Guessing / Strict Verification):
 * لا يسمح بأي قطعة اسميتها تخالف خانتها أو ذات ثقة ضعيفة.
 */
export function auditPlanPicks(plan, K) {
  if (!plan || !plan.people) return plan;
  let changed = false;

  const BAD_SHIRT = /(^|\s)(كافلينج|كفلينج|كافلنج|ازرار|زرار|زراير|دبوس|بروش|سلسلة|حزام)(\s|$)/i;
  const BAD_DRESS_OR_SUIT = /(^|\s)(لانجري|لانجيري|بيبي دول|قميص نوم|روب نوم|روب حمام|ملابس داخلية|بوكسر)(\s|$)/i;
  const BAD_FORMAL_SHOES = /(^|\s)(شبشب|سليبر|صندل بيتي|كوتشي رياضي)(\s|$)/i;

  const people = plan.people.map((pe) => {
    const dropped = [];
    const kept = [];

    for (const pk of pe.picks || []) {
      const name = norm(pk.product?.name_ar || pk.product?.name_en || '');
      const key = pk.product?.key || '';
      const slot = String(pk.slotKey || '');

      let bad = false;
      // 1. كفلينج أو أزرار في خانة قميص/توب
      if (/shirt|polo|top|tshirt/i.test(slot) && (BAD_SHIRT.test(name) || key === 'cufflinks')) bad = true;
      // 2. لانجري أو ملابس نوم في خانة فستان أو بدلة أو طقم
      if (/dress|suit|classic|set|top|bottom/i.test(slot) && (BAD_DRESS_OR_SUIT.test(name) || ['lingerie', 'sleepwear', 'robe'].includes(key))) bad = true;
      // 3. شبشب أو كوتشي رياضي في خانة حذاء رسمي
      if (/formal_shoes|loafers|heels/i.test(slot) && (BAD_FORMAL_SHOES.test(name) || key === 'slippers')) bad = true;
      // 4. تعارض صريح في النوع
      if (pk.product?.typeConflict) bad = true;

      if (bad) {
        dropped.push(pk);
        changed = true;
      } else {
        kept.push(pk);
      }
    }

    if (!dropped.length) return pe;

    const missing = [
      ...(pe.missing || []),
      ...dropped.map((pk) => ({
        keys: [pk.slotKey],
        base: pk.slotKey,
        material: null,
        color: null,
        label: pk.slotKey,
        title: pk.slotKey,
        aud: pe.aud,
      })),
    ];

    return {
      ...pe,
      picks: kept,
      missing,
      subtotal: kept.reduce((t, pk) => t + (pk.product?.price || 0), 0),
    };
  });

  if (!changed) return plan;

  const anyPicks = people.some((p) => p.picks.length);
  const total = people.reduce((sum, p) => sum + (p.subtotal || 0), 0);
  const state = anyPicks ? (people.some((p) => p.missing?.length) ? 'partial' : 'full') : 'none';

  return {
    ...plan,
    people,
    total,
    state,
    missing: people.flatMap((p) => p.missing || []),
  };
}
