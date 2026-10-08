import { Link } from 'react-router-dom';
import { useI18n } from '../../lib/i18n.jsx';
import { cx } from '../ui/cx.js';

export function BrandMark({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={cx('h-9 w-9 shrink-0', className)} aria-hidden="true">
      <defs>
        <linearGradient id="bl-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F3DFA2" /><stop offset=".5" stopColor="#C9A24D" /><stop offset="1" stopColor="#8E6A24" />
        </linearGradient>
        <linearGradient id="bl-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1A1A1C" /><stop offset="1" stopColor="#0B0B0C" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#bl-bg)" />
      <rect x="4.5" y="4.5" width="55" height="55" rx="12.5" fill="none" stroke="url(#bl-gold)" strokeWidth="1" opacity=".7" />
      <path d="M28.2 19.4a3.9 3.9 0 1 1 5.3 3.6c-1 .4-1.5 1.2-1.5 2.2V27" fill="none" stroke="url(#bl-gold)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M32 27 13.5 40.2c-1.3.9-.7 2.8.9 2.8h35.2c1.6 0 2.2-1.9.9-2.8L32 27Z" fill="none" stroke="url(#bl-gold)" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M32 46.5l1.6 1.6L32 49.7l-1.6-1.6z" fill="url(#bl-gold)" />
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
