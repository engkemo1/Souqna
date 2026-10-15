import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import SmartImage from '../ui/SmartImage.jsx';

export const DEPT_EMOJI = {
  women: '👗', men: '👔', kids: '🧒', shoes: '👟', bags: '👜', hijab: '🧕', abaya: '🥻', jalabiya: '👘',
  underwear: '🩲', wedding_dress: '👰', wedding_suit: '🤵', sports: '🏃', denim: '👖', accessories: '💍',
  perfume_makeup: '💄', care: '✨',
};

export const DEFAULT_DEPTS = [
  { slug: 'women', name: { ar: 'حريمي', en: 'Women' } },
  { slug: 'men', name: { ar: 'رجالي', en: 'Men' } },
  { slug: 'kids', name: { ar: 'أطفال', en: 'Kids' } },
  { slug: 'shoes', name: { ar: 'كوتشيات وأحذية', en: 'Shoes' } },
  { slug: 'bags', name: { ar: 'شنط', en: 'Bags' } },
  { slug: 'hijab', name: { ar: 'طرح وحجاب', en: 'Hijab' } },
  { slug: 'abaya', name: { ar: 'عبايات', en: 'Abayas' } },
  { slug: 'jalabiya', name: { ar: 'جلابيب', en: 'Jalabiya' } },
  { slug: 'underwear', name: { ar: 'ملابس داخلية', en: 'Underwear' } },
  { slug: 'wedding_dress', name: { ar: 'فساتين أفراح', en: 'Wedding Dresses' } },
  { slug: 'wedding_suit', name: { ar: 'بدل أفراح', en: 'Wedding Suits' } },
  { slug: 'sports', name: { ar: 'رياضي', en: 'Sports' } },
  { slug: 'denim', name: { ar: 'جينز', en: 'Denim' } },
  { slug: 'accessories', name: { ar: 'إكسسوارات', en: 'Accessories' } },
  { slug: 'perfume_makeup', name: { ar: 'عطور ومكياج', en: 'Perfume & Makeup' } },
  { slug: 'care', name: { ar: 'عنايات', en: 'Care' } },
];

/** صور افتراضية للأقسام (لو الأدمن ما رفعش صورة). بتتغير من لوحة الإدارة > الأقسام. */
const DEFAULT_IMG = {
  women: 'photo-1485230895905-ec40ba36b9bc', men: 'photo-1617137984095-74e4e5e3613f', kids: 'photo-1519238263530-99bdd11df2ea',
  shoes: 'photo-1560769629-975ec94e6a86', bags: 'photo-1590874103328-eac38a683ce7', hijab: 'photo-1609357605129-26f69add5d6e',
  abaya: 'photo-1583391733956-6c78276477e2', jalabiya: 'photo-1509631179647-0177331693ae', underwear: 'photo-1588850561407-ed78c282e89b',
  wedding_dress: 'photo-1594552072238-b8a33785b261', wedding_suit: 'photo-1593032465175-481ac7f401a0', sports: 'photo-1518310383802-640c2de311b2',
  denim: 'photo-1541099649105-f69ad21f3246', accessories: 'photo-1535632066927-ab7c9ab60908', perfume_makeup: 'photo-1522337360788-8b13dee7a37e',
  care: 'photo-1556228720-195a672e8a03',
};
const defaultImg = (slug) => (DEFAULT_IMG[slug] ? `https://images.unsplash.com/${DEFAULT_IMG[slug]}?q=80&w=800&auto=format&fit=crop` : null);

/** لون هوية لكل قسم (باستيل واضح مش باهت) + اسم اللون + لون النص الثانوي. */
const STAGE = {
  women: ['#F7D9DE', '#A5495E', 'وردي'], men: ['#EEDFCB', '#7D6446', 'رملي'], kids: ['#D6EEDD', '#3F8A5E', 'نعناعي'], shoes: ['#FBE2A6', '#9A6410', 'كهرماني'],
  bags: ['#F2D9C4', '#8A5A33', 'جملي'], hijab: ['#E6DDF3', '#6B4F97', 'لافندر'], abaya: ['#DDE1E8', '#464F5E', 'رمادي هادي'], jalabiya: ['#EBE3D3', '#7A6747', 'كريمي'],
  underwear: ['#F8DCEA', '#A44A77', 'روز'], wedding_dress: ['#F6EAD0', '#8F6F2E', 'شامبانيا'], wedding_suit: ['#D9DFE8', '#3D4C60', 'رمادي أزرق'],
  sports: ['#D4E5F7', '#2F6AA6', 'أزرق سما'], denim: ['#D2E1F0', '#32608C', 'دنيم'], accessories: ['#EADFD6', '#7A5F4B', 'بيج دافي'],
  perfume_makeup: ['#F7D8D8', '#9A4A50', 'بودرة'], care: ['#D5EBDD', '#3E7F58', 'أخضر هادي'],
};
const FALLBACK_STAGE = ['#ECEEF1', '#5B6470', ''];

/** تبويبات سريعة: العميل يختصر الطريق لقسمه من غير ما يدوّر. */
const GROUPS = [
  { id: 'all', ar: 'كل الأقسام', en: 'All' },
  { id: 'her', ar: 'ليها', en: 'Her', slugs: ['women', 'hijab', 'abaya', 'wedding_dress', 'underwear', 'perfume_makeup'] },
  { id: 'him', ar: 'ليه', en: 'Him', slugs: ['men', 'jalabiya', 'wedding_suit', 'sports', 'denim'] },
  { id: 'kids', ar: 'للأطفال', en: 'Kids', slugs: ['kids'] },
  { id: 'extras', ar: 'كوتشيات وشنط وإكسسوار', en: 'Shoes & more', slugs: ['shoes', 'bags', 'accessories', 'care'] },
];

/* ---------- لون الكارت من المنتج نفسه ---------- */
const hexToRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const mixWhite = (rgb, k) => rgb.map((v) => v + (255 - v) * k);
const sat = ([r, g, b]) => { const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
/** باستيل مشتق من اللون الغالب في صورة القسم؛ لو الصورة أبيض/رمادي (مفيش لون) بنرجع للون القسم الثابت. */
function pastelOf(color) {
  const rgb = hexToRgb(color);
  if (!rgb || sat(rgb) < 0.14 || Math.min(...rgb) > 225) return null;
  return toHex(mixWhite(rgb, 0.72));
}
const tintCache = new Map();
/** للصور اللي الأدمن رفعها (URL): بنقرا لونها الغالب مرة واحدة من نفس الموقع. */
function useImageTint(url) {
  const [tint, setTint] = useState(() => (url ? tintCache.get(url) : null) || null);
  useEffect(() => {
    if (!url || tintCache.has(url)) { if (url) setTint(tintCache.get(url)); return undefined; }
    let dead = false; const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = 16; c.height = 16; const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(img, 0, 0, 16, 16); const d = x.getImageData(0, 0, 16, 16).data; let r = 0; let g = 0; let b = 0; let n = 0;
        for (let k = 0; k < d.length; k += 4) { const px = [d[k], d[k + 1], d[k + 2]]; if (sat(px) < 0.18 || Math.min(...px) > 235) continue; r += px[0]; g += px[1]; b += px[2]; n += 1; }
        const v = n > 8 ? pastelOf(toHex([r / n, g / n, b / n])) : null; tintCache.set(url, v); if (!dead) setTint(v);
      } catch { tintCache.set(url, null); }
    };
    img.onerror = () => tintCache.set(url, null);
    img.src = url;
    return () => { dead = true; };
  }, [url]);
  return tint;
}

function DeptCard({ dept, lang, fmt, priority }) {
  const [step, setStep] = useState(0); // 0: صورة الأدمن/الافتراضية  1: صورة منتج حقيقي  2: إيموجي
  const [fallbackBg, accent, colorName] = STAGE[dept.slug] || FALLBACK_STAGE;
  const url = dept.image || defaultImg(dept.slug);
  const imgTint = useImageTint(dept.image); // صورة الأدمن: لون الكارت من لونها الغالب
  const bg = (dept.image && imgTint) || fallbackBg;
  const name = dept.name?.[lang] || dept.name?.ar || dept.slug;
  const mode = step === 0 && url ? 'url' : step <= 1 && dept.cover ? 'cover' : 'emoji';
  return (
    <Link to={`/search?department=${dept.slug}`} className="group block focus:outline-none" aria-label={name}>
      <div
        className="relative flex aspect-[4/5] flex-col overflow-hidden rounded-[26px] ring-1 ring-black/5 shadow-[0_6px_18px_-10px_rgba(20,33,61,.25)] transition duration-300 ease-out group-hover:-translate-y-1.5 group-hover:shadow-[0_20px_34px_-16px_rgba(20,33,61,.4)] group-focus-visible:ring-2 group-focus-visible:ring-brand"
        style={{ backgroundColor: bg }}
      >
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {mode === 'url' && (
            <img src={url} alt="" loading={priority ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" onError={() => setStep(1)} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          )}
          {mode === 'cover' && (
            <SmartImage media={dept.cover} alt="" className="h-full w-full transition-transform duration-500 group-hover:scale-105" sizes="(min-width:1024px) 16vw, (min-width:640px) 25vw, 46vw" />
          )}
          {mode === 'emoji' && <div className="grid h-full w-full place-items-center text-6xl" aria-hidden="true">{DEPT_EMOJI[dept.slug] || '🛍️'}</div>}
          {/* الصورة بتذوب في لون الكارت */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5" style={{ background: `linear-gradient(to top, ${bg}, ${bg}00)` }} />
        </div>
        <div className="relative px-3.5 pb-3.5 pt-0.5">
          <div className="flex items-end justify-between gap-2">
            <p className="min-w-0 truncate text-lg font-black leading-tight text-fg sm:text-xl">{name}</p>
            {dept.products > 0 && (
              <span className="shrink-0 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-extrabold tabular-nums shadow-sm" style={{ color: accent }}>
                {fmt(dept.products)} {lang === 'ar' ? 'منتج' : 'items'}
              </span>
            )}
          </div>
          {lang === 'ar' && colorName && <p className="mt-0.5 text-[10.5px] font-bold tracking-wide" style={{ color: accent, opacity: 0.8 }}>{colorName}</p>}
        </div>
      </div>
    </Link>
  );
}

export default function DeptStrip({ departments = [] }) {
  const { t, lang } = useI18n();
  const [group, setGroup] = useState('all');
  const fmt = (n) => new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US').format(n);

  // الأقسام الفاضية طريق مسدود للعميل، فنخبيها (لو كل الأقسام فاضية نعرضها كلها)
  const list = useMemo(() => {
    const all = departments.length ? departments : DEFAULT_DEPTS;
    const live = all.filter((d) => (d.products || 0) > 0);
    return live.length ? live : all;
  }, [departments]);
  const totalProducts = list.reduce((s, d) => s + (d.products || 0), 0);
  const tabs = GROUPS.filter((g) => g.id === 'all' || list.some((d) => g.slugs.includes(d.slug)));
  const active = tabs.find((g) => g.id === group) || tabs[0];
  const shown = active.id === 'all' ? list : list.filter((d) => active.slugs.includes(d.slug));

  return (
    <section aria-label={t('market.shopByDept')} className="container mt-6">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-black text-fg sm:text-3xl">{t('market.shopByDept')}</h2>
          {totalProducts > 0 && (
            <p className="mt-1 text-xs font-medium text-muted sm:text-sm">
              {lang === 'ar' ? `${fmt(totalProducts)} منتج متوفر في ${fmt(list.length)} قسم` : `${fmt(totalProducts)} items across ${fmt(list.length)} departments`}
            </p>
          )}
        </div>
        <Link to="/search" className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line-strong bg-elevated px-4 py-2 text-xs font-bold transition hover:border-brand hover:text-brand sm:text-sm">
          <span>{t('market.seeAll')}</span>
          <ArrowRight className="h-4 w-4 rtl:rotate-180" />
        </Link>
      </div>

      {tabs.length > 2 && (
        <div role="tablist" aria-label={t('market.shopByDept')} className="scroll-x -mx-4 mb-4 gap-2 px-4">
          {tabs.map((g) => (
            <button
              key={g.id} type="button" role="tab" aria-selected={g.id === active.id} onClick={() => setGroup(g.id)}
              className={`shrink-0 snap-start rounded-full border px-4 py-2 text-[13px] font-bold transition ${g.id === active.id ? 'border-fg bg-fg text-white' : 'border-line-strong bg-elevated text-fg hover:border-fg'}`}
            >
              {lang === 'ar' ? g.ar : g.en}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
        {shown.map((d, i) => <DeptCard key={d.slug} dept={d} lang={lang} fmt={fmt} priority={i < 4} />)}
      </div>
    </section>
  );
}
