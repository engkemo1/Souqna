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
  const [quick, setQuick] = useState(null); // { queue: [card], i }

  useEffect(() => {
    let alive = true;
    setLook(null); setHidden(false); setRemoved(new Set());
    api('/stylist/smart-look', { method: 'POST', body: { productId } })
      .then((r) => { if (alive && r?.ok && r.looks?.length) setLook(r); })
      .catch(() => { /* اقتراح اختياري: لو فشل منعرضش حاجة */ });
    return () => { alive = false; };
  }, [productId]);

  if (!look || hidden) return fallback;
  const pieces = look.looks.map((l) => ({ label: l.label, p: l.items[l.pick] || l.items[0] })).filter((x) => x.p);
  const kept = pieces.filter((x) => !removed.has(x.p.id));
  const total = kept.reduce((s, x) => s + Number(x.p.price || 0), 0);
  const toggle = (id) => setRemoved((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const nextAdd = () => { if (!quick) return; if (quick.i + 1 < quick.queue.length) setQuick({ ...quick, i: quick.i + 1 }); else setQuick(null); };

  return (
    <div data-testid="smart-look" className="mt-6 rounded-2xl border border-brand/20 bg-gradient-to-br from-brand/5 via-canvas to-brand/10 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-white shadow-sm"><Sparkles className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <h4 className="font-display text-sm font-bold text-fg">{ar ? 'مودة نسّقتلك طقم يكمّل القطعة دي' : 'Moda styled a full look around this piece'}</h4>
          <p className="text-xs text-muted">{ar ? 'اقتراح اختياري — تقدر تشتري القطعة دي لوحدها، أو تضيف الطقم (وتشيل أي قطعة مش عاجباك).' : 'Optional — buy this piece alone, or add the look (and remove any piece you do not want).'}</p>
        </div>
        <button type="button" onClick={() => setHidden(true)} aria-label={ar ? 'إخفاء الاقتراح' : 'Hide suggestion'} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted transition hover:bg-secondary hover:text-fg"><X className="h-4 w-4" /></button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {pieces.map(({ label, p }) => {
          const off = removed.has(p.id);
          return (
            <div key={p.id} className={cx('min-w-0 rounded-2xl border bg-elevated p-2 transition', off ? 'border-dashed border-line opacity-50' : 'border-line')}>
              <Link to={'/s/' + p.store.slug + '/p/' + p.slug} className="block">
                <SmartImage media={p.image} ratio="4 / 5" className="overflow-hidden rounded-xl" sizes="(min-width:640px) 30vw, 44vw" />
                <p className="mt-2 text-[11px] font-semibold text-muted">{label}</p>
                <p className="line-clamp-2 min-h-[2.6em] text-[12px] font-semibold leading-snug">{tr(p.name)}</p>
                <p className="mt-1 text-sm font-bold text-sale">{formatMoney(p.price, lang)}</p>
                <p className="truncate text-[11px] text-muted">{tr(p.store.name)}</p>
              </Link>
              <button type="button" onClick={() => toggle(p.id)} className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-full border border-line-strong px-2 py-1.5 text-[11.5px] font-bold transition hover:border-fg">
                {off ? <RotateCcw className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}{off ? (ar ? 'رجّعها' : 'Put back') : (ar ? 'شيلها من الطقم' : 'Remove')}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-extrabold">{ar ? 'إجمالي القطع المقترحة: ' : 'Suggested pieces total: '}{formatMoney(total, lang)}</p>
        <button type="button" disabled={!kept.length} onClick={() => setQuick({ queue: kept.map((x) => x.p), i: 0 })} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-btn px-4 text-[13px] font-bold text-on-btn disabled:opacity-40">
          <ShoppingBag className="h-4 w-4" />{ar ? `أضف ${kept.length} قطع لسلة Twist` : `Add ${kept.length} to Twist basket`}
        </button>
      </div>
      {quick && <QuickAddSheet slug={quick.queue[quick.i].store.slug} product={quick.queue[quick.i]} marketplace step={quick.queue.length > 1 ? `${quick.i + 1}/${quick.queue.length}` : ''} onAdded={nextAdd} onClose={() => setQuick(null)} />}
    </div>
  );
}
