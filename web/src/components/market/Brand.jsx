import { Link } from 'react-router-dom';
import { useI18n } from '../../lib/i18n.jsx';
import { cx } from '../ui/cx.js';

/** Tella mark: three flowing fabric shapes above the Arabic wordmark and fashion descriptor. */
export function BrandMark({ className, mono = false }) {
  const color = mono ? 'currentColor' : '#FF5A1F';
  const accent = mono ? 'currentColor' : '#FF8A5C';
  return (
    <svg viewBox="0 0 80 76" className={cx('h-8 w-auto shrink-0', className)} aria-hidden="true">
      <path d="M8 10c17 0 29 6 37 24-7-5-13-7-20-7C14 27 9 20 8 10Z" fill={color} />
      <path d="M72 10c-16 0-25 6-33 24 7-5 13-7 20-7 11 0 12-7 13-17Z" fill={accent} />
      <path d="M40 37c-11 9-12 21-8 33 12-4 17-15 8-33Z" fill={mono ? 'currentColor' : '#D94A22'} />
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
