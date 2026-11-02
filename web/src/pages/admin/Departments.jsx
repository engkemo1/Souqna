import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, X, ImagePlus, ChevronDown, ChevronLeft, ArrowUp, ArrowDown, Search, Store } from 'lucide-react';
import { PROFILES, ATTR_TYPES } from '@souqna/shared/catalog';
import { PageHeader } from '../../components/dash/Kit.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import { Field, Input, Switch } from '../../components/ui/Field.jsx';
import { ErrorState, EmptyState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import TaxonomyTools from './TaxonomyTools.jsx';
import { adminApi, adminUpload, useAdminApi, fmtNum } from './adminApi.js';

const PRESETS = [
  ['ملابس', ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL']],
  ['بناطيل', ['28', '30', '32', '34', '36', '38', '40', '42']],
  ['أحذية', ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45']],
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

function DeptPhoto({ dept, onSaved }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setBusy(true);
    try { const r = await adminUpload(`/departments/${dept.id}/image`, file); onSaved(r.departments); toast({ title: 'اتغيرت صورة القسم' }); }
    catch (x) { toast({ tone: 'error', title: x.code === 'image_too_small' ? 'الصورة صغيرة (200 بكسل على الأقل)' : x.code === 'invalid_image' ? 'الملف ده مش صورة مدعومة' : x.message }); }
    setBusy(false);
  };
  const reset = async () => {
    setBusy(true);
    try { const r = await adminApi(`/departments/${dept.id}/image`, { method: 'DELETE' }); onSaved(r.departments); toast({ title: 'رجعنا للصورة الافتراضية' }); } catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy(false);
  };
  const cur = dept.image;
  return (
    <div>
      <p className="mb-2 text-sm font-medium">صورة القسم</p>
      <div className="flex items-center gap-4">
        <span className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-secondary text-muted">{cur ? <img src={cur} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6" />}</span>
        <div className="flex flex-wrap gap-2">
          <label className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-line-strong bg-elevated px-4 text-sm font-semibold hover:border-fg ${busy ? 'pointer-events-none opacity-60' : ''}`}>
            <ImagePlus className="h-4 w-4" />{cur ? 'تغيير الصورة' : 'رفع صورة'}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={pick} disabled={busy} />
          </label>
          {cur && <Button variant="outline" onClick={reset} loading={busy}>رجّع الافتراضية</Button>}
        </div>
      </div>
      <p className="mt-1.5 text-[12px] text-muted">صورة مربعة أو قريبة من المربع (400×400 أو أكتر). بتتقص وتتصغّر لوحدها. لازم تكون صورة ليك أو مجانية للاستخدام التجاري.</p>
    </div>
  );
}


const TYPE_AR = { text: 'نص', select: 'اختيار واحد', multi: 'اختيار متعدد', number: 'رقم', boolean: 'نعم / لا' };
const optsToText = (o = []) => o.map((x) => `${x.v} | ${x.ar || ''} | ${x.en || ''}`).join('\n');
const textToOpts = (t) => String(t || '').split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((a) => a[0]).map(([v, ar, en]) => ({ v, ar: ar || v, en: en || ar || v }));

/** Own attribute definitions of a section + the inherited ones (which can be switched off for this branch). */
function AttrEditor({ own, inherited, onChange }) {
  const set = (i, patch) => onChange(own.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const offKeys = new Set(own.filter((a) => a.active === false).map((a) => a.key));
  const toggleInherited = (d) => onChange(offKeys.has(d.key) ? own.filter((a) => !(a.key === d.key && a.active === false)) : [...own, { key: d.key, ar: d.ar, en: d.en, type: d.type, options: d.options, active: false }]);
  const ownKeys = new Set(own.filter((a) => a.active !== false).map((a) => a.key));
  return (
    <div className="space-y-3">
      {inherited.length > 0 && (
        <div className="rounded-xl bg-secondary p-3">
          <p className="mb-2 text-sm font-medium">خصائص موروثة من القسم الأب</p>
          <div className="flex flex-wrap gap-2">
            {inherited.filter((d) => !ownKeys.has(d.key) || offKeys.has(d.key)).map((d) => (
              <button key={d.key} type="button" onClick={() => toggleInherited(d)} className={`h-8 rounded-full border px-3 text-xs font-medium ${offKeys.has(d.key) ? 'border-line text-muted line-through' : 'border-fg'}`}>{d.ar}</button>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-muted">اضغط على خاصية لإيقافها في القسم ده وكل اللي تحته.</p>
        </div>
      )}
      {own.map((a, i) => a.active === false ? null : (
        <div key={i} className="space-y-3 rounded-xl border border-line p-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="المفتاح"><Input dir="ltr" value={a.key || ''} onChange={(e) => set(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} className="text-start" placeholder="fabric" /></Field>
            <Field label="الاسم (عربي)"><Input value={a.ar || ''} onChange={(e) => set(i, { ar: e.target.value })} /></Field>
            <Field label="الاسم (English)"><Input dir="ltr" value={a.en || ''} onChange={(e) => set(i, { en: e.target.value })} className="text-start" /></Field>
            <Field label="النوع"><select className="h-11 w-full rounded-xl border border-line-strong bg-elevated px-3 text-sm" value={a.type || 'select'} onChange={(e) => set(i, { type: e.target.value })}>{ATTR_TYPES.map((t) => <option key={t} value={t}>{TYPE_AR[t]}</option>)}</select></Field>
          </div>
          {(a.type === 'select' || a.type === 'multi' || !a.type) && <Field label="الاختيارات" hint="سطر لكل اختيار بالشكل: المفتاح | عربي | English"><textarea dir="ltr" rows={4} className="w-full rounded-xl border border-line-strong bg-elevated p-3 text-sm" value={a._text ?? optsToText(a.options)} onChange={(e) => set(i, { _text: e.target.value, options: textToOpts(e.target.value) })} placeholder={'cotton | قطن | Cotton'} /></Field>}
          {a.type === 'number' && <div className="grid gap-3 sm:grid-cols-3"><Field label="أقل قيمة"><Input type="number" dir="ltr" value={a.min ?? ''} onChange={(e) => set(i, { min: e.target.value })} /></Field><Field label="أعلى قيمة"><Input type="number" dir="ltr" value={a.max ?? ''} onChange={(e) => set(i, { max: e.target.value })} /></Field><Field label="الوحدة"><Input value={a.unit || ''} onChange={(e) => set(i, { unit: e.target.value })} /></Field></div>}
          <div className="flex flex-wrap items-center gap-4">
            <Switch checked={!!a.required} onChange={(v) => set(i, { required: v })} label="مطلوب" />
            <Switch checked={a.merchant_only ? false : a.filterable !== false} disabled={!!a.merchant_only} onChange={(v) => set(i, { filterable: v })} label="فلتر للعميل" />
            <Switch checked={!!a.merchant_only} onChange={(v) => set(i, { merchant_only: v })} label="للتاجر فقط" />
            <Button size="xs" variant="danger-ghost" icon={Trash2} onClick={() => onChange(own.filter((_, j) => j !== i))}>حذف</Button>
          </div>
        </div>
      ))}
      <Button size="xs" variant="outline" icon={Plus} onClick={() => onChange([...own, { key: '', ar: '', en: '', type: 'select', options: [], filterable: true }])}>خاصية جديدة</Button>
    </div>
  );
}

function DeptSheet({ dept, onClose, onSaved, all = [], defaultParent = '' }) {
  const toast = useToast();
  const isNew = dept === 'new';
  const [f, setF] = useState(null);
  const [key, setKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState({});
  if (dept && key !== (isNew ? 'new' : dept.id)) {
    setKey(isNew ? 'new' : dept.id); setErrs({});
    setF(isNew ? { name_ar: '', name_en: '', slug: '', sizes: [], active: true, sort: '', parent: defaultParent || '', profile: '', description_ar: '', description_en: '', icon: '', visibility: 'visible', attrs: [], seo_title_ar: '', seo_title_en: '', seo_desc_ar: '', seo_desc_en: '', show_empty: false } : { parent: dept.parent || '', name_ar: dept.name_ar, name_en: dept.name_en, slug: dept.slug, sizes: dept.sizes, active: dept.active, sort: dept.sort, profile: dept.profile || '', description_ar: dept.description?.ar || '', description_en: dept.description?.en || '', icon: dept.icon || '', visibility: dept.visibility || 'visible', attrs: dept.attrs || [], seo_title_ar: dept.seo?.title?.ar || '', seo_title_en: dept.seo?.title?.en || '', seo_desc_ar: dept.seo?.description?.ar || '', seo_desc_en: dept.seo?.description?.en || '', show_empty: !!dept.show_empty });
  }
  const open = !!dept && !!f;
  const save = async (e) => {
    e?.preventDefault();
    setBusy(true); setErrs({});
    try {
      const sortValue = Number(f.sort);
      const body = { parent: f.parent || null, name_ar: f.name_ar, name_en: f.name_en, sizes: f.sizes, profile: f.profile || null, description_ar: f.description_ar, description_en: f.description_en, seo_title_ar: f.seo_title_ar, seo_title_en: f.seo_title_en, seo_desc_ar: f.seo_desc_ar, seo_desc_en: f.seo_desc_en, show_empty: !!f.show_empty, icon: f.icon || null, visibility: f.visibility, attrs: f.attrs.filter((a) => a.active === false || (a.key && (a.ar || a.en))).map(({ _text, ...a }) => a), ...(Number.isInteger(sortValue) && sortValue >= 0 ? { sort: sortValue } : {}) };
      const r = isNew ? await adminApi('/departments', { method: 'POST', body: { ...body, slug: f.slug || undefined } }) : await adminApi(`/departments/${dept.id}`, { method: 'PATCH', body: { ...body, active: f.active } });
      onSaved(r.departments); toast({ title: isNew ? 'اتضاف القسم' : 'اتحفظ' }); onClose();
    } catch (x) {
      setErrs(Object.fromEntries(Object.entries(x.fields || {}).map(([k, v]) => [k, v === 'slug_taken' ? 'المفتاح ده مستخدم' : v === 'slug_invalid' ? 'حروف إنجليزي صغيرة وأرقام فقط، مثال: perfumes' : k === 'name_ar' && v === 'duplicate_name' ? 'فيه قسم بنفس الاسم هنا' : 'قيمة غير صحيحة'])));
      toast({ tone: 'error', title: x.message });
    }
    setBusy(false);
  };
  return (
    <Sheet open={open} onClose={onClose} title={isNew ? 'قسم جديد' : `تعديل: ${dept?.name_ar || ''}`} side="end" size="lg"
      footer={<div className="flex gap-2"><Button full loading={busy} onClick={save}>{isNew ? 'إضافة القسم' : 'حفظ'}</Button><Button variant="outline" onClick={onClose}>إلغاء</Button></div>}>
      {f && dept && (
        <form onSubmit={save} className="space-y-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الاسم (عربي)" error={errs.name_ar}><Input required minLength={2} value={f.name_ar} onChange={(e) => setF({ ...f, name_ar: e.target.value })} placeholder="مثال: عطور" /></Field>
            <Field label="الاسم (إنجليزي)" error={errs.name_en}><Input dir="ltr" required minLength={2} value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} placeholder="Perfumes" className="text-start" /></Field>
            <Field label="المفتاح (إنجليزي)" hint={isNew ? 'بيتعمل تلقائي من الاسم الإنجليزي — مينفعش يتغير بعد كده' : 'ثابت'} error={errs.slug}>
              <Input dir="ltr" value={f.slug} disabled={!isNew} onChange={(e) => setF({ ...f, slug: e.target.value })} placeholder="perfumes" className="text-start" />
            </Field>
            <Field label="تحت قسم" hint="سيبه فاضي لو ده قسم رئيسي (زي حريمي). لو قسم زي فساتين اختار الرئيسي، ولو نوع زي فساتين أفراح اختار فساتين." error={errs.parent}>
              <select className="h-11 w-full rounded-xl border border-line-strong bg-elevated px-3 text-sm" value={f.parent} onChange={(e) => setF({ ...f, parent: e.target.value })}>
                <option value="">— قسم رئيسي —</option>
                {all.filter((x) => !dept?.slug || x.slug !== dept.slug).map((x) => <option key={x.slug} value={x.slug}>{x.path}</option>)}
              </select>
            </Field>
          </div>
          {isNew ? <p className="rounded-xl bg-secondary px-3 py-2 text-[13px] text-muted">تقدر ترفع صورة القسم بعد ما تضيفه (تعديل ← صورة القسم).</p> : <DeptPhoto dept={dept} onSaved={onSaved} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="وصف القسم (عربي)"><textarea rows={2} maxLength={300} className="w-full rounded-xl border border-line-strong bg-elevated p-3 text-sm" value={f.description_ar} onChange={(e) => setF({ ...f, description_ar: e.target.value })} /></Field>
            <Field label="Description (English)"><textarea dir="ltr" rows={2} maxLength={300} className="w-full rounded-xl border border-line-strong bg-elevated p-3 text-start text-sm" value={f.description_en} onChange={(e) => setF({ ...f, description_en: e.target.value })} /></Field>
            <Field label="تجربة التسوق" hint="فاضي = يرث من القسم الأب. بتحدد شكل كارت المنتج وصفحة القسم.">
              <select className="h-11 w-full rounded-xl border border-line-strong bg-elevated px-3 text-sm" value={f.profile} onChange={(e) => setF({ ...f, profile: e.target.value })}>
                <option value="">— وراثة من الأب{dept && dept !== 'new' && dept.profile_effective ? ` (${PROFILES[dept.profile_effective]?.ar})` : ''} —</option>
                {Object.entries(PROFILES).map(([k, v]) => <option key={k} value={k}>{v.ar}</option>)}
              </select>
            </Field>
            <Field label="أيقونة (اسم أو رمز)"><Input dir="ltr" maxLength={30} value={f.icon} onChange={(e) => setF({ ...f, icon: e.target.value })} className="text-start" placeholder="shirt" /></Field>
          </div>
          <Switch checked={f.visibility !== 'hidden'} onChange={(v) => setF({ ...f, visibility: v ? 'visible' : 'hidden' })} label="ظاهر للتجار والعملاء" description="لو اتقفل القسم بيفضل بمنتجاته بس مش بيظهر في القوائم." />
          <Switch checked={!!f.show_empty} onChange={(v) => setF({ ...f, show_empty: v })} label="اعرضه للعملاء حتى لو فاضي" description="الأقسام اللي مفيهاش منتجات ولا محلات بتتخفى عن العملاء تلقائيًا." />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="عنوان SEO (عربي)" hint="حتى 70 حرف. فاضي = اسم القسم."><Input maxLength={70} value={f.seo_title_ar} onChange={(e) => setF({ ...f, seo_title_ar: e.target.value })} /></Field>
            <Field label="SEO title (English)"><Input dir="ltr" maxLength={70} value={f.seo_title_en} onChange={(e) => setF({ ...f, seo_title_en: e.target.value })} className="text-start" /></Field>
            <Field label="وصف SEO (عربي)" hint="حتى 170 حرف."><textarea rows={2} maxLength={170} className="w-full rounded-xl border border-line-strong bg-elevated p-3 text-sm" value={f.seo_desc_ar} onChange={(e) => setF({ ...f, seo_desc_ar: e.target.value })} /></Field>
            <Field label="SEO description (English)"><textarea dir="ltr" rows={2} maxLength={170} className="w-full rounded-xl border border-line-strong bg-elevated p-3 text-start text-sm" value={f.seo_desc_en} onChange={(e) => setF({ ...f, seo_desc_en: e.target.value })} /></Field>
          </div>
          <div><p className="mb-2 text-sm font-medium">الخصائص والفلاتر (التيشيرت غير الجزمة غير العطر)</p>
            <AttrEditor own={f.attrs} inherited={isNew ? [] : (dept.attrs_effective || []).filter((d) => !(dept.attrs || []).some((o) => o.key === d.key && o.active !== false))} onChange={(attrs) => setF({ ...f, attrs })} /></div>
          <div><p className="mb-2 text-sm font-medium">مقاسات احتياطية للقسم (المقاسات الأساسية بتيجي من نوع المنتج)</p><SizesEditor value={f.sizes} onChange={(sizes) => setF({ ...f, sizes })} />
            <p className="mt-2 text-[13px] text-muted">دي المقاسات اللي بتظهر لصاحب المحل جاهزة وهو بيضيف منتج في المحل اللي فيه القسم ده.</p></div>
          {!isNew && <Switch checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="القسم مفعّل" description="لو اتقفل مش هيظهر للمحلات الجديدة ولا في الفلتر" />}
        </form>
      )}
    </Sheet>
  );
}

function RequestsInbox({ all, onChanged, data, reload }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const [parent, setParent] = useState({});
  const list = data?.requests || [];
  if (!list.length) return null;
  const approve = async (r) => {
    setBusy(r.id);
    try { await adminApi(`/category-requests/${r.id}/approve`, { method: 'POST', body: { parent: parent[r.id] ?? r.parent_slug ?? null } }); toast({ title: 'اتقبل واتضاف القسم، والتاجر اتبلّغ' }); reload(); onChanged(); }
    catch (x) { toast({ tone: 'error', title: x.fields?.name_ar === 'duplicate_name' ? 'فيه قسم بنفس الاسم تحت الأب ده' : x.message }); } finally { setBusy(null); }
  };
  const reject = async (r) => {
    const reason = window.prompt('سبب الرفض (هيوصل للتاجر):');
    if (!reason || reason.trim().length < 2) return;
    setBusy(r.id);
    try { await adminApi(`/category-requests/${r.id}/reject`, { method: 'POST', body: { reason } }); toast({ title: 'اترفض والتاجر اتبلّغ' }); reload(); } catch (x) { toast({ tone: 'error', title: x.message }); } finally { setBusy(null); }
  };
  return (
    <section className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4" aria-label="طلبات أقسام من التجار">
      <p className="mb-3 text-base font-bold">طلبات أقسام من التجار ({list.length})</p>
      <ul className="space-y-2">
        {list.map((r) => (
          <li key={r.id} className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-line">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0"><p className="font-semibold">{r.name_ar}{r.name_en ? <span className="ms-2 text-xs font-normal text-muted" dir="ltr">{r.name_en}</span> : null}</p><p className="text-xs text-muted">من: {r.store_name}{r.note ? ` — ${r.note}` : ''}</p></div>
              <div className="flex gap-2"><Button size="xs" disabled={busy === r.id} onClick={() => approve(r)}>قبول وإضافة</Button><Button size="xs" variant="danger-ghost" disabled={busy === r.id} onClick={() => reject(r)}>رفض</Button></div>
            </div>
            <select className="h-9 w-full rounded-lg border border-line-strong bg-elevated px-2 text-sm" value={parent[r.id] ?? r.parent_slug ?? ''} onChange={(e) => setParent({ ...parent, [r.id]: e.target.value || null })} aria-label="القسم الأب">
              <option value="">— قسم رئيسي —</option>
              {all.map((x) => <option key={x.slug} value={x.slug}>{x.path}</option>)}
            </select>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DeleteDialog({ dept, others, onClose, onDone }) {
  const toast = useToast();
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [merchants, setMerchants] = useState(null);
  useEffect(() => { if (dept?.products_count) adminApi(`/departments/${dept.id}/merchants`).then((r) => setMerchants(r.merchants)).catch(() => {}); }, [dept]);
  if (!dept) return null;
  const go = async () => {
    setBusy(true);
    try { const r = await adminApi(`/departments/${dept.id}${target ? `?reassign_to=${target}` : ''}`, { method: 'DELETE' }); onDone(r.departments); toast({ title: r.moved ? `اتحذف واتنقل ${fmtNum(r.moved)} منتج` : 'اتحذف' }); onClose(); }
    catch (x) { toast({ tone: 'error', title: x.code === 'has_children' ? 'انقل أو احذف الأقسام اللي تحته الأول' : x.code === 'has_products' ? 'اختار قسم تنقل له المنتجات' : x.message }); }
    setBusy(false);
  };
  return (
    <Sheet open onClose={onClose} title={`حذف: ${dept.name_ar}`} side="end" size="md"
      footer={<div className="flex gap-2"><Button full variant="danger" loading={busy} disabled={dept.products_count > 0 && !target} onClick={go}>{dept.products_count ? 'انقل المنتجات واحذف' : 'حذف'}</Button><Button variant="outline" onClick={onClose}>إلغاء</Button></div>}>
      <div className="space-y-4 py-4 text-sm">
        {dept.products_count > 0 ? (
          <>
            <p className="rounded-xl bg-amber-50 p-3">القسم فيه <b>{fmtNum(dept.products_count)}</b> منتج. مش هنمسحهم؛ لازم تختار قسم تانٍ ينتقلوا له.</p>
            {merchants && <p className="text-muted">المحلات: {merchants.map((m) => `${m.name_ar} (${fmtNum(m.products)})`).join('، ')}</p>}
            <Field label="انقل المنتجات إلى">
              <select className="h-11 w-full rounded-xl border border-line-strong bg-elevated px-3 text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">— اختار قسم —</option>
                {others.map((x) => <option key={x.slug} value={x.slug}>{x.path}</option>)}
              </select>
            </Field>
          </>
        ) : <p>القسم فاضي. الحذف نهائي ومش بيمسّ أي منتج.</p>}
      </div>
    </Sheet>
  );
}

export default function Departments() {
  const { data, error, loading, reload } = useAdminApi('/departments');
  const reqs = useAdminApi('/category-requests?status=pending');
  const toast = useToast();
  const [edit, setEdit] = useState(null);
  const [newParent, setNewParent] = useState('');
  const [local, setLocal] = useState(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(() => new Set());
  const [del, setDel] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const everything = local || data?.departments || [];
  const raw = everything.filter((d) => !d.pending);
  const reqSlugs = new Set((reqs.data?.requests || []).map((r) => r.department_slug).filter(Boolean));
  const pendingList = everything.filter((d) => d.pending && !reqSlugs.has(d.slug)); // requests already shown in the inbox above are not listed twice
  const decide = async (d, verb) => {
    setBusyId(d.id);
    try { const r = await adminApi(`/departments/${d.id}/${verb}`, { method: 'POST' }); setLocal(r.departments); toast({ title: verb === 'approve' ? 'اتقبل وبقى ظاهر في السوق' : 'اترفض (فاضل في المحل بس)' }); } catch (x) { toast({ tone: 'error', title: x.message }); } finally { setBusyId(null); }
  };
  const byS = new Map(raw.map((d) => [d.slug, d]));
  const kids = new Map(); for (const d of raw) { const k = byS.has(d.parent) ? d.parent : null; kids.set(k, [...(kids.get(k) || []), d]); }
  const depthOf = (d) => { let n = 0; for (let p = d.parent; p && n < 4; p = byS.get(p)?.parent) n++; return n; };
  const pathOf = (d) => { const parts = []; for (let x = d, i = 0; x && i < 4; x = byS.get(x.parent), i++) parts.unshift(x.name_ar); return parts.join(' › '); };
  const norm = (x) => String(x || '').toLowerCase();
  const needle = norm(q).trim();
  const matches = (d) => !needle || norm(`${d.name_ar} ${d.name_en} ${d.slug}`).includes(needle);
  const hasMatch = (d) => matches(d) || (kids.get(d.slug) || []).some(hasMatch);
  const countTree = (d) => (d.products_count || 0) + (kids.get(d.slug) || []).reduce((n, c) => n + countTree(c), 0);
  const all = raw.filter((d) => depthOf(d) < 2).map((d) => ({ slug: d.slug, path: pathOf(d) }));
  const toggle = (slug) => setOpen((s) => { const n = new Set(s); n.has(slug) ? n.delete(slug) : n.add(slug); return n; });
  const move = async (d, dir) => {
    const sib = kids.get(byS.has(d.parent) ? d.parent : null) || []; const i = sib.findIndex((x) => x.id === d.id); const j = i + dir;
    if (j < 0 || j >= sib.length) return;
    const order = sib.map((x) => x.id); [order[i], order[j]] = [order[j], order[i]];
    try { const r = await adminApi('/departments/reorder', { method: 'POST', body: { order } }); setLocal(r.departments); } catch (x) { toast({ tone: 'error', title: x.message }); }
  };
  const setActive = async (d, active) => {
    try { const r = await adminApi(`/departments/${d.id}`, { method: 'PATCH', body: { active } }); setLocal(r.departments); } catch (x) { toast({ tone: 'error', title: x.message }); }
  };
  const Row = ({ d, level }) => {
    const ch = (kids.get(d.slug) || []).filter(hasMatch);
    const expanded = !!needle || open.has(d.slug);
    return (
      <li>
        <div className={`flex flex-wrap items-center gap-2 rounded-xl border border-line bg-elevated p-2.5 ${matches(d) ? '' : 'opacity-60'}`} style={{ marginInlineStart: level * 20 }}>
          <button type="button" onClick={() => toggle(d.slug)} disabled={!(kids.get(d.slug) || []).length} aria-label="فتح/قفل" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-fg/[0.06] disabled:opacity-20">{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}</button>
          {d.image && <img src={d.image} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{d.name_ar} {!d.active && <Badge tone="danger" size="sm">متوقف</Badge>} {d.visibility === 'hidden' && <Badge size="sm">مخفي</Badge>}</p>
            <p className="truncate text-[12px] text-muted" dir="ltr">{d.name_en} · {d.slug} · {PROFILES[d.profile_effective]?.en}</p>
          </div>
          <span className="text-xs text-muted">{fmtNum(countTree(d))} منتج · <Store className="inline h-3 w-3" /> {fmtNum(d.stores_count)}</span>
          <div className="flex items-center gap-1">
            <Button size="xs" variant="ghost" icon={ArrowUp} aria-label="لأعلى" onClick={() => move(d, -1)} />
            <Button size="xs" variant="ghost" icon={ArrowDown} aria-label="لأسفل" onClick={() => move(d, 1)} />
            <Button size="xs" variant="outline" icon={Pencil} onClick={() => setEdit(d)}>تعديل</Button>
            {depthOf(d) < 2 && <Button size="xs" variant="outline" icon={Plus} aria-label="قسم تحته" onClick={() => { setNewParent(d.slug); setEdit('new'); }} />}
            <Button size="xs" variant="outline" onClick={() => setActive(d, !d.active)}>{d.active ? 'إيقاف' : 'تفعيل'}</Button>
            <Button size="xs" variant="danger-ghost" icon={Trash2} aria-label="حذف" onClick={() => setDel(d)} />
          </div>
        </div>
        {expanded && ch.length > 0 && <ul className="mt-1.5 space-y-1.5">{ch.map((c) => <Row key={c.id} d={c} level={level + 1} />)}</ul>}
      </li>
    );
  };
  const roots = (kids.get(null) || []).filter(hasMatch);
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  return (
    <div>
      <PageHeader title="الأقسام" subtitle="شجرة الأقسام الواحدة اللي بتغذّي التاجر والعميل والفلاتر. اتحكم في الترتيب والخصائص والوصف من هنا." actions={<Button icon={Plus} onClick={() => setEdit('new')}>قسم جديد</Button>} />
      <RequestsInbox all={all} data={reqs.data} reload={reqs.reload} onChanged={() => reload()} />
      {pendingList.length > 0 && (
        <section className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4" aria-label="طلبات أقسام قديمة">
          <p className="mb-3 text-base font-bold">أقسام مضافة من المحلات ({pendingList.length})</p>
          <ul className="space-y-2">
            {pendingList.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-3 ring-1 ring-line">
                <div className="min-w-0"><p className="truncate font-semibold">{d.name_ar}{d.parent && <span className="ms-2 text-xs font-normal text-muted">تحت: {byS.get(d.parent)?.name_ar || d.parent}</span>}</p><p className="text-xs text-muted">طلب من: {(d.requesters || []).join('، ') || '—'}</p></div>
                <div className="flex gap-2"><Button size="xs" disabled={busyId === d.id} onClick={() => decide(d, 'approve')}>قبول وإظهار في السوق</Button><Button size="xs" variant="danger-ghost" disabled={busyId === d.id} onClick={() => decide(d, 'reject')}>رفض</Button></div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="relative mb-4"><Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في الأقسام (عربي / English / مفتاح)" className="ps-9" aria-label="بحث" /></div>
      {loading && !data ? <Skeleton className="h-64 w-full rounded-2xl" /> : !roots.length ? <EmptyState title={needle ? 'مفيش نتيجة' : 'مفيش أقسام'} body={needle ? 'جرّب كلمة تانية.' : 'أضف أول قسم.'} /> : <ul className="space-y-1.5">{roots.map((d) => <Row key={d.id} d={d} level={0} />)}</ul>}
      <TaxonomyTools sections={raw.map((d) => ({ slug: d.slug, active: !!d.active, label: pathOf(d) }))} />
      <DeleteDialog key={del?.id} dept={del} others={all.filter((x) => x.slug !== del?.slug)} onClose={() => setDel(null)} onDone={(l) => { setLocal(l); reload(); }} />
      <DeptSheet all={all} defaultParent={newParent} dept={edit === 'new' || !edit ? edit : raw.find((x) => x.id === edit.id) || edit} onClose={() => { setEdit(null); setNewParent(''); }} onSaved={(l) => { setLocal(l); reload(); }} />
    </div>
  );
}
