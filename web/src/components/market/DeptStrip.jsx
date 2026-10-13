import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';

export const DEPT_EMOJI = {
  women: '👗', men: '👔', kids: '🧒', shoes: '👟', bags: '👜', hijab: '🧕', abaya: '🥻', jalabiya: '👘',
  underwear: '🩲', wedding_dress: '👰', wedding_suit: '🤵', sports: '🏃', denim: '👖', accessories: '💍',
};

const UNSPLASH = {
  women: 'photo-1567966456076-905a50a06d8c', men: 'photo-1602810316693-3667c854239a', kids: 'photo-1622218286192-95f6a20083c7', shoes: 'photo-1560769629-975ec94e6a86',
  bags: 'photo-1652427019217-3ded1a356f10', hijab: 'photo-1550546094-9835463f9f71', abaya: 'photo-1772474500365-c2c520545f44', jalabiya: 'photo-1616147147027-60d49d3582c4',
  underwear: 'photo-1713881630214-82c44407cf25', wedding_dress: 'photo-1770866381183-0429c19d59df', wedding_suit: 'photo-1606216769783-a7dbe227a17f', sports: 'photo-1540254597053-3901b858d40f',
  denim: 'photo-1602293589930-45aad59ba3ab', accessories: 'photo-1606760227091-3dd870d97f1d',
  perfume_makeup: 'photo-1592945403244-b3fbafd7f539', care: 'photo-1556228720-195a672e8a03',
};
const unsplash = (slug) => (UNSPLASH[slug] ? `https://images.unsplash.com/${UNSPLASH[slug]}?auto=format&fit=crop&w=240&h=240&q=70` : null);

export const DEFAULT_DEPTS = [
  { slug: 'women', name: { ar: 'حريمي', en: 'Women' } },
  { slug: 'men', name: { ar: 'رجال', en: 'Men' } },
  { slug: 'kids', name: { ar: 'أطفال', en: 'Kids' } },
  { slug: 'shoes', name: { ar: 'كوتشيات وأحذية', en: 'Shoes' } },
  { slug: 'bags', name: { ar: 'شنط', en: 'Bags' } },
  { slug: 'perfume_makeup', name: { ar: 'عطور ومكياج', en: 'Perfume & Makeup' } },
  { slug: 'care', name: { ar: 'عنايات', en: 'Care' } },
  { slug: 'jalabiya', name: { ar: 'جلابيب', en: 'Jalabiya' } },
  { slug: 'underwear', name: { ar: 'ملابس داخلية', en: 'Underwear' } },
  { slug: 'wedding_dress', name: { ar: 'فساتين أفراح', en: 'Wedding Dresses' } },
  { slug: 'wedding_suit', name: { ar: 'بدل أفراح', en: 'Wedding Suits' } },
  { slug: 'sports', name: { ar: 'رياضي', en: 'Sports' } },
];

/** Department photo: uploaded from the admin → default Unsplash photo → emoji. */
function DeptThumb({ slug, image }) {
  const sources = [image, unsplash(slug)].filter(Boolean);
  const [stage, setStage] = useState(0);
  const src = sources[stage] || null;
  if (!src) return <span aria-hidden="true">{DEPT_EMOJI[slug] || '🛍️'}</span>;
  return <img key={src} src={src} alt="" loading="lazy" width="96" height="96" onError={() => setStage((x) => x + 1)} className="h-full w-full object-cover" />;
}

/** Show every department together so shoppers can scan the full catalogue at a glance. */
export default function DeptStrip({ departments = [] }) {
  const { t, lang } = useI18n();
  const list = departments.length > 0 ? departments : DEFAULT_DEPTS;
  const totalProducts = list.reduce((sum, d) => sum + (d.products || 0), 0);
  const fmt = (n) => new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US').format(n);

  return (
    <section aria-label={t('market.shopByDept')} className="container mt-6">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-black text-gray-900">{t('market.shopByDept')}</h2>
          {totalProducts > 0 && (
            <p className="mt-0.5 text-xs font-medium text-gray-500">
              {lang === 'ar'
                ? `${fmt(totalProducts)} منتج متوفر في ${fmt(list.length)} قسم`
                : `${fmt(totalProducts)} products across ${fmt(list.length)} departments`}
            </p>
          )}
        </div>
        <Link to="/search" className="inline-flex items-center gap-1.5 text-sm font-bold text-[#ea580c] transition hover:text-[#d94e08]">
          <span>{lang === 'ar' ? 'عرض الكل' : 'View all'}</span>
          <ArrowRight className="h-4 w-4 rtl:rotate-180" />
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2.5 pb-2 pt-1 sm:grid-cols-4 sm:gap-3 md:grid-cols-6 lg:grid-cols-7">
        {list.map((d) => (
          <Link
            key={d.slug}
            to={`/search?department=${d.slug}`}
            className="group flex flex-col items-center rounded-2xl border border-line bg-white p-3 text-center shadow-[0_2px_8px_rgba(20,33,61,.04)] transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[0_8px_20px_rgba(20,33,61,.08)]"
          >
            <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#fff0e5] shadow-inner transition group-hover:scale-105 sm:h-16 sm:w-16">
              <DeptThumb slug={d.slug} image={d.image} />
            </span>
            <span className="mt-2.5 block w-full truncate text-xs font-bold leading-tight text-[#14213D] transition-colors group-hover:text-brand sm:text-sm">
              {d.name?.[lang] || d.name?.ar || d.slug}
            </span>
            {d.products > 0 && (
              <span className="mt-1 inline-block rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-[#ea580c]">
                {fmt(d.products)} {lang === 'ar' ? 'منتج' : 'items'}
              </span>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
