import { useState } from 'react';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { Input } from '../../components/ui/Field.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { adminApi, useAdminApi, fmtNum } from './adminApi.js';

const TABS = [['aliases', 'الروابط القديمة'], ['history', 'سجل الترحيل'], ['review', 'مراجعة يدوية']];
const KINDS = [['slug_ar', 'اسم عربي'], ['slug_en', 'اسم إنجليزي'], ['legacy_id', 'رقم قديم'], ['path', 'مسار']];

function Aliases({ sections }) {
  const toast = useToast();
  const { data, reload } = useAdminApi('/category-aliases');
  const [f, setF] = useState({ alias: '', kind: 'slug_ar', to: '', reason: '' });
  const add = async (e) => {
    e.preventDefault();
    try { await adminApi('/category-aliases', { method: 'POST', body: { ...f, reason: f.reason || undefined } }); toast({ title: 'اتضاف الرابط القديم' }); setF({ ...f, alias: '', reason: '' }); reload(); } catch (x) { toast({ tone: 'error', title: x.message }); }
  };
  const flip = async (a) => { try { await adminApi(`/category-aliases/${a.id}`, { method: 'PATCH', body: { status: a.status === 'active' ? 'disabled' : 'active' } }); reload(); } catch (x) { toast({ tone: 'error', title: x.message }); } };
  const list = data?.aliases || [];
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">الرابط القديم بيودّي العميل للقسم الأساسي. بنضيف رابط بس لما نتأكد إن القسمين نفس النوع.</p>
      <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1.4fr_auto]">
        <Input value={f.alias} onChange={(e) => setF({ ...f, alias: e.target.value })} placeholder="الرابط القديم (مثال: فساتين-سهرة)" aria-label="الرابط القديم" required />
        <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className="rounded-xl border border-line bg-elevated px-2 text-sm" aria-label="النوع">{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className="rounded-xl border border-line bg-elevated px-2 text-sm" aria-label="القسم الأساسي" required><option value="">القسم الأساسي…</option>{sections.filter((s) => s.active).map((s) => <option key={s.slug} value={s.slug}>{s.label}</option>)}</select>
        <Button type="submit" size="sm">إضافة</Button>
      </form>
      {!list.length ? <p className="text-sm text-muted">لا توجد روابط قديمة مسجّلة.</p> : (
        <ul className="space-y-1.5">{list.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-elevated p-2.5 text-sm">
            <span dir="ltr" className="font-mono">{a.alias}</span><span className="text-muted">←</span><span className="font-semibold">{a.name_ar}</span>
            {!a.department_active && <Badge tone="danger" size="sm">الوجهة متوقفة</Badge>}{a.status === 'disabled' && <Badge size="sm">معطّل</Badge>}
            <span className="ms-auto"><Button size="xs" variant="outline" onClick={() => flip(a)}>{a.status === 'active' ? 'تعطيل' : 'تفعيل'}</Button></span>
          </li>))}</ul>
      )}
    </div>
  );
}

function History() {
  const { data } = useAdminApi('/category-migrations');
  const rows = data?.migrations || [];
  if (!rows.length) return <p className="text-sm text-muted">لسه مفيش عمليات ترحيل مسجّلة.</p>;
  return (
    <div className="overflow-x-auto"><table className="w-full text-start text-sm"><thead className="text-xs text-muted"><tr><th className="p-2 text-start">العملية</th><th className="p-2 text-start">من</th><th className="p-2 text-start">إلى</th><th className="p-2 text-start">منتجات</th><th className="p-2 text-start">الحالة</th><th className="p-2 text-start">التاريخ</th></tr></thead>
      <tbody>{rows.map((m) => <tr key={m.id} className="border-t border-line"><td className="p-2">{m.type}</td><td className="p-2" dir="ltr">{m.old_slug}</td><td className="p-2" dir="ltr">{m.new_slug}</td><td className="p-2">{fmtNum(m.affected_products)}</td><td className="p-2"><Badge tone={m.status === 'verified' ? 'success' : m.status === 'failed' ? 'danger' : undefined} size="sm">{m.status}</Badge></td><td className="p-2 text-xs text-muted">{m.created_at}</td></tr>)}</tbody></table></div>
  );
}

function Review() {
  const [slugs, setSlugs] = useState('');
  const [go, setGo] = useState('');
  const { data } = useAdminApi(`/category-review?slugs=${encodeURIComponent(go)}`);
  const rows = data?.products || [];
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">اكتب مفاتيح الأقسام القديمة (مفصولة بفاصلة) لعرض منتجاتها. التصنيف بيتم يدويًا منتج بمنتج، مفيش نقل تلقائي.</p>
      <form onSubmit={(e) => { e.preventDefault(); setGo(slugs.trim()); }} className="flex gap-2"><Input dir="ltr" value={slugs} onChange={(e) => setSlugs(e.target.value)} placeholder="old_slug_1, old_slug_2" aria-label="مفاتيح الأقسام" /><Button type="submit" size="sm">عرض</Button></form>
      {go && (!rows.length ? <p className="text-sm text-muted">لا توجد منتجات في هذه الأقسام.</p> : (
        <ul className="space-y-1.5">{rows.map((p) => <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-elevated p-2.5 text-sm"><span className="font-semibold">{p.name_ar || p.name_en}</span><span className="text-xs text-muted" dir="ltr">#{p.id} · {p.store_slug} · {p.department} · {p.audience || '—'}</span></li>)}</ul>
      ))}
      {!!data?.empty_sections?.length && <p className="text-xs text-muted">أقسام فارغة (مرشحة للتعطيل): {data.empty_sections.map((s) => s.name_ar).join('، ')}</p>}
    </div>
  );
}

export default function TaxonomyTools({ sections }) {
  const [tab, setTab] = useState(null);
  return (
    <section className="mt-6 rounded-2xl border border-line bg-surface p-4" aria-label="أدوات التصنيف">
      <div className="flex flex-wrap items-center gap-2">
        <p className="me-2 text-base font-bold">أدوات تنظيف التصنيفات</p>
        {TABS.map(([k, l]) => <Button key={k} size="xs" variant={tab === k ? 'primary' : 'outline'} onClick={() => setTab(tab === k ? null : k)}>{l}</Button>)}
      </div>
      {tab && <div className="mt-4">{tab === 'aliases' ? <Aliases sections={sections} /> : tab === 'history' ? <History /> : <Review />}</div>}
    </section>
  );
}
