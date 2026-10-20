import { useCallback, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, KeyRound, FileUp, Copy } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { Select, Input } from '../../components/ui/Field.jsx';
import { adminApi, adminKey, adminSession, AdminError, useAdminApi, fmtDateTime } from './adminApi.js';

const REASONS = {
  no_key: 'بدون كود أو باركود',
  duplicate_in_file: 'مكرر في الملف',
  bad_quantity: 'كمية غير صالحة',
  ambiguous: 'الكود مكرر عند المحل',
  has_variants: 'المنتج له مقاسات/ألوان: استخدم كود المقاس',
  not_found: 'غير موجود عند المحل',
  not_tracked: 'المحل لا يتابع مخزون المنتج ده',
};
const FIELD_LABELS = [['sku', 'كود الصنف (SKU)'], ['barcode', 'الباركود'], ['stock', 'الكمية (مطلوب)'], ['name', 'الاسم (للعرض)'], ['price', 'السعر (للمقارنة فقط)']];

/** Colours are stored as hex codes: show a dot instead of "#FF0000". */
const Piece = ({ c }) => (
  <span className="inline-flex items-center gap-1.5">
    {c.color && /^#[0-9a-f]{6}$/i.test(c.color) && <span className="inline-block h-3 w-3 rounded-full ring-1 ring-fg/20" style={{ background: c.color }} />}
    <span>{c.name}</span>{c.size ? <span className="text-muted">/ {c.size}</span> : null}
  </span>
);

async function postForm(path, form) {
  let res;
  try { res = await fetch(`/api/admin${path}`, { method: 'POST', headers: { 'x-admin-key': adminKey.get(), 'x-admin-session': adminSession.get() }, body: form }); }
  catch { throw new AdminError(0, 'network', 'مفيش اتصال بالسيرفر'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = data?.error || {}; throw new AdminError(res.status, e.code || 'error', e.message || 'حصل خطأ', e.fields); }
  return data;
}

function KeyBox({ slug, info, onChanged }) {
  const toast = useToast();
  const [fresh, setFresh] = useState('');
  const [busy, setBusy] = useState(false);
  const make = async () => {
    if (info && !window.confirm('تجديد المفتاح هيوقّف المفتاح القديم فوراً. متأكد؟')) return;
    setBusy(true);
    try { const r = await adminApi(`/cashier-sync/stores/${slug}/key`, { method: 'POST' }); setFresh(r.key); onChanged(); }
    catch (x) { toast({ tone: 'error', title: x.message }); } finally { setBusy(false); }
  };
  const revoke = async () => {
    if (!window.confirm('إلغاء المفتاح هيوقّف أي كاشير بيستخدمه. متأكد؟')) return;
    setBusy(true);
    try { await adminApi(`/cashier-sync/stores/${slug}/key`, { method: 'DELETE' }); setFresh(''); onChanged(); }
    catch (x) { toast({ tone: 'error', title: x.message }); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2 rounded-xl border border-fg/10 p-3">
      <p className="flex items-center gap-2 font-medium"><KeyRound className="h-4 w-4" /> مفتاح الربط (API)</p>
      <p className="text-xs text-muted">
        {info ? <>المفتاح الحالي يبدأ بـ <span dir="ltr" className="font-mono">{info.prefix}…</span> · اتعمل {fmtDateTime(info.createdAt)} · آخر استخدام: {info.lastUsedAt ? fmtDateTime(info.lastUsedAt) : 'لم يُستخدم بعد'}</> : 'مفيش مفتاح للمحل ده.'}
      </p>
      {fresh && (
        <div className="rounded-lg bg-amber-500/10 p-2 text-sm">
          <p className="mb-1 font-medium">انسخ المفتاح دلوقتي، مش هيظهر تاني:</p>
          <div className="flex items-center gap-2"><code dir="ltr" className="min-w-0 flex-1 break-all rounded bg-fg/[0.06] p-2 text-xs">{fresh}</code>
            <Button size="xs" variant="outline" onClick={() => { navigator.clipboard?.writeText(fresh); toast({ title: 'تم النسخ' }); }}><Copy className="h-3.5 w-3.5" /></Button></div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="xs" loading={busy} onClick={make}>{info ? 'تجديد المفتاح' : 'إنشاء مفتاح'}</Button>
        {info && <Button size="xs" variant="outline" loading={busy} onClick={revoke}>إلغاء المفتاح</Button>}
      </div>
      <details className="text-xs text-muted">
        <summary className="cursor-pointer">طريقة الاستخدام للمبرمج</summary>
        <pre dir="ltr" className="mt-2 overflow-x-auto rounded bg-fg/[0.06] p-2 text-[11px] leading-relaxed">{`POST /api/cashier/v1/stock
Authorization: Bearer <key>
{"items":[{"sku":"SH-R-M","stock":6},{"barcode":"6291000000099","stock":8}]}

POST /api/cashier/v1/sales
{"externalId":"INV-1001","type":"sale","items":[{"sku":"SH-R-M","qty":2}]}`}</pre>
        <p className="mt-1">بيشتغل بس لما قرار الإطلاق مفعّل وحالة ربط المحل «مفعّل». الكمية في /stock قيمة مطلقة، وإعادة الإرسال آمنة. وفي /sales نفس externalId مش بيخصم مرتين.</p>
      </details>
    </div>
  );
}

function ImportBox({ slug, onApplied }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [prev, setPrev] = useState(null);
  const [mapping, setMapping] = useState(null);
  const [busy, setBusy] = useState(false);

  const form = useCallback((f, m) => { const fd = new FormData(); fd.append('file', f); if (m) fd.append('mapping', JSON.stringify(m)); return fd; }, []);
  const preview = useCallback(async (f, m) => {
    setBusy(true);
    try { const r = await postForm(`/cashier-sync/stores/${slug}/import/preview`, form(f, m)); setPrev(r); setMapping(r.mapping); }
    catch (x) { setPrev(null); toast({ tone: 'error', title: x.message }); } finally { setBusy(false); }
  }, [slug, form, toast]);

  const apply = async () => {
    if (!window.confirm(`هيتحدّث مخزون ${prev.summary.toUpdate} صنف. تكمل؟`)) return;
    setBusy(true);
    try {
      const r = await postForm(`/cashier-sync/stores/${slug}/import/apply`, form(file, mapping));
      toast({ title: `تم تحديث ${r.summary.toUpdate} صنف` });
      setPrev(null); setFile(null); if (fileRef.current) fileRef.current.value = ''; onApplied();
    } catch (x) { toast({ tone: 'error', title: x.message }); } finally { setBusy(false); }
  };
  const setCol = (f, v) => { const m = { ...mapping, [f]: v === '' ? null : Number(v) }; setMapping(m); preview(file, m); };
  const s = prev?.summary;

  return (
    <div className="space-y-3 rounded-xl border border-fg/10 p-3">
      <p className="flex items-center gap-2 font-medium"><FileUp className="h-4 w-4" /> استيراد المخزون من ملف</p>
      <p className="text-xs text-muted">ارفع ملف Excel (.xlsx) أو CSV من كاشير المحل. بيتحدّث مخزون الأصناف الموجودة بس (بالكود أو الباركود)، ومبيتغيّرش أي سعر ولا بيتضاف منتج. أول معاينة مفيهاش حفظ.</p>
      <input ref={fileRef} type="file" accept=".xlsx,.csv,text/csv" className="block w-full text-sm"
        onChange={(e) => { const f = e.target.files?.[0] || null; setFile(f); setPrev(null); if (f) preview(f, null); }} />
      {prev && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            {FIELD_LABELS.map(([f, label]) => (
              <label key={f} className="block min-w-0"><span className="mb-1 block text-xs font-medium text-muted">{label}</span>
                <Select value={mapping?.[f] ?? ''} onChange={(e) => setCol(f, e.target.value)}>
                  <option value="">— مفيش —</option>
                  {prev.headers.map((h, i) => <option key={i} value={i}>{h || `عمود ${i + 1}`}</option>)}
                </Select></label>
            ))}
          </div>
          {prev.problem && <p className="flex items-center gap-2 text-sm text-sale"><AlertTriangle className="h-4 w-4" />{prev.problem === 'no_stock_column' ? 'اختار عمود الكمية.' : 'اختار عمود الكود أو الباركود.'}</p>}
          {s && (
            <>
              <p className="rounded-lg bg-fg/[0.04] p-2 text-sm">
                الصفوف: {s.total} · هتتحدّث: <b>{s.toUpdate}</b> · زي ما هي: {s.unchanged} · متخطّاة: {s.skipped}
                {s.priceDiffs ? ` · فروق أسعار (للعلم بس): ${s.priceDiffs}` : ''}{s.barcodesToLearn ? ` · باركودات هتتحفظ: ${s.barcodesToLearn}` : ''}
              </p>
              {prev.changes.length > 0 && (
                <div className="max-h-48 overflow-auto rounded-lg border border-fg/10 text-sm">
                  <table className="w-full"><thead className="bg-fg/[0.04] text-xs text-muted"><tr><th className="p-1.5 text-start">الصنف</th><th className="p-1.5">من</th><th className="p-1.5">إلى</th></tr></thead>
                    <tbody>{prev.changes.map((c, i) => <tr key={i} className="border-t border-fg/5"><td className="p-1.5"><Piece c={c} /></td><td className="p-1.5 text-center">{c.from}</td><td className="p-1.5 text-center font-medium">{c.to}{c.clamped ? ' (كان سالب)' : ''}</td></tr>)}</tbody></table>
                </div>
              )}
              {prev.skipped.length > 0 && (
                <details className="text-sm"><summary className="cursor-pointer text-muted">الصفوف المتخطّاة ({s.skipped})</summary>
                  <ul className="mt-1 max-h-40 space-y-0.5 overflow-auto text-xs">{prev.skipped.map((k, i) => <li key={i}>صف {k.line}: {k.label || '—'} — {REASONS[k.reason] || k.reason}</li>)}</ul></details>
              )}
              <Button loading={busy} disabled={!s.toUpdate} onClick={apply}>تطبيق التحديث ({s.toUpdate})</Button>
            </>
          )}
        </div>
      )}
      {busy && !prev && <p className="text-sm text-muted">بقرأ الملف…</p>}
    </div>
  );
}

function LogBox({ slug, log }) {
  const [open, setOpen] = useState(null);
  const [details, setDetails] = useState(null);
  const show = async (id) => {
    if (open === id) { setOpen(null); return; }
    setOpen(id); setDetails(null);
    try { const r = await adminApi(`/cashier-sync/stores/${slug}/log/${id}`); setDetails(r.details || {}); } catch { setDetails({}); }
  };
  return (
    <div className="space-y-2 rounded-xl border border-fg/10 p-3">
      <p className="font-medium">سجل المزامنة</p>
      {!log?.length && <p className="text-sm text-muted">لسه مفيش عمليات.</p>}
      <ul className="space-y-1 text-sm">
        {(log || []).map((l) => (
          <li key={l.id}>
            <button type="button" onClick={() => show(l.id)} className="flex w-full items-center gap-2 text-start">
              {l.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-sale" />}
              <span className="min-w-0 flex-1 truncate">{l.source === 'file' ? 'ملف' : 'API'} · {l.kind === 'stock' ? 'مخزون' : l.kind === 'sale' ? 'بيع' : 'مرتجع'} · تحدّث {l.updated} · متخطّى {l.unmatched}{l.message ? ` · ${l.message}` : ''}</span>
              <span className="shrink-0 text-xs text-muted">{fmtDateTime(l.createdAt)}</span>
            </button>
            {open === l.id && details && (
              <div className="mt-1 max-h-40 overflow-auto rounded bg-fg/[0.04] p-2 text-xs">
                {(details.changes || []).map((c, i) => <div key={i} className="flex items-center gap-2"><Piece c={c} /><span dir="ltr" className="ms-auto">{c.from} → {c.to}</span></div>)}
                {(details.skipped || []).map((k, i) => <div key={`s${i}`} className="text-muted">تخطّي {k.label || k.ref || k.line}: {REASONS[k.reason || k.status] || k.reason || k.status}</div>)}
                {!(details.changes?.length || details.skipped?.length) && 'لا توجد تفاصيل.'}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const STATE_AR = { off: 'غير مفعّل', pending: 'قيد التجهيز', paused: 'موقوف', active: 'ساري', grace: 'فترة سماح', expired: 'منتهي' };

function SubscriptionBox({ link, history, onChanged }) {
  const toast = useToast();
  const [endsAt, setEndsAt] = useState(link.endsAt || '');
  const [grace, setGrace] = useState(String(link.graceDays ?? 7));
  const [months, setMonths] = useState('1');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); toast({ title: okMsg }); onChanged(); } catch (x) { toast({ tone: 'error', title: x.message }); } finally { setBusy(false); }
  };
  if (!link.cashierId) return <div className="rounded-xl border border-fg/10 p-3 text-sm text-muted">اختار نظام الكاشير للمحل واحفظ الأول، وبعدين تقدر تسجّل الاشتراك.</div>;
  return (
    <div className="space-y-3 rounded-xl border border-fg/10 p-3">
      <p className="font-medium">اشتراك الكاشير <span className="ms-2 rounded-full bg-fg/[0.07] px-2 py-0.5 text-xs">{STATE_AR[link.state] || link.state}</span></p>
      <p className="text-xs text-muted">مستقل عن اشتراك Twist الأساسي. لما يخلص + أيام السماح بيقف الربط بس (البيانات بتفضل)، وتقدر تستورد ملفات وتشوف السجل من هنا. من غير تاريخ نهاية: مفيش انتهاء تلقائي.</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block"><span className="mb-1 block text-xs font-medium text-muted">ينتهي في</span><Input type="date" dir="ltr" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></label>
        <label className="block"><span className="mb-1 block text-xs font-medium text-muted">أيام السماح</span><Input inputMode="numeric" dir="ltr" value={grace} onChange={(e) => setGrace(e.target.value.replace(/\D/g, ''))} /></label>
        <div className="flex items-end"><Button size="sm" variant="outline" loading={busy} onClick={() => run(() => adminApi(`/cashier-sync/stores/${link.slug}`, { method: 'PUT', body: { cashierId: link.cashierId, status: link.status, note: link.note, endsAt: endsAt || null, graceDays: Number(grace || 0) } }), 'تم حفظ التواريخ')}>حفظ التواريخ</Button></div>
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        <label className="block"><span className="mb-1 block text-xs font-medium text-muted">مدة الدفعة</span>
          <Select value={months} onChange={(e) => setMonths(e.target.value)}>{[1, 2, 3, 6, 12].map((m) => <option key={m} value={m}>{m} شهر</option>)}</Select></label>
        <label className="block"><span className="mb-1 block text-xs font-medium text-muted">المبلغ (ج.م)</span><Input inputMode="numeric" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} /></label>
        <label className="block"><span className="mb-1 block text-xs font-medium text-muted">ملاحظة</span><Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} /></label>
        <div className="flex items-end"><Button size="sm" loading={busy} onClick={() => run(() => adminApi(`/cashier-sync/stores/${link.slug}/extend`, { method: 'POST', body: { months: Number(months), amount: Number(amount || 0), note } }), 'تم تسجيل الدفعة وتمديد الاشتراك')}>تسجيل دفعة وتمديد</Button></div>
      </div>
      {history?.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted">{history.map((p) => <li key={p.id}>{fmtDateTime(p.createdAt)} · {p.months} شهر · {p.amount} ج.م · <bdi dir="ltr">{p.coveredFrom} → {p.coveredThrough}</bdi>{p.note ? ` · ${p.note}` : ''}</li>)}</ul>
      )}
    </div>
  );
}

export default function CashierTools({ slug, link, onSaved }) {
  const { data, reload: reloadTools } = useAdminApi(`/cashier-sync/stores/${slug}/tools`);
  const reload = () => { reloadTools(); onSaved?.(); };
  return (
    <div className="mt-3 space-y-3 md:col-span-5">
      <SubscriptionBox key={`${link.state}:${link.endsAt}:${link.graceDays}`} link={link} history={data?.subscription} onChanged={reload} />
      <div className="grid gap-3 lg:grid-cols-2">
        <KeyBox slug={slug} info={data?.key} onChanged={reload} />
        <ImportBox slug={slug} onApplied={reload} />
      </div>
      <LogBox slug={slug} log={data?.log} />
    </div>
  );
}
