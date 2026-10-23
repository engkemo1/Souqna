import { useEffect, useRef, useState } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { Plus, FolderTree, Pencil, Trash2, GripVertical } from 'lucide-react';
import { useApi, invalidate } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { PageHeader, ListSkeleton } from '../../components/dash/Kit.jsx';
import MediaUploader from '../../components/dash/MediaUploader.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import Button, { IconButton } from '../../components/ui/Button.jsx';
import Sheet, { ConfirmDialog } from '../../components/ui/Sheet.jsx';
import { Field, Input } from '../../components/ui/Field.jsx';
import { EmptyState, ErrorState, errorMessage, fieldErrors } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import PageTransition from '../../components/PageTransition.jsx';
import { SUBSECTION_SUGGESTIONS } from '../../lib/subsections.js';

function CatRow({ c, onEdit, onDelete, onDragEnd, onAddSub, canTop, parent, t, tr }) {
  const locked = !!c.system && !canTop; // أقسام الأدمن (الرئيسية وأنواعها) مفيهاش تعديل لصاحب المحل؛ اللي هو أضافه يعدّل فيه
  const controls = useDragControls();
  return (
    <Reorder.Item value={c} dragListener={false} dragControls={controls} onDragEnd={onDragEnd} className="list-none" whileDrag={{ scale: 1.02, boxShadow: '0 20px 40px -20px rgba(0,0,0,.3)' }}>
      <div className={`flex items-center gap-3 rounded-2xl border border-line bg-elevated p-3 ${c.parentId ? 'ms-8' : ''}`}>
        <button type="button" onPointerDown={(e) => controls.start(e)} aria-label="Reorder" className="grid h-11 w-8 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted hover:bg-fg/[0.05]"><GripVertical className="h-5 w-5" /></button>
        <SmartImage media={c.image} ratio="1 / 1" sizes="64px" className="h-14 w-14 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1"><p className="truncate font-semibold">{tr(c.name)}{parent && <span className="ms-2 text-xs font-normal text-muted">تحت: {tr(parent.name)}</span>}</p><p className="text-sm text-muted">{t('categories.count', { n: c.count ?? 0 })}</p></div>
        {!c.parentId && <Button size="sm" variant="outline" icon={Plus} onClick={() => onAddSub(c)}>قسم فرعي</Button>}
        {!locked && <IconButton size="sm" label={t('common.edit')} icon={Pencil} iconClass="h-4 w-4" onClick={() => onEdit(c)} />}
        {!locked && <IconButton size="sm" label={t('common.delete')} icon={Trash2} iconClass="h-4 w-4 text-sale" onClick={() => onDelete(c)} />}
      </div>
    </Reorder.Item>
  );
}

export default function Categories() {
  const { t, tr } = useI18n();
  const { store } = useAuth();
  const toast = useToast();
  const { data, error, reload, mutate } = useApi('/owner/categories');
  const [form, setForm] = useState(null);
  const [f, setF] = useState({ name_ar: '', name_en: '', media: [], parent_id: null });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(null);
  const [picks, setPicks] = useState([]);
  const items = data?.items || [];
  const canTop = !!data?.canManageTop;
  const ref = useRef(items);
  ref.current = items;

  useEffect(() => {
    if (!form) return;
    setErrors({}); setPicks([]);
    setF(form.id ? { name_ar: form.name.ar, name_en: form.name.en, media: form.image ? [form.image] : [], parent_id: form.parentId ?? null } : { name_ar: '', name_en: '', media: [], parent_id: form.parentId ?? null });
  }, [form]);

  const save = async () => {
    setBusy(true);
    try {
      if (!form.id) {
        // sub-sections: the ticked suggestions + (optionally) one the owner typed himself
        const todo = [...picks, ...(f.name_ar.trim() ? [{ ar: f.name_ar.trim(), en: (f.name_en || '').trim() || f.name_ar.trim() }] : [])];
        const made = [];
        for (const p of todo) {
          const r = await api('/owner/categories', { method: 'POST', body: { name_ar: p.ar, name_en: p.en, media_id: f.media[0]?.id && todo.length === 1 ? f.media[0].id : null, parent_id: f.parent_id ? Number(f.parent_id) : null } });
          made.push(r.category);
        }
        mutate((d) => ({ ...d, items: [...d.items, ...made] }));
      } else {
        const body = { name_ar: f.name_ar, name_en: f.name_en || f.name_ar, media_id: f.media[0]?.id ?? null, parent_id: f.parent_id ? Number(f.parent_id) : null };
        if (!canTop) delete body.parent_id;
        const r = await api(`/owner/categories/${form.id}`, { method: 'PUT', body });
        mutate((d) => ({ ...d, items: d.items.map((x) => (x.id === form.id ? { ...r.category, count: x.count } : x)) }));
      }
      invalidate(`/stores/${store.slug}`);
      toast({ title: t('categories.saved') });
      setForm(null);
    } catch (e) { setErrors(fieldErrors(t, e)); if (!e.fields) toast({ tone: 'error', title: errorMessage(t, e) }); }
    setBusy(false);
  };
  const persist = async () => {
    try { await api('/owner/categories-order', { method: 'PUT', body: { ids: ref.current.map((c) => c.id) } }); invalidate(`/stores/${store.slug}`); } catch (e) { toast({ tone: 'error', title: errorMessage(t, e) }); }
  };
  const remove = async () => {
    try { await api(`/owner/categories/${del.id}`, { method: 'DELETE' }); mutate((d) => ({ items: d.items.filter((x) => x.id !== del.id) })); toast({ title: t('categories.deleted') }); } catch (e) { toast({ tone: 'error', title: errorMessage(t, e) }); }
    setDel(null);
  };

  return (
    <PageTransition>
      <PageHeader title={t('categories.title')} subtitle={items.length > 1 ? t('categories.reorderHint') : null} actions={<Button icon={Plus} onClick={() => setForm({})}>{canTop ? t('categories.new') : 'قسم فرعي جديد'}</Button>} />
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <ListSkeleton rows={4} /> : !items.length ? (
        <EmptyState icon={FolderTree} title={t('categories.empty')} body={t('categories.emptyBody')} action={canTop ? <Button icon={Plus} onClick={() => setForm({})}>{t('categories.new')}</Button> : null} />
      ) : (
        <Reorder.Group axis="y" values={items} onReorder={(list) => mutate({ items: list })} className="max-w-3xl space-y-3">
          {items.map((c) => <CatRow key={c.id} c={c} t={t} tr={tr} onEdit={setForm} onDelete={setDel} onDragEnd={persist} canTop={canTop} onAddSub={(p) => setForm({ parentId: p.id })} parent={c.parentId ? items.find((x) => x.id === c.parentId) : null} />)}
        </Reorder.Group>
      )}
      <Sheet open={!!form} onClose={() => setForm(null)} title={form?.id ? t('common.edit') : t('categories.new')} side="auto" desktop="center" size="md"
        footer={<Button full size="lg" onClick={save} loading={busy} disabled={form?.id ? (!f.name_ar || (!canTop && false)) : ((!picks.length && !f.name_ar.trim()) || (!canTop && !f.parent_id))}>{t('common.save')}</Button>}>
        <div className="space-y-4 py-4">
          {!form?.id && (() => {
            const parent = items.find((x) => x.id === Number(f.parent_id));
            const have = new Set(items.filter((x) => x.parentId === parent?.id).map((x) => x.name.ar));
            const sugg = (parent && SUBSECTION_SUGGESTIONS[parent.slug] || []).filter((x) => !have.has(x.ar));
            if (!parent) return <p className="rounded-xl bg-secondary px-3 py-2 text-[13px] text-muted">اختار القسم الرئيسي الأول (تحت)، وهتظهرلك أقسام جاهزة تختار منها.</p>;
            return sugg.length ? (
              <div>
                <p className="mb-2 text-sm font-medium">اختار من الأقسام الجاهزة لـ «{tr(parent.name)}» أو اكتب قسمك تحت</p>
                <div className="flex flex-wrap gap-2">
                  {sugg.map((x) => { const on = picks.some((p) => p.ar === x.ar); return (
                    <button key={x.ar} type="button" aria-pressed={on} onClick={() => setPicks(on ? picks.filter((p) => p.ar !== x.ar) : [...picks, x])}
                      className={`h-9 rounded-full border px-3.5 text-sm font-medium transition active:scale-95 ${on ? 'border-fg bg-fg text-canvas' : 'border-line-strong hover:border-fg'}`}>{x.ar}</button>
                  ); })}
                </div>
              </div>
            ) : null;
          })()}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('categories.nameAr')} error={errors.name_ar}><Input dir="rtl" value={f.name_ar} onChange={(e) => setF({ ...f, name_ar: e.target.value })} /></Field>
            <Field label={t('categories.nameEn')} error={errors.name_en} optional="اختياري"><Input dir="ltr" value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} /></Field>
          </div>
          <Field label="القسم الرئيسي" hint={canTop ? 'سيبه فاضي لو ده قسم رئيسي' : 'القسم الفرعي بيظهر تحت القسم الرئيسي في متجرك'}>
            <select dir="rtl" className="h-11 w-full rounded-xl border border-line-strong bg-elevated px-3 text-sm" value={f.parent_id || ''} disabled={!canTop && !!form?.id} onChange={(e) => setF({ ...f, parent_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">{canTop ? '— قسم رئيسي —' : '— اختار القسم —'}</option>
              {items.filter((x) => !x.parentId && x.id !== form?.id).map((x) => <option key={x.id} value={x.id}>{tr(x.name)}</option>)}
            </select>
          </Field>
          <Field label={t('editor.images')} optional={t('common.optional')}><MediaUploader value={f.media} onChange={(m) => setF((x) => ({ ...x, media: m.slice(-1) }))} kind="category" max={1} /></Field>
        </div>
      </Sheet>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={remove} danger title={t('common.delete')} body={del ? t('categories.confirmDelete', { name: tr(del.name) }) : ''} confirmLabel={t('common.delete')} />
    </PageTransition>
  );
}
