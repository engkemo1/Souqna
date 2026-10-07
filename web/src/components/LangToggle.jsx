import { Languages } from 'lucide-react';
import { useI18n } from '../lib/i18n.jsx';
import { cx } from './ui/cx.js';

export default function LangToggle({ className, compact }) {
  const { t, toggle, lang } = useI18n();
  return (
    <button type="button" onClick={toggle} lang={lang === 'ar' ? 'en' : 'ar'} aria-label={t('common.language')}
      className={cx('inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition hover:bg-fg/[0.07] active:scale-95', className)}>
      <Languages className="h-[18px] w-[18px]" strokeWidth={1.75} />
      {!compact && <span>{lang === 'ar' ? 'EN' : 'ع'}</span>}
    </button>
  );
}
