import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../lib/i18n.jsx';

export const DEPT_EMOJI = {
  women: '👗', men: '👔', kids: '🧒', shoes: '👟', bags: '👜', hijab: '🧕', abaya: '🥻', jalabiya: '👘',
  underwear: '🩲', wedding_dress: '👰', wedding_suit: '🤵', sports: '🏃', denim: '👖', accessories: '💍',
};

// Free-to-use photos (Unsplash licence: commercial use, no attribution required). The admin can replace each one (الأقسام → تعديل → صورة القسم).
const UNSPLASH = {
  women: 'photo-1567966456076-905a50a06d8c', men: 'photo-1602810316693-3667c854239a', kids: 'photo-1622218286192-95f6a20083c7', shoes: 'photo-1560769629-975ec94e6a86',
  bags: 'photo-1652427019217-3ded1a356f10', hijab: 'photo-1550546094-9835463f9f71', abaya: 'photo-1772474500365-c2c520545f44', jalabiya: 'photo-1616147147027-60d49d3582c4',
  underwear: 'photo-1713881630214-82c44407cf25', wedding_dress: 'photo-1770866381183-0429c19d59df', wedding_suit: 'photo-1606216769783-a7dbe227a17f', sports: 'photo-1540254597053-3901b858d40f',
  denim: 'photo-1602293589930-45aad59ba3ab', accessories: 'photo-1606760227091-3dd870d97f1d',
};
const unsplash = (slug) => (UNSPLASH[slug] ? `https://images.unsplash.com/${UNSPLASH[slug]}?auto=format&fit=crop&w=240&h=240&q=70` : null);

/** Department photo: uploaded from the admin → default Unsplash photo → emoji. */
function DeptThumb({ slug, image }) {
  const sources = [image, unsplash(slug)].filter(Boolean);
  const [stage, setStage] = useState(0);
  const src = sources[stage] || null;
  if (!src) return <span aria-hidden="true">{DEPT_EMOJI[slug] || '🛍️'}</span>;
  return <img key={src} src={src} alt="" loading="lazy" width="96" height="96" onError={() => setStage((x) => x + 1)} className="h-full w-full object-cover" />;
}

/** Amazon-style "shop by department" row: every department, always visible, one tap to its products. */
export default function DeptStrip({ departments = [] }) {
  const { t, lang } = useI18n();
  return (
    <section aria-label={t('market.shopByDept')} className="container mt-2">
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 className="font-display text-display-sm font-bold">{t('market.shopByDept')}</h2>
        <Link to="/search" className="shrink-0 text-sm font-semibold text-brand hover:underline">{t('market.seeAll')}</Link>
      </div>
      <div className="scroll-x -mx-4 gap-3 px-4 pb-2 sm:gap-4">
        {departments.map((d) => (
          <Link key={d.slug} to={`/search?department=${d.slug}`} className="group flex w-[84px] shrink-0 flex-col items-center gap-2 text-center sm:w-[100px]">
            <span className="grid h-[72px] w-[72px] place-items-center overflow-hidden rounded-full border border-line bg-elevated text-[32px] shadow-sm transition group-hover:-translate-y-0.5 group-hover:border-fg sm:h-[84px] sm:w-[84px] sm:text-4xl"><DeptThumb slug={d.slug} image={d.image} /></span>
            <span className="line-clamp-2 text-[13px] font-semibold leading-tight">{d.name?.[lang] || d.name?.ar || d.slug}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
