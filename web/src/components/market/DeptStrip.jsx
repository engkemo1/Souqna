import { useMemo, useState } from 'react';
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
  { slug: 'shoes', name: { ar: 'أحذية', en: 'Shoes' } },
  { slug: 'perfume_makeup', name: { ar: 'عطور ومكياج', en: 'Perfume & Makeup' } },
  { slug: 'care', name: { ar: 'عنايات', en: 'Care' } },
];

const DEFAULT_IMG = {
  women: 'photo-1485230895905-ec40ba36b9bc', men: 'photo-1617137984095-74e4e5e3613f', kids: 'photo-1519238263530-99bdd11df2ea',
  shoes: 'photo-1560769629-975ec94e6a86', bags: 'photo-1590874103328-eac38a683ce7', hijab: 'photo-1609357605129-26f69add5d6e',
  abaya: 'photo-1583391733956-6c78276477e2', jalabiya: 'photo-1509631179647-0177331693ae', underwear: 'photo-1588850561407-ed78c282e89b',
  wedding_dress: 'photo-1594552072238-b8a33785b261', wedding_suit: 'photo-1593032465175-481ac7f401a0', sports: 'photo-1518310383802-640c2de311b2',
  denim: 'photo-1541099649105-f69ad21f3246', accessories: 'photo-1535632066927-ab7c9ab60908', perfume_makeup: 'photo-1522337360788-8b13dee7a37e',
  care: 'photo-1556228720-195a672e8a03',
};
const defaultImg = (slug) => (DEFAULT_IMG[slug] ? `https://images.unsplash.com/${DEFAULT_IMG[slug]}?q=80&w=800&auto=format&fit=crop` : null);

// رجالي / حريمي / أطفال أقسام رئيسية: بتفتح كل منتجات الفئة (أحذية، جلاليب، شباشب، إكسسوارات…) مش القسم الواحد بس.
const AUDIENCE_DEPTS = ['women', 'men', 'kids'];

function DeptCard({ dept, lang, fmt, priority }) {
  const [imgErr, setImgErr] = useState(false);
  const name = dept.name?.[lang] || dept.name?.ar || dept.slug;
  const localUrl = `/departments/${dept.slug}.jpg`;
  const url = dept.image || localUrl || defaultImg(dept.slug);

  return (
    <Link to={AUDIENCE_DEPTS.includes(dept.slug) ? `/search?audience=${dept.slug}` : `/search?department=${dept.slug}`} className="group block focus:outline-none" aria-label={name}>
      <div className="relative aspect-[4/5] overflow-hidden rounded-[22px] bg-neutral-100 shadow-[0_4px_16px_rgba(0,0,0,0.06)] ring-1 ring-black/5 transition duration-300 ease-out group-hover:-translate-y-1.5 group-hover:shadow-[0_16px_30px_-10px_rgba(3,36,77,0.22)] group-focus-visible:ring-2 group-focus-visible:ring-brand">
        {!imgErr && url ? (
          <img
            src={url}
            alt=""
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            onError={() => setImgErr(true)}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : dept.cover ? (
          <SmartImage
            media={dept.cover}
            alt=""
            className="h-full w-full transition-transform duration-500 group-hover:scale-105"
            sizes="(min-width:1024px) 16vw, (min-width:640px) 25vw, 46vw"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-neutral-50 text-5xl opacity-80" aria-hidden="true">
            {DEPT_EMOJI[dept.slug] || '🛍️'}
          </div>
        )}

        {/* تدرج هادئ وناعم أسفل الكارت لقراءة الاسم بوضوح بدون أي ألوان صناعية أو كتل ملونة */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/75 via-black/35 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 p-3.5 text-white">
          <p className="truncate text-[15px] font-black leading-tight drop-shadow sm:text-base">{name}</p>
          {dept.products > 0 && (
            <p className="mt-1 text-[11px] font-bold text-white/90 drop-shadow-xs">
              {fmt(dept.products)} {lang === 'ar' ? 'منتج' : 'items'}
            </p>
          )}
        </div>

        <span
          className="absolute end-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-neutral-800 opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden="true"
        >
          <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
        </span>
      </div>
    </Link>
  );
}

export default function DeptStrip({ departments = [] }) {
  const { t, lang } = useI18n();
  const fmt = (n) => new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US').format(n);

  // عرض كل الأقسام الأساسية (أطفال، شنط، عبايات، طرح، عطور...) بجانب الأقسام التي بها منتجات حالياً
  const list = useMemo(() => {
    const liveMap = new Map((departments || []).map((d) => [d.slug, d]));
    // الأقسام الرئيسية بس (اللي من غير أب)؛ لو الأدمن ضاف قسم رئيسي جديد بيظهر هنا لوحده.
    const tops = (departments || []).filter((d) => !d.parent);
    const base = tops.length ? tops.map((d) => ({ slug: d.slug, name: d.name })) : DEFAULT_DEPTS;
    return base.map((def) => {
      const live = liveMap.get(def.slug);
      return {
        ...def,
        ...live,
        products: AUDIENCE_DEPTS.includes(def.slug) ? 0 : live?.products || 0, // عدّاد القسم الواحد مضلل للفئات الرئيسية
      };
    });
  }, [departments]);

  const totalProducts = (departments || []).reduce((s, d) => s + (d.products || 0), 0);

  return (
    <section aria-label={t('market.shopByDept')} className="container mt-6">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-black text-fg sm:text-3xl">{t('market.shopByDept')}</h2>
          {totalProducts > 0 && (
            <p className="mt-1 text-xs font-medium text-muted sm:text-sm">
              {lang === 'ar'
                ? `اكتشف ${fmt(totalProducts)} منتج متوفر في أقسام المنصة`
                : `Browse ${fmt(totalProducts)} items across marketplace departments`}
            </p>
          )}
        </div>
        <Link
          to="/search"
          className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line-strong bg-elevated px-4 py-2 text-xs font-bold transition hover:border-fg/30 hover:bg-[#F6F8FB] sm:text-sm"
        >
          <span>{t('market.seeAll')}</span>
          <ArrowRight className="h-4 w-4 rtl:rotate-180" />
        </Link>
      </div>

      {/* عرض الأقسام مباشرة في شبكة متناسقة بدون أي تبويبات أو ألوان مصطنعة */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        {list.map((d, i) => (
          <DeptCard key={d.slug} dept={d} lang={lang} fmt={fmt} priority={i < 6} />
        ))}
      </div>
    </section>
  );
}
