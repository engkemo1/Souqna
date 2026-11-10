/** أسئلة عن محل معيّن (رقمه، عنوانه، لوكيشنه، مواعيده، فروعه، بيبيع إيه، عروضه): الرد كله من بيانات المحل المسجّلة، ومفيش حاجة بتتخترع. */
import { norm, skeleton } from './text.js';

const strip = (s) => String(s).split(' ').map((w) => (w.length > 3 ? w.replace(/^ال/, '') : w)).join(' ').trim();
export const GENERIC = new Set(['ستايل', 'ستور', 'شوب', 'فاشن', 'مول', 'كلوثز', 'wear', 'style', 'store', 'shop', 'fashion', 'clothes', 'stores', 'ملابس', 'لبس', 'محل', 'متجر', 'بيت', 'عالم', 'house', 'world', 'collection', 'brand', 'man', 'men', 'women', 'kids', 'design']);

const AR_TO_LAT_MAP = {
  'ا': 'a', 'أ': 'a', 'إ': 'e', 'آ': 'a', 'ء': '', 'ئ': 'e', 'ؤ': 'o',
  'ب': 'b', 'ت': 't', 'ة': 'a', 'ث': 'th', 'ج': 'g', 'ح': 'h', 'خ': 'kh',
  'د': 'd', 'ذ': 'z', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 's',
  'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'k',
  'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'و': 'o', 'ي': 'y', 'ى': 'a'
};

export function arToLat(str) {
  return String(str || '').split('').map((c) => AR_TO_LAT_MAP[c] !== undefined ? AR_TO_LAT_MAP[c] : c).join('')
    .replace(/oo/g, 'u').replace(/ee/g, 'i');
}

/** أقرب محل مذكور بالاسم (كامل أو كلمة مميّزة، عربي أو إنجليزي أو فرانكو)، أو ambiguous لو أكتر من محل بنفس القوة. */
export function matchStore(text, stores = []) {
  const normText = norm(text);
  const t = ` ${strip(normText)} `;
  const tLat = ` ${strip(arToLat(normText))} `;
  const queryToks = normText.split(' ').filter((w) => w.length >= 3 && !GENERIC.has(w));
  const querySkels = queryToks.map((w) => skeleton(arToLat(w))).filter((sk) => sk.length >= 3);

  const tokenCount = new Map();
  const cands = stores.map((s) => {
    const rawNames = [s.name_ar, s.name_en, String(s.slug || '').replace(/-/g, ' ')].filter(Boolean);
    const translit = s.name_ar ? arToLat(s.name_ar) : '';
    const names = [...rawNames, translit].map((x) => strip(norm(x || ''))).filter((x) => x.length >= 3);
    const toks = new Set(names.flatMap((n) => n.split(' ')).filter((w) => w.length >= 3 && !GENERIC.has(w)));
    const skels = new Set([...toks].map((w) => skeleton(arToLat(w))).filter((sk) => sk.length >= 3));
    for (const w of toks) tokenCount.set(w, (tokenCount.get(w) || 0) + 1);
    return { s, names, toks, skels };
  });

  const scored = [];
  for (const { s, names, toks, skels } of cands) {
    let best = 0;
    for (const n of names) {
      if (t.includes(` ${n} `) || tLat.includes(` ${n} `)) best = Math.max(best, 100 + n.length);
    }
    if (!best) {
      for (const w of toks) {
        if (tokenCount.get(w) === 1 && (t.includes(` ${w} `) || tLat.includes(` ${w} `))) {
          best = Math.max(best, w.length);
        }
      }
    }
    if (!best) {
      for (const qsk of querySkels) {
        if (skels.has(qsk)) {
          best = Math.max(best, 10 + qsk.length);
        }
      }
    }
    if (best) scored.push({ s, best });
  }
  if (!scored.length) return { store: null, ambiguous: [] };
  scored.sort((a, b) => b.best - a.best);
  const top = scored.filter((x) => x.best === scored[0].best);
  return top.length === 1 ? { store: top[0].s, ambiguous: [] } : { store: null, ambiguous: top.map((x) => x.s) };
}

const W = (alts) => new RegExp(`(^| )(ال ?)?(${alts})( |$)`);
const ASPECTS = [
  ['phone', W('رقم|ارقام|نمره|نمرة|تليفون|تلفون|موبايل|هاتف|فون|واتس|واتساب|وتساب|اكلم|اكلمه|اكلمهم|اتصل|كلم|كلمه|كلمهم|تواصل|اتواصل|phone|number|call|whatsapp|contact')],
  ['map', W('لوكيشن|لوكشن|موقع|موقعه|خريطه|خريطة|ماب|map|location|اوصل|اروح|توصف|اتجاهات|directions|مكانه|مكان|طريق|ازاي اروح|اروح ازاي|ازاي اوصل')],
  ['address', W('عنوان|عنوانه|عناوين|address|ساكن|شارع|فين|where|مكان|مكانه')],
  ['branches', W('فرع|فروع|فروعه|branch|branches')],
  ['hours', W('مواعيد|مواعيده|بتفتح|بيفتح|بتقفل|بيقفل|فاتح|مفتوح|مقفول|قافل|ساعات|امتي|open|opens|close|closes|hours|اجازه|اجازته|يفتح|يقفل|دلوقتي فاتح|شغال دلوقتي')],
  ['sells', W('بيبيع|بتبيع|بيبيعوا|بيبيعو|عندهم|عنده|بيعمل|بيشتغل|تخصص|تخصصه|منتجات|منتجاته|بضاعه|sells|sell|products|carry|بيقدم|بيوفر|نوع')],
  ['social', W('سوشيال|سوشال|حسابات|حساباته|حسابهم|صفحته|صفحاته|فيسبوك|فيسبك|فيس بوك|فيس|انستجرام|انستا|انستغرام|انستقرام|تيك توك|تيكتوك|تك توك|facebook|fb|instagram|insta|ig|tiktok|social|socials')],
  ['offers', W('عروض|عروضه|عرض|خصم|خصومات|تخفيضات|اوكازيون|offers|deals|discount|discounts|sale')],
  ['all', W('عن|كل حاجه|كل شي|تفاصيل|معلومات|حكيلي|احكيلي|عرفني|عرفيني|اعرف|info|about|details|tell me|مين')],
];
export const aspectsOf = (text) => { const n = ` ${norm(text)} `.trim(); return ASPECTS.filter(([, re]) => re.test(n)).map(([k]) => k); };

const STORE_WORD = /(^| )(ال ?)?(محل|محلات|متجر|متاجر|ستور|store|shop)( |$)/;
export const mentionsStoreWord = (text) => STORE_WORD.test(` ${norm(text)} `.trim());

const cairoNow = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return { dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')), mins: (Number(get('hour')) % 24) * 60 + Number(get('minute')) };
};
const toMin = (hm) => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + m; };
const t12 = (hm) => { const [h, m] = String(hm).split(':').map(Number); const p = h >= 12 ? 'م' : 'ص'; const hh = h % 12 || 12; return `${hh}${m ? `:${String(m).padStart(2, '0')}` : ''} ${p}`; };
const DAYS = ['الأحد', 'الإتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];

/** «النهارده من X لـ Y» + هل فاتح دلوقتي، أو null لو المواعيد مش متسجلة. */
export function hoursLine(hours, now = new Date()) {
  if (!hours) return null;
  const { dow, mins } = cairoNow(now);
  let shifts = null; let closed = false;
  if (Array.isArray(hours.days) && hours.days.length === 7) { const d = hours.days[dow]; closed = !!d.closed; shifts = d.shifts || []; }
  else if (hours.open && hours.close) { closed = hours.dayOff === dow; shifts = closed ? [] : [{ open: hours.open, close: hours.close }]; }
  else return null;
  if (closed || !shifts.length) return `النهارده (${DAYS[dow]}) المحل مقفول، وده يوم الأجازة حسب المواعيد المسجلة.`;
  const txt = shifts.map((s) => `من ${t12(s.open)} لـ ${t12(s.close)}`).join(' ومن بعدها ');
  const isOpen = shifts.some((s) => { const o = toMin(s.open); const c = toMin(s.close); return c > o ? mins >= o && mins < c : mins >= o || mins < c; });
  return `النهارده (${DAYS[dow]}) ${txt}${isOpen ? '، وهو فاتح دلوقتي حسب المواعيد' : '، وهو مقفول دلوقتي حسب المواعيد'}.`;
}

/** رابط الخريطة: لينك المحل المحفوظ، وإلا إحداثياته، وإلا بحث بالعنوان. */
export function mapLink(s) {
  const u = String(s.map_url || '').trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng)) && s.lat != null && s.lng != null) return `https://www.google.com/maps/search/?api=1&query=${Number(s.lat)},${Number(s.lng)}`;
  const a = String(s.address_ar || '').trim();
  return a ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(/بنها/.test(a) ? a : `${a} بنها`)}` : null;
}
const waLink = (raw) => { const d = String(raw || '').replace(/\D/g, ''); if (d.length < 8) return null; const n = d.startsWith('20') ? d : `20${d.replace(/^0/, '')}`; return n.length >= 10 && n.length <= 15 ? `https://wa.me/${n}` : null; };
const money = (n) => `${Number(n).toLocaleString('en-US')} جنيه`;

/** بيبني الرد + بطاقه المحل (للشات: خريطه وأزرار). */
export function storeAnswer(s, aspects, { products = [], offers = [], now = new Date() } = {}) {
  const want = new Set(aspects.length ? aspects : ['all']);
  const all = want.has('all') && want.size === 1;
  const has = (k) => all || want.has(k);
  const parts = []; const head = `«${s.name_ar}»`;
  const addr = s.address_ar ? [s.address_ar, !/banha|بنها/i.test(s.address_ar) ? (s.city === 'Banha' ? 'بنها' : s.city) : ''].filter(Boolean).join('، ') : '';
  const map = mapLink(s);
  let branches = []; try { branches = (Array.isArray(s.branches) ? s.branches : JSON.parse(s.branches_json || '[]')).filter((b) => b && b.name); } catch { branches = []; }
  let extra = []; try { extra = (Array.isArray(s.contacts) ? s.contacts : JSON.parse(s.contacts_json || '[]')).filter((c) => c && (c.phone || c.number)); } catch { extra = []; }
  if (all) parts.push(`${head}${s.tagline_ar ? ` — ${s.tagline_ar}` : ''}`);
  if (has('phone')) {
    const nums = [s.phone, s.whatsapp].filter(Boolean);
    const uniq = [...new Set(nums.map((x) => String(x).trim()))];
    parts.push(uniq.length ? `رقم ${head}: ${uniq.join(' / ')}${waLink(s.whatsapp || s.phone) ? `\nواتساب: ${waLink(s.whatsapp || s.phone)}` : ''}${extra.length ? `\nأرقام تانية: ${extra.slice(0, 3).map((c) => `${c.label ? `${c.label} ` : ''}${c.phone || c.number}`).join('، ')}` : ''}` : `${head} مسجّلش رقم تليفون على Twist. تقدر تتواصل معاه من صفحته على الموقع، أو كلّم فريق Twist على ${'{phone}'} ونوصّلك بيه.`);
  }
  if (has('address') || has('map')) {
    const line = addr ? `عنوان ${head}: ${addr}.` : `عنوان ${head} مش مسجّل بالتفصيل.`;
    parts.push(`${line}${map ? `\nاللوكيشن على الخريطة: ${map}` : ''}`);
  }
  if (has('branches')) parts.push(branches.length ? `فروع ${head}:\n${branches.slice(0, 8).map((b) => `• ${b.name}${b.address ? `: ${b.address}` : ''}${b.phone ? ` — ${b.phone}` : ''}${/^https?:\/\//i.test(b.map_url || '') ? `\n  ${b.map_url}` : ''}`).join('\n')}` : `${head} مسجّل له موقع واحد بس على Twist${addr ? ` (${addr})` : ''}، ومفيش فروع تانية متسجلة.`);
  if (has('hours')) { const h = hoursLine(s.hours, now); parts.push(h ? `مواعيد ${head}: ${h}` : `مواعيد ${head} مش مسجّلة على Twist. اتأكد منه على رقمه قبل ما تروح.`); }
  if (has('sells')) {
    const mine = products.filter((p) => p.store_slug === s.slug).sort((a, b) => (b.sold_count || 0) - (a.sold_count || 0));
    const names = [...new Set(mine.map((p) => p.name_ar))].slice(0, 6);
    const desc = s.description_ar || s.tagline_ar || '';
    parts.push(`${head} ${desc ? `— ${desc}` : ''}${names.length ? `\nمن منتجاتهم المتاحة دلوقتي: ${names.join('، ')}` : '\nمفيش منتجات متاحة منه دلوقتي على الموقع.'}`.trim());
  }
  if (has('social')) {
    const norm1 = (u, base) => { const v = String(u || '').trim(); if (!v) return null; if (/^https?:\/\//i.test(v)) return v; const h = v.replace(/^@/, ''); return base ? `${base}${h}` : null; };
    const links = [['انستجرام', norm1(s.instagram, 'https://www.instagram.com/')], ['فيسبوك', norm1(s.facebook, 'https://www.facebook.com/')], ['تيك توك', norm1(s.tiktok, 'https://www.tiktok.com/@')]].filter(([, u]) => u);
    parts.push(links.length ? `حسابات ${head}:\n${links.map(([n, u]) => `• ${n}: ${u}`).join('\n')}` : `${head} مسجّلش حسابات سوشيال ميديا على Twist. تقدر تتابع منتجاته وعروضه من صفحته على الموقع.`);
  }
  if (has('offers')) {
    const lines = offers.slice(0, 4).map((o) => `• ${o.name ? `${o.name} — ` : ''}${o.headline}${o.endsAt ? ` (لحد ${new Date(o.endsAt).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', timeZone: 'Africa/Cairo' })})` : ''}`);
    const disc = products.filter((p) => p.store_slug === s.slug && p.compare_at_price > p.price && p.price > 0 && (p.stock > 0 || !p.track_stock)).map((p) => ({ p, pct: Math.round((1 - p.price / p.compare_at_price) * 100) })).filter((x) => x.pct >= 5).sort((a, b) => b.pct - a.pct).slice(0, 4)
      .map(({ p, pct }) => `• ${p.name_ar}: ${money(p.price)} بدل ${money(p.compare_at_price)} (خصم ${pct}%)`);
    parts.push(lines.length || disc.length ? `عروض ${head} دلوقتي:\n${[...lines, ...disc].join('\n')}` : `مفيش عروض شغالة عند ${head} دلوقتي.`);
  }
  if (all) { // الملخص: العنوان والرقم والمواعيد كمان
    const a = []; if (addr) a.push(`العنوان: ${addr}`); if (s.phone) a.push(`التليفون: ${s.phone}`); const h = hoursLine(s.hours, now); if (h) a.push(h);
    if (branches.length) a.push(`فيه ${branches.length} فرع تاني`);
    if (a.length) parts.push(a.join('\n'));
    parts.push('اسألني عن أي حاجة فيه: رقمه، لوكيشنه، فروعه، مواعيده، بيبيع إيه، أو عروضه.');
  }
  const card = { slug: s.slug, social: ['instagram', 'facebook', 'tiktok'].filter((k) => s[k]).length, name: s.name_ar, address: addr || null, phone: s.phone || null, whatsapp: waLink(s.whatsapp || s.phone), mapUrl: map, lat: Number.isFinite(Number(s.lat)) && s.lat != null ? Number(s.lat) : null, lng: Number.isFinite(Number(s.lng)) && s.lng != null ? Number(s.lng) : null, hours: hoursLine(s.hours, now), branches: branches.length };
  return { say: parts.join('\n\n'), card };
}

/** رد لما العميل يسأل «رقم المحل» من غير اسم: قايمه بالأسماء. */
export function askWhichStore(stores = []) {
  const names = stores.slice(0, 10).map((s) => s.name_ar).filter(Boolean);
  return names.length ? `أي محل بالظبط؟ قولّي اسمه وأديك رقمه ولوكيشنه وعنوانه ومواعيده وفروعه وعروضه. المحلات الموجودة: ${names.join('، ')}${stores.length > 10 ? '، وغيرهم في صفحة «المحلات»' : ''}.` : null;
}

/** «أي محل بيفتح/بيقفل إمتى»: مواعيد النهارده لأغلب المحلات المسجّل لها مواعيد. */
export function allStoresHours(stores = [], now = new Date()) {
  const lines = []; let missing = 0;
  for (const s of stores) {
    const h = hoursLine(s.hours, now);
    if (!h) { missing += 1; continue; }
    lines.push(`• ${s.name_ar}: ${h.replace(/^النهارده \([^)]*\) /, '')}`);
    if (lines.length >= 10) break;
  }
  if (!lines.length) return null;
  return `مواعيد المحلات النهارده حسب اللي مسجّل:\n${lines.join('\n')}${missing ? `\n(فيه ${missing} محل مواعيده مش مسجّلة)` : ''}\nقولّي اسم محل معيّن وأديك مواعيده بالتفصيل.`;
}
