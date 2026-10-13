import { useState } from 'react';
import { Users, KeyRound, Copy } from 'lucide-react';
import { PageHeader, SearchInput } from '../../components/dash/Kit.jsx';
import Button from '../../components/ui/Button.jsx';
import { ErrorState, EmptyState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { adminApi, useAdminApi, fmtDateTime, waLink } from './adminApi.js';

export default function Buyers() {
  const [term, setTerm] = useState('');
  const toast = useToast();
  const { data, error, loading, reload } = useAdminApi(`/buyers?q=${encodeURIComponent(term)}`);
  const [shown, setShown] = useState({});
  const reset = async (b) => {
    try { const r = await adminApi(`/buyers/${b.id}/reset-password`, { method: 'POST' }); setShown((s) => ({ ...s, [b.id]: r.password })); } catch (x) { toast({ tone: 'error', title: x.message }); }
  };
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  return (
    <div>
      <PageHeader title="حسابات العملاء" subtitle={`عدد الحسابات: ${data?.total ?? '…'}. لو عميل نسي الباسورد: دوّر برقمه واعمله باسورد مؤقت وابعتهوله على واتساب.`} />
      <SearchInput value={term} onChange={setTerm} placeholder="دوّر برقم الموبايل" className="mb-4 max-w-sm" />
      {loading && !data ? <Skeleton className="h-40 w-full rounded-2xl" /> : !data?.items.length ? <EmptyState icon={Users} title="مفيش حسابات" body="الحسابات اختيارية. لما عميل يعمل حساب هيظهر هنا." /> : (
        <ul className="space-y-2">
          {data.items.map((b) => (
            <li key={b.id} className="rounded-2xl border border-line bg-elevated p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><p className="font-semibold">{b.name}</p><p className="text-sm text-muted"><span dir="ltr">{b.phone}</span> · {b.orders} طلب · {fmtDateTime(b.created_at)}</p></div>
                <Button size="xs" variant="outline" icon={KeyRound} onClick={() => reset(b)}>باسورد مؤقت</Button>
              </div>
              {shown[b.id] && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                  <span>الباسورد المؤقت (بيظهر مرة واحدة): <b dir="ltr" className="font-mono">{shown[b.id]}</b></span>
                  <Button size="xs" variant="outline" icon={Copy} onClick={() => navigator.clipboard?.writeText(shown[b.id])}>نسخ</Button>
                  <Button size="xs" variant="outline" href={waLink(b.phone, `أهلاً ${b.name}، الباسورد المؤقت لحسابك في طِلّة: ${shown[b.id]} (غيّره بعد الدخول)`)} target="_blank" rel="noreferrer">ابعته واتساب</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
