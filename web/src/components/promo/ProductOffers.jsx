import { useState } from 'react';
import { Check, X, Plus, Sparkles } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi, invalidate } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useDashBase } from '../../lib/dashBase.js';
import { formatMoney } from '../../lib/format.js';
import { cx } from '../ui/cx.js';
import { Switch } from '../ui/Field.jsx';
import { useToast } from '../ui/Toast.jsx';
import { blankOffer, formToBody } from '../../lib/promo.js';

/** Egypt wall-clock "YYYY-MM-DDTHH:mm" N days from now (offers are stored in Cairo time). */
const cairoIn = (days) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(Date.now() + days * 86400e3).map((x) => [x.type, x.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};
const DAYS = { 3: ['٣ أيام', '3 days'], 7: ['أسبوع', '1 week'], 30: ['شهر', '1 month'] };
export const quickLabel = (s, p) => p(`خصم ${s.percent}%`, `${s.percent}% off`) + (s.days ? ' · ' + p(DAYS[s.days]?.[0] || `${s.days} أيام`, DAYS[s.days]?.[1] || `${s.days} days`) : '');

/** Creates a one-product "percent off" offer. Used at once for saved products, or right after save for new ones. */
export async function createQuickOffer(spec, productId, nameHint = '') {
  const f = blankOffer('percentage');
  const base = `خصم ${spec.percent}%`;
  f.name_ar = (nameHint ? `${base} — ${nameHint}` : base).slice(0, 80);
  f.status = 'active';
  f.ends_at = spec.days ? cairoIn(spec.days) : '';
  f.def.qualify = { all: false, products: [productId], categories: [] };
  f.def.effect = { kind: 'percent_off', percent: spec.percent, apply_to: 'all' };
  return api('/owner/promotions', { method: 'POST', body: { ...formToBody(f), status: 'active' } });
}

const chip = (on) => cx('min-h-[40px] rounded-full border px-4 text-sm font-semibold transition', on ? 'border-brand bg-brand text-white shadow-sm' : 'border-line bg-canvas hover:border-brand/60');

/**
 * Offers on a product, kept light: make a quick "% off" offer in two taps, or tap an existing offer to join it.
 * Saved product: applies immediately. New product: waits in `pending` / `quick` and applies right after it is created.
 */
export default function ProductOffers({ productId, pending = [], onPending, quick = [], onQuick, price, hasSale = false, nameHint = '' }) {
  const { lang, tr } = useI18n();
  const p = (ar, en) => (lang === 'ar' ? ar : en);
  const toast = useToast();
  const base = useDashBase();
  const isNew = !productId;
  const cur = useApi(isNew ? null : `/owner/promotions/for-product/${productId}`, { keepPrevious: false });
  const all = useApi(isNew ? '/owner/promotions' : null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [spec, setSpec] = useState({ percent: 20, days: 7 });

  const mutate = async (body) => {
    setBusy(true);
    try { await api(`/owner/promotions/for-product/${productId}`, { method: 'PUT', body }); invalidate('/owner/promotions'); cur.reload?.(); }
    catch (e) { toast({ tone: 'error', title: e.message || p('تعذر الحفظ', 'Could not save') }); } finally { setBusy(false); }
  };

  const rows = isNew
    ? (all.data?.items || []).filter((o) => o.state !== 'expired').map((o) => ({ ...o, on: pending.includes(o.id), direct: true }))
    : [...(cur.data?.items || []).map((o) => ({ ...o, on: true })), ...(cur.data?.available || []).filter((o) => !o.joined).map((o) => ({ ...o, on: false, direct: true }))];

  const toggle = async (o) => {
    if (busy || (o.on && !o.direct)) return;
    if (isNew) onPending(o.on ? pending.filter((x) => x !== o.id) : [...pending, o.id]);
    else await mutate(o.on ? { remove: [o.id] } : { add: [o.id] });
  };
  const excluded = !isNew && cur.data?.excluded;

  const create = async () => {
    if (isNew) { onQuick([...quick, spec]); setOpen(false); return; }
    setBusy(true);
    try {
      await createQuickOffer(spec, productId, nameHint);
      invalidate('/owner/promotions'); cur.reload?.(); setOpen(false);
      toast({ title: p('تم تفعيل العرض', 'Offer is live') });
    } catch (e) { toast({ tone: 'error', title: e.message || p('تعذر إنشاء العرض', 'Could not create the offer') }); } finally { setBusy(false); }
  };

  const after = price ? Math.round(price * (1 - spec.percent / 100)) : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      <div className="flex items-center gap-3 bg-gradient-to-l from-brand/10 to-transparent px-4 py-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand"><Sparkles className="h-5 w-5" /></span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold">{p('عرض على المنتج', 'Offer')} <span className="text-xs font-normal text-muted">({p('اختياري', 'optional')})</span></h3>
          <p className="text-[12.5px] text-muted">{p('خصم سريع في خطوتين، أو انضم لعرض موجود.', 'A quick discount in two taps, or join an existing offer.')}</p>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {!!quick.length && quick.map((s, i) => (
          <div key={i} className="flex min-h-[48px] items-center gap-2 rounded-xl bg-brand/10 px-3.5 text-sm font-semibold text-brand">
            <Check className="h-4 w-4" /><span className="flex-1">{quickLabel(s, p)}</span>
            <button type="button" onClick={() => onQuick(quick.filter((_, j) => j !== i))} aria-label={p('إزالة', 'Remove')} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-brand/15"><X className="h-4 w-4" /></button>
          </div>
        ))}

        {!!rows.length && (
          <div className="flex flex-wrap gap-2">
            {rows.map((o) => (
              <button key={o.id} type="button" onClick={() => toggle(o)} disabled={busy || (o.on && !o.direct)} aria-pressed={o.on}
                title={o.on && !o.direct ? p('داخل بالقسم أو المتجر', 'Included via category/store') : undefined}
                className={cx('inline-flex min-h-[40px] max-w-full items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition', o.on ? 'border-brand bg-brand/10 text-brand' : 'border-line hover:border-brand/60')}>
                {o.on ? <Check className="h-4 w-4 shrink-0" /> : <Plus className="h-4 w-4 shrink-0 text-muted" />}<span className="truncate">{tr(o.name)}</span>
              </button>
            ))}
          </div>
        )}

        {!open ? (
          <button type="button" onClick={() => setOpen(true)} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-fg text-[15px] font-semibold text-canvas"><Plus className="h-4 w-4" />{p('اعمل خصم سريع', 'Quick discount')}</button>
        ) : (
          <div className="space-y-3.5 rounded-2xl bg-fg/[0.04] p-4">
            <div>
              <p className="mb-2 text-xs font-medium text-muted">{p('نسبة الخصم', 'Discount')}</p>
              <div className="flex flex-wrap gap-2">{[10, 20, 30, 50].map((v) => <button key={v} type="button" onClick={() => setSpec({ ...spec, percent: v })} className={chip(spec.percent === v)}>{v}%</button>)}</div>
              {hasSale && <p className="mt-2.5 rounded-xl bg-sale/10 px-3 py-2 text-[12.5px] text-sale">{p('المنتج عليه خصم بالفعل — العرض هيتحسب فوقه والعميل هياخد الخصمين.', 'This product already has a discount — the offer stacks on top of it.')}</p>}
              {after > 0 && <p className="mt-2.5 text-sm">{p('السعر هيبقى', 'Price becomes')} <b className="tabular-nums text-sale">{formatMoney(after, lang)}</b> <span className="text-xs text-muted line-through tabular-nums">{formatMoney(price, lang)}</span></p>}
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted">{p('لمدة', 'For')}</p>
              <div className="flex flex-wrap gap-2">
                {[[3], [7], [30], [0]].map(([d]) => <button key={d} type="button" onClick={() => setSpec({ ...spec, days: d })} className={chip(spec.days === d)}>{d ? p(...DAYS[d]) : p('بدون نهاية', 'No end')}</button>)}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={create} disabled={busy} className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand text-[15px] font-semibold text-white disabled:opacity-50"><Check className="h-4 w-4" />{isNew ? p('تمام', 'Done') : p('فعّل العرض', 'Start offer')}</button>
              <button type="button" onClick={() => setOpen(false)} className="h-12 rounded-xl border border-line px-4 text-sm">{p('إلغاء', 'Cancel')}</button>
            </div>
          </div>
        )}

        <a href={`${base}/promotions/new`} target="_blank" rel="noreferrer" className="block text-center text-[12.5px] text-muted hover:text-brand">{p('عروض أكتر تفصيلًا (اشتري X واحصل على Y…)', 'More offer types (Buy X Get Y…)')}</a>

        {!isNew && (
          <div className="border-t border-line pt-3">
            <Switch checked={!!excluded} disabled={busy} onChange={(v) => mutate({ exclude: v })} label={p('استبعاد المنتج من كل العروض', 'Exclude from all offers')} />
          </div>
        )}
      </div>
    </div>
  );
}
