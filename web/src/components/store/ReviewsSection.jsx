import { useState } from 'react';
import { Star, BadgeCheck, Camera } from 'lucide-react';
import { useApi } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { formatNumber } from '../../lib/format.js';
import { pickSrc } from '../../lib/image.js';
import SmartImage from '../ui/SmartImage.jsx';
import { cx } from '../ui/cx.js';

export const Stars = ({ value, className = 'h-4 w-4' }) => (
  <span className="inline-flex" role="img" aria-label={`${value}/5`}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={cx(className, i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-line-strong')} />)}</span>
);

const day = (iso, lang) => { try { return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso.replace(' ', 'T') + 'Z')); } catch { return ''; } };

/** Verified-buyer reviews of a product, with the customers' own photos. */
export default function ReviewsSection({ slug, pslug }) {
  const { t, lang } = useI18n();
  const { data } = useApi(`/stores/${slug}/products/${pslug}/reviews`);
  const [photosOnly, setPhotosOnly] = useState(false);
  if (!data) return null;
  const { summary, items } = data;
  const shown = photosOnly ? items.filter((r) => r.photos.length) : items;
  const hasPhotos = items.some((r) => r.photos.length);
  return (
    <section className="container mt-14 sm:mt-20" aria-labelledby="reviews-h">
      <h2 id="reviews-h" className="font-display text-xl font-bold sm:text-2xl">{t('rev.title')}</h2>
      {!summary.count ? <p className="mt-3 rounded-2xl bg-secondary p-4 text-sm text-on-secondary">{t('rev.empty')}</p> : (
        <div className="mt-5 grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="flex items-end gap-3"><span className="font-display text-5xl font-bold leading-none tabular">{summary.avg}</span><div><Stars value={summary.avg} className="h-5 w-5" /><p className="mt-1 text-sm text-muted">{t('rev.count', { n: formatNumber(summary.count, lang) })}</p></div></div>
            <ul className="mt-4 space-y-1.5">
              {[5, 4, 3, 2, 1].map((n) => (
                <li key={n} className="flex items-center gap-2 text-sm"><span className="w-3 tabular">{n}</span><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-secondary"><span className="block h-full rounded-full bg-amber-400" style={{ width: `${(summary.dist[n - 1] / summary.count) * 100}%` }} /></span>
                  <span className="w-6 text-end text-muted tabular">{summary.dist[n - 1]}</span></li>
              ))}
            </ul>
            {hasPhotos && <button type="button" onClick={() => setPhotosOnly((v) => !v)} aria-pressed={photosOnly} className={cx('mt-5 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition', photosOnly ? 'border-fg bg-fg text-canvas' : 'border-line-strong hover:bg-fg/[0.04]')}><Camera className="h-4 w-4" />{t('rev.photosOnly')}</button>}
          </div>
          <ul className="space-y-5 lg:col-span-8">
            {shown.map((r) => (
              <li key={r.id} className="border-b border-line pb-5 last:border-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><Stars value={r.rating} /><span className="font-semibold">{r.name}</span><span className="inline-flex items-center gap-1 text-xs text-emerald-700"><BadgeCheck className="h-3.5 w-3.5" />{t('rev.verified')}</span><span className="text-xs text-muted">{day(r.createdAt, lang)}</span></div>
                {r.comment && <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed">{r.comment}</p>}
                {r.photos.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.photos.map((p) => (
                      <a key={p.id} href={pickSrc(p, 900, 'jpg')} target="_blank" rel="noreferrer" className="block w-24 overflow-hidden rounded-xl sm:w-28"><SmartImage media={p} ratio="1 / 1" sizes="112px" /></a>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
