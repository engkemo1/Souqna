import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, X, TicketPercent } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi, invalidate } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import Badge from '../ui/Badge.jsx';
import { Select, Switch } from '../ui/Field.jsx';
import { useToast } from '../ui/Toast.jsx';
import { STATE_TONE, STATE_LABEL } from '../../lib/promo.js';

/**
 * "إضافة المنتج إلى عرض" section of the product form.
 * Existing product (productId): changes are saved to the offer immediately.
 * New product (productId null): choices are kept in `pending` and applied by the parent right after the product is created.
 */
export default function ProductOffers({ productId, pending = [], onPending }) {
  const { lang, tr } = useI18n();
  const p = (ar, en) => (lang === 'ar' ? ar : en);
  const toast = useToast();
  const isNew = !productId;
  const cur = useApi(isNew ? null : `/owner/promotions/for-product/${productId}`, { keepPrevious: false });
  const all = useApi(isNew ? '/owner/promotions' : null);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);

  const mutate = async (body) => {
    setBusy(true);
    try {
      await api(`/owner/promotions/for-product/${productId}`, { method: 'PUT', body });
      invalidate('/owner/promotions'); cur.reload?.();
    } catch (e) { toast({ tone: 'error', title: e.message || p('تعذر الحفظ', 'Could not save') }); } finally { setBusy(false); }
  };

  const joined = isNew
    ? (all.data?.items || []).filter((o) => pending.includes(o.id)).map((o) => ({ id: o.id, name: o.name, state: o.state, direct: true }))
    : (cur.data?.items || []);
  const options = isNew
    ? (all.data?.items || []).filter((o) => o.state !== 'expired' && !pending.includes(o.id)).map((o) => ({ id: o.id, name: o.name, state: o.state }))
    : (cur.data?.available || []).filter((o) => !o.joined);

  const add = async () => {
    const id = Number(pick); if (!id) return;
    setPick('');
    if (isNew) onPending([...pending, id]); else await mutate({ add: [id] });
  };
  const remove = async (id) => { if (isNew) onPending(pending.filter((x) => x !== id)); else await mutate({ remove: [id] }); };
  const excluded = !isNew && cur.data?.excluded;

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><TicketPercent className="h-4 w-4 text-brand" />{p('إضافة المنتج إلى عرض', 'Add this product to an offer')}</h3>
        <Link to="/dashboard/promotions/new" className="text-[13px] font-semibold text-brand hover:underline">{p('عرض جديد', 'New offer')}</Link>
      </div>
      {isNew && <p className="mt-1 text-[12.5px] text-muted">{p('هتتضاف للعروض المختارة بمجرد نشر المنتج.', 'The product joins the chosen offers as soon as it is created.')}</p>}

      {!!joined.length && (
        <ul className="mt-3 space-y-1.5">
          {joined.map((o) => (
            <li key={o.id} className="flex min-h-[44px] items-center gap-2 rounded-xl bg-fg/[0.04] px-3">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{tr(o.name)}</span>
              <Badge tone={STATE_TONE[o.state] || 'neutral'} size="sm">{STATE_LABEL[o.state]?.[lang === 'ar' ? 0 : 1]}</Badge>
              {o.direct
                ? <button type="button" disabled={busy} onClick={() => remove(o.id)} aria-label={p('إزالة', 'Remove')} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-fg/[0.08] hover:text-fg"><X className="h-4 w-4" /></button>
                : <span className="text-[11px] text-muted">{p('بالقسم/المتجر', 'via category/store')}</span>}
            </li>
          ))}
        </ul>
      )}

      {!!options.length ? (
        <div className="mt-3 flex gap-2">
          <Select value={pick} onChange={(e) => setPick(e.target.value)} size="sm" className="min-w-0 flex-1" aria-label={p('اختر عرضًا', 'Choose an offer')}>
            <option value="">{p('اختر عرضًا…', 'Choose an offer…')}</option>
            {options.map((o) => <option key={o.id} value={o.id}>{tr(o.name)}</option>)}
          </Select>
          <button type="button" onClick={add} disabled={!pick || busy} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-fg px-4 text-sm font-semibold text-canvas disabled:opacity-50"><Plus className="h-4 w-4" />{p('إضافة', 'Add')}</button>
        </div>
      ) : !joined.length && <p className="mt-3 text-sm text-muted">{p('لا توجد عروض متاحة بعد. أنشئ عرضًا أولًا.', 'No offers available yet. Create one first.')}</p>}

      {!isNew && (
        <div className="mt-4 border-t border-line pt-3">
          <Switch checked={!!excluded} disabled={busy} onChange={(v) => mutate({ exclude: v })} label={p('استبعاد المنتج من كل العروض', 'Exclude from all offers')} description={p('لن يدخل في أي عرض حتى لو كان القسم كله مشمولًا.', 'Never part of any offer, even when its whole category is.')} />
        </div>
      )}
    </div>
  );
}
