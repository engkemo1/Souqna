/**
 * "تويلا تصمّم متجرك": اقتراح قالب + ألوان + جمل ترحيب بالعامية بناءً على نوع المحل والإحساس المطلوب.
 * الموديل بيختار من قوايم محددة بس (قالب/باليت) والنصوص بتتفحص؛ لو الموديل مش متاح أو رد غلط بنرجع لقواعد ثابتة، فالزرار دايمًا بيرجّع اقتراح.
 * ما بنخترعش حقايق عن المحل (سنين خبرة، جوايز، أسعار، شحن، خصومات): النص عام وصاحب المحل يعدّله.
 */
import { TEMPLATES, TEMPLATE_IDS } from '@souqna/shared/layout';
import { THEME_PRESETS } from '@souqna/shared/theme';
import { checkText } from './moda/guard.js';
import { llmChain } from './stylist.js';

const KIND_TEMPLATE = { men: 'menswear', women: 'boutique', kids: 'playground', sport: 'streetwear', wedding: 'atelier', shoes: 'lookbook', mixed: 'classic' };
const VIBE_TEMPLATE = { luxury: 'atelier', soft: 'boutique', street: 'streetwear', simple: 'editorial', deals: 'deals', classic: 'menswear' };
const KIND_AR = { men: 'ملابس رجالي', women: 'ملابس حريمي', kids: 'ملابس أطفال', sport: 'ملابس رياضية', wedding: 'فساتين وبدل مناسبات', shoes: 'أحذية', mixed: 'ملابس للعيلة كلها' };
const KIND_TAGLINE = {
  men: 'لبس رجالي شيك لكل مناسبة', women: 'اختياراتك الأنيقة من قلب بنها', kids: 'لبس مريح وحلو لأطفالك',
  sport: 'لبس رياضي مريح وعملي', wedding: 'طلتك في يومك المميز', shoes: 'جزم وكوتشيات لكل ذوق', mixed: 'كل اللي تحتاجه للبس العيلة',
};
const VIBE_ANNOUNCE = { luxury: 'تشكيلة جديدة وصلت — الفخامة في التفاصيل', soft: 'تشكيلة جديدة بألوان هادية وصلت', street: 'دروب جديد نزل — الحق قطعتك', simple: 'تشكيلة جديدة وصلت', deals: 'عروض مختارة على تشكيلة المحل', classic: 'تشكيلة جديدة وصلت' };

const clean = (v, max) => String(v ?? '').replace(/<[^>]*>/g, '').replace(/https?:\/\/\S+|www\.\S+/gi, '').replace(/\s+/g, ' ').trim().slice(0, max);
const hasClaims = (s) => /\d\s*(جنيه|ج\.?م|EGP|%|٪)|\d{4}|خصم|مجان|ضمان|الأفضل|الاول في|رقم 1|شحن/i.test(s);
const okText = (s) => !!s && !hasClaims(s) && checkText(s, { lang: 'ar', maxLen: 400 }).ok;

export function rulesSuggestion({ kind = '', vibe = '' } = {}) {
  // a kids' shop gets the kids template whatever the vibe (only a luxury kids' boutique keeps its vibe's look)
  const template = (kind === 'kids' && vibe !== 'luxury' ? 'playground' : null) || VIBE_TEMPLATE[vibe] || KIND_TEMPLATE[kind] || 'classic';
  const preset = TEMPLATES[template].preset || 'noir';
  return {
    template, preset, source: 'rules',
    tagline_ar: KIND_TAGLINE[kind] || 'طلتك تبدأ من هنا',
    about_ar: `أهلاً بيك في متجرنا. بنختار القطع بعناية عشان تلاقي ${KIND_AR[kind] || 'اللي يناسبك'} بخامات كويسة وتفاصيل حلوة. تعالى شوف التشكيلة، ولو عندك أي سؤال كلمنا على واتساب.`,
    announcement_ar: VIBE_ANNOUNCE[vibe] || 'تشكيلة جديدة وصلت',
  };
}

function aiPrompt({ store, kind, vibe, note }) {
  const tpls = TEMPLATE_IDS.map((id) => `${id}: ${TEMPLATES[id].desc_en}`).join('\n');
  return [
    'You are a senior fashion-retail brand designer helping a small clothing store owner in Banha, Egypt set up their online storefront on the marketplace "Talla / طلة".',
    `Store: ${store?.name?.ar || ''}. Type of store: ${kind || 'not specified'}. Desired feeling: ${vibe || 'not specified'}. Owner note: ${note || '-'}.`,
    `Choose ONE template id from:\n${tpls}`,
    `Choose ONE colour preset id from: ${Object.keys(THEME_PRESETS).join(', ')}.`,
    'Write short texts in warm, natural Egyptian colloquial Arabic (not formal MSA): tagline_ar (max 50 chars), about_ar (2-3 sentences, max 280 chars), announcement_ar (max 60 chars).',
    'RULES: do not invent facts about the store (years in business, awards, brands, number of customers). No prices, discounts, percentages, delivery or quality guarantees. No links, no emojis, no English words.',
    'Reply with ONE JSON object only: {"template":"...","preset":"...","tagline_ar":"...","about_ar":"...","announcement_ar":"..."}',
  ].join('\n');
}

export async function designSuggestion({ store, kind = '', vibe = '', note = '' }) {
  const base = rulesSuggestion({ kind, vibe });
  const call = llmChain();
  if (!call) return base;
  try {
    const raw = await Promise.race([call(aiPrompt({ store, kind, vibe, note }), [{ role: 'user', content: 'Design it now. JSON only.' }]), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000))]);
    let out = raw;
    if (typeof raw === 'string') { const a = raw.indexOf('{'); const b = raw.lastIndexOf('}'); out = a >= 0 && b > a ? JSON.parse(raw.slice(a, b + 1)) : null; }
    if (!out || typeof out !== 'object') return base;
    const tagline = clean(out.tagline_ar, 60); const about = clean(out.about_ar, 320); const ann = clean(out.announcement_ar, 70);
    return {
      template: TEMPLATES[out.template] ? out.template : base.template,
      preset: THEME_PRESETS[out.preset] ? out.preset : base.preset,
      tagline_ar: okText(tagline) ? tagline : base.tagline_ar,
      about_ar: okText(about) ? about : base.about_ar,
      announcement_ar: okText(ann) ? ann : base.announcement_ar,
      source: 'ai',
    };
  } catch { return base; }
}
