import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Share2, ShoppingBag, Check, PackagePlus } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';
import QuickAddSheet from '../store/QuickAddSheet.jsx';
import { useCart } from '../../lib/cart.jsx';
import { sp } from '../../lib/store.jsx';
import SmartImage from '../ui/SmartImage.jsx';
import { cx } from '../ui/cx.js';

function StoreCartLink({ slug, name, tr, t }) {
  const c = useCart(slug);
  if (!c.count) return null;
  return <Link to={sp(slug, 'cart')} className="inline-flex items-center gap-1.5 rounded-full bg-btn px-3.5 py-2 text-[13px] font-bold text-on-btn"><ShoppingBag className="h-4 w-4" />{t('stylist.cartOf', { s: tr(name), n: c.count })}</Link>;
}

function LookRow({ look, lang, tr, t, added, onAdd }) {
  return (
    <div className="mt-4 rounded-2xl border border-line bg-canvas/60 p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-bold sm:text-base">{look.label}</p>
        <span className="text-[12px] text-muted">{t('lod.options', { n: look.items.length })}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {look.items.map((p, i) => (
          <Link key={p.id} to={'/s/' + p.store.slug + '/p/' + p.slug} className={cx('group min-w-0 rounded-2xl border bg-elevated p-2 text-start transition hover:-translate-y-0.5 hover:border-fg hover:shadow-sm', i === look.pick ? 'border-brand ring-1 ring-brand/40' : 'border-line')}>
            <div className="relative">
              <SmartImage media={p.image} ratio="4 / 5" className="overflow-hidden rounded-xl" sizes="(min-width:1280px) 220px, (min-width:640px) 30vw, 44vw" />
              {i === look.pick && <span className="absolute end-2 top-2 inline-flex items-center gap-1 rounded-full bg-brand px-2 py-1 text-[10px] font-bold text-white"><Check className="h-3 w-3" />{t('lod.picked')}</span>}
            </div>
            <p className="mt-2 line-clamp-2 min-h-[2.6em] text-[12px] font-semibold leading-snug sm:text-[13px]">{tr(p.name)}</p>
            <p className="mt-1 text-sm font-bold text-sale">{formatMoney(p.price, lang)}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted">{tr(p.store.name)}</p>
          </Link>
        ))}
      </div>
      {look.items[look.pick] && (
        <button type="button" onClick={() => onAdd(look.items[look.pick])} className={cx('mt-3 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12.5px] font-semibold transition', added ? 'border-brand text-brand' : 'border-line-strong bg-elevated hover:border-fg')}>
          {added ? <Check className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}{added ? t('stylist.added') : t('stylist.addPick')}
        </button>
      )}
    </div>
  );
}

function ManualLookCards({ looks, lang, tr, t, added, onAdd }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {looks.map((look, index) => {
        const p = look.items[0];
        if (!p) return null;
        return (
          <article key={`${p.id}-${index}`} className="overflow-hidden rounded-2xl border border-line bg-canvas/60 p-2.5 sm:p-3">
            <Link to={'/s/' + p.store.slug + '/p/' + p.slug} className="group block min-w-0 text-start">
              <div className="relative">
                <SmartImage media={p.image} ratio="4 / 5" className="overflow-hidden rounded-xl" sizes="(min-width:1280px) 220px, (min-width:640px) 30vw, 44vw" />
                <span className="absolute start-2 top-2 max-w-[calc(100%-1rem)] truncate rounded-full bg-elevated/95 px-2.5 py-1 text-[11px] font-semibold shadow-sm">{look.label}</span>
              </div>
              <p className="mt-2 line-clamp-2 min-h-[2.6em] text-[12px] font-semibold leading-snug sm:text-[13px]">{tr(p.name)}</p>
              <p className="mt-1 text-sm font-bold text-sale">{formatMoney(p.price, lang)}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted">{tr(p.store.name)}</p>
            </Link>
            <button type="button" onClick={() => onAdd(p)} className={cx('mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition sm:text-xs', added.includes(p.id) ? 'border-brand text-brand' : 'border-line-strong bg-elevated hover:border-fg')}>
              {added.includes(p.id) ? <Check className="h-3.5 w-3.5" /> : <ShoppingBag className="h-3.5 w-3.5" />}{added.includes(p.id) ? t('stylist.added') : t('stylist.addPick')}
            </button>
          </article>
        );
      })}
    </div>
  );
}

/** A complete look: styling tip, the pieces, the total, add-everything-to-cart (size picker per piece), per-store cart links and WhatsApp share. */
export default function LookSet({ data, name }) {
  const { t, tr, lang } = useI18n();
  const [quick, setQuick] = useState(null); // { queue: [product], i }
  const [added, setAdded] = useState([]);
  const [tab, setTab] = useState(0);
  const m = data; const miss = (m?.missing || []).slice(0, 4);
  const ar = lang === 'ar';
  if (!m?.looks?.length && !miss.length) return null;
  const tabs = m.tabs?.length > 1 ? m.tabs : null;
  const shownLooks = tabs ? (tabs[Math.min(tab, tabs.length - 1)].items.filter((i) => i.card).map((i) => ({ label: i.label, items: [i.card], pick: 0 }))) : m.looks;
  const orderItems = (m.missingItems || []);
  const missing = orderItems.length > 0 ? (
    <div className="mt-3 space-y-1.5">{orderItems.slice(0, 4).map((x, i) => <Link key={`${x.key}-${i}`} to={`/request?title=${encodeURIComponent(`${x.label}${x.material ? ' ' + x.material : ''}`)}&from=moda`} className="flex items-center gap-2 rounded-xl border border-dashed border-brand/50 bg-brand/5 px-3 py-2 text-[13px] font-semibold text-brand"><PackagePlus className="h-4 w-4 shrink-0" /><span className="flex-1">{x.label}{x.tab && tabs ? ` (${x.tab})` : ''} — {x.hint}</span><span className="rounded-full bg-brand px-3 py-1 text-[12px] text-white">{x.button}</span></Link>)}</div>
  ) : miss.length > 0 && (
    <div className="mt-3 space-y-1.5">{miss.map((x) => <Link key={x} to={`/request?title=${encodeURIComponent(x)}&from=moda`} className="flex items-center gap-2 rounded-xl border border-dashed border-brand/50 bg-brand/5 px-3 py-2 text-[13px] font-semibold text-brand"><PackagePlus className="h-4 w-4 shrink-0" />{t('req.moda', { x })}</Link>)}</div>
  );
  if (!m.looks?.length) return missing;
  const money = (n) => formatMoney(n, lang);
  const picks = m.looks.map((l) => l.items[l.pick]).filter(Boolean);
  const startAdd = (items) => setQuick({ queue: items, i: 0 });
  const nextAdd = () => {
    if (!quick) return;
    setAdded((a) => [...new Set([...a, quick.queue[quick.i].id])]);
    if (quick.i + 1 < quick.queue.length) setQuick({ ...quick, i: quick.i + 1 }); else setQuick(null);
  };
  const share = () => {
    const lines = m.looks.map((l) => { const p = l.items[l.pick]; return `${l.label}: ${tr(p.name)} — ${formatMoney(p.price, lang)}\n${location.origin}/s/${p.store.slug}/p/${p.slug}`; });
    window.open(`https://wa.me/?text=${encodeURIComponent(`${name} ✨\n${lines.join('\n\n')}\n\n${t('stylist.total', { p: formatMoney(m.total, lang) })}`)}`, '_blank', 'noopener');
  };
  const shareLink = async () => {
    try {
      const { url } = await api('/look-share', { method: 'POST', body: { title: name, items: m.looks.map((l) => ({ id: l.items[l.pick].id, label: l.label })) } });
      const full = location.origin + url;
      if (navigator.share) { try { await navigator.share({ title: name, url: full }); return; } catch { /* cancelled → fall through to WhatsApp */ } }
      window.open(`https://wa.me/?text=${encodeURIComponent(`${name} ✨\n${full}`)}`, '_blank', 'noopener');
    } catch { share(); }
  };
  return (
    <>
      {(m.tips || m.palette?.length > 0) && <div className="mt-3 rounded-2xl border border-brand/20 bg-brand/5 px-4 py-3 text-[13px] leading-relaxed sm:text-sm">
        {m.palette?.length > 0 && <p className="mb-1 text-[12px] font-semibold text-brand">لوحة الألوان: {m.palette.join(' · ')}</p>}
        {m.tips && <p>✨ {m.tips}</p>}
      </div>}
      {m.state === 'alternatives' && <p className="mt-3 inline-block rounded-full bg-secondary px-3 py-1 text-[12px] font-semibold text-muted">{ar ? 'أقرب بديل متاح' : 'Closest available'}</p>}
      {m.state === 'partial' && <p className="mt-3 inline-block rounded-full bg-secondary px-3 py-1 text-[12px] font-semibold text-muted">{ar ? 'جزء من الطقم متاح' : 'Part of the look is available'}</p>}
      {tabs && <div role="tablist" className="mt-4 grid grid-cols-2 gap-1 rounded-full bg-secondary p-1">{tabs.map((tb, i) => <button key={tb.id} type="button" role="tab" aria-selected={i === tab} onClick={() => setTab(i)} className={cx('rounded-full px-3 py-2 text-[13px] font-bold transition', i === tab ? 'bg-elevated shadow-sm' : 'text-muted')}>{tb.label} <span className="font-normal">· {Number(tb.subtotal) > 0 ? money(tb.subtotal) : (ar ? 'لسه مفيش قطع' : 'No items yet')}</span></button>)}</div>}
      {m.manual ? <><p className="mt-4 text-sm font-bold">قطع الأوتفيت المختارة</p><ManualLookCards looks={m.looks} lang={lang} tr={tr} t={t} added={added} onAdd={(p) => startAdd([p])} /></> : shownLooks.map((l) => <LookRow key={l.label} look={l} lang={lang} tr={tr} t={t} added={added.includes(l.items[l.pick]?.id)} onAdd={(p) => startAdd([p])} />)}
      <p className="mt-3 text-[13.5px] font-semibold">{tabs && m.state === 'partial' ? (ar ? 'إجمالي القطع المتاحة: ' : 'Available items total: ') : ''}{t('stylist.total', { p: formatMoney(m.total, lang) })}{m.overBudget && <span className="ms-2 font-normal text-sale">{t('stylist.over', { b: formatMoney(m.budget, lang) })}</span>}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => startAdd(picks)} className="inline-flex items-center gap-1.5 rounded-full bg-btn px-4 py-2 text-[13px] font-bold text-on-btn"><ShoppingBag className="h-4 w-4" />{t('stylist.addAll')}</button>
        {[...new Map(picks.map((p) => [p.store.slug, p.store.name])).entries()].map(([sl, nm]) => <StoreCartLink key={sl} slug={sl} name={nm} tr={tr} t={t} />)}
      </div>
      <button type="button" onClick={shareLink} className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-elevated px-3.5 py-2 text-[13px] font-semibold transition hover:border-fg"><Share2 className="h-4 w-4" />{t('stylist.share')}</button>
      {missing}
      {quick && <QuickAddSheet slug={quick.queue[quick.i].store.slug} product={quick.queue[quick.i]} step={quick.queue.length > 1 ? `${quick.i + 1}/${quick.queue.length}` : ''} onAdded={nextAdd} onClose={() => setQuick(null)} />}
    </>
  );
}
