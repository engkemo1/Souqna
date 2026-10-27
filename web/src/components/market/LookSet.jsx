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
  return <Link to={sp(slug, 'cart')} className="inline-flex items-center gap-1.5 rounded-full bg-btn px-3.5 py-2 text-[13px] font-bold text-white"><ShoppingBag className="h-4 w-4" />{t('stylist.cartOf', { s: tr(name), n: c.count })}</Link>;
}

function LookRow({ look, lang, tr, t, added, onAdd }) {
  return (
    <div className="mt-4 rounded-2xl border border-line bg-canvas/60 p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-bold sm:text-base">{look.label}</p>
        <span className="text-[12px] text-muted">{look.items.length === 1 ? (lang === 'ar' ? 'اختيار واحد' : '1 option') : t('lod.options', { n: look.items.length })}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {look.items.map((p, i) => (
          <Link key={p.id} to={'/s/' + p.store.slug + '/p/' + p.slug} className={cx('group min-w-0 rounded-2xl border bg-elevated p-2 text-start transition hover:-translate-y-0.5 hover:border-fg hover:shadow-sm', i === look.pick ? 'border-brand ring-1 ring-brand/40' : 'border-line')}>
            <div className="relative">
              <SmartImage media={p.image} ratio="4 / 5" className="overflow-hidden rounded-xl" sizes="(min-width:1280px) 220px, (min-width:640px) 30vw, 44vw" />
              {i === look.pick && <span className="absolute end-2 top-2 inline-flex items-center gap-1 rounded-full bg-btn px-2 py-1 text-[10px] font-bold text-white"><Check className="h-3 w-3" />{t('lod.picked')}</span>}
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

function ManualLookCards({ looks, lang, tr, t, added, onAdd, editorial = false }) {
  return (
    <div className={cx('mx-auto mt-4 grid w-full grid-cols-1 gap-3 sm:gap-4', editorial ? 'lg:grid-cols-2' : 'sm:grid-cols-2', looks.length <= 2 ? 'max-w-5xl' : 'max-w-6xl xl:grid-cols-3')}>
      {looks.map((look, index) => {
        const p = look.items[0];
        if (!p) return null;
        return (
          <article key={`${p.id}-${index}`} className={cx('group overflow-hidden rounded-2xl border border-line bg-canvas/70 p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:border-fg/30/40 hover:shadow-md sm:rounded-3xl sm:p-3', editorial && 'grid grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)] items-center gap-2 sm:gap-4')}>
            <Link to={'/s/' + p.store.slug + '/p/' + p.slug} className="group block min-w-0 text-start">
              <div className="relative">
                <SmartImage media={p.image} ratio="4 / 4.5" className="overflow-hidden rounded-xl sm:rounded-2xl" sizes={editorial ? '(min-width:1024px) 28vw, 48vw' : '(min-width:1280px) 360px, (min-width:640px) 42vw, 92vw'} />
                <span className="absolute start-2 top-2 max-w-[calc(100%-1rem)] truncate rounded-full border border-line/70 bg-elevated/95 px-3 py-1.5 text-[11px] font-bold shadow-sm sm:text-xs">{look.label}</span>
              </div>
            </Link>
            <div className={cx('min-w-0', editorial ? 'flex flex-col justify-center px-1 py-2 sm:px-2' : 'col-span-full px-1 pb-1 pt-3')}>
              <Link to={'/s/' + p.store.slug + '/p/' + p.slug} className="block min-w-0 text-start">
                <p className={cx('font-bold leading-snug', editorial ? 'line-clamp-3 text-xs sm:text-base' : 'line-clamp-2 min-h-[2.6em] text-sm sm:text-base')}>{tr(p.name)}</p>
                <p className="mt-1 truncate text-[11px] text-muted sm:text-xs">{tr(p.store.name)}</p>
                <p className="mt-2 text-base font-extrabold text-sale sm:text-lg">{formatMoney(p.price, lang)}</p>
              </Link>
              {editorial && Array.isArray(p.colors) && p.colors.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-1" aria-label={lang === 'ar' ? 'الألوان المتاحة' : 'Available colours'}>{p.colors.slice(0, 5).map((color) => <span key={color.hex} title={lang === 'ar' ? color.name_ar : color.name_en} className="h-3.5 w-3.5 rounded-full border border-black/15 sm:h-4 sm:w-4" style={{ backgroundColor: color.hex }} />)}</div>}
              <button type="button" onClick={() => onAdd(p)} className={cx('mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-full border px-2 py-2 text-[10px] font-bold transition sm:text-sm', added.includes(p.id) ? 'border-[#F8620A] bg-[#FFF3EB] text-fg' : 'border-line-strong bg-elevated hover:border-fg/30 hover:bg-[#F6F8FB]')}>
                {added.includes(p.id) ? <Check className="h-4 w-4 shrink-0" /> : <ShoppingBag className="h-4 w-4 shrink-0" />}{added.includes(p.id) ? t('stylist.added') : t('stylist.addPick')}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

/** Home-page "complete the look": the pieces collaged together, the list, one total and one big add-everything button. */
function Showcase({ looks, total, lang, tr, t, added, onAdd, onAddAll, onShare, storeLinks }) {
  const ar = lang === 'ar';
  const picks = looks.map((l) => ({ label: l.label, p: l.items[l.pick] })).filter((x) => x.p);
  const tiles = picks.slice(0, 4);
  const ask = (text) => window.dispatchEvent(new CustomEvent('moda:open', { detail: { ask: text } }));
  const cheaper = Math.max(500, Math.round((total * 0.75) / 100) * 100);
  const chips = ar
    ? [[`أرخص من ${cheaper} ج`, `عدّل اللوك ده بحيث الإجمالي يبقى أقل من ${cheaper} جنيه`], ['ألوان أهدى', 'غيّر ألوان اللوك ده لألوان أهدى'], ['ضيف إكسسوار', 'ضيف إكسسوار يناسب اللوك ده']]
    : [[`Under ${cheaper} EGP`, `Adjust this look so the total is under ${cheaper} EGP`], ['Calmer colours', 'Change this look to calmer colours'], ['Add an accessory', 'Add an accessory that suits this look']];
  const grid = tiles.length === 1 ? 'grid-cols-1' : tiles.length === 2 ? 'grid-cols-2' : 'grid-cols-[1.25fr_1fr]';
  const rows = tiles.length >= 3 ? { gridTemplateRows: `repeat(${tiles.length - 1}, minmax(0, 1fr))` } : undefined;
  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-6">
      <div className={cx('grid h-[360px] gap-2 rounded-[26px] bg-gradient-to-br from-secondary/70 to-brand/10 p-2 sm:h-[440px] lg:h-full lg:min-h-[460px]', grid)} style={rows}>
        {tiles.map(({ label, p }, i) => (
          <Link key={p.id} to={'/s/' + p.store.slug + '/p/' + p.slug} className={cx('group relative min-h-0 overflow-hidden rounded-2xl bg-white shadow-sm', tiles.length >= 3 && i === 0 && 'row-span-full')}>
            <SmartImage media={p.image} alt={tr(p.name)} className="h-full w-full" sizes="(min-width:1024px) 30vw, 60vw" />
            <span className="absolute start-2 top-2 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold shadow-sm">{label}</span>
            <span className="absolute bottom-2 end-2 rounded-full bg-fg/80 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur">{formatMoney(p.price, lang)}</span>
          </Link>
        ))}
      </div>
      <div className="min-w-0">
        <p className="mb-2 text-sm font-extrabold">{picks.length === 1 ? (ar ? 'القطعة المقترحة' : 'Suggested piece') : (ar ? `قطع اللوك (${picks.length})` : `Pieces in this look (${picks.length})`)}</p>
        <ul className="divide-y divide-line rounded-2xl border border-line bg-elevated">
          {picks.map(({ label, p }) => (
            <li key={p.id} className="flex items-center gap-3 p-2.5">
              <Link to={'/s/' + p.store.slug + '/p/' + p.slug} className="block w-14 shrink-0"><SmartImage media={p.image} alt="" ratio="4 / 5" className="rounded-xl" sizes="64px" /></Link>
              <Link to={'/s/' + p.store.slug + '/p/' + p.slug} className="min-w-0 flex-1 text-start">
                <p className="text-[11px] font-semibold text-brand">{label}</p>
                <p className="line-clamp-1 text-sm font-bold">{tr(p.name)}</p>
                <p className="truncate text-[11px] text-muted">{tr(p.store.name)}</p>
              </Link>
              <p className="shrink-0 text-sm font-extrabold text-sale">{formatMoney(p.price, lang)}</p>
              <button type="button" onClick={() => onAdd(p)} aria-label={t('stylist.addPick')} className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-full border transition', added.includes(p.id) ? 'border-brand bg-[#EAF0F8] text-brand' : 'border-line-strong hover:border-fg/30 hover:bg-[#F6F8FB]')}>
                {added.includes(p.id) ? <Check className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 rounded-2xl border border-line bg-[#F1F4F9] p-3.5">
          <div className="flex items-end justify-between gap-3">
            <p className="text-[12px] font-semibold text-muted">{picks.length === 1 ? (ar ? 'سعر القطعة' : 'Item price') : (ar ? 'إجمالي اللوك' : 'Look total')}</p>
            <p className="text-2xl font-black text-brand">{formatMoney(total, lang)}</p>
          </div>
          <button type="button" onClick={onAddAll} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-btn text-[15px] font-extrabold text-white shadow-[0_10px_24px_-10px_rgba(3,36,77,.6)] transition hover:brightness-95 active:scale-[.99]"><ShoppingBag className="h-5 w-5" />{picks.length === 1 ? t('stylist.addPick') : (ar ? 'أضف اللوك كامل للسلة' : 'Add the full look to cart')}</button>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={onShare} className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-elevated px-3.5 py-2 text-[12.5px] font-semibold transition hover:border-fg"><Share2 className="h-4 w-4" />{picks.length === 1 ? t('stylist.shareItem') : t('stylist.share')}</button>
            {storeLinks}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold text-muted">{ar ? 'اطلب من تويلا:' : 'Ask Twila:'}</span>
          {chips.map(([label, text]) => <button key={label} type="button" onClick={() => ask(text)} className="rounded-full border border-line bg-elevated px-3 py-1.5 text-[12px] font-semibold transition hover:border-fg/30 hover:bg-[#F6F8FB]">{label}</button>)}
        </div>
      </div>
    </div>
  );
}

/** Look-detail page: product cards row, one total + add-everything bar, share and quick "ask Twila" tweaks. */
function CardsBlock({ looks, total, lang, tr, t, added, onAdd, onAddAll, onShare, storeLinks }) {
  const ar = lang === 'ar';
  const picks = looks.map((l) => ({ label: l.label, p: l.items[l.pick] })).filter((x) => x.p);
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-extrabold sm:text-base">{picks.length === 1 ? (ar ? 'القطعة المقترحة' : 'Suggested piece') : (ar ? `القطع المستخدمة في الإطلالة (${picks.length})` : `Pieces in this look (${picks.length})`)}</p>
      </div>
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {picks.map(({ label, p }) => (
          <li key={p.id} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-elevated shadow-sm">
            <Link to={'/s/' + p.store.slug + '/p/' + p.slug} className="block">
              <div className="relative bg-white">
                <SmartImage media={p.image} alt={tr(p.name)} ratio="1 / 1" className="w-full" fit="contain" sizes="(min-width:1024px) 14vw, 44vw" />
                <span className="absolute start-1.5 top-1.5 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-bold text-brand shadow-sm">{label}</span>
              </div>
            </Link>
            <div className="flex flex-1 flex-col p-2.5">
              <Link to={'/s/' + p.store.slug + '/p/' + p.slug} className="min-w-0 text-start">
                <p className="line-clamp-2 min-h-[2.5em] text-[12.5px] font-bold leading-snug">{tr(p.name)}</p>
                <p className="mt-0.5 truncate text-[11px] text-muted">{tr(p.store.name)}</p>
              </Link>
              <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                <p className="text-sm font-extrabold text-sale">{formatMoney(p.price, lang)}</p>
                <button type="button" onClick={() => onAdd(p)} aria-label={t('stylist.addPick')} className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-full border transition', added.includes(p.id) ? 'border-brand bg-[#EAF0F8] text-brand' : 'border-line-strong hover:border-fg/30 hover:bg-[#F6F8FB]')}>
                  {added.includes(p.id) ? <Check className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-stretch gap-2">
        <button type="button" onClick={onAddAll} className="flex h-14 w-full min-w-0 items-center justify-between sm:w-auto sm:flex-1 gap-3 rounded-2xl bg-btn px-4 text-white shadow-[0_12px_26px_-12px_rgba(3,36,77,.65)] transition hover:brightness-95 active:scale-[.99] sm:px-5">
          <span className="flex items-center gap-2 text-[14px] font-extrabold sm:text-[15px]"><ShoppingBag className="h-5 w-5" />{picks.length === 1 ? t('stylist.addPick') : (ar ? 'أضف الإطلالة كاملة للسلة' : 'Add the full look to basket')}</span>
          <span className="shrink-0 border-s border-white/40 ps-3 text-[15px] font-black">{formatMoney(total, lang)}</span>
        </button>
        <button type="button" onClick={onShare} className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-line-strong bg-elevated px-4 sm:h-14 sm:flex-none text-[13px] font-bold transition hover:border-fg"><Share2 className="h-4 w-4" />{picks.length === 1 ? t('stylist.shareItem') : t('stylist.share')}</button>
      </div>
      {storeLinks && storeLinks.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{storeLinks}</div>}
    </div>
  );
}

/** A complete look: styling tip, the pieces, the total, add-everything-to-cart (size picker per piece), per-store cart links and WhatsApp share. */
export default function LookSet({ data, name, marketplace = false, editorial = false, stickyCTA = false, showcase = false }) {
  const { t, tr, lang } = useI18n();
  const [quick, setQuick] = useState(null); // { queue: [product], i }
  const [added, setAdded] = useState([]);
  const [tab, setTab] = useState(0);
  const m = data; const miss = (m?.missing || []).slice(0, 4);
  const ar = lang === 'ar';
  const weatherTips = Array.isArray(m?.tips) ? m.tips.filter(Boolean) : m?.tips ? [m.tips] : [];
  const styleTips = Array.isArray(m?.styleTips) ? m.styleTips.filter(Boolean) : m?.styleTips ? [m.styleTips] : [];
  const hasAdvice = weatherTips.length > 0 || styleTips.length > 0 || (m?.palette?.length || 0) > 0;
  if (!m?.looks?.length && !miss.length && !hasAdvice) return null;
  const tabs = m.tabs?.length > 1 ? m.tabs : null;
  const shownLooks = tabs ? (tabs[Math.min(tab, tabs.length - 1)].items.filter((i) => i.card).map((i) => ({ label: i.label, items: [i.card], pick: 0 }))) : m.looks;
  const orderItems = (m.missingItems || []);
  const missing = orderItems.length > 0 ? (
    <div className="mt-3 space-y-1.5">{orderItems.slice(0, 4).map((x, i) => <Link key={`${x.key}-${i}`} to={`/request?title=${encodeURIComponent(`${x.label}${x.material ? ' ' + x.material : ''}`)}&from=moda`} className="flex items-center gap-2 rounded-xl border border-dashed border-line bg-[#F1F4F9] px-3 py-2 text-[13px] font-semibold text-brand"><PackagePlus className="h-4 w-4 shrink-0" /><span className="flex-1">{x.label}{x.tab && tabs ? ` (${x.tab})` : ''} — {x.hint}</span><span className="rounded-full bg-btn px-3 py-1 text-[12px] text-white">{x.button}</span></Link>)}</div>
  ) : miss.length > 0 && (
    <div className="mt-3 space-y-1.5">{miss.map((x) => <Link key={x} to={`/request?title=${encodeURIComponent(x)}&from=moda`} className="flex items-center gap-2 rounded-xl border border-dashed border-line bg-[#F1F4F9] px-3 py-2 text-[13px] font-semibold text-brand"><PackagePlus className="h-4 w-4 shrink-0" />{t('req.moda', { x })}</Link>)}</div>
  );
  const advice = hasAdvice && <div className="mt-3 rounded-2xl border border-line bg-[#F1F4F9] px-4 py-3 text-[13px] leading-relaxed sm:text-sm">
    {m.palette?.length > 0 && <p className="mb-1 text-[12px] font-semibold text-brand">{ar ? 'ألوان مقترحة' : 'Suggested colours'}: {m.palette.join(' · ')}</p>}
    {weatherTips.map((tip, i) => <p key={`weather-${i}`} className={i ? 'mt-1' : ''}>✨ {tip}</p>)}
    {styleTips.length > 0 && <div className={weatherTips.length ? 'mt-2 border-t border-line pt-2' : ''}>
      <p className="mb-1 font-semibold text-brand">{t('stylist.styleProposal')}</p>
      {styleTips.map((tip, i) => <p key={`style-${i}`} className={i ? 'mt-1' : ''}>{tip}</p>)}
    </div>}
  </div>;
  if (!m.looks?.length) return <>{advice}{missing}</>;
  const money = (n) => formatMoney(n, lang);
  const picks = m.looks.map((l) => l.items[l.pick]).filter(Boolean);
  const totalLabel = picks.length === 1 ? t('stylist.totalItem', { p: money(m.total) }) : m.state === 'partial' ? t('stylist.availableTotal', { p: money(m.total) }) : t('stylist.total', { p: money(m.total) });
  const ShowComp = showcase === 'cards' ? CardsBlock : Showcase;
  const startAdd = (items) => setQuick({ queue: items, i: 0 });
  const nextAdd = () => {
    if (!quick) return;
    setAdded((a) => [...new Set([...a, quick.queue[quick.i].id])]);
    if (quick.i + 1 < quick.queue.length) setQuick({ ...quick, i: quick.i + 1 }); else setQuick(null);
  };
  const share = () => {
    const lines = m.looks.map((l) => { const p = l.items[l.pick]; return `${l.label}: ${tr(p.name)} — ${formatMoney(p.price, lang)}\n${location.origin}/s/${p.store.slug}/p/${p.slug}`; });
    window.open(`https://wa.me/?text=${encodeURIComponent(`${name} ✨\n${lines.join('\n\n')}\n\n${totalLabel}`)}`, '_blank', 'noopener');
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
      {advice}
      {m.state === 'alternatives' && <p className="mt-3 inline-block rounded-full bg-secondary px-3 py-1 text-[12px] font-semibold text-muted">{ar ? 'أقرب بديل متاح' : 'Closest available'}</p>}
      {m.state === 'partial' && <p className="mt-3 inline-block rounded-full bg-secondary px-3 py-1 text-[12px] font-semibold text-muted">{ar ? 'جزء من الطقم متاح' : 'Part of the look is available'}</p>}
      {tabs && <div role="tablist" className="mt-4 grid grid-cols-2 gap-1 rounded-full bg-secondary p-1">{tabs.map((tb, i) => <button key={tb.id} type="button" role="tab" aria-selected={i === tab} onClick={() => setTab(i)} className={cx('rounded-full px-3 py-2 text-[13px] font-bold transition', i === tab ? 'bg-elevated shadow-sm' : 'text-muted')}>{tb.label} <span className="font-normal">· {Number(tb.subtotal) > 0 ? money(tb.subtotal) : (ar ? 'لسه مفيش قطع' : 'No items yet')}</span></button>)}</div>}
      {showcase && !tabs ? (
        <ShowComp looks={m.looks} total={m.total} lang={lang} tr={tr} t={t} added={added} onAdd={(p) => startAdd([p])} onAddAll={() => startAdd(picks)} onShare={shareLink} storeLinks={[...new Map(picks.map((p) => [p.store.slug, p.store.name])).entries()].map(([sl, nm]) => <StoreCartLink key={sl} slug={sl} name={nm} tr={tr} t={t} />)} />
      ) : (
      <>
      {m.manual ? <><p className="mt-4 text-sm font-bold">{editorial ? (ar ? 'هذا اللوك يحتوي على:' : 'Pieces in this look:') : 'قطع الأوتفيت المختارة'}</p><ManualLookCards looks={m.looks} lang={lang} tr={tr} t={t} added={added} onAdd={(p) => startAdd([p])} editorial={editorial} /></> : shownLooks.map((l) => <LookRow key={l.label} look={l} lang={lang} tr={tr} t={t} added={added.includes(l.items[l.pick]?.id)} onAdd={(p) => startAdd([p])} />)}
      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-line bg-canvas/70 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div>
          <p className="text-[11px] font-semibold text-muted">{ar ? 'إجمالي القطع المختارة' : 'Selected items total'}</p>
          <p className="mt-0.5 text-base font-extrabold sm:text-lg">{totalLabel}{m.overBudget && <span className="ms-2 text-xs font-normal text-sale">{t('stylist.over', { b: formatMoney(m.budget, lang) })}</span>}</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <button type="button" onClick={() => startAdd(picks)} className="inline-flex items-center justify-center gap-1.5 rounded-full bg-btn px-4 py-2.5 text-[13px] font-bold text-white"><ShoppingBag className="h-4 w-4" />{t(picks.length === 1 ? 'stylist.addPick' : m.state === 'partial' ? 'stylist.addAvailable' : 'stylist.addAll')}</button>
          {[...new Map(picks.map((p) => [p.store.slug, p.store.name])).entries()].map(([sl, nm]) => <StoreCartLink key={sl} slug={sl} name={nm} tr={tr} t={t} />)}
          <button type="button" onClick={shareLink} className="inline-flex items-center justify-center gap-1.5 rounded-full border border-line-strong bg-elevated px-3.5 py-2.5 text-[13px] font-semibold transition hover:border-fg"><Share2 className="h-4 w-4" />{picks.length === 1 ? t('stylist.shareItem') : t('stylist.share')}</button>
        </div>
      </div>
      </>
      )}
      {missing}
      {stickyCTA && <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/95 px-3 pt-3 shadow-[0_-8px_30px_rgba(0,0,0,.08)] backdrop-blur-md sm:px-6" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}>
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold text-muted sm:text-xs">{ar ? 'إجمالي اللوك كامل' : 'Full look total'}</p><p className="truncate text-base font-extrabold text-brand sm:text-lg">{money(m.total)}</p></div>
          <button type="button" onClick={() => startAdd(picks)} className="inline-flex min-h-12 flex-[1.6] items-center justify-center gap-2 rounded-full bg-btn px-4 py-2.5 text-[13px] font-bold text-white sm:flex-none sm:px-8 sm:text-base"><ShoppingBag className="h-4 w-4" />{ar ? 'اشتري اللوك كامل' : 'Buy the full look'}</button>
        </div>
      </div>}
      {quick && <QuickAddSheet slug={quick.queue[quick.i].store.slug} product={quick.queue[quick.i]} marketplace={marketplace} step={quick.queue.length > 1 ? `${quick.i + 1}/${quick.queue.length}` : ''} onAdded={nextAdd} onClose={() => setQuick(null)} />}
    </>
  );
}
