import { Languages } from 'lucide-react';
import { useI18n } from '../lib/i18n.jsx';
import { cx } from './ui/cx.js';

export default function LangToggle({ className, compact, stacked }) {
  const { t, toggle, lang } = useI18n();
  if (stacked) {
    return (
      <button type="button" onClick={toggle} lang={lang === 'ar' ? 'en' : 'ar'} aria-label={t('common.language')}
        className={cx('flex h-12 min-w-[52px] flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 text-[10px] font-semibold leading-none text-fg/80 transition hover:bg-fg/[0.07] active:scale-95', className)}>
        <Languages className="h-5 w-5" strokeWidth={1.75} />
        <span>{lang === 'ar' ? 'English' : 'عربي'}</span>
      </button>
    );
  }
  return (
    <button type="button" onClick={toggle} lang={lang === 'ar' ? 'en' : 'ar'} aria-label={t('common.language')}
      className={cx('inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition hover:bg-fg/[0.07] active:scale-95', className)}>
      <Languages className="h-[18px] w-[18px]" strokeWidth={1.75} />
      {!compact && <span>{lang === 'ar' ? 'EN' : 'ع'}</span>}
    </button>
  );
}
