import { useState } from 'react';
import { Users, KeyRound, Copy, Ban, ShieldCheck, ChevronDown, MessageCircle, StickyNote, ExternalLink } from 'lucide-react';
import { PageHeader, SearchInput, FilterTabs, Pagination } from '../../components/dash/Kit.jsx';
import Button from '../../components/ui/Button.jsx';
import { ErrorState, EmptyState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { adminApi, useAdminApi, fmtMoney, waLink, ORDER_STATUS_AR } from './adminApi.js';
import ExportButton from './ExportButton.jsx';

/** Dates come both as SQLite "YYYY-MM-DD HH:MM:SS" (UTC) and as ISO strings. */
const when = (s) => {
  if (!s) return '—';
  const str = String(s);
  const d = new Date(str.includes('T') ? str : /^\d{4}-\d{2}-\d{2}$/.test(str) ? `${str}T00:00:00Z` : `${str.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? str : d.toLocaleString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const VIA_AR = { google: 'جوجل', whatsapp: 'واتساب', password: 'باسورد' };
const STATUS_TONE = { pending: 'bg-amber-100 text-amber-800', confirmed: 'bg-sky-100 text-sky-800', processing: 'bg-violet-100 text-violet-800', shipped: 'bg-sky-100 text-sky-800', delivered: 'bg-emerald-100 text-emerald-800', cancelled: 'bg-red-100 text-red-700' };
const Chip = ({ children, tone = 'bg-fg/[0.06] text-fg' }) => <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{children}</span>;

/** Block / unblock a mobile number + the team's private note. Blocking stops new orders, reservations and sign-ins with that number. */
function FlagBox({ phone, blocked, reason, note, onSaved }) {
  const toast = useToast();
  const [r, setR] = useState(reason || '');
  const [n, setN] = useState(note || '');
  const [busy, setBusy] = useState(false);
  const save = async (body, ok) => {
    setBusy(true);
    try { await adminApi(`/customers/${phone}`, { method: 'PUT', body }); toast({ title: ok }); onSaved?.(); } catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy(false);
  };
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-line bg-surface p-3">
      <label className="block text-[12px] font-semibold text-muted"><StickyNote className="me-1 inline h-3.5 w-3.5" />ملاحظة للفريق (العميل مش بيشوفها)
        <textarea value={n} onChange={(e) => setN(e.target.value)} rows={2} maxLength={1000} placeholder="مثلًا: رفض يستلم الأوردر، أو اشتكى من مقاس…" className="mt-1 w-full rounded-lg border border-line-strong bg-elevated p-2 text-sm text-fg" />
      </label>
      <Button size="xs" variant="outline" loading={busy} onClick={() => save({ note: n }, 'الملاحظة اتحفظت')}>احفظ الملاحظة</Button>
      {blocked ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 p-2 text-sm text-red-800">
          <Ban className="h-4 w-4" />محظور{reason ? `: ${reason}` : ''}
          <Button size="xs" variant="outline" icon={ShieldCheck} loading={busy} onClick={() => save({ blocked: false }, 'اتشال الحظر')}>شيل الحظر</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[200px] flex-1 text-[12px] font-semibold text-muted">سبب الحظر
            <input value={r} onChange={(e) => setR(e.target.value)} maxLength={200} placeholder="مثلًا: مستلمش الأوردر مرتين" className="mt-1 h-9 w-full rounded-lg border border-line-strong bg-elevated px-2 text-sm text-fg" />
          </label>
          <Button size="xs" variant="outline" icon={Ban} loading={busy} onClick={() => { if (window.confirm(`حظر الرقم ${phone}؟ مش هيقدر يطلب أو يحجز أو يدخل حسابه لحد ما تشيل الحظر.`)) save({ blocked: true, reason: r }, 'الرقم اتحظر'); }}>احظر الرقم</Button>
        </div>
      )}
    </div>
  );
}

function CustomerDetail({ phone, onChanged }) {
  const { data, error, reload } = useAdminApi(`/customers/${phone}`);
  if (error) return <p className="mt-3 text-sm text-sale">{error.message}</p>;
  if (!data) return <Skeleton className="mt-3 h-24 w-full rounded-xl" />;
  return (
    <div className="mt-3 space-y-3">
      {data.account && <p className="text-[13px] text-muted">عنده حساب من {when(data.account.created_at)}{data.account.email ? ` · ${data.account.email}` : ''} · آخر ظهور {when(data.account.last_seen_at)}</p>}
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead className="bg-fg/[0.04] text-muted"><tr>{['الطلب', 'المحل', 'الحالة', 'الإجمالي', 'العنوان', 'التاريخ', ''].map((x) => <th key={x} className="px-2 py-2 text-start font-semibold">{x}</th>)}</tr></thead>
          <tbody>
            {data.orders.map((o) => (
              <tr key={o.id} className="border-t border-line">
                <td className="px-2 py-2 font-mono" dir="ltr">{o.number}</td>
                <td className="px-2 py-2">{o.store}{o.delivery_by === 'pickup' ? ' (حجز)' : ''}</td>
                <td className="px-2 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[o.status] || ''}`}>{ORDER_STATUS_AR[o.status] || o.status}</span></td>
                <td className="px-2 py-2">{fmtMoney(o.total)}</td>
                <td className="px-2 py-2">{[o.governorate, o.city, o.address].filter(Boolean).join(' - ')}</td>
                <td className="px-2 py-2 whitespace-nowrap">{when(o.created_at)}</td>
                <td className="px-2 py-2"><a href={`/track/${o.track_token}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand"><ExternalLink className="h-3.5 w-3.5" />تتبع</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <FlagBox phone={phone} blocked={data.blocked} reason={data.reason} note={data.note} onSaved={() => { reload(); onChanged?.(); }} />
    </div>
  );
}

function CustomersTab() {
  const [term, setTerm] = useState('');
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const { data, error, loading, reload } = useAdminApi(`/customers?q=${encodeURIComponent(term)}&filter=${filter}&sort=${sort}&page=${page}`);
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const st = data?.stats;
  return (
    <div>
      <p className="mb-3 text-sm text-muted">كل اللي طلب أو حجز من الموقع (بحساب أو من غير حساب)، متجمّعين برقم الموبايل.</p>
      <FilterTabs value={filter} onChange={(v) => { setFilter(v); setPage(1); }} className="mb-3" options={[
        { value: '', label: 'الكل', count: st?.all }, { value: 'guests', label: 'من غير حساب', count: st?.guests },
        { value: 'cancelled', label: 'عندهم طلبات ملغية', count: st?.cancelled }, { value: 'noted', label: 'عليهم ملاحظة' }, { value: 'blocked', label: 'محظورين', count: st?.blocked },
      ]} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={term} onChange={(v) => { setTerm(v); setPage(1); }} placeholder="دوّر بالاسم أو رقم الموبايل" className="min-w-[220px] max-w-sm flex-1" />
        <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} className="h-11 rounded-xl border border-line-strong bg-elevated px-3 text-sm">
          <option value="recent">آخر طلب</option><option value="spent">الأكتر شراء</option><option value="orders">الأكتر طلبات</option><option value="cancelled">الأكتر إلغاء</option>
        </select>
      </div>
      {loading && !data ? <Skeleton className="h-40 w-full rounded-2xl" /> : !data?.items.length ? <EmptyState icon={Users} title="مفيش عملاء" body="أول ما حد يطلب أو يحجز هيظهر هنا." /> : (
        <ul className="space-y-2">
          {data.items.map((c) => (
            <li key={c.phone} className={`rounded-2xl border bg-elevated p-4 ${c.blocked ? 'border-red-300' : 'border-line'}`}>
              <button type="button" onClick={() => setOpen(open === c.phone ? null : c.phone)} className="flex w-full flex-wrap items-start justify-between gap-2 text-start">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 font-semibold">{c.name}
                    {c.has_account ? <Chip>عنده حساب</Chip> : <Chip>من غير حساب</Chip>}
                    {c.blocked && <Chip tone="bg-red-100 text-red-700">محظور</Chip>}
                    {c.note && <Chip tone="bg-amber-100 text-amber-800">ملاحظة</Chip>}
                  </p>
                  <p className="mt-0.5 text-sm text-muted"><span dir="ltr">{c.phone}</span>{c.area ? ` · ${c.area}` : ''}</p>
                  <p className="mt-1 text-[13px]">{c.orders} طلب · {c.delivered} اتسلّم · <span className={c.cancelled ? 'font-semibold text-red-700' : ''}>{c.cancelled} ملغي</span>{c.open ? ` · ${c.open} مفتوح` : ''} · {fmtMoney(c.spent)} · آخر طلب {when(c.last_order)}</p>
                </div>
                <ChevronDown className={`h-5 w-5 shrink-0 text-muted transition ${open === c.phone ? 'rotate-180' : ''}`} />
              </button>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="xs" variant="outline" icon={MessageCircle} href={waLink(c.phone, `أهلاً ${c.name}، معاك فريق Twist`)} target="_blank" rel="noreferrer">واتساب</Button>
              </div>
              {open === c.phone && <CustomerDetail phone={c.phone} onChanged={reload} />}
            </li>
          ))}
        </ul>
      )}
      <Pagination page={data?.page || 1} pages={data?.pages || 1} onChange={setPage} />
    </div>
  );
}

function AccountsTab() {
  const toast = useToast();
  const [term, setTerm] = useState('');
  const [via, setVia] = useState('');
  const [sort, setSort] = useState('new');
  const [page, setPage] = useState(1);
  const [shown, setShown] = useState({});
  const { data, error, loading, reload } = useAdminApi(`/buyers?q=${encodeURIComponent(term)}&via=${via}&sort=${sort}&page=${page}`);
  const reset = async (b) => {
    try { const r = await adminApi(`/buyers/${b.id}/reset-password`, { method: 'POST' }); setShown((s) => ({ ...s, [b.id]: r.password })); } catch (x) { toast({ tone: 'error', title: x.message }); }
  };
  const block = async (b, blocked) => {
    const reason = blocked ? window.prompt(`سبب حظر ${b.name}؟ (اختياري)`, '') : undefined;
    if (blocked && reason === null) return;
    try { await adminApi(`/buyers/${b.id}/block`, { method: 'PUT', body: { blocked, ...(reason ? { reason } : {}) } }); toast({ title: blocked ? 'الحساب اتحظر' : 'اتشال الحظر' }); reload(); } catch (x) { toast({ tone: 'error', title: x.message }); }
  };
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const st = data?.stats;
  return (
    <div>
      {st && <p className="mb-3 text-sm text-muted">{st.all} حساب · {st.new7} جديد آخر 7 أيام · {st.active7} دخلوا آخر 7 أيام · {st.buyers} منهم اشتروا</p>}
      <FilterTabs value={via} onChange={(v) => { setVia(v); setPage(1); }} className="mb-3" options={[
        { value: '', label: 'الكل', count: st?.all }, { value: 'google', label: 'جوجل', count: st?.google }, { value: 'whatsapp', label: 'واتساب', count: st?.whatsapp }, { value: 'password', label: 'باسورد', count: st?.password },
      ]} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={term} onChange={(v) => { setTerm(v); setPage(1); }} placeholder="دوّر بالاسم أو الموبايل أو الإيميل" className="min-w-[220px] max-w-sm flex-1" />
        <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} className="h-11 rounded-xl border border-line-strong bg-elevated px-3 text-sm">
          <option value="new">الأحدث تسجيلًا</option><option value="active">آخر ظهور</option><option value="spent">الأكتر شراء</option><option value="orders">الأكتر طلبات</option>
        </select>
      </div>
      {loading && !data ? <Skeleton className="h-40 w-full rounded-2xl" /> : !data?.items.length ? <EmptyState icon={Users} title="مفيش حسابات" body="لما عميل يعمل حساب هيظهر هنا." /> : (
        <ul className="space-y-2">
          {data.items.map((b) => (
            <li key={b.id} className={`rounded-2xl border bg-elevated p-4 ${b.blocked ? 'border-red-300' : 'border-line'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 font-semibold">{b.name}
                    <Chip>{VIA_AR[b.via] || b.via}</Chip>
                    {b.phone && (b.phone_verified ? <Chip tone="bg-emerald-100 text-emerald-800">الرقم متأكد</Chip> : <Chip tone="bg-amber-100 text-amber-800">الرقم مش متأكد</Chip>)}
                    {b.blocked && <Chip tone="bg-red-100 text-red-700">محظور</Chip>}
                  </p>
                  <p className="mt-0.5 text-sm text-muted">{b.phone ? <span dir="ltr">{b.phone}</span> : 'من غير رقم'}{b.email ? <> · <span dir="ltr">{b.email}</span></> : ''}</p>
                  <p className="mt-1 text-[13px]">{b.orders} طلب · {fmtMoney(b.spent)} · بيتابع {b.watches} منتج و{b.follows} محل · {b.chats} محادثة تويلا{b.push ? ' · الإشعارات مفعّلة' : ''}</p>
                  <p className="mt-0.5 text-[12px] text-muted">سجّل {when(b.created_at)} · آخر ظهور {when(b.last_seen_at)}{b.last_order_at ? ` · آخر طلب ${when(b.last_order_at)}` : ''}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {b.phone && <Button size="xs" variant="outline" icon={MessageCircle} href={waLink(b.phone, `أهلاً ${b.name}، معاك فريق Twist`)} target="_blank" rel="noreferrer">واتساب</Button>}
                  {b.via === 'password' && b.phone && <Button size="xs" variant="outline" icon={KeyRound} onClick={() => reset(b)}>باسورد مؤقت</Button>}
                  {b.blocked ? <Button size="xs" variant="outline" icon={ShieldCheck} onClick={() => block(b, false)}>شيل الحظر</Button> : <Button size="xs" variant="outline" icon={Ban} onClick={() => block(b, true)}>احظر</Button>}
                </div>
              </div>
              {shown[b.id] && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                  <span>الباسورد المؤقت (بيظهر مرة واحدة): <b dir="ltr" className="font-mono">{shown[b.id]}</b></span>
                  <Button size="xs" variant="outline" icon={Copy} onClick={() => navigator.clipboard?.writeText(shown[b.id])}>نسخ</Button>
                  <Button size="xs" variant="outline" href={waLink(b.phone, `أهلاً ${b.name}، الباسورد المؤقت لحسابك في Twist: ${shown[b.id]} (غيّره بعد الدخول)`)} target="_blank" rel="noreferrer">ابعته واتساب</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Pagination page={data?.page || 1} pages={data?.pages || 1} onChange={setPage} />
    </div>
  );
}

/** Platform admin: everyone who bought (guests too) and every shopper account, with block / note actions. */
export default function Buyers() {
  const [tab, setTab] = useState('customers');
  return (
    <div>
      <PageHeader title="العملاء والحسابات" subtitle="بيانات كل اللي اشترى أو عمل حساب. تقدر تكلمهم، تكتب ملاحظة، أو تحظر رقم عمل مشكلة (المحظور مش بيقدر يطلب أو يحجز أو يدخل حسابه)." actions={<ExportButton kind="buyers" label="تصدير الحسابات Excel" />} />
      <FilterTabs value={tab} onChange={setTab} className="mb-5" options={[{ value: 'customers', label: 'اللي اشتروا' }, { value: 'accounts', label: 'الحسابات' }]} />
      {tab === 'customers' ? <CustomersTab /> : <AccountsTab />}
    </div>
  );
}
