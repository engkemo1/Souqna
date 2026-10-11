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
    <div className="mt-3">
      <p className="mb-1.5 text-[13px] font-bold">{look.label}</p>
      <div className="scroll-x -mx-1 gap-2 px-1 pb-1">
        {look.items.map((p, i) => (
          <Link key={p.id} to={`/s/${p.store.slug}/p/${p.slug}`} className={cx('w-[120px] shrink-0 rounded-xl border bg-elevated p-1.5 text-start transition hover:border-fg', i === look.pick ? 'border-brand ring-1 ring-brand/40' : 'border-line')}>
            <SmartImage media={p.image} ratio="4 / 5" className="rounded-lg" sizes="120px" />
            <p className="mt-1.5 line-clamp-2 min-h-[2.4em] text-[12px] font-medium leading-snug">{tr(p.name)}</p>
            <p className="text-[13px] font-bold text-sale">{formatMoney(p.price, lang)}</p>
            <p className="truncate text-[11px] text-muted">{tr(p.store.name)}</p>
          </Link>
        ))}
      </div>
      {look.items[look.pick] && (
        <button type="button" onClick={() => onAdd(look.items[look.pick])} className={cx('mt-1 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition', added ? 'border-brand text-brand' : 'border-line-strong hover:border-fg')}>
          {added ? <Check className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}{added ? t('stylist.added') : t('stylist.addPick')}
        </button>
      )}
    </div>
  );
}

/** A complete look: styling tip, the pieces, the total, add-everything-to-cart (size picker per piece), per-store cart links and WhatsApp share. */
export default function LookSet({ data, name }) {
  const { t, tr, lang } = useI18n();
  const [quick, setQuick] = useState(null); // { queue: [product], i }
  const [added, setAdded] = useState([]);
  const m = data; const miss = (m?.missing || []).slice(0, 4);
  if (!m?.looks?.length && !miss.length) return null;
  const missing = miss.length > 0 && (
    <div className="mt-3 space-y-1.5">{miss.map((x) => <Link key={x} to={`/request?title=${encodeURIComponent(x)}&from=moda`} className="flex items-center gap-2 rounded-xl border border-dashed border-brand/50 bg-brand/5 px-3 py-2 text-[13px] font-semibold text-brand"><PackagePlus className="h-4 w-4 shrink-0" />{t('req.moda', { x })}</Link>)}</div>
  );
  if (!m.looks?.length) return missing;
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
      {m.tips && <p className="mt-2 max-w-[90%] rounded-xl border border-brand/30 bg-brand/5 px-3 py-2 text-[13px] leading-relaxed">✨ {m.tips}</p>}
      {m.looks.map((l) => <LookRow key={l.label} look={l} lang={lang} tr={tr} t={t} added={added.includes(l.items[l.pick]?.id)} onAdd={(p) => startAdd([p])} />)}
      <p className="mt-3 text-[13.5px] font-semibold">{t('stylist.total', { p: formatMoney(m.total, lang) })}{m.overBudget && <span className="ms-2 font-normal text-sale">{t('stylist.over', { b: formatMoney(m.budget, lang) })}</span>}</p>
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
