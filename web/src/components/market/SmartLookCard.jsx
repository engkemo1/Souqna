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

  useEffect(() => {
    let alive = true;
    setLook(null); setHidden(false); setRemoved(new Set()); setPicks({});
    api('/stylist/smart-look', { method: 'POST', body: { productId } })
      .then((r) => { if (alive && r?.ok && r.looks?.length) setLook(r); })
      .catch(() => { /* اقتراح اختياري: لو فشل منعرضش حاجة */ });
    return () => { alive = false; };
  }, [productId]);

  if (!look || hidden) return fallback;
  const pieces = look.looks.map((l, i) => ({ label: l.label, i, n: l.items.length, p: l.items[picks[i] ?? l.pick] || l.items[0] })).filter((x) => x.p);
  const swap = (i, n) => setPicks((cur) => ({ ...cur, [i]: ((cur[i] ?? 0) + 1) % n }));
  const kept = pieces.filter((x) => !removed.has(x.p.id));
  const total = kept.reduce((s, x) => s + Number(x.p.price || 0), 0);
  const toggle = (id) => setRemoved((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const nextAdd = () => { if (!quick) return; if (quick.i + 1 < quick.queue.length) setQuick({ ...quick, i: quick.i + 1 }); else setQuick(null); };

  return (
    <section data-testid="smart-look" className="mt-4 rounded-2xl border border-line bg-elevated p-3 sm:p-3.5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
        <h4 className="min-w-0 flex-1 truncate font-display text-sm font-bold text-fg">{ar ? 'كمّل اللوك' : 'Complete the look'} <span className="font-normal text-muted">· {ar ? `${pieces.length} قطع تليق معاها` : `${pieces.length} pieces that go with it`}</span></h4>
        <button type="button" onClick={() => setHidden(true)} aria-label={ar ? 'إخفاء الاقتراح' : 'Hide suggestion'} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted transition hover:bg-secondary hover:text-fg"><X className="h-4 w-4" /></button>
      </div>

      {/* Pinterest-style board: the pieces tiled like an outfit flat-lay — first piece large, the rest stacked beside it */}
      <div className={cx('mt-2.5 grid h-[12.5rem] gap-1.5 overflow-hidden rounded-2xl bg-secondary/60 p-1.5 sm:h-[15rem]', pieces.length === 1 ? 'grid-cols-1' : pieces.length === 2 ? 'grid-cols-2' : 'grid-cols-[1.2fr_1fr]')} style={pieces.length >= 3 ? { gridTemplateRows: `repeat(${pieces.length - 1}, minmax(0, 1fr))` } : undefined}>
        {pieces.map(({ label, p, i, n }, k) => {
          const off = removed.has(p.id);
          return (
            <div key={p.id} className={cx('group relative min-h-0 overflow-hidden rounded-xl bg-white shadow-sm transition', pieces.length >= 3 && k === 0 && 'row-span-full', off && 'opacity-40')}>
              <Link to={'/s/' + p.store.slug + '/p/' + p.slug} className="block h-full w-full"><SmartImage media={p.image} alt={tr(p.name)} className="h-full w-full" sizes="(min-width:640px) 28vw, 56vw" /></Link>
              <span className="pointer-events-none absolute start-1.5 top-1.5 max-w-[70%] truncate rounded-full bg-white/95 px-2 py-0.5 text-[10.5px] font-bold shadow-sm">{label}</span>
              <button type="button" onClick={() => toggle(p.id)} aria-label={off ? (ar ? 'رجّعها' : 'Put back') : (ar ? 'شيلها من الطقم' : 'Remove')} className="absolute end-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-white/95 text-fg shadow-sm transition hover:bg-white">
                {off ? <RotateCcw className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              </button>
              <div className="pointer-events-none absolute inset-x-1.5 bottom-1.5 flex items-end justify-between gap-1">
                <span className="rounded-full bg-fg/80 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur">{formatMoney(p.price, lang)}</span>
                {n > 1 && <button type="button" onClick={() => swap(i, n)} className="pointer-events-auto rounded-full bg-white/95 px-2 py-0.5 text-[10.5px] font-bold text-fg shadow-sm transition hover:bg-white">{ar ? 'غيّرها' : 'Swap'}</button>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-line pt-2.5">
        <div className="min-w-0">
          <p className="text-[11px] text-muted">{ar ? `إجمالي ${kept.length} قطع` : `Total · ${kept.length} pieces`}</p>
          <p className="text-base font-extrabold leading-tight">{formatMoney(total, lang)}</p>
        </div>
        <button type="button" disabled={!kept.length} onClick={() => setQuick({ queue: kept.map((x) => x.p), i: 0 })} className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-btn px-4 text-[13px] font-bold text-on-btn disabled:opacity-40">
          <ShoppingBag className="h-4 w-4" />{ar ? 'أضف الطقم للسلة' : 'Add look to basket'}
        </button>
      </div>
      {quick && <QuickAddSheet slug={quick.queue[quick.i].store.slug} product={quick.queue[quick.i]} marketplace step={quick.queue.length > 1 ? `${quick.i + 1}/${quick.queue.length}` : ''} onAdded={nextAdd} onClose={() => setQuick(null)} />}
    </section>
  );
}
