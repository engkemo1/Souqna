import { Link } from 'react-router-dom';
import { useI18n } from '../../lib/i18n.jsx';
import { cx } from '../ui/cx.js';

/** Tella mark: three flowing fabric shapes above the Arabic wordmark and fashion descriptor. */
export function BrandMark({ className, mono = false }) {
  const color = mono ? 'currentColor' : '#FF5A1F';
  const accent = mono ? 'currentColor' : '#FF8A5C';
  return (
    <svg viewBox="0 0 80 76" className={cx('h-8 w-auto shrink-0', className)} aria-hidden="true">
      <path d="M9 10c16 1 27 7 34 22-7-4-12-5-19-5C15 27 10 21 9 10Z" fill={color} />
      <path d="M71 10c-16 1-27 7-34 22 7-4 12-5 19-5 9 0 14-6 15-17Z" fill={accent} />
      <path d="M40 39c-9 8-11 18-8 29 10-3 15-12 12-22-1-3-2-5-4-7Z" fill={mono ? 'currentColor' : '#D94A22'} />
    </svg>
  );
}

export default function Brand({ to = '/', className, sub }) {
  const { t } = useI18n();
  return (
    <Link to={to} className={cx('flex items-center gap-2.5', className)} aria-label={`${t('app.name')} — ${sub || t('app.tagline')}`}>
      <BrandMark />
      <span className="leading-none">
        <span className="block font-display text-[22px] font-extrabold">{t('app.name')}</span>
        <span className="mt-1 block text-[10px] font-semibold leading-none text-muted sm:text-[11px]">{sub || t('app.tagline')}</span>
      </span>
    </Link>
  );
}
