import { useState } from 'react';
import SmartImage from '../ui/SmartImage.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { PALETTE, offerBadge } from '../../lib/promo.js';
import { cx } from '../ui/cx.js';

/**
 * The offer card/banner. The picture is a universal template per offer CATEGORY (or the owner's own upload) and is purely decorative:
 * the numbers drawn over it always come from the offer definition, so "Buy 2 Get 1" and "Buy 10 Get 5" share one template.
 */
export default function OfferVisual({ offer, templateUrl: tplOverride, ratio = '16 / 9', compact = false, className }) {
  const { lang, tr } = useI18n();
  const [broken, setBroken] = useState(false);
  const key = offer.templateKey || offer.type;
  const [c1, c2] = PALETTE[key] || PALETTE.custom;
  const b = offerBadge(offer.def, lang);
  const text = offer.text?.headline ? tr(offer.text.headline) : '';
  const name = tr(offer.name) || '';
  const templateUrl = tplOverride !== undefined ? tplOverride : offer.imageResolved?.url;
  const bg = offer.image ? null : (templateUrl && !broken ? templateUrl : null);
  return (
    <div className={cx('relative isolate overflow-hidden rounded-2xl text-white', className)} style={{ aspectRatio: ratio, background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
      {offer.image && <SmartImage media={offer.image} alt="" ratio={ratio} className="absolute inset-0 h-full w-full" sizes="(min-width:1024px) 480px, 100vw" />}
      {bg && <img src={bg} alt="" onError={() => setBroken(true)} className="absolute inset-0 -z-10 h-full w-full object-cover" loading="lazy" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
      <div className={cx('absolute inset-0 flex flex-col justify-end', compact ? 'p-3' : 'p-4 sm:p-5')}>
        {b.kicker && <span className={cx('font-semibold uppercase tracking-wide text-white/90', compact ? 'text-[11px]' : 'text-xs sm:text-sm')}>{b.kicker}</span>}
        {b.big && <span className={cx('font-black leading-none drop-shadow tabular', compact ? 'text-2xl' : 'text-4xl sm:text-5xl')}>{b.big}</span>}
        {b.sub && <span className={cx('mt-1 font-semibold text-white/95', compact ? 'text-[11px]' : 'text-sm')}>{b.sub}</span>}
        {!compact && (name || text) && <span className="mt-2 line-clamp-2 text-xs text-white/85">{name || text}</span>}
      </div>
    </div>
  );
}
