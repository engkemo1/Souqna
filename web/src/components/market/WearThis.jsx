import { Link } from 'react-router-dom';
import { ArrowRight, Camera } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';

/** Upload an outfit photo and let the stylist find the closest real products in Banha stores. */
export default function WearThis({ className = '' }) {
  const { t } = useI18n();
  return (
    <section className={className}>
      <Link to="/visual" style={{ background: 'radial-gradient(120% 120% at 15% 90%, #274a85 0%, #14305c 45%, #0b1f42 100%)' }}
        className="group relative flex h-full min-h-[150px] sm:min-h-[200px] w-full flex-col overflow-hidden rounded-3xl p-4 text-start shadow-[0_14px_30px_-16px_rgba(11,31,66,.7)] transition hover:shadow-[0_18px_36px_-16px_rgba(11,31,66,.85)] sm:p-6">
        <img src="/brand/card-visual.webp" alt="" aria-hidden="true" width="560" height="445" loading="lazy" decoding="async" className="pointer-events-none absolute bottom-0 end-0 w-[48%] max-w-[270px] [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]  transition duration-300 group-hover:scale-[1.04]" />
        <span className="relative block max-w-[52%] pb-3 sm:pb-4">
          <span className="block font-display text-[15px] font-bold leading-snug text-white sm:text-lg">{t('wear.title')}</span>
          <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/70 sm:line-clamp-none sm:text-[13px]">{t('wear.sub')}</span>
        </span>
        <span className="relative mt-auto inline-flex w-fit items-center gap-2 rounded-xl bg-[#ff8a3d] px-3.5 py-2 text-xs font-bold text-white shadow-[0_8px_16px_-8px_rgba(255,138,61,.9)] transition group-hover:brightness-105 sm:text-[13px]"><Camera className="h-4 w-4" />{t('wear.cta')}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></span>
      </Link>
    </section>
  );
}
