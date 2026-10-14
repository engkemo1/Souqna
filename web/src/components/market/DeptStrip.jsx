import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';

export const DEPT_EMOJI = {
  women: '👗', men: '👔', kids: '🧒', shoes: '👟', bags: '👜', hijab: '🧕', abaya: '🥻', jalabiya: '👘',
  underwear: '🩲', wedding_dress: '👰', wedding_suit: '🤵', sports: '🏃', denim: '👖', accessories: '💍',
  perfume_makeup: '💄', care: '✨',
};

/** Curated high-resolution studio & flat-lay photography for fashion departments */
const UNSPLASH = {
  women: 'photo-1490481651871-ab68de25d43d',         // Luxury chic beige outfit flat-lay
  men: 'photo-1489987707025-afc232f7ea0f',           // Crisp folded linen shirt & trousers flat-lay
  kids: 'photo-1622290291468-a28f7a7dc6a8',          // Clean pastel baby & kids clothing flat-lay
  shoes: 'photo-1549298916-b41d501d3772',          // Iconic clean sneakers floating studio shot
  bags: 'photo-1584917865442-de89df76afd3',           // Premium leather handbag on soft studio backdrop
  hijab: 'photo-1576995853123-5a10305d93c0',          // Modest elegant hijab & scarf portrait
  abaya: 'photo-1584273143981-41c073dfe8f8',          // Luxury modern abaya & modest fashion
  jalabiya: 'photo-1598033129183-c4f50c736f10',       // Crisp tailored modern thobe / jalabiya
  underwear: 'photo-1608256246200-53e635b5b65f',      // Aesthetic comfy loungewear & sleepwear flat-lay
  wedding_dress: 'photo-1519741497674-611481863552',  // Stunning haute couture bridal wedding gown
  wedding_suit: 'photo-1594938298603-c8148c4dae35',   // Sharp luxury tailored tuxedo & bowtie
  sports: 'photo-1517838277536-f5f99be501cd',         // Modern active sportswear & gym outfit
  denim: 'photo-1541099649105-f69ad21f3246',          // Stack of premium classic denim jeans
  accessories: 'photo-1523275335684-37898b6baf30',    // Minimalist luxury watch & fashion accessories
  perfume_makeup: 'photo-1522335789203-aabd1fc54bc9', // Luxury perfume bottle & designer cosmetics
  care: 'photo-1556228720-195a672e8a03',           // Premium organic skincare & beauty essentials
};

const unsplash = (slug) => (UNSPLASH[slug] ? `https://images.unsplash.com/${UNSPLASH[slug]}?auto=format&fit=crop&w=480&h=480&q=80` : null);

/** Department specific soft studio stage color palettes (Amazon & Editorial style) */
const DEPT_STYLES = {
  women: { stage: 'bg-[#FDF2F4] border-pink-100', badge: 'bg-rose-50 text-rose-700' },
  men: { stage: 'bg-[#F7F4EE] border-amber-100/70', badge: 'bg-stone-100 text-stone-700' },
  kids: { stage: 'bg-[#F0FDF8] border-teal-100', badge: 'bg-teal-50 text-teal-700' },
  shoes: { stage: 'bg-[#FFF7ED] border-orange-100', badge: 'bg-orange-50 text-orange-700' },
  bags: { stage: 'bg-[#FAF5F0] border-amber-100', badge: 'bg-amber-50 text-amber-800' },
  hijab: { stage: 'bg-[#FDF4FF] border-purple-100', badge: 'bg-purple-50 text-purple-700' },
  abaya: { stage: 'bg-[#F8FAFC] border-slate-200/80', badge: 'bg-slate-100 text-slate-800' },
  jalabiya: { stage: 'bg-[#FAF8F5] border-stone-200/80', badge: 'bg-stone-100 text-stone-800' },
  underwear: { stage: 'bg-[#FDF2F8] border-pink-100', badge: 'bg-pink-50 text-pink-700' },
  wedding_dress: { stage: 'bg-[#FFFDF7] border-amber-100', badge: 'bg-amber-50 text-amber-800' },
  wedding_suit: { stage: 'bg-[#F3F4F6] border-slate-200', badge: 'bg-slate-100 text-slate-800' },
  sports: { stage: 'bg-[#EFF6FF] border-blue-100', badge: 'bg-blue-50 text-blue-700' },
  denim: { stage: 'bg-[#F0F7FF] border-sky-100', badge: 'bg-sky-50 text-sky-800' },
  accessories: { stage: 'bg-[#F9F7F5] border-stone-200/70', badge: 'bg-stone-100 text-stone-800' },
  perfume_makeup: { stage: 'bg-[#FFF1F2] border-rose-100', badge: 'bg-rose-50 text-rose-700' },
  care: { stage: 'bg-[#F0FDF4] border-emerald-100', badge: 'bg-emerald-50 text-emerald-800' },
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

/** Department Photo Card */
function DeptCard({ dept, lang, fmt }) {
  const [imgFailed, setImgFailed] = useState(false);
  const src = !imgFailed ? (dept.image || unsplash(dept.slug)) : null;
  const style = DEPT_STYLES[dept.slug] || { stage: 'bg-[#F9FAFB] border-gray-100', badge: 'bg-gray-100 text-gray-700' };
  const deptName = dept.name?.[lang] || dept.name?.ar || dept.slug;

  return (
    <Link
      to={`/search?department=${dept.slug}`}
      className="group relative flex flex-col items-center"
    >
      {/* Studio Stage Canvas */}
      <div
        className={`relative aspect-[4/5] w-full overflow-hidden rounded-2xl border ${style.stage} p-2.5 sm:p-3 shadow-[0_3px_12px_rgba(20,33,61,0.03)] transition-all duration-300 ease-out group-hover:-translate-y-1.5 group-hover:shadow-[0_12px_28px_rgba(20,33,61,0.1)] group-hover:border-brand/40`}
      >
        <div className="relative h-full w-full overflow-hidden rounded-xl">
          {src ? (
            <img
              src={src}
              alt={deptName}
              loading="lazy"
              onError={() => setImgFailed(true)}
              className="h-full w-full object-cover object-center transition-transform duration-500 ease-out group-hover:scale-110"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-4xl">
              {DEPT_EMOJI[dept.slug] || '🛍️'}
            </div>
          )}
          {/* Subtle soft gradient scrim for depth */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        </div>

        {/* Product count tag */}
        {dept.products > 0 && (
          <span
            className={`absolute end-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-black tracking-wide shadow-xs backdrop-blur-xs transition-transform group-hover:scale-105 ${style.badge}`}
          >
            {fmt(dept.products)}
          </span>
        )}
      </div>

      {/* Typography Label */}
      <div className="mt-2.5 w-full px-1 text-center">
        <span className="block truncate text-xs font-black tracking-tight text-[#14213D] transition-colors duration-200 group-hover:text-brand sm:text-sm">
          {deptName}
        </span>
        {dept.products > 0 && (
          <span className="mt-0.5 block text-[11px] font-medium text-gray-500 group-hover:text-brand/80">
            {fmt(dept.products)} {lang === 'ar' ? 'منتج' : 'items'}
          </span>
        )}
      </div>
    </Link>
  );
}

/** Show every department together with rich Amazon-grade visual presentation */
export default function DeptStrip({ departments = [] }) {
  const { t, lang } = useI18n();
  const list = departments.length > 0 ? departments : DEFAULT_DEPTS;
  const totalProducts = list.reduce((sum, d) => sum + (d.products || 0), 0);
  const fmt = (n) => new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US').format(n);

  return (
    <section aria-label={t('market.shopByDept')} className="container mt-6">
      {/* Header with Title and View All */}
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-2xl font-black text-gray-900 sm:text-3xl">
              {t('market.shopByDept')}
            </h2>
            <span className="hidden items-center gap-1 rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-bold text-brand sm:inline-flex">
              <Sparkles className="h-3.5 w-3.5" />
              {lang === 'ar' ? 'تشكيلة مميزة' : 'Curated'}
            </span>
          </div>
          {totalProducts > 0 && (
            <p className="mt-1 text-xs font-medium text-gray-500 sm:text-sm">
              {lang === 'ar'
                ? `اكتشف أكثر من ${fmt(totalProducts)} منتج متوفر في ${fmt(list.length)} قسم مختلف`
                : `Browse over ${fmt(totalProducts)} items across ${fmt(list.length)} departments`}
            </p>
          )}
        </div>
        <Link
          to="/search"
          className="group inline-flex items-center gap-1.5 rounded-full border border-orange-200/70 bg-orange-50/50 px-4 py-2 text-xs font-bold text-[#ea580c] transition hover:border-[#ea580c] hover:bg-[#ea580c] hover:text-white sm:text-sm"
        >
          <span>{lang === 'ar' ? 'تصفح كل الأقسام' : 'View all'}</span>
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
        </Link>
      </div>

      {/* Grid: 3 cols on mobile, 4 on sm, 6 on md, 7 or 8 on lg */}
      <div className="grid grid-cols-3 gap-3 pb-2 pt-1 sm:grid-cols-4 sm:gap-4 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8">
        {list.map((d) => (
          <DeptCard key={d.slug} dept={d} lang={lang} fmt={fmt} />
        ))}
      </div>
    </section>
  );
}
