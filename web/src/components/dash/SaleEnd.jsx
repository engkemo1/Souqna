import { useState } from 'react';
import { Switch } from '../ui/Field.jsx';
import { cx } from '../ui/cx.js';

/* optional timed discount: presets + custom date; after it ends the price returns to the old one by itself */
export default function SaleEnd({ value, onChange, error, L, lang }) {
  const [custom, setCustom] = useState(false);
  const presets = [[1, L('يوم', '1 day')], [3, L('٣ أيام', '3 days')], [7, L('أسبوع', '1 week')], [14, L('أسبوعين', '2 weeks')], [30, L('شهر', '1 month')]];
  const toLocal = (ms) => { const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
  const on = !!value;
  return (
    <div className="rounded-2xl border border-line bg-surface p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{L('خصم لفترة محدودة', 'Limited-time discount')} <span className="text-xs font-normal text-muted">({L('اختياري', 'optional')})</span></p>
          <p className="mt-0.5 text-xs text-muted">{L('هيظهر للعميل عدّاد تنازلي، وبعد الانتهاء السعر يرجع للسعر قبل الخصم تلقائيًا.', 'Shoppers see a countdown, then the price returns to the old one automatically.')}</p>
        </div>
        <Switch checked={on} onChange={(v) => { if (v) onChange(Date.now() + 3 * 86400e3); else { onChange(null); setCustom(false); } }} aria-label={L('خصم لفترة محدودة', 'Limited-time discount')} />
      </div>
      {on && (
        <div className="mt-3 space-y-2.5">
          <div className="flex flex-wrap gap-2">
            {presets.map(([d, label]) => (
              <button key={d} type="button" onClick={() => { setCustom(false); onChange(Date.now() + d * 86400e3); }} className="rounded-full border border-line px-3 py-1.5 text-sm hover:border-brand hover:text-brand">{label}</button>
            ))}
            <button type="button" onClick={() => setCustom(true)} className={cx('rounded-full border px-3 py-1.5 text-sm', custom ? 'border-brand text-brand' : 'border-line hover:border-brand hover:text-brand')}>{L('تاريخ محدد', 'Pick a date')}</button>
          </div>
          {custom && <input type="datetime-local" min={toLocal(Date.now())} value={toLocal(value)} onChange={(e) => { const ms = new Date(e.target.value).getTime(); if (ms) onChange(ms); }} className="h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm" />}
          <p className="text-xs font-medium text-sale">{L('ينتهي: ', 'Ends: ')}{new Date(value).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en', { dateStyle: 'medium', timeStyle: 'short' })}</p>
          {error && <p className="text-xs text-sale">{error}</p>}
        </div>
      )}
    </div>
  );
}
