import { Link } from 'react-router-dom';
import { PackagePlus, ArrowRight, ImagePlus, Link2 } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';

/** Catalogue miss → request flow for the home page and empty-search prompt. */
export default function RequestBanner({ title, className = '', query, compact = false }) {
  const { t, isRtl } = useI18n();
  const href = query ? '/request?title=' + encodeURIComponent(query) + '&from=search' : '/request?from=home-sourcing';
  const sectionClass = compact ? className : 'container ' + className;
  const linkClass = compact
    ? 'group relative flex h-full min-h-[150px] sm:min-h-[200px] flex-col overflow-hidden rounded-3xl p-4 shadow-[0_14px_30px_-16px_rgba(11,31,66,.7)] transition hover:shadow-[0_18px_36px_-16px_rgba(11,31,66,.85)] sm:p-6'
    : 'flex items-center gap-4 rounded-3xl border border-line bg-gradient-to-br from-secondary to-elevated p-5 transition hover:border-fg/30 sm:p-6';
  return (
    <section className={sectionClass}>
      <Link to={href} className={linkClass} style={compact ? { background: 'radial-gradient(120% 120% at 15% 90%, #274a85 0%, #14305c 45%, #0b1f42 100%)' } : undefined}>
        {compact ? <>
          <img src="/brand/card-request.webp" alt="" aria-hidden="true" width="560" height="432" loading="lazy" decoding="async" className="pointer-events-none absolute bottom-0 end-0 w-[48%] max-w-[270px] [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]  transition duration-300 group-hover:scale-[1.04]" />
          <span className="relative block max-w-[52%] pb-3 sm:pb-4">
            <span className="block font-display text-[15px] font-bold leading-snug text-white sm:text-lg">{title || t('req.banner.title')}</span>
            <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/70 sm:line-clamp-none sm:text-[13px]">{t('req.banner.body')}</span>
            <span className="mt-2.5 hidden flex-wrap gap-1.5 sm:flex text-[11px] font-semibold text-[#ffd9bf]"><span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1"><PackagePlus className="h-3 w-3" />{t('req.banner.item')}</span><span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1"><ImagePlus className="h-3 w-3" />{t('req.banner.photo')}</span><span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1"><Link2 className="h-3 w-3" />{t('req.banner.link')}</span></span>
          </span>
          <span className="relative mt-auto inline-flex w-fit items-center gap-1.5 rounded-xl bg-[#ff8a3d] px-3.5 py-2 text-xs font-bold text-white shadow-[0_8px_16px_-8px_rgba(255,138,61,.9)] transition group-hover:brightness-105 sm:text-[13px]">{t('req.banner.cta')}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></span>
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
