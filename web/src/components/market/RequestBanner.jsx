import { Link } from 'react-router-dom';
import { PackagePlus, ArrowRight, ImagePlus, Link2 } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';

/** Catalogue miss → request flow for the home page and empty-search prompt. */
export default function RequestBanner({ title, className = '', query, compact = false }) {
  const { t, isRtl } = useI18n();
  const href = query ? '/request?title=' + encodeURIComponent(query) + '&from=search' : '/request?from=home-sourcing';
  const sectionClass = compact ? className : 'container ' + className;
  const linkClass = compact
    ? 'group relative flex h-full min-h-[190px] flex-col overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-secondary/75 via-elevated to-elevated p-5 shadow-[0_8px_24px_rgba(3,36,77,.04)] transition hover:border-fg/30/40 hover:shadow-[0_12px_30px_rgba(3,36,77,.09)] sm:p-6'
    : 'flex items-center gap-4 rounded-3xl border border-line bg-gradient-to-br from-secondary to-elevated p-5 transition hover:border-fg/30 sm:p-6';
  return (
    <section className={sectionClass}>
      <Link to={href} className={linkClass}>
        {compact ? <>
          <span className="relative flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary text-on-primary shadow-sm"><PackagePlus className="h-5 w-5" /></span>
            <span className="min-w-0">
              <span className="block font-display text-base font-bold leading-snug sm:text-lg">{title || t('req.banner.title')}</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted sm:text-[13px]">{t('req.banner.body')}</span>
              <span className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-muted"><span className="inline-flex items-center gap-1"><PackagePlus className="h-3 w-3 text-brand" />{t('req.banner.item')}</span><span className="inline-flex items-center gap-1"><ImagePlus className="h-3 w-3 text-brand" />{t('req.banner.photo')}</span><span className="inline-flex items-center gap-1"><Link2 className="h-3 w-3 text-brand" />{t('req.banner.link')}</span></span>
            </span>
          </span>
          <span className="relative mt-auto inline-flex w-fit items-center gap-1.5 rounded-xl bg-btn px-4 py-2.5 text-xs font-semibold text-on-btn transition group-hover:brightness-95 sm:text-[13px]">{t('req.banner.cta')}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></span>
        </> : <>
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-btn text-on-btn"><PackagePlus className="h-6 w-6" /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg font-bold">{title || t('req.banner.title')}</span>
            <span className="mt-1 block text-[13px] leading-relaxed text-muted sm:text-sm">{t('req.banner.body')}</span>
          </span>
          <span className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-brand sm:inline-flex">{t('req.banner.cta')}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></span>
        </>}
      </Link>
    </section>
  );
}
