/**
 * قوالب المتجر + سكنات المواسم + تنضيف إعدادات التصميم (مشترك بين السيرفر والواجهة).
 *
 * التخزين: stores.customization_json.design = { template, season, overrides }, و .flash و .whatsapp (جنب إعدادات الإعلان/المزايا/القصة).
 * أي قيمة مش معروفة بتتشال: صاحب المحل ما يقدرش يكتب CSS ولا HTML، يختار من قوايم بس.
 */

export const CARD_STYLES = ['round', 'flat', 'soft', 'bordered'];
export const CAT_STYLES = ['tiles', 'circles', 'list'];
export const GRID_STYLES = ['cozy', 'dense', 'airy'];
export const HERO_STYLES = ['auto', 'cover', 'slider', 'split', 'compact'];
export const TYPE_STYLES = ['normal', 'light', 'bold'];
export const BADGE_TONES = ['brand', 'sale', 'dark', 'gold', 'green'];
export const FLASH_TARGETS = ['sale', 'new', 'shop'];

/** الأقسام اللي بتتعرض في الصفحة الرئيسية (hero أول واحد دايمًا). ticker/flash اختيارية: ما بتظهرش إلا لو القالب أو صاحب المحل ضافها. */
export const SECTION_IDS = ['hero', 'ticker', 'free_shipping', 'flash', 'trust', 'new_arrivals', 'categories', 'best_sellers', 'offers', 'on_sale', 'story', 'visit'];
export const OPTIONAL_SECTIONS = ['ticker', 'flash'];

export const TEMPLATES = {
  classic: {
    ar: 'الكلاسيك (الحالي)', en: 'Classic (current)',
    desc_ar: 'الشكل المعتاد للمتجر: متوازن ومناسب لأي محل.', desc_en: 'The familiar balanced storefront.',
    hero: 'auto', card: 'round', cat: 'tiles', grid: 'cozy', type: 'normal', preset: null,
    sections: ['hero', 'free_shipping', 'trust', 'new_arrivals', 'categories', 'best_sellers', 'offers', 'on_sale', 'story', 'visit'],
  },
  editorial: {
    ar: 'تحريري بسيط', en: 'Minimal editorial',
    desc_ar: 'أسلوب المجلات: صورة كبيرة، خط رفيع، منتجات من غير حدود. للمحلات الراقية الهادية.', desc_en: 'Magazine feel: big imagery, light type, borderless products.',
    hero: 'cover', card: 'flat', cat: 'list', grid: 'airy', type: 'light', preset: 'ivory',
    sections: ['hero', 'new_arrivals', 'categories', 'best_sellers', 'trust', 'on_sale', 'offers', 'story', 'visit', 'free_shipping'],
  },
  lookbook: {
    ar: 'لوك بوك', en: 'Lookbook',
    desc_ar: 'التصنيفات الكبيرة الأول وبنرات أسلوب حياة. للمحلات اللي عندها صور تنسيقات حلوة.', desc_en: 'Big category tiles first, lifestyle banners.',
    hero: 'slider', card: 'round', cat: 'tiles', grid: 'cozy', type: 'normal', preset: 'noir',
    sections: ['hero', 'categories', 'new_arrivals', 'flash', 'best_sellers', 'trust', 'on_sale', 'offers', 'story', 'visit', 'free_shipping'],
  },
  streetwear: {
    ar: 'ستريت وير دروب', en: 'Streetwear drop',
    desc_ar: 'خلفية داكنة، خط تقيل، شريط متحرك وعدّاد للدروب الجديد. للشباب والكاجوال.', desc_en: 'Dark, bold, scrolling ticker and a drop countdown.',
    hero: 'cover', card: 'flat', cat: 'circles', grid: 'dense', type: 'bold', preset: 'midnight',
    sections: ['hero', 'ticker', 'flash', 'new_arrivals', 'categories', 'best_sellers', 'on_sale', 'offers', 'trust', 'story', 'visit', 'free_shipping'],
  },
  boutique: {
    ar: 'بوتيك ناعم', en: 'Soft boutique',
    desc_ar: 'ألوان هادية، كروت مدورة وتصنيفات في دواير. للبوتيكات الحريمي.', desc_en: 'Soft colours, rounded cards, circular categories.',
    hero: 'split', card: 'soft', cat: 'circles', grid: 'cozy', type: 'light', preset: 'rose',
    sections: ['hero', 'categories', 'new_arrivals', 'best_sellers', 'offers', 'flash', 'on_sale', 'trust', 'story', 'visit', 'free_shipping'],
  },
  deals: {
    ar: 'عروض مزدحمة', en: 'Busy deals',
    desc_ar: 'شبكة كثيفة والعروض الأول وشارات. للمحلات اللي بتبيع بالعروض والكمية.', desc_en: 'Dense grid, deals first, badges.',
    hero: 'compact', card: 'bordered', cat: 'list', grid: 'dense', type: 'bold', preset: 'indigo',
    sections: ['hero', 'ticker', 'free_shipping', 'flash', 'on_sale', 'offers', 'best_sellers', 'new_arrivals', 'categories', 'trust', 'story', 'visit'],
  },
  atelier: {
    ar: 'أتيليه فاخر', en: 'Luxury atelier',
    desc_ar: 'داكن وذهبي، كروت كبيرة ومنتجات قليلة. للفساتين والبدل والمناسبات.', desc_en: 'Dark and gold, large cards, few products.',
    hero: 'cover', card: 'flat', cat: 'tiles', grid: 'airy', type: 'light', preset: 'midnight',
    sections: ['hero', 'new_arrivals', 'story', 'categories', 'best_sellers', 'trust', 'on_sale', 'offers', 'visit', 'free_shipping'],
  },
  menswear: {
    ar: 'رجالي كلاسيك', en: 'Classic menswear',
    desc_ar: 'زوايا حادة وتصنيفات بدل/قميص/جزمة. للمحلات الرجالي والبدل.', desc_en: 'Sharp corners, structured categories.',
    hero: 'split', card: 'bordered', cat: 'tiles', grid: 'cozy', type: 'normal', preset: 'pine',
    sections: ['hero', 'categories', 'new_arrivals', 'best_sellers', 'trust', 'on_sale', 'offers', 'story', 'visit', 'free_shipping'],
  },
};
export const TEMPLATE_IDS = Object.keys(TEMPLATES);

/** سكنات المواسم: ألوان كاملة (8 حقول) بتتركّب فوق ثيم المحل وقت الموسم، وجملة إعلان جاهزة. الفاحص بيتأكد إن النص مقروء. */
export const SEASONS = {
  ramadan: {
    ar: 'رمضان', en: 'Ramadan', emoji: '🌙',
    palette: { primary: '#1E2A5A', secondary: '#F6EFD9', accent: '#B8860B', background: '#FFFDF6', text: '#1A1A2E', button: '#1E2A5A', header: '#FFFDF6', footer: '#141B3D' },
    announce_ar: 'رمضان كريم — تشكيلة جديدة لشهر الخير', announce_en: 'Ramadan Kareem — new arrivals for the blessed month',
  },
  eid: {
    ar: 'العيد', en: 'Eid', emoji: '🎉',
    palette: { primary: '#0F5132', secondary: '#EAF4EC', accent: '#C9962B', background: '#FFFFFF', text: '#10241A', button: '#0F5132', header: '#FFFFFF', footer: '#0B3A24' },
    announce_ar: 'كل سنة وانتم طيبين — جهّز لبس العيد', announce_en: 'Eid Mubarak — get your Eid outfit ready',
  },
  white_friday: {
    ar: 'الجمعة البيضاء', en: 'White Friday', emoji: '🏷️',
    palette: { primary: '#111111', secondary: '#F2F2F2', accent: '#D91E36', background: '#FFFFFF', text: '#111111', button: '#111111', header: '#FFFFFF', footer: '#111111' },
    announce_ar: 'عروض الجمعة البيضاء — تخفيضات على تشكيلة مختارة', announce_en: 'White Friday deals on selected pieces',
  },
  back_to_school: {
    ar: 'العودة للمدارس', en: 'Back to school', emoji: '🎒',
    palette: { primary: '#1D4ED8', secondary: '#EAF1FF', accent: '#F59E0B', background: '#FFFFFF', text: '#0F1B3D', button: '#1D4ED8', header: '#FFFFFF', footer: '#13255A' },
    announce_ar: 'جهّز ولادك للمدرسة — لبس وشنط وأحذية', announce_en: 'Get the kids ready for school',
  },
  winter: {
    ar: 'الشتاء', en: 'Winter', emoji: '🧥',
    palette: { primary: '#2F3E46', secondary: '#EEF2F3', accent: '#B5651D', background: '#FAFBFB', text: '#1B2428', button: '#2F3E46', header: '#FAFBFB', footer: '#1E292E' },
    announce_ar: 'تشكيلة الشتاء وصلت — جواكت وبلوفرات وبوت', announce_en: 'Winter collection is here',
  },
  summer: {
    ar: 'الصيف', en: 'Summer', emoji: '☀️',
    palette: { primary: '#0E7490', secondary: '#E8F7FA', accent: '#F97316', background: '#FFFFFF', text: '#0B2A33', button: '#0E7490', header: '#FFFFFF', footer: '#0A4F63' },
    announce_ar: 'تشكيلة الصيف — خامات خفيفة وألوان منعشة', announce_en: 'Summer collection — light fabrics, fresh colours',
  },
};
export const SEASON_IDS = Object.keys(SEASONS);

const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);
const text = (v, max) => String(v ?? '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** الشكل النهائي المستخدم في الرسم: القالب + أي تعديل يدوي من صاحب المحل. */
export function resolveDesign(customization) {
  const d = customization?.design || {};
  const tpl = TEMPLATES[d.template] ? d.template : 'classic';
  const base = TEMPLATES[tpl];
  const o = d.overrides || {};
  return {
    template: tpl,
    season: SEASONS[d.season] ? d.season : null,
    hero: pick(o.hero, HERO_STYLES, base.hero),
    card: pick(o.card, CARD_STYLES, base.card),
    cat: pick(o.cat, CAT_STYLES, base.cat),
    grid: pick(o.grid, GRID_STYLES, base.grid),
    type: pick(o.type, TYPE_STYLES, base.type),
    sections: base.sections,
  };
}

/** يرجّع { design?, flash?, whatsapp? } سليمة من مدخل المستخدم (أي حقل مش موجود بيتساب زي ما هو). */
export function normalizeDesignPatch(input = {}) {
  const out = {};
  if (input.design && typeof input.design === 'object') {
    const d = input.design; const nd = {};
    if ('template' in d) nd.template = pick(d.template, TEMPLATE_IDS, 'classic');
    if ('season' in d) nd.season = d.season ? pick(d.season, SEASON_IDS, null) : null;
    if ('overrides' in d) {
      const o = d.overrides && typeof d.overrides === 'object' ? d.overrides : {};
      nd.overrides = {};
      if (o.hero) nd.overrides.hero = pick(o.hero, HERO_STYLES, undefined);
      if (o.card) nd.overrides.card = pick(o.card, CARD_STYLES, undefined);
      if (o.cat) nd.overrides.cat = pick(o.cat, CAT_STYLES, undefined);
      if (o.grid) nd.overrides.grid = pick(o.grid, GRID_STYLES, undefined);
      if (o.type) nd.overrides.type = pick(o.type, TYPE_STYLES, undefined);
      for (const k of Object.keys(nd.overrides)) if (!nd.overrides[k]) delete nd.overrides[k];
    }
    out.design = nd;
  }
  if (input.flash && typeof input.flash === 'object') {
    const f = input.flash; const ends = f.endsAt ? new Date(f.endsAt) : null;
    out.flash = {
      enabled: !!f.enabled, title_ar: text(f.title_ar, 70), title_en: text(f.title_en, 70),
      endsAt: ends && !Number.isNaN(ends.getTime()) ? ends.toISOString() : '',
      target: pick(f.target, FLASH_TARGETS, 'sale'),
    };
  }
  if (input.whatsapp && typeof input.whatsapp === 'object') {
    const w = input.whatsapp;
    out.whatsapp = { enabled: !!w.enabled, message_ar: text(w.message_ar, 140), message_en: text(w.message_en, 140) };
  }
  return out;
}

/** رقم واتساب مصري → صيغة wa.me الدولية (بدون +). */
export function waNumber(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = `20${d.slice(1)}`;
  return d.length >= 10 ? d : '';
}

/** نسبة اكتمال المتجر + اقتراحات صغيرة. store = الـstore المتسلسل من السيرفر. */
export function completeness(store = {}) {
  const c = store.customization || {};
  const has = (v) => (typeof v === 'object' ? !!(v && (v.ar || v.en)) : !!v);
  const checks = [
    { id: 'logo', ok: !!store.logo, hint_ar: 'ضيف لوجو للمحل', hint_en: 'Add a logo' },
    { id: 'cover', ok: !!store.cover, hint_ar: 'ارفع صورة غلاف', hint_en: 'Upload a cover photo' },
    { id: 'tagline', ok: has(store.tagline), hint_ar: 'اكتب جملة قصيرة تعرّف بمحلك', hint_en: 'Write a short tagline' },
    { id: 'story', ok: !!(c.story?.enabled && (c.story.text_ar || c.story.text_en)), hint_ar: 'احكي قصة المحل', hint_en: 'Tell your story' },
    { id: 'address', ok: has(store.address) && !!store.mapUrl, hint_ar: 'ضيف العنوان ولينك الخريطة', hint_en: 'Add address and map link' },
    { id: 'hours', ok: !!store.hours, hint_ar: 'حدد مواعيد الشغل', hint_en: 'Set opening hours' },
    { id: 'whatsapp', ok: !!c.whatsapp?.enabled && !!store.whatsapp, hint_ar: 'فعّل زر الواتساب الذكي', hint_en: 'Enable the smart WhatsApp button' },
    { id: 'template', ok: (c.design?.template || 'classic') !== 'classic', hint_ar: 'اختار قالب يميّز متجرك', hint_en: 'Pick a template' },
    { id: 'social', ok: !!(store.instagram || c.story?.instagram || c.story?.tiktok), hint_ar: 'ضيف حساب إنستغرام أو تيك توك', hint_en: 'Add Instagram or TikTok' },
  ];
  const done = checks.filter((x) => x.ok).length;
  return { percent: Math.round((done / checks.length) * 100), checks, next: checks.filter((x) => !x.ok).slice(0, 3) };
}
