import { Link } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';
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
  if (!data?.issues?.length) return null;
  const n = (v) => formatNumber(v, lang);
  return (
    <Panel className={className} title={ar ? 'إيه اللي ناقص في متجرك؟' : "What's missing in your store?"}>
      <ul className="divide-y divide-line">
        {data.issues.map((i) => {
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
  );
}
