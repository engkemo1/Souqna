import { Zap } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { cx } from '../ui/cx.js';

/** "Delivery today" chip shown on products and stores that switched same-day delivery on. */
export default function SameDayBadge({ until, className, solid = true }) {
  const { t, lang } = useI18n();
  const time = until ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(`2000-01-01T${until}:00`)) : '';
  return (
    <span title={time ? t('sameday.until', { time }) : undefined} className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold', solid ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-800', className)}>
      <Zap className="h-3 w-3 fill-current" aria-hidden="true" />{t('sameday.badge')}
    </span>
  );
}
