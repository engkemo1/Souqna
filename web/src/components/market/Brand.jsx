import { Link } from 'react-router-dom';
import { useI18n } from '../../lib/i18n.jsx';
import { cx } from '../ui/cx.js';

/** Banha Outfit mark — a price tag with the Arabic letter "ب" cut out of it (and a hole for the string).
 *  Orange by default; pass `mono` to inherit the surrounding text colour (single-colour print, watermarks). */
export function BrandMark({ className, mono = false }) {
  return (
    <svg viewBox="0 0 97 76" className={cx('h-8 w-auto shrink-0', className)} aria-hidden="true">
      <g transform="translate(-4.60,-9.70) scale(1)">
        <g transform="rotate(-14 50 50)">
          <path fillRule="evenodd" fill={mono ? 'currentColor' : '#FF5A1F'} d="M34 22 H86 Q94 22 94 30 V70 Q94 78 86 78 H34 Q31 78 29 76 L9 54 Q6 50 9 46 L29 24 Q31 22 34 22 Z M21 45 A5 5 0 1 0 21 55 A5 5 0 1 0 21 45 Z M61.34 64.74Q54.59 64.74 49.97 64.0Q45.35 63.25 42.50 61.55Q39.64 59.84 38.37 57.11Q37.10 54.39 37.10 50.36Q37.10 47.87 37.75 44.90Q38.40 41.92 39.58 39.01L45.53 40.75Q44.48 42.85 43.89 44.81Q43.30 46.76 43.30 48.31Q43.30 50.11 44.05 51.32Q44.79 52.53 46.46 53.27Q48.14 54.01 50.87 54.35Q53.59 54.7 57.62 54.7H66.30Q70.40 54.7 73.19 54.51Q75.98 54.32 77.68 53.86Q79.39 53.39 80.16 52.68Q80.94 51.97 80.94 50.91Q80.94 49.98 80.78 48.53Q80.63 47.07 80.19 44.71L79.14 38.95L85.90 37.83L86.83 43.60Q87.14 45.27 87.32 47.32Q87.51 49.36 87.51 50.91Q87.51 55.07 86.36 57.73Q85.21 60.40 82.27 61.95Q79.32 63.50 74.27 64.12Q69.22 64.74 61.34 64.74ZM61.28 77.26Q59.67 77.26 58.65 76.27Q57.62 75.28 57.62 73.11Q57.62 70.94 58.65 69.95Q59.67 68.96 61.28 68.96H62.52Q64.13 68.96 65.16 69.95Q66.18 70.94 66.18 73.11Q66.18 75.28 65.16 76.27Q64.13 77.26 62.52 77.26Z" />
        </g>
      </g>
    </svg>
  );
}

export default function Brand({ to = '/', className, sub }) {
  const { t } = useI18n();
  return (
    <Link to={to} className={cx('flex items-center gap-2.5', className)} aria-label={t('app.name')}>
      <BrandMark />
      <span className="leading-none">
        <span className="block font-display text-[22px] font-extrabold">{t('app.name')}</span>
        {sub && <span className="mt-1 block text-xs font-medium text-muted">{sub}</span>}
      </span>
    </Link>
  );
}
