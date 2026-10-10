import { useState } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { PageHeader } from '../../components/dash/Kit.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import { Field, Input, Switch } from '../../components/ui/Field.jsx';
import { ErrorState, EmptyState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { adminApi, useAdminApi, fmtNum } from './adminApi.js';

const PRESETS = [
  ['ملابس', ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL']],
  ['بناطيل', ['28', '30', '32', '34', '36', '38', '40', '42']],
  ['كوتشيات', ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45']],
  ['أطفال (سن)', ['0-3M', '3-6M', '6-12M', '1Y', '2Y', '3Y', '4Y', '6Y', '8Y', '10Y', '12Y', '14Y']],
  ['طول (عبايات/جلاليب)', ['50', '52', '54', '56', '58', '60']],
  ['فري سايز', ['Free size']],
];

function SizesEditor({ value, onChange }) {
  const [draft, setDraft] = useState('');
  const add = (raw) => {
    const items = String(raw).split(/[,،\s]+/).map((x) => x.trim()).filter(Boolean);
    if (items.length) onChange([...new Set([...value, ...items])]);
    setDraft('');
  };
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        {value.map((s) => <button key={s} type="button" onClick={() => onChange(value.filter((x) => x !== s))} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-fg px-2.5 text-sm font-semibold text-canvas">{s}<X className="h-3 w-3" /></button>)}
        {!value.length && <span className="text-sm text-muted">من غير مقاسات (المنتج هيبقى بدون اختيار مقاس).</span>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); add(draft); }} className="flex gap-2">
        <Input dir="ltr" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="اكتب مقاس أو أكتر مفصولين بفاصلة، مثال: 30ml, 50ml" className="text-start" />
        <Button type="submit" variant="outline" icon={Plus} aria-label="إضافة" />
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map(([label, sizes]) => <button key={label} type="button" onClick={() => onChange(sizes)} className="h-8 rounded-full border border-line-strong px-3 text-xs font-medium hover:border-fg">{label}</button>)}
      </div>
      <p className="mt-1.5 text-[12px] text-muted">اضغط على مجموعة جاهزة عشان تملا المقاسات بسرعة (بتستبدل الموجود).</p>
    </div>
  );
}

function DeptSheet({ dept, onClose, onSaved }) {
  const toast = useToast();
  const isNew = dept === 'new';
  const [f, setF] = useState(null);
  const [key, setKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState({});
  if (dept && key !== (isNew ? 'new' : dept.id)) {
    setKey(isNew ? 'new' : dept.id); setErrs({});
    setF(isNew ? { name_ar: '', name_en: '', slug: '', sizes: [], active: true, sort: '' } : { name_ar: dept.name_ar, name_en: dept.name_en, slug: dept.slug, sizes: dept.sizes, active: dept.active, sort: dept.sort });
  }
  const open = !!dept && !!f;
  const save = async (e) => {
    e?.preventDefault();
    setBusy(true); setErrs({});
    try {
      const body = { name_ar: f.name_ar, name_en: f.name_en, sizes: f.sizes, ...(f.sort !== '' ? { sort: Number(f.sort) } : {}) };
      const r = isNew ? await adminApi('/departments', { method: 'POST', body: { ...body, slug: f.slug || undefined } }) : await adminApi(`/departments/${dept.id}`, { method: 'PATCH', body: { ...body, active: f.active } });
      onSaved(r.departments); toast({ title: isNew ? 'اتضاف القسم' : 'اتحفظ' }); onClose();
    } catch (x) {
      setErrs(Object.fromEntries(Object.entries(x.fields || {}).map(([k, v]) => [k, v === 'slug_taken' ? 'المفتاح ده مستخدم' : v === 'slug_invalid' ? 'حروف إنجليزي صغيرة وأرقام فقط، مثال: perfumes' : 'قيمة غير صحيحة'])));
      toast({ tone: 'error', title: x.message });
    }
    setBusy(false);
  };
  return (
    <Sheet open={open} onClose={onClose} title={isNew ? 'قسم جديد' : `تعديل: ${dept?.name_ar || ''}`} side="end" size="lg"
      footer={<div className="flex gap-2"><Button full loading={busy} onClick={save}>{isNew ? 'إضافة القسم' : 'حفظ'}</Button><Button variant="outline" onClick={onClose}>إلغاء</Button></div>}>
      {f && (
        <form onSubmit={save} className="space-y-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الاسم (عربي)" error={errs.name_ar}><Input required minLength={2} value={f.name_ar} onChange={(e) => setF({ ...f, name_ar: e.target.value })} placeholder="مثال: عطور" /></Field>
            <Field label="الاسم (إنجليزي)" error={errs.name_en}><Input dir="ltr" required minLength={2} value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} placeholder="Perfumes" className="text-start" /></Field>
            <Field label="المفتاح (إنجليزي)" hint={isNew ? 'بيتعمل تلقائي من الاسم الإنجليزي — مينفعش يتغير بعد كده' : 'ثابت'} error={errs.slug}>
              <Input dir="ltr" value={f.slug} disabled={!isNew} onChange={(e) => setF({ ...f, slug: e.target.value })} placeholder="perfumes" className="text-start" />
            </Field>
            <Field label="الترتيب" hint="الأصغر يظهر الأول"><Input type="number" dir="ltr" min={0} value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })} /></Field>
          </div>
          <div><p className="mb-2 text-sm font-medium">المقاسات الخاصة بالقسم</p><SizesEditor value={f.sizes} onChange={(sizes) => setF({ ...f, sizes })} />
            <p className="mt-2 text-[13px] text-muted">دي المقاسات اللي بتظهر لصاحب المحل جاهزة وهو بيضيف منتج في المحل اللي فيه القسم ده.</p></div>
          {!isNew && <Switch checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="القسم مفعّل" description="لو اتقفل مش هيظهر للمحلات الجديدة ولا في الفلتر" />}
        </form>
      )}
    </Sheet>
  );
}

export default function Departments() {
  const { data, error, loading, reload } = useAdminApi('/departments');
  const toast = useToast();
  const [edit, setEdit] = useState(null);
  const [local, setLocal] = useState(null);
  const list = local || data?.departments || [];
  const remove = async (d) => {
    if (!window.confirm(`حذف قسم "${d.name_ar}"؟`)) return;
    try { const r = await adminApi(`/departments/${d.id}`, { method: 'DELETE' }); setLocal(r.departments); toast({ title: 'اتحذف' }); } catch (x) { toast({ tone: 'error', title: x.code === 'department_in_use' ? `ينفعش — ${x.message}` : x.message }); }
  };
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  return (
    <div>
      <PageHeader title="الأقسام" subtitle="الأقسام اللي المحلات بتختار منها (شنط، ملابس، أطفال، كوتشيات…) ومقاسات كل قسم" actions={<Button icon={Plus} onClick={() => setEdit('new')}>قسم جديد</Button>} />
      {loading && !data ? <Skeleton className="h-64 w-full rounded-2xl" /> : !list.length ? <EmptyState title="مفيش أقسام" body="أضف أول قسم." /> : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((d) => (
            <li key={d.id} className="flex flex-col rounded-2xl border border-line bg-elevated p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="truncate text-lg font-semibold">{d.name_ar}</p><p className="text-[13px] text-muted" dir="ltr">{d.name_en} · {d.slug}</p></div>
                {!d.active && <Badge tone="danger" size="sm">متوقف</Badge>}
              </div>
              <p className="mt-2 text-sm text-muted">{fmtNum(d.stores_count)} محل</p>
              <p className="mt-2 flex flex-wrap gap-1">{d.sizes.slice(0, 10).map((s) => <span key={s} className="rounded-md bg-fg/[0.06] px-1.5 py-0.5 text-xs" dir="ltr">{s}</span>)}{d.sizes.length > 10 && <span className="text-xs text-muted">+{d.sizes.length - 10}</span>}{!d.sizes.length && <span className="text-xs text-muted">بدون مقاسات</span>}</p>
              <div className="mt-4 flex gap-2 border-t border-line pt-3">
                <Button size="xs" variant="outline" icon={Pencil} onClick={() => setEdit(d)}>تعديل</Button>
                <Button size="xs" variant="danger-ghost" icon={Trash2} onClick={() => remove(d)}>حذف</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <DeptSheet dept={edit} onClose={() => setEdit(null)} onSaved={(l) => { setLocal(l); reload(); }} />
    </div>
  );
}
