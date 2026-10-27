import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, LayoutGrid } from 'lucide-react';
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

function DeptCard({ dept, lang, priority }) {
  const [imgErr, setImgErr] = useState(false);
  const name = dept.name?.[lang] || dept.name?.ar || dept.slug;
  const url = dept.image || `/departments/${dept.slug}.jpg` || defaultImg(dept.slug);
  return (
    <Link to={AUDIENCE_DEPTS.includes(dept.slug) ? `/search?audience=${dept.slug}` : `/search?department=${dept.slug}`} className="group flex w-[78px] shrink-0 snap-start flex-col items-center gap-2 text-center focus:outline-none sm:w-[100px]" aria-label={name}>
      <span className="relative block h-[70px] w-[70px] overflow-hidden rounded-full bg-neutral-100 ring-1 ring-black/10 transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_12px_24px_-10px_rgba(3,36,77,0.35)] group-focus-visible:ring-2 group-focus-visible:ring-brand sm:h-[90px] sm:w-[90px]">
        {!imgErr && url ? (
          <img src={url} alt="" loading={priority ? 'eager' : 'lazy'} decoding="async" onError={() => setImgErr(true)} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
        ) : dept.cover ? (
          <SmartImage media={dept.cover} alt="" className="h-full w-full" sizes="90px" />
        ) : (
          <span className="grid h-full w-full place-items-center text-3xl" aria-hidden="true">{DEPT_EMOJI[dept.slug] || '🛍️'}</span>
        )}
      </span>
      <span className="line-clamp-2 text-[12.5px] font-bold leading-tight text-fg sm:text-[13.5px]">{name}</span>
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
    // أي قسم رئيسي فاضي (قديم أو جديد) بيتشال من الشريط تلقائي؛ رجالي/حريمي/أطفال دايماً موجودين.
    const tops = (departments || []).filter((d) => !d.parent && (AUDIENCE_DEPTS.includes(d.slug) || (d.products || 0) > 0));
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

      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 no-scrollbar sm:mx-0 sm:flex-wrap sm:justify-start sm:gap-x-4 sm:gap-y-6 sm:overflow-visible sm:px-0">
        <Link to="/search" className="group flex w-[78px] shrink-0 snap-start flex-col items-center gap-2 text-center sm:w-[100px]" aria-label={t('market.seeAll')}>
          <span className="grid h-[70px] w-[70px] place-items-center rounded-full bg-fg text-canvas transition group-hover:-translate-y-1 sm:h-[90px] sm:w-[90px]"><LayoutGrid className="h-6 w-6" /></span>
          <span className="text-[12.5px] font-bold leading-tight sm:text-[13.5px]">{lang === 'ar' ? 'كل الأقسام' : 'All'}</span>
        </Link>
        {list.map((d, i) => <DeptCard key={d.slug} dept={d} lang={lang} priority={i < 8} />)}
      </div>
    </section>
  );
}
