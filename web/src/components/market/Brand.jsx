import { Link } from 'react-router-dom';
import { useI18n } from '../../lib/i18n.jsx';
import { cx } from '../ui/cx.js';

export function BrandMark({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={cx('h-9 w-9 shrink-0', className)} aria-hidden="true">
      <rect width="64" height="64" rx="18" fill="#17483B" />
      <path d="M20 26h24l-2.5 22a3 3 0 0 1-3 2.6H25.5a3 3 0 0 1-3-2.6L20 26Z" fill="#F6F1E7" />
      <path d="M26 27v-4a6 6 0 0 1 12 0v4" stroke="#D97745" strokeWidth="3.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export default function Brand({ to = '/', className, sub }) {
  const { t } = useI18n();
  return (
    <Link to={to} className={cx('flex items-center gap-2.5', className)} aria-label={t('app.name')}>
      <BrandMark />
      <span className="leading-none">
        <span className="block font-display text-[21px] font-semibold tracking-tight">{t('app.name')}</span>
        {sub && <span className="mt-1 block text-[11px] font-medium text-muted">{sub}</span>}
      </span>
    </Link>
  );
}
