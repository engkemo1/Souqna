import { useState } from 'react';
import { Eye, ShoppingBag, Banknote, Gift, Info } from 'lucide-react';
import { useApi } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney, formatNumber } from '../../lib/format.js';
import { Panel, KpiCard } from '../dash/Kit.jsx';
import Sheet from '../ui/Sheet.jsx';
import { Segmented } from '../ui/Field.jsx';
import { ErrorState } from '../ui/States.jsx';

const ACTION = {
  created: ['تم الإنشاء', 'Created'], updated: ['تم التعديل', 'Edited'], activated: ['تم التفعيل', 'Activated'], paused: ['تم الإيقاف', 'Paused'],
  drafted: ['رجوع لمسودة', 'Back to draft'], duplicated: ['تم النسخ', 'Duplicated'], deleted: ['تم الحذف', 'Deleted'],
};
const FIELD = {
  name_ar: ['الاسم', 'name'], name_en: ['الاسم بالإنجليزية', 'English name'], status: ['الحالة', 'status'], def: ['قواعد العرض', 'rules'], rules: ['قواعد العرض', 'rules'], products: ['المنتجات', 'products'],
  starts_at: ['البداية', 'start'], ends_at: ['النهاية', 'end'], usage_limit: ['حد الاستخدام', 'usage limit'], per_customer_limit: ['حد لكل عميل', 'per-customer limit'],
  audience: ['الفئة المستهدفة', 'audience'], stacking: ['التجميع', 'stacking'], priority: ['الأولوية', 'priority'], image: ['الصورة', 'image'],
};

/** Merchant analytics. "Views" are impressions of the offer; "Orders" are real conversions: the two are never mixed. */
export function PromoAnalytics({ promotionId = null }) {
  const { lang, tr } = useI18n();
  const p = (ar, en) => (lang === 'ar' ? ar : en);
  const [days, setDays] = useState(30);
  const { data, error, loading, reload } = useApi(`/owner/promotions/analytics?days=${days}`);
  const items = (data?.items || []).filter((i) => !promotionId || i.id === promotionId);
  const tot = promotionId ? items[0] && { ...items[0] } : data?.totals;
  const money = (v) => formatMoney(v || 0, lang);
  return (
    <Panel title={p('أداء العروض', 'Offer performance')}
      action={<Segmented size="sm" value={days} onChange={setDays} options={[{ value: 7, label: p('7 أيام', '7d') }, { value: 30, label: p('30 يوم', '30d') }, { value: 90, label: p('90 يوم', '90d') }]} />}>
      {error ? <ErrorState error={error} onRetry={reload} /> : (
        <>
          <div className={`grid grid-cols-2 gap-3 ${promotionId ? '' : 'lg:grid-cols-5'}`}>
            <KpiCard label={p('مشاهدات العرض', 'Views')} value={tot?.views || 0} icon={Eye} loading={loading && !data} />
            <KpiCard label={p('طلبات فعلية', 'Orders')} value={tot?.orders || 0} icon={ShoppingBag} tone="brand" loading={loading && !data} />
            <KpiCard label={p('إيراد العروض', 'Offer revenue')} value={tot?.revenue || 0} format={money} icon={Banknote} tone="sky" loading={loading && !data} />
            <KpiCard label={p('تكلفة الخصم', 'Discount cost')} value={tot?.discountCost || 0} format={money} icon={Banknote} tone="accent" loading={loading && !data} />
            <KpiCard label={p('تكلفة الهدايا', 'Gift cost')} value={tot?.giftCost || 0} format={money} icon={Gift} tone="violet" loading={loading && !data} />
          </div>
          <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{p('المشاهدات = عدد مرات ظهور العرض للزوّار (مرة لكل جلسة). الطلبات = طلبات غير ملغاة حصلت على العرض فعلًا. نسبة التحويل = الطلبات ÷ المشاهدات. الإيراد بعد الخصم وبعد خصم المرتجعات.', 'Views = times the offer was shown to visitors (once per session). Orders = non-cancelled orders that actually received the offer. Conversion = orders ÷ views. Revenue is after discounts and refunds.')}</span>
          </p>
          {!promotionId && !!items.length && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-xs text-muted"><tr className="text-start">
                  <th className="py-2 text-start font-medium">{p('العرض', 'Offer')}</th><th className="text-end font-medium">{p('مشاهدات', 'Views')}</th><th className="text-end font-medium">{p('طلبات', 'Orders')}</th>
                  <th className="text-end font-medium">{p('تحويل', 'Conv.')}</th><th className="text-end font-medium">{p('إيراد', 'Revenue')}</th><th className="text-end font-medium">{p('خصم', 'Discount')}</th><th className="text-end font-medium">{p('هدايا', 'Gifts')}</th>
                </tr></thead>
                <tbody className="divide-y divide-line tabular">
                  {items.map((i) => (
                    <tr key={i.id}>
                      <td className="max-w-[220px] truncate py-2 font-medium">{tr(i.name)}</td><td className="text-end">{formatNumber(i.views, lang)}</td><td className="text-end">{formatNumber(i.orders, lang)}</td>
                      <td className="text-end">{i.conversion != null ? `${i.conversion}%` : '—'}</td><td className="text-end">{money(i.revenue)}</td><td className="text-end">{money(i.discountCost)}</td><td className="text-end">{money(i.giftCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

const describe = (h, lang) => {
  const a = ACTION[h.action] || [h.action, h.action];
  const base = lang === 'ar' ? a[0] : a[1];
  const ch = h.detail?.changed;
  if (h.action === 'updated' && ch?.length) return `${base}: ${ch.map((k) => (FIELD[k] ? FIELD[k][lang === 'ar' ? 0 : 1] : k)).join('، ')}`.replace(/، /g, lang === 'ar' ? '، ' : ', ');
  return base;
};

/** Change log: who created, edited, activated, paused or deleted an offer, and when. */
export function PromoHistorySheet({ open, onClose, promotionId = null }) {
  const { lang } = useI18n();
  const p = (ar, en) => (lang === 'ar' ? ar : en);
  const { data, error, loading, reload } = useApi(open ? `/owner/promotions/history?limit=100${promotionId ? `&promotionId=${promotionId}` : ''}` : null);
  const items = data?.items || [];
  return (
    <Sheet open={open} onClose={onClose} title={p('سجل التغييرات', 'Change history')} size="md">
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <p className="py-8 text-center text-sm text-muted">…</p> : !items.length ? (
        <p className="py-8 text-center text-sm text-muted">{p('لا توجد تغييرات مسجلة بعد.', 'No changes recorded yet.')}</p>
      ) : (
        <ol className="space-y-3">
          {items.map((h) => (
            <li key={h.id} className="rounded-xl border border-line p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="font-semibold">{describe(h, lang)}</span>
                <time className="shrink-0 text-xs text-muted tabular" dir="ltr">{String(h.at).slice(0, 16).replace('T', ' ')}</time>
              </div>
              {!promotionId && h.name && <p className="mt-0.5 truncate text-[13px] text-muted">{h.name}</p>}
              {h.actor && <p className="mt-0.5 text-xs text-muted">{p('بواسطة', 'By')} {h.actor}</p>}
            </li>
          ))}
        </ol>
      )}
    </Sheet>
  );
}

