import { Link } from 'react-router-dom';
import { PackagePlus, ArrowLeft } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';

/** "Not in Banha? We get it for you" — home page card and empty-search prompt. */
export default function RequestBanner({ title, className = '', query, compact = false }) {
  const { t, isRtl } = useI18n();
  const href = query ? '/request?title=' + encodeURIComponent(query) + '&from=search' : '/request';
  const sectionClass = compact ? className : 'container ' + className;
  const linkClass = compact
    ? 'group relative flex h-full min-h-[190px] flex-col items-start justify-between overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-secondary/90 to-elevated p-5 transition hover:border-brand/40 hover:shadow-sm sm:p-6'
    : 'flex items-center gap-4 rounded-3xl border border-line bg-gradient-to-br from-secondary to-elevated p-5 transition hover:border-fg/30 sm:p-6';
  return (
    <section className={sectionClass}>
      <Link to={href} className={linkClass}>
        <span className={compact ? 'grid h-12 w-12 place-items-center rounded-2xl bg-primary text-on-primary' : 'grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-on-primary'}><PackagePlus className="h-6 w-6" /></span>
        <span className={compact ? 'mt-5 block min-w-0' : 'min-w-0 flex-1'}>
          <span className="block font-display text-lg font-bold">{title || t('req.banner.title')}</span>
          <span className="mt-1 block text-[13px] leading-relaxed text-muted sm:text-sm">{t('req.banner.body')}</span>
        </span>
        <span className={compact ? 'mt-4 inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-elevated/80 px-4 py-2 text-[12px] font-semibold text-brand transition group-hover:border-brand/40 sm:text-[13px]' : 'hidden shrink-0 items-center gap-1 text-sm font-semibold text-brand sm:inline-flex'}>{t('req.banner.cta')}<ArrowLeft className={'h-4 w-4 ' + (isRtl ? '' : 'rotate-180')} /></span>
      </Link>
    </section>
  );
}
