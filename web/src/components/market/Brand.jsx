import { Link } from 'react-router-dom';
import { useI18n } from '../../lib/i18n.jsx';
import { cx } from '../ui/cx.js';

/** The exact Talla app mark supplied in the brand reference. */
export function BrandMark({ className }) {
  return (
    <img src="/brand/talla-192.png" className={cx('h-9 w-9 shrink-0 rounded-xl', className)} alt="" aria-hidden="true" />
  );
}

export default function Brand({ to = '/', className, sub }) {
  const { t } = useI18n();
  return (
    <Link to={to} className={cx('flex items-center gap-2.5', className)} aria-label={`${t('app.name')} — ${sub || 'كل المحلات في طلة'}`}>
      <img src="/brand/talla-logo.svg" className="h-[58px] w-auto shrink-0 object-contain" alt="" aria-hidden="true" />
    </Link>
  );
}
