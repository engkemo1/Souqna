import { useEffect, useState } from 'react';
import SmartImage from '../ui/SmartImage.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { PALETTE, offerBadge } from '../../lib/promo.js';
import { cx } from '../ui/cx.js';
import { bannerFontFamily, loadBannerFont, readableOn } from '../../lib/bannerFonts.js';

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
  const d = { fit: 'cover', focus: 'center', ratio: 'default', text_position: 'bottom-start', text_color: '', font: '', ...(offer.display || {}) };
  const m = offer.image;
  const aspect = d.ratio === 'default' ? ratio : d.ratio === 'auto' ? (m?.w && m?.h ? `${Math.min(Math.max(m.w / m.h, 0.8), 3.2)}` : ratio) : d.ratio.replace('/', ' / ');
  const pos = d.focus === 'top' ? 'top' : d.focus === 'bottom' ? 'bottom' : 'center';
  const [vertical, horizontal] = String(d.text_position || 'bottom-start').split('-');
  const textPosition = `${vertical === 'top' ? 'justify-start' : vertical === 'center' ? 'justify-center' : 'justify-end'} ${horizontal === 'start' ? 'items-start text-start' : horizontal === 'end' ? 'items-end text-end' : 'items-center text-center'}`;
  const fontFam = bannerFontFamily(d.font);
  useEffect(() => { loadBannerFont(d.font); }, [d.font]);
  const bg = offer.image ? null : (d.banner_url || (templateUrl && !broken ? templateUrl : null));
  return (
    <div className={cx('relative isolate overflow-hidden rounded-2xl text-white', className)} style={{ aspectRatio: aspect, background: `linear-gradient(135deg, ${c1}, ${c2})`, color: d.text_color || undefined, fontFamily: fontFam }}>
      {offer.image && d.fit === 'contain' && <SmartImage media={offer.image} alt="" ratio={aspect} fit="cover" showPlaceholder={false} className="absolute inset-0 h-full w-full scale-110 blur-2xl brightness-75" imgClassName="!opacity-100" sizes="160px" />}
      {offer.image && <SmartImage media={offer.image} alt="" ratio={aspect} fit={d.fit} position={pos} className="absolute inset-0 h-full w-full" sizes="(min-width:1024px) 480px, 100vw" />}
      {bg && <img src={bg} alt="" onError={() => setBroken(true)} className={cx('absolute inset-0 -z-10 h-full w-full', d.fit === 'contain' ? 'object-contain' : 'object-cover', pos === 'top' ? 'object-top' : pos === 'bottom' ? 'object-bottom' : 'object-center')} loading="lazy" />}
      <div className={cx('absolute inset-0 to-transparent', vertical === 'top' ? 'bg-gradient-to-b' : vertical === 'center' ? 'bg-gradient-to-b from-black/25 via-transparent to-black/25' : 'bg-gradient-to-t', d.text_color && readableOn(d.text_color) === '#111111' ? 'from-white/70 via-white/20' : 'from-black/60 via-black/15')} />
      <div className={cx('absolute inset-0 flex flex-col', textPosition, compact ? 'p-3' : 'p-4 sm:p-5')}>
        {b.kicker && <span className={cx('font-semibold uppercase tracking-wide', !d.text_color && 'text-white/90', compact ? 'text-[11px]' : 'text-xs sm:text-sm')}>{b.kicker}</span>}
        {b.big && <span className={cx('font-black leading-none drop-shadow tabular', compact ? 'text-2xl' : 'text-4xl sm:text-5xl')}>{b.big}</span>}
        {b.sub && <span className={cx('mt-1 font-semibold', !d.text_color && 'text-white/95', compact ? 'text-[11px]' : 'text-sm')}>{b.sub}</span>}
        {!compact && (name || text) && <span className={cx('mt-2 line-clamp-2 text-xs', !d.text_color && 'text-white/85')}>{name || text}</span>}
      </div>
    </div>
  );
}
