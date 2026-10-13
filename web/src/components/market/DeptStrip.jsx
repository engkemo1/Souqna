import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
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

  return (
    <section aria-label={t('market.shopByDept')} className="container mt-2">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-black text-gray-900">{t('market.shopByDept')}</h2>
        <Link to="/search" className="inline-flex items-center gap-1.5 text-sm font-bold text-[#ea580c] transition hover:text-[#d94e08]">
          <span>عرض الكل</span>
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-3 pb-2 pt-1 sm:grid-cols-4 sm:gap-4 lg:grid-cols-6 xl:grid-cols-7">
        {list.map((d) => (
          <Link key={d.slug} to={`/search?department=${d.slug}`} className="group flex min-w-0 items-center gap-2 rounded-2xl border border-line bg-white p-2 text-start shadow-[0_5px_16px_rgba(20,33,61,.04)] transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[0_10px_24px_rgba(20,33,61,.08)] sm:gap-3 sm:p-3">
            <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[#fff0e5] sm:h-14 sm:w-14">
              <DeptThumb slug={d.slug} image={d.image} />
            </span>
            <span className="min-w-0 text-xs font-bold leading-snug text-[#14213D] transition-colors group-hover:text-brand sm:text-sm">{d.name?.[lang] || d.name?.ar || d.slug}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
