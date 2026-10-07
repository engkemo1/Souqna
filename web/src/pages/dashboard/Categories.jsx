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

function CatRow({ c, onEdit, onDelete, onDragEnd, t, tr }) {
  const controls = useDragControls();
  return (
    <Reorder.Item value={c} dragListener={false} dragControls={controls} onDragEnd={onDragEnd} className="list-none" whileDrag={{ scale: 1.02, boxShadow: '0 20px 40px -20px rgba(0,0,0,.3)' }}>
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-elevated p-3">
        <button type="button" onPointerDown={(e) => controls.start(e)} aria-label="Reorder" className="grid h-11 w-8 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted hover:bg-fg/[0.05]"><GripVertical className="h-5 w-5" /></button>
        <SmartImage media={c.image} ratio="1 / 1" sizes="64px" className="h-14 w-14 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1"><p className="truncate font-semibold">{tr(c.name)}</p><p className="text-sm text-muted">{t('categories.count', { n: c.count ?? 0 })}</p></div>
        <IconButton size="sm" label={t('common.edit')} icon={Pencil} iconClass="h-4 w-4" onClick={() => onEdit(c)} />
        <IconButton size="sm" label={t('common.delete')} icon={Trash2} iconClass="h-4 w-4 text-sale" onClick={() => onDelete(c)} />
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
  const [f, setF] = useState({ name_ar: '', name_en: '', media: [] });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(null);
  const items = data?.items || [];
  const ref = useRef(items);
  ref.current = items;

  useEffect(() => {
    if (!form) return;
    setErrors({});
    setF(form.id ? { name_ar: form.name.ar, name_en: form.name.en, media: form.image ? [form.image] : [] } : { name_ar: '', name_en: '', media: [] });
  }, [form]);

  const save = async () => {
    setBusy(true);
    try {
      const body = { name_ar: f.name_ar, name_en: f.name_en, media_id: f.media[0]?.id ?? null };
      const r = await api(form.id ? `/owner/categories/${form.id}` : '/owner/categories', { method: form.id ? 'PUT' : 'POST', body });
      mutate((d) => ({ items: form.id ? d.items.map((x) => (x.id === form.id ? { ...r.category, count: x.count } : x)) : [...d.items, r.category] }));
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
      <PageHeader title={t('categories.title')} subtitle={items.length > 1 ? t('categories.reorderHint') : null} actions={<Button icon={Plus} onClick={() => setForm({})}>{t('categories.new')}</Button>} />
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <ListSkeleton rows={4} /> : !items.length ? (
        <EmptyState icon={FolderTree} title={t('categories.empty')} body={t('categories.emptyBody')} action={<Button icon={Plus} onClick={() => setForm({})}>{t('categories.new')}</Button>} />
      ) : (
        <Reorder.Group axis="y" values={items} onReorder={(list) => mutate({ items: list })} className="max-w-3xl space-y-3">
          {items.map((c) => <CatRow key={c.id} c={c} t={t} tr={tr} onEdit={setForm} onDelete={setDel} onDragEnd={persist} />)}
        </Reorder.Group>
      )}
      <Sheet open={!!form} onClose={() => setForm(null)} title={form?.id ? t('common.edit') : t('categories.new')} side="auto" desktop="center" size="md"
        footer={<Button full size="lg" onClick={save} loading={busy} disabled={!f.name_ar || !f.name_en}>{t('common.save')}</Button>}>
        <div className="space-y-4 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('categories.nameAr')} error={errors.name_ar}><Input dir="rtl" value={f.name_ar} onChange={(e) => setF({ ...f, name_ar: e.target.value })} /></Field>
            <Field label={t('categories.nameEn')} error={errors.name_en}><Input dir="ltr" value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} /></Field>
          </div>
          <Field label={t('editor.images')} optional={t('common.optional')}><MediaUploader value={f.media} onChange={(m) => setF((x) => ({ ...x, media: m.slice(-1) }))} kind="category" max={1} /></Field>
        </div>
      </Sheet>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={remove} danger title={t('common.delete')} body={del ? t('categories.confirmDelete', { name: tr(del.name) }) : ''} confirmLabel={t('common.delete')} />
    </PageTransition>
  );
}
