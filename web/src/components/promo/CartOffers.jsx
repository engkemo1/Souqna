import { Gift, Sparkles, Tag } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';
import { Select } from '../ui/Field.jsx';
import SmartImage from '../ui/SmartImage.jsx';
import { cx } from '../ui/cx.js';

/** Original price (struck through) + price after the offer. Falls back to the plain price while the quote loads. */
export function LinePrice({ ql, price, qty, className }) {
  const { lang } = useI18n();
  const orig = (ql?.price ?? price) * qty;
  const off = ql?.promoDiscount || 0;
  if (!off) return <span className={cx('font-semibold tabular', className)}>{formatMoney(orig, lang)}</span>;
  return (
    <span className={cx('flex flex-col items-end leading-tight', className)}>
      <s className="text-xs text-muted tabular">{formatMoney(orig, lang)}</s>
      <span className="font-semibold text-success tabular">{formatMoney(orig - off, lang)}</span>
    </span>
  );
}

/** Small chip under a line telling which offer touched it. */
export function LineOfferTag({ quote, ql }) {
  const { tr } = useI18n();
  if (!ql?.promoDiscount || !ql.promotionIds?.length) return null;
  const names = ql.promotionIds.map((id) => quote.promotions?.find((p) => p.id === id)).filter(Boolean);
  if (!names.length) return null;
  return <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success"><Tag className="h-3 w-3" />{names.map((n) => tr(n.name)).join(' + ')}</p>;
}

/** Free gifts added by an offer: shown as zero-price lines. */
export function GiftRows({ quote, className }) {
  const { tr, lang } = useI18n();
  const gifts = (quote?.lines || []).filter((l) => l.gift);
  if (!gifts.length) return null;
  return (
    <ul className={cx('divide-y divide-line', className)}>
      {gifts.map((g, i) => (
        <li key={`${g.productId}-${g.variantId}-${i}`} className="flex items-center gap-3 py-3">
          <SmartImage media={g.image} ratio="4 / 5" sizes="56px" className="w-12 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <p className="inline-flex items-center gap-1 text-[11px] font-bold uppercase text-success"><Gift className="h-3 w-3" />{lang === 'ar' ? 'هدية مجانية' : 'Free gift'}</p>
            <p className="truncate text-sm font-medium">{tr(g.name)} × {g.qty}</p>
          </div>
          <div className="flex flex-col items-end leading-tight"><s className="text-xs text-muted tabular">{formatMoney(g.listPrice * g.qty, lang)}</s><span className="text-sm font-bold text-success">{lang === 'ar' ? 'مجانًا' : 'Free'}</span></div>
        </li>
      ))}
    </ul>
  );
}

/** Applied offers with what each saved, plus a gift picker when the owner offered several gifts. */
export function AppliedOffers({ quote, gifts = {}, onGift, className }) {
  const { tr, lang } = useI18n();
  const list = quote?.promotions || [];
  if (!list.length) return null;
  return (
    <div className={cx('space-y-2', className)}>
      {list.map((p) => (
        <div key={p.id} className="rounded-xl bg-success/10 px-3.5 py-2.5 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="flex items-center gap-1.5 font-semibold text-success"><Tag className="h-4 w-4 shrink-0" /><span className="truncate">{tr(p.name)}</span></p>{p.headline && <p className="mt-0.5 text-xs text-muted">{tr(p.headline)}</p>}</div>
            {p.discount > 0 && <span className="shrink-0 font-semibold text-success tabular">−{formatMoney(p.discount, lang)}</span>}
          </div>
          {p.giftOptions?.length > 1 && onGift && (
            <label className="mt-2 block text-xs text-muted">{lang === 'ar' ? 'اختر هديتك' : 'Choose your gift'}
              <Select size="sm" value={gifts[p.id] || p.gifts?.[0]?.productId || ''} onChange={(e) => onGift({ ...gifts, [p.id]: Number(e.target.value) })} className="mt-1">
                {p.giftOptions.map((o) => <option key={o.productId} value={o.productId}>{tr(o.name)}</option>)}
              </Select>
            </label>
          )}
        </div>
      ))}
    </div>
  );
}

/** "Add one more and get the third free" - progress nudges straight from the engine. */
export function OfferHints({ quote, className }) {
  const { tr } = useI18n();
  const hints = quote?.promoHints || [];
  if (!hints.length) return null;
  return (
    <ul className={cx('space-y-1.5', className)}>
      {hints.slice(0, 2).map((h, i) => (
        <li key={`${h.promotionId}-${i}`} className="flex items-start gap-2 rounded-xl bg-secondary px-3.5 py-2.5 text-[13px] font-medium text-on-secondary"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" /><span>{tr(h.text)}</span></li>
      ))}
    </ul>
  );
}
