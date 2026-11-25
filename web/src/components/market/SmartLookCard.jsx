import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ShoppingBag, X, RotateCcw } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';
import QuickAddSheet from '../store/QuickAddSheet.jsx';
import SmartImage from '../ui/SmartImage.jsx';
import { cx } from '../ui/cx.js';

/**
 * اقتراح اختياري في صفحة المنتج: «طقم كامل يكمّل القطعة دي».
 * السيرفر بيرد بطقم بس لو كامل ومتناسق (ok:true)، وغير كده الكارت مش بيظهر خالص ويظهر `fallback` (زرار «اسأل تويلا»).
 * العميل بيشيل أي قطعة مش عاجباه قبل الإضافة، والإضافة بتروح لسلة Twist (شحنة واحدة من كذا محل).
 */
export default function SmartLookCard({ productId, fallback = null }) {
  const { tr, lang } = useI18n();
  const ar = lang === 'ar';
  const [look, setLook] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [removed, setRemoved] = useState(() => new Set());
  const [picks, setPicks] = useState({}); // index القطعة → رقم البديل المختار
  const [quick, setQuick] = useState(null); // { queue: [card], i }
  const [seen, setSeen] = useState(() => new Set()); // every piece id shown so far, so «another look» never repeats one
  const [busy, setBusy] = useState(false);
  const [noMore, setNoMore] = useState(false);

  useEffect(() => {
    let alive = true;
    setLook(null); setHidden(false); setRemoved(new Set()); setPicks({}); setSeen(new Set()); setNoMore(false);
    api('/stylist/smart-look', { method: 'POST', body: { productId } })
      .then((r) => { if (alive && r?.ok && r.looks?.length) { setLook(r); setSeen(new Set(r.looks.flatMap((l) => l.items.map((x) => x.id)))); } })
      .catch(() => { /* اقتراح اختياري: لو فشل منعرضش حاجة */ });
    return () => { alive = false; };
  }, [productId]);

  if (!look || hidden) return fallback;
  const pieces = look.looks.map((l, i) => ({ label: l.label, i, n: l.items.length, p: l.items[picks[i] ?? l.pick] || l.items[0] })).filter((x) => x.p);
  const track = (event, extra = {}) => { api('/stylist/smart-look/event', { method: 'POST', body: { productId, event, ...extra } }).catch(() => {}); }; // feedback for the quality bar; never blocks the UI
  const swap = (i, n) => { track('swap', { pieceId: pieces.find((x) => x.i === i)?.p?.id }); setPicks((cur) => ({ ...cur, [i]: ((cur[i] ?? 0) + 1) % n })); };
  const kept = pieces.filter((x) => !removed.has(x.p.id));
  const total = kept.reduce((s, x) => s + Number(x.p.price || 0), 0);
  const toggle = (id) => { track(removed.has(id) ? 'restore' : 'remove', { pieceId: id }); setRemoved((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };
  const anotherLook = async () => {
    if (busy) return;
    setBusy(true); setNoMore(false); track('another');
    try {
      const r = await api('/stylist/smart-look', { method: 'POST', body: { productId, exclude: [...seen].slice(-40) } });
      if (r?.ok && r.looks?.length) { setLook(r); setRemoved(new Set()); setPicks({}); setSeen((cur) => new Set([...cur, ...r.looks.flatMap((l) => l.items.map((x) => x.id))])); } else setNoMore(true);
    } catch { setNoMore(true); }
    setBusy(false);
  };
  // children's pieces carry the recommended size the look was verified for (never the generic word "أطفال")
  const sizeText = (rec) => (rec?.size ? `${ar ? 'المقاس المتاح' : 'Available size'}: ${rec.size}${Number(rec.left) === 1 ? (ar ? ' · متبقي قطعة واحدة' : ' · 1 left') : ''}` : '');
  const nextAdd = () => { if (!quick) return; if (quick.i + 1 < quick.queue.length) setQuick({ ...quick, i: quick.i + 1 }); else setQuick(null); };

  return (
    <section data-testid="smart-look" className="mt-4 rounded-2xl border border-line bg-elevated p-3 sm:p-3.5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
        <h4 className="min-w-0 flex-1 truncate font-display text-sm font-bold text-fg">{ar ? 'كمّل اللوك' : 'Complete the look'} <span className="font-normal text-muted">· {ar ? `${pieces.length} قطع تليق معاها` : `${pieces.length} pieces that go with it`}</span></h4>
        <button type="button" onClick={() => setHidden(true)} aria-label={ar ? 'إخفاء الاقتراح' : 'Hide suggestion'} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted transition hover:bg-secondary hover:text-fg"><X className="h-4 w-4" /></button>
      </div>

      {look.anchorRec?.size && <p data-testid="look-anchor-size" className="mt-1 text-[11px] text-muted">{ar ? 'الطقم متظبط على' : 'Look matched to'} {look.anchorRec.size}</p>}
      {/* Outfit strip: every piece is shown at the same, clearly readable size (4:5 photo, name chip, price, swap) — compact, no overlays covering the picture */}
      <div className={cx('mt-2.5 grid gap-2', pieces.length <= 3 ? (pieces.length === 1 ? 'grid-cols-1' : pieces.length === 2 ? 'grid-cols-2' : 'grid-cols-3') : pieces.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3')}>
        {pieces.map(({ label, p, i, n }) => {
          const off = removed.has(p.id);
          return (
            <div key={p.id} className={cx('min-w-0 transition', off && 'opacity-40')}>
              <div className="relative">
                <Link to={'/s/' + p.store.slug + '/p/' + p.slug} className="block"><SmartImage media={p.image} alt={tr(p.name)} ratio="4 / 5" className="w-full rounded-xl bg-secondary" sizes="(min-width:640px) 14vw, 30vw" /></Link>
                <button type="button" onClick={() => toggle(p.id)} aria-label={off ? (ar ? 'رجّعها' : 'Put back') : (ar ? 'شيلها من الطقم' : 'Remove')} className="absolute end-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-white/95 text-fg shadow-sm transition hover:bg-white">
                  {off ? <RotateCcw className="h-3 w-3" /> : <X className="h-3 w-3" />}
                </button>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-1">
                <span className="min-w-0 truncate text-[11.5px] font-bold text-fg">{label}</span>
                {n > 1 && <button type="button" onClick={() => swap(i, n)} className="shrink-0 text-[11px] font-bold text-brand underline-offset-2 hover:underline">{ar ? 'غيّرها' : 'Swap'}</button>}
              </div>
              <p className="text-[12px] font-extrabold tabular leading-tight text-fg">{formatMoney(p.price, lang)}</p>
              {p.rec?.size && <p data-testid="look-size" className="mt-0.5 text-[10.5px] leading-snug text-muted">{sizeText(p.rec)}</p>}
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <button type="button" onClick={anotherLook} disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-secondary px-3 text-[12px] font-bold text-fg transition hover:bg-line disabled:opacity-60"><RotateCcw className={cx('h-3.5 w-3.5', busy && 'animate-spin')} />{ar ? 'طقم تاني' : 'Another look'}</button>
        {noMore && <span className="text-[11.5px] text-muted">{ar ? 'مفيش طقم تاني مناسب دلوقتي' : 'No other good look right now'}</span>}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-line pt-2.5">
        <div className="min-w-0">
          <p className="text-[11px] text-muted">{ar ? `إجمالي ${kept.length} قطع` : `Total · ${kept.length} pieces`}</p>
          <p className="text-base font-extrabold leading-tight">{formatMoney(total, lang)}</p>
        </div>
        <button type="button" disabled={!kept.length} onClick={() => { track('add_all', { ids: kept.map((x) => x.p.id) }); setQuick({ queue: kept.map((x) => x.p), i: 0 }); }} className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-btn px-4 text-[13px] font-bold text-on-btn disabled:opacity-40">
          <ShoppingBag className="h-4 w-4" />{ar ? 'أضف الطقم للسلة' : 'Add look to basket'}
        </button>
      </div>
      {quick && <QuickAddSheet slug={quick.queue[quick.i].store.slug} product={quick.queue[quick.i]} marketplace step={quick.queue.length > 1 ? `${quick.i + 1}/${quick.queue.length}` : ''} onAdded={nextAdd} onClose={() => setQuick(null)} />}
    </section>
  );
}
