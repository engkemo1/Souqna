import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Tag } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { offerBadge } from '../../lib/promo.js';
import OfferVisual from './OfferVisual.jsx';
import { cx } from '../ui/cx.js';

/** 'YYYY-MM-DDTHH:MM' in Africa/Cairo -> Date (DST aware, no library). */
export function cairoToDate(stamp) {
  if (!stamp) return null;
  const [d, t] = stamp.split('T'); const [y, mo, da] = d.split('-').map(Number); const [h, mi] = (t || '00:00').split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, da, h, mi);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
  const p = Object.fromEntries(fmt.formatToParts(new Date(guess)).map((x) => [x.type, Number(x.value)]));
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - guess;
  return new Date(guess - offset);
}

export function useExpiry(endsAt) {
  const { lang } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!endsAt) return undefined; const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id); }, [endsAt]);
  const end = cairoToDate(endsAt);
  if (!end) return null;
  const ms = end.getTime() - now;
  if (ms <= 0) return null;
  const mins = Math.floor(ms / 60_000); const hrs = Math.floor(mins / 60); const days = Math.floor(hrs / 24);
  const ar = lang === 'ar';
  if (days >= 3) return ar ? `ينتهي في ${end.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', timeZone: 'Africa/Cairo' })}` : `Ends ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Cairo' })}`;
  if (hrs >= 24) return ar ? `ينتهي خلال ${days} يوم` : `Ends in ${days} day${days > 1 ? 's' : ''}`;
  if (hrs >= 1) return ar ? `ينتهي خلال ${hrs} ساعة` : `Ends in ${hrs}h`;
  return ar ? `ينتهي خلال ${Math.max(1, mins)} دقيقة` : `Ends in ${Math.max(1, mins)} min`;
}

/** Counts one impression per offer per browser session (aggregate counter only). */
export function useOfferViews(slug, ids) {
  const key = ids.join(',');
  useEffect(() => {
    let seen = {};
    try { seen = JSON.parse(sessionStorage.getItem('twist.offerviews') || '{}'); } catch { /* ignore */ }
    for (const id of ids) {
      const k = `${slug}:${id}`;
      if (seen[k]) continue;
      seen[k] = 1;
      api(`/stores/${slug}/promotions/${id}/view`, { method: 'POST' }).catch(() => {});
    }
    try { sessionStorage.setItem('twist.offerviews', JSON.stringify(seen)); } catch { /* ignore */ }
  }, [slug, key]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Customer-facing offer: picture + the numbers from the offer itself, the conditions in words and when it ends. */
export function OfferCard({ offer, to, className }) {
  const { tr } = useI18n();
  const expiry = useExpiry(offer.endsAt);
  const body = (
    <>
      <OfferVisual offer={offer} ratio="16 / 8" compact />
      <div className="space-y-1 p-3.5">
        <h3 className="line-clamp-1 font-semibold">{tr(offer.name)}</h3>
        {offer.text && <p className="line-clamp-2 text-[13px] text-muted">{[tr(offer.text.headline), tr(offer.text.conditions)].filter(Boolean).join(' — ')}</p>}
        {expiry && <p className="inline-flex items-center gap-1 text-xs font-semibold text-sale"><Clock className="h-3.5 w-3.5" />{expiry}</p>}
      </div>
    </>
  );
  const cls = cx('block overflow-hidden rounded-2xl border border-line bg-elevated transition hover:shadow-md', className);
  return to ? <Link to={to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** Row of the store's live offers (home page). */
export function StoreOffersStrip({ slug, offers, title, linkFor }) {
  useOfferViews(slug, offers.map((o) => o.id));
  if (!offers.length) return null;
  return (
    <section className="container mt-10 sm:mt-14">
      <h2 className="mb-4 font-display text-xl font-bold sm:text-2xl">{title}</h2>
      <div className="scroll-x -mx-4 gap-3 px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:px-0 lg:grid-cols-3">
        {offers.map((o) => <OfferCard key={o.id} offer={o} to={linkFor?.(o)} className="w-[78%] shrink-0 sm:w-auto" />)}
      </div>
    </section>
  );
}

/** "Offers on this product" block under the price. */
export function ProductOffersPanel({ slug, offers }) {
  const { tr, lang } = useI18n();
  useOfferViews(slug, offers.map((o) => o.id));
  if (!offers.length) return null;
  return (
    <div className="mt-5 space-y-2.5">
      {offers.map((o) => <ProductOfferRow key={o.id} offer={o} lang={lang} tr={tr} />)}
    </div>
  );
}
function ProductOfferRow({ offer, lang, tr }) {
  const expiry = useExpiry(offer.endsAt);
  const b = offerBadge(offer.def, lang);
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-success/30 bg-success/[0.07] p-3.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-success/15 text-success"><Tag className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{tr(offer.name)}{b.big && <span className="ms-2 rounded-full bg-success px-2 py-0.5 text-[11px] font-bold text-white">{b.big}</span>}</p>
        {offer.text && <p className="mt-0.5 text-[13px] text-fg/80">{[tr(offer.text.headline), tr(offer.text.conditions)].filter(Boolean).join(' — ')}</p>}
        {offer.text?.cap && <p className="mt-0.5 text-xs text-muted">{tr(offer.text.cap)}</p>}
        {expiry && <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-sale"><Clock className="h-3.5 w-3.5" />{expiry}</p>}
      </div>
    </div>
  );
}

/** Small label on a product card. */
export function OfferChip({ offer, className }) {
  const { tr } = useI18n();
  if (!offer) return null;
  return <span className={cx('inline-flex max-w-full items-center gap-1 rounded-full bg-success px-2 py-0.5 text-[11px] font-bold text-white', className)}><Tag className="h-3 w-3 shrink-0" /><span className="truncate">{tr(offer.headline) || tr(offer.name)}</span></span>;
}
