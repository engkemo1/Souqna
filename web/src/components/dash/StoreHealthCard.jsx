import { Link } from 'react-router-dom';
import { ClipboardCheck, MessageCircle, AlertTriangle, Pencil } from 'lucide-react';
import { useApi } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { formatNumber } from '../../lib/format.js';
import { Panel } from './Kit.jsx';

const TEXT = {
  name: ['اسم المنتج كلمة واحدة', 'اكتب اسم أوضح: النوع + اللون أو الخامة (مثال: لانجيري شيفون قصير أسود).', 'One-word product name', 'Use type + colour or fabric, e.g. "short black chiffon lingerie".'],
  photos: ['منتجات بصورة واحدة أو من غير صور', 'المنتج بـ 3 صور على الأقل (وش، ضهر، تفصيلة) بيتباع أكتر.', 'Products with one photo or none', 'Products with 3+ photos (front, back, detail) sell better.'],
  weak: ['صور جودتها ضعيفة', 'صور أوضح وإضاءة أحسن بتفرق في الطلبات.', 'Low-quality photos', 'Brighter, sharper photos get more orders.'],
  desc: ['منتجات من غير وصف', 'سطرين عن الخامة والمقاس بيقلّلوا أسئلة العملاء.', 'Products without a description', 'Two lines about fabric and fit save customers questions.'],
};

/** "What is missing in your store": a short to-do list of weak spots, each linking straight to the products to fix. Hidden when there is nothing to fix. */
export default function StoreHealthCard({ className }) {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const { data } = useApi('/owner/store-health');
  const adminNotes = data?.adminNotes || [];
  const issues = data?.issues || [];
  if (!issues.length && !adminNotes.length) return null;
  const n = (v) => formatNumber(v, lang);
  return (
    <div className={`space-y-4 ${className || ''}`}>
      {adminNotes.length > 0 && (
        <div className="rounded-2xl border border-red-300 bg-red-50/80 p-4 sm:p-5 dark:border-red-500/30 dark:bg-red-500/10">
          <div className="flex items-center gap-2.5 text-red-900 dark:text-red-200">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
            <h2 className="text-base font-bold">
              {ar ? `ملاحظات من إدارة Twist تحتاج تعديل (${n(adminNotes.length)})` : `Notes from Twist team (${n(adminNotes.length)})`}
            </h2>
          </div>
          <ul className="mt-3 divide-y divide-red-200/70 dark:divide-red-500/20">
            {adminNotes.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/dashboard/products/${p.id}`} className="font-bold text-red-950 hover:underline dark:text-red-100">
                      {p.name}
                    </Link>
                    {p.status !== 'active' && (
                      <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
                        {ar ? 'موقوف لحين التعديل' : 'Hidden until edited'}
                      </span>
                    )}
                    {p.adminFlags?.map((f) => (
                      <span key={f} className="rounded-full bg-red-200/80 px-2 py-0.5 text-[11px] font-semibold text-red-900 dark:bg-red-500/30 dark:text-red-100">
                        {f}
                      </span>
                    ))}
                  </div>
                  {p.adminReviewNote && (
                    <p className="flex items-start gap-1.5 text-sm font-medium text-red-900 dark:text-red-200">
                      <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                      <span>{p.adminReviewNote}</span>
                    </p>
                  )}
                </div>
                <Link
                  to={`/dashboard/products/${p.id}`}
                  className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-red-600 px-3.5 text-xs font-bold text-white shadow-sm hover:bg-red-700"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {ar ? 'عدّل المنتج الآن' : 'Edit product'}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {issues.length > 0 && (
        <Panel title={ar ? 'إيه اللي ناقص في متجرك؟' : "What's missing in your store?"}>
          <ul className="divide-y divide-line">
            {issues.map((i) => {
              const [title, tip, titleEn, tipEn] = TEXT[i.key] || [];
              return (
                <li key={i.key} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-800"><ClipboardCheck className="h-4 w-4" aria-hidden="true" /></span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{ar ? title : titleEn} <span className="text-muted">({n(i.count)})</span></p>
                      <p className="mt-0.5 text-[13px] text-muted">{ar ? tip : tipEn}</p>
                      <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
                        {i.items.map((p) => <Link key={p.id} to={`/dashboard/products/${p.id}`} className="max-w-[180px] truncate font-medium text-brand hover:underline">{p.name}</Link>)}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}
