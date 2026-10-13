import { useEffect, useState } from 'react';
import { ImagePlus, Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '../../components/dash/Kit.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import { Field, Input, Switch, Textarea } from '../../components/ui/Field.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { adminApi, adminUpload, useAdminApi } from './adminApi.js';

const blankAd = { image: '', preview: '', file: null, title_ar: '', title_en: '', subtitle_ar: '', subtitle_en: '', cta_ar: 'اكتشف الآن', cta_en: 'Explore now', link: '/search', starts_at: '', ends_at: '', position: '0', active: true };
const dateToday = () => new Date().toISOString().slice(0, 10);

function Editor({ ad, onClose, onSaved }) {
  const toast = useToast();
  const isNew = ad === 'new';
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!ad) { setForm(null); return; }
    setForm(isNew ? { ...blankAd } : {
      ...blankAd, image: ad.image, title_ar: ad.title.ar, title_en: ad.title.en,
      subtitle_ar: ad.subtitle.ar, subtitle_en: ad.subtitle.en, cta_ar: ad.cta.ar, cta_en: ad.cta.en,
      link: ad.link, starts_at: ad.startsAt || '', ends_at: ad.endsAt || '', position: String(ad.position), active: ad.active,
    });
  }, [ad, isNew]);
  const set = (name) => (event) => setForm((value) => ({ ...value, [name]: event.target.value }));
  const selectImage = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setForm((value) => ({ ...value, file, preview: URL.createObjectURL(file) }));
  };
  const save = async (event) => {
    event?.preventDefault();
    if (!form.image && !form.file) { toast({ tone: 'error', title: 'ارفع صورة الإعلان الأول' }); return; }
    setBusy(true);
    try {
      let image = form.image;
      if (form.file) image = (await adminUpload('/homepage-ads/image', form.file)).image;
      const body = {
        image, title_ar: form.title_ar, title_en: form.title_en, subtitle_ar: form.subtitle_ar, subtitle_en: form.subtitle_en,
        cta_ar: form.cta_ar, cta_en: form.cta_en, link: form.link, starts_at: form.starts_at || null,
        ends_at: form.ends_at || null, position: Number(form.position) || 0, active: form.active,
      };
      await adminApi(isNew ? '/homepage-ads' : `/homepage-ads/${ad.id}`, { method: isNew ? 'POST' : 'PUT', body });
      toast({ title: isNew ? 'اتضاف الإعلان' : 'اتحفظ الإعلان' });
      onSaved();
      onClose();
    } catch (error) {
      toast({ tone: 'error', title: error.code === 'image_too_small' ? 'الصورة لازم تكون ٦٠٠×٣٠٠ بكسل على الأقل' : error.code === 'invalid_image' ? 'الملف ده مش صورة مدعومة' : error.message });
    }
    setBusy(false);
  };
  const close = () => { if (!busy) onClose(); };
  return (
    <Sheet open={!!ad && !!form} onClose={close} title={isNew ? 'إعلان جديد للرئيسية' : 'تعديل إعلان الرئيسية'} side="end" size="lg"
      footer={<div className="flex gap-2"><Button full loading={busy} onClick={save}>{isNew ? 'إضافة الإعلان' : 'حفظ التعديلات'}</Button><Button variant="outline" onClick={close}>إلغاء</Button></div>}>
      {form && <form onSubmit={save} className="space-y-5 py-4">
        <div>
          <p className="mb-2 text-sm font-medium">صورة الإعلان</p>
          <label className="group relative flex min-h-44 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-line-strong bg-secondary/50 text-center transition hover:border-brand">
            {(form.preview || form.image) ? <img src={form.preview || form.image} alt="معاينة الإعلان" className="absolute inset-0 h-full w-full object-cover" /> : <span className="flex flex-col items-center gap-2 text-sm font-semibold text-muted"><ImagePlus className="h-8 w-8 text-brand" />اختار صورة عريضة للإعلان</span>}
            <span className="absolute bottom-3 end-3 rounded-full bg-elevated/95 px-3 py-1.5 text-xs font-bold shadow">{form.file || form.image ? 'تغيير الصورة' : 'رفع صورة'}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" onChange={selectImage} />
          </label>
          <p className="mt-1.5 text-xs text-muted">صورة عريضة 1200×600 أو أكبر، والحد الأقصى ٨ ميجابايت. الصورة بتتجهز تلقائيًا للويب.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="العنوان بالعربي"><Input required minLength={2} maxLength={80} value={form.title_ar} onChange={set('title_ar')} /></Field>
          <Field label="العنوان بالإنجليزي"><Input required minLength={2} maxLength={80} dir="ltr" className="text-start" value={form.title_en} onChange={set('title_en')} /></Field>
          <Field label="وصف مختصر بالعربي" optional><Textarea rows={2} maxLength={160} value={form.subtitle_ar} onChange={set('subtitle_ar')} /></Field>
          <Field label="وصف مختصر بالإنجليزي" optional><Textarea rows={2} maxLength={160} dir="ltr" className="text-start" value={form.subtitle_en} onChange={set('subtitle_en')} /></Field>
          <Field label="نص الزر بالعربي" optional><Input maxLength={30} value={form.cta_ar} onChange={set('cta_ar')} /></Field>
          <Field label="نص الزر بالإنجليزي" optional><Input maxLength={30} dir="ltr" className="text-start" value={form.cta_en} onChange={set('cta_en')} /></Field>
        </div>
        <Field label="صفحة الإعلان داخل الموقع" hint="اكتب مسارًا داخليًا، مثال: /search?sale=1 أو /s/اسم-المحل"><Input required dir="ltr" className="text-start" value={form.link} onChange={set('link')} placeholder="/search?sale=1" /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="يبدأ يوم" optional><Input type="date" dir="ltr" className="text-start" value={form.starts_at} onChange={set('starts_at')} min={dateToday()} /></Field>
          <Field label="ينتهي يوم" optional><Input type="date" dir="ltr" className="text-start" value={form.ends_at} onChange={set('ends_at')} min={form.starts_at || dateToday()} /></Field>
          <Field label="ترتيب العرض" hint="الأقل يظهر الأول"><Input type="number" min={0} max={999} value={form.position} onChange={set('position')} /></Field>
        </div>
        <Switch checked={form.active} onChange={(active) => setForm((value) => ({ ...value, active }))} label="الإعلان مفعّل" description="هيظهر للزبائن خلال المدة المحددة. تقدر توقفه في أي وقت." />
      </form>}
    </Sheet>
  );
}

export default function HomepageAds() {
  const { data, error, loading, reload } = useAdminApi('/homepage-ads');
  const toast = useToast();
  const [edit, setEdit] = useState(null);
  const items = data?.items || [];
  const toggle = async (ad) => {
    try { await adminApi(`/homepage-ads/${ad.id}`, { method: 'PATCH', body: { active: !ad.active } }); reload(); }
    catch (error) { toast({ tone: 'error', title: error.message }); }
  };
  const remove = async (ad) => {
    if (!window.confirm(`تحذف إعلان «${ad.title.ar}»؟`)) return;
    try { await adminApi(`/homepage-ads/${ad.id}`, { method: 'DELETE' }); toast({ title: 'اتحذف الإعلان' }); reload(); }
    catch (error) { toast({ tone: 'error', title: error.message }); }
  };
  return (
    <div>
      <PageHeader title="إعلانات الرئيسية" subtitle="إعلانات طِلّة اللي تظهر للزبائن في الصفحة الرئيسية" actions={<Button icon={Plus} onClick={() => setEdit('new')}>إعلان جديد</Button>} />
      {error && !data ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <Skeleton className="h-64 w-full rounded-2xl" /> : !items.length ? (
        <EmptyState icon={Megaphone} title="مفيش إعلانات لسه" body="أضف إعلان بصورة ورابط داخلي، وحدد موعد ظهوره أو فعّله فورًا." action={<Button icon={Plus} onClick={() => setEdit('new')}>إضافة أول إعلان</Button>} />
      ) : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((ad) => <article key={ad.id} className="overflow-hidden rounded-2xl border border-line bg-elevated">
          <div className="relative aspect-[16/8] bg-secondary"><img src={ad.image} alt={ad.title.ar} className="h-full w-full object-cover" /><Badge className="absolute start-3 top-3" tone={ad.active ? 'success' : 'neutral'} dot>{ad.active ? 'مفعّل' : 'متوقف'}</Badge></div>
          <div className="p-4"><p className="truncate text-lg font-bold">{ad.title.ar}</p><p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted">{ad.subtitle.ar || 'من غير وصف'}</p><p className="mt-2 truncate text-xs text-muted" dir="ltr">{ad.link}</p>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3"><Button size="xs" variant={ad.active ? 'outline' : 'brand'} onClick={() => toggle(ad)}>{ad.active ? 'إيقاف الإعلان' : 'تفعيل الإعلان'}</Button><Button size="xs" variant="outline" icon={Pencil} onClick={() => setEdit(ad)}>تعديل</Button><Button size="xs" variant="danger-ghost" icon={Trash2} onClick={() => remove(ad)}>حذف</Button></div>
          </div>
        </article>)}
      </div>}
      <Editor ad={edit} onClose={() => setEdit(null)} onSaved={reload} />
    </div>
  );
}
