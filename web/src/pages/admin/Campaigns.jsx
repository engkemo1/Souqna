import { useMemo, useState } from 'react';
import { Megaphone, Copy, Check, Link2 } from 'lucide-react';
import { PageHeader, Panel, FilterTabs } from '../../components/dash/Kit.jsx';
import { ErrorState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { useAdminApi, fmtNum } from './adminApi.js';

const SOURCES = [['whatsapp', 'واتساب'], ['instagram', 'إنستجرام'], ['facebook', 'فيسبوك'], ['tiktok', 'تيك توك'], ['youtube', 'يوتيوب'], ['google', 'جوجل'], ['other', 'مصدر تاني']];
const SRC_AR = { ...Object.fromEntries(SOURCES), direct: 'دخول مباشر' };
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+/, '').slice(0, 40);
const pct = (n) => (n == null ? '—' : `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 1 }).format(n)}٪`);
const field = 'h-11 w-full rounded-xl border border-line-strong bg-elevated px-3 text-base outline-none focus:border-ring';

function LinkBuilder() {
  const stores = useAdminApi('/stores');
  const [dest, setDest] = useState('/');
  const [custom, setCustom] = useState('');
  const [src, setSrc] = useState('instagram');
  const [camp, setCamp] = useState('');
  const [copied, setCopied] = useState(false);
  const path = dest === '__custom' ? (custom.startsWith('/') ? custom : `/${custom}`) : dest;
  const url = useMemo(() => {
    if (!camp) return '';
    const qs = new URLSearchParams({ src, camp }).toString();
    return `${window.location.origin}${path}${path.includes('?') ? '&' : '?'}${qs}`;
  }, [path, src, camp]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); } catch {
      const t = document.createElement('textarea'); t.value = url; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch { /* ignore */ } t.remove();
    }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Panel title="اعمل لينك لإعلان" subtitle="حط اللينك ده في الإعلان أو البوست، ونتابع جاب كام زيارة وكام طلب">
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="mb-1 block text-xs text-muted">اللينك يفتح إيه؟</span>
          <select value={dest} onChange={(e) => setDest(e.target.value)} className={field}>
            <option value="/">الصفحة الرئيسية</option>
            {(stores.data?.stores || []).map((s) => <option key={s.slug} value={`/s/${s.slug}`}>محل: {s.name_ar}</option>)}
            <option value="/join">صفحة انضمام المحلات</option>
            <option value="__custom">صفحة تانية…</option>
          </select></label>
        <label><span className="mb-1 block text-xs text-muted">هتنزله فين؟</span>
          <select value={src} onChange={(e) => setSrc(e.target.value)} className={field}>{SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        {dest === '__custom' && <label className="sm:col-span-2"><span className="mb-1 block text-xs text-muted">المسار (مثال: /search?q=فستان)</span><input dir="ltr" value={custom} onChange={(e) => setCustom(e.target.value)} className={field} /></label>}
        <label className="sm:col-span-2"><span className="mb-1 block text-xs text-muted">اسم الحملة (حروف إنجليزي وأرقام، مثال: video-nov)</span>
          <input dir="ltr" value={camp} onChange={(e) => setCamp(slug(e.target.value))} placeholder="video-nov" className={field} /></label>
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-xl bg-fg/[0.04] p-3">
        <Link2 className="h-4 w-4 shrink-0 text-muted" />
        <p className="min-w-0 flex-1 break-all text-sm" dir="ltr">{url || 'اكتب اسم الحملة عشان اللينك يظهر'}</p>
        <button type="button" disabled={!url} onClick={copy} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-brand px-4 text-sm font-semibold text-white disabled:opacity-40">{copied ? <><Check className="h-4 w-4" />اتنسخ</> : <><Copy className="h-4 w-4" />نسخ</>}</button>
      </div>
    </Panel>
  );
}

export default function Campaigns() {
  const [days, setDays] = useState(30);
  const { data, error, loading, reload } = useAdminApi(`/campaigns?days=${days}`);
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const L = loading && !data;
  const camps = data?.campaigns || [];
  const maxV = Math.max(1, ...camps.map((c) => c.visits));
  return (
    <div>
      <PageHeader title="الحملات والإعلانات" subtitle="كل إعلان جاب كام زيارة وكام طلب"
        actions={<FilterTabs value={days} onChange={setDays} options={[{ value: 7, label: '٧ أيام' }, { value: 30, label: '٣٠ يوم' }, { value: 90, label: '٩٠ يوم' }]} />} />
      <LinkBuilder />

      <Panel title="أداء الحملات" className="mt-6" subtitle="الطلب بيتحسب للحملة لو العميل دخل من لينكها وطلب خلال ٧ أيام">
        {L ? <Skeleton className="h-40 w-full rounded-xl" /> : !camps.length ? (
          <div className="py-8 text-center text-muted"><Megaphone className="mx-auto mb-3 h-8 w-8" /><p>لسه مفيش حملات. اعمل لينك من فوق وانزله في إعلان، والأرقام هتظهر هنا.</p></div>
        ) : (
          <ul className="divide-y divide-line">
            {camps.map((c) => (
              <li key={`${c.camp}-${c.source}`} className="py-3.5">
                <div className="flex items-center gap-3">
                  <p className="min-w-0 flex-1 truncate font-semibold" dir="ltr">{c.camp}</p>
                  <span className="rounded-full bg-fg/[0.06] px-2.5 py-0.5 text-xs">{SRC_AR[c.source] || c.source}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-fg/[0.06]"><div className="h-full rounded-full bg-brand" style={{ width: `${(c.visits / maxV) * 100}%` }} /></div>
                <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted">
                  <span><b className="tabular text-fg">{fmtNum(c.visits)}</b> زيارة</span>
                  <span><b className="tabular text-fg">{fmtNum(c.orders)}</b> طلب</span>
                  <span>تحويل <b className="tabular text-fg">{pct(c.conversion)}</b></span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="الزيارات والطلبات حسب المصدر" className="mt-6" subtitle="كل المصادر، حتى اللي من غير حملة">
        {L ? <Skeleton className="h-32 w-full rounded-xl" /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[360px] text-sm">
            <thead><tr className="border-b border-line text-xs text-muted"><th className="py-2 text-start font-medium">المصدر</th><th className="font-medium">زيارات</th><th className="font-medium">طلبات</th><th className="text-end font-medium">تحويل</th></tr></thead>
            <tbody>{(data?.bySource || []).map((s) => (
              <tr key={s.source} className="border-b border-line/60 text-center tabular"><td className="py-2.5 text-start font-medium">{SRC_AR[s.source] || s.source}</td><td>{fmtNum(s.visits)}</td><td>{fmtNum(s.orders)}</td><td className="text-end">{pct(s.conversion)}</td></tr>
            ))}</tbody>
          </table></div>
        )}
        <p className="mt-3 text-xs text-muted">الطلب بيتحسب لما العميل يوصل لصفحة تأكيد الطلب. الطلب التاني في نفس الجلسة مش بيتعد تاني. التتبع بدأ من وقت النشر.</p>
      </Panel>
    </div>
  );
}
