import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../lib/i18n.jsx';
import { emojiFor } from '../../lib/deptIcons.js';
import { cx } from '../ui/cx.js';

/** Where a section opens. Section landing pages live at /c/:slug (the old /search?department= URLs keep working). */
export const deptHref = (slug) => `/c/${encodeURIComponent(slug)}`;
export const deptName = (d, lang) => d?.name?.[lang] || d?.name?.ar || d?.slug || '';

/**
 * A stored picture of a section, in the rendition that fits its card (thumb 160 / card 480 / hero 1200), lazy-loaded.
 * No picture, or a broken one, shows a neutral placeholder — never a generic stock photo and never a generation request.
 */
export function CategoryImage({ dept, sizes, priority = false, className }) {
  const [bad, setBad] = useState(false);
  const im = dept?.images;
  const src = im?.card || dept?.image;
  if (!src || bad) {
    return <span className={cx('grid h-full w-full place-items-center bg-gradient-to-br from-[#EAF0F8] via-[#F4EEF8] to-[#F8E9DD] text-4xl', className)} aria-hidden="true">{emojiFor(dept)}</span>;
  }
  const srcSet = im ? `${im.thumb} 160w, ${im.card} 480w, ${im.hero} 1200w` : undefined;
  return <img src={src} srcSet={srcSet} sizes={sizes} alt="" loading={priority ? 'eager' : 'lazy'} decoding="async" onError={() => setBad(true)} className={cx('h-full w-full object-cover', className)} />;
}

const countLabel = (n, lang) => (n > 0 ? (lang === 'ar' ? `${new Intl.NumberFormat('ar-EG').format(n)} منتج` : `${n} items`) : '');

/** LEVEL 0 — large, dominant card for a main section (homepage + category discovery). Portrait, big type. */
export function MainCard({ dept, feature = false, priority = false }) {
  const { lang } = useI18n();
  const n = countLabel(dept.product_count, lang);
  return (
    <Link to={deptHref(dept.slug)} aria-label={deptName(dept, lang)}
      className={cx('group relative block overflow-hidden rounded-3xl bg-[#EAF0F8] shadow-[0_10px_30px_-18px_rgba(3,36,77,0.45)] ring-1 ring-black/5 transition duration-500 hover:-translate-y-1 hover:shadow-[0_24px_44px_-20px_rgba(3,36,77,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        feature ? 'aspect-[3/4] lg:aspect-auto lg:h-full lg:min-h-[520px] lg:col-span-2 lg:row-span-2' : 'aspect-[3/4]')}>
      <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-105"><CategoryImage dept={dept} priority={priority} sizes={feature ? '(min-width:1024px) 50vw, 70vw' : '(min-width:1024px) 25vw, (min-width:640px) 33vw, 70vw'} /></div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
        <h3 className={cx('font-display font-black leading-tight text-white drop-shadow', feature ? 'text-3xl sm:text-4xl' : 'text-2xl')}>{deptName(dept, lang)}</h3>
        {n && <p className="mt-1 text-xs font-semibold text-white/80">{n}</p>}
        <span className="mt-3 inline-flex items-center rounded-full bg-white/95 px-4 py-1.5 text-xs font-bold text-[#03244D] transition group-hover:bg-white">{lang === 'ar' ? 'تسوق الآن' : 'Shop now'}</span>
      </div>
    </Link>
  );
}

/** LEVEL 1 — medium card, clearly smaller than a main card. Landscape, compact caption. */
export function SubCard({ dept }) {
  const { lang } = useI18n();
  return (
    <Link to={deptHref(dept.slug)} className="group relative block aspect-[4/3] overflow-hidden rounded-2xl bg-[#EAF0F8] ring-1 ring-black/5 transition duration-300 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
      <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-105"><CategoryImage dept={dept} sizes="(min-width:1024px) 20vw, (min-width:640px) 30vw, 45vw" className="text-3xl" /></div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      <h3 className="absolute inset-x-0 bottom-0 line-clamp-2 p-3 text-sm font-bold leading-snug text-white drop-shadow sm:text-[15px]">{deptName(dept, lang)}</h3>
    </Link>
  );
}

/** LEVEL 2+ — compact thumbnail row item, visibly subordinate to its parent. */
export function ThumbChip({ dept }) {
  const { lang } = useI18n();
  return (
    <Link to={deptHref(dept.slug)} className="group inline-flex items-center gap-2.5 rounded-full border border-line-strong bg-elevated py-1 pe-4 ps-1 text-[13px] font-semibold transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
      <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-secondary"><CategoryImage dept={dept} sizes="36px" className="text-base" /></span>
      <span className="line-clamp-1">{deptName(dept, lang)}</span>
    </Link>
  );
}
