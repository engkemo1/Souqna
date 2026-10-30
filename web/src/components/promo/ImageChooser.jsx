import { useRef, useState } from 'react';
import { Upload, Sparkles, Library, Check } from 'lucide-react';
import { upload } from '../../lib/api.js';
import { useApi } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { Segmented } from '../ui/Field.jsx';
import Button from '../ui/Button.jsx';
import SmartImage from '../ui/SmartImage.jsx';
import { PALETTE } from '../../lib/promo.js';
import { useToast } from '../ui/Toast.jsx';
import { cx } from '../ui/cx.js';

/**
 * Three ways to pick the offer picture (decorative only - it never changes what the offer calculates):
 *  auto    - chosen for the store from its products' category
 *  library - a shared image: offer type x product category (stored once for every store)
 *  custom  - the store's own upload, through the existing media pipeline (R2)
 */
export default function ImageChooser({ form, setForm, resolved, customMedia, onCustomMedia }) {
  const { lang } = useI18n();
  const p = (ar, en) => (lang === 'ar' ? ar : en);
  const toast = useToast();
  const { data } = useApi(`/owner/promotions/templates?type=${form.template_key || form.type}`);
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const mode = form.image_mode;
  const cats = data?.categories || [];
  const typeKey = form.template_key || form.type;
  const have = (cat) => { const c = cats.find((x) => x.key === cat); return c?.image ? { url: c.image } : null; };
  const catName = (c) => (lang === 'ar' ? c.name.ar : c.name.en);

  const doUpload = async (file) => {
    if (!file) return; setBusy(true);
    try {
      const fd = new FormData(); fd.append('files', file);
      const r = await upload('/owner/media?kind=offer', fd);
      const m = r.media[0];
      onCustomMedia(m); setForm({ ...form, image_mode: 'custom', image_media_id: m.id });
    } catch { toast({ tone: 'error', title: p('تعذر رفع الصورة', 'Upload failed') }); }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <Segmented value={mode} onChange={(v) => setForm({ ...form, image_mode: v })} ariaLabel="image mode"
        options={[{ value: 'auto', label: p('تلقائي', 'Automatic') }, { value: 'library', label: p('من المكتبة', 'Library') }, { value: 'custom', label: p('صورتي', 'My image') }]} />
      {mode === 'auto' && (
        <p className="flex items-start gap-2 rounded-xl bg-surface p-3 text-sm text-muted"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          {p(`بنختار صورة مناسبة لنوع العرض وقسم منتجاتك${resolved?.category ? ` (القسم: ${cats.find((c) => c.key === resolved.category) ? catName(cats.find((c) => c.key === resolved.category)) : resolved.category})` : ''}.`,
            `We pick a picture that fits the offer type and your products' category${resolved?.category ? ` (${cats.find((c) => c.key === resolved.category)?.name.en || resolved.category})` : ''}.`)}</p>
      )}
      {mode === 'library' && (
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm text-muted"><Library className="h-4 w-4" />{p('اختار فئة المنتجات. نفس الصورة لكل الكميات والأرقام.', 'Pick the product category. One image serves every quantity and number.')}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {cats.map((c) => {
              const img = have(c.key); const on = form.image_category === c.key; const [c1, c2] = PALETTE[typeKey] || PALETTE.custom;
              return (
                <button key={c.key} type="button" onClick={() => setForm({ ...form, image_category: c.key })} aria-pressed={on}
                  className={cx('relative overflow-hidden rounded-xl border-2 text-start transition', on ? 'border-primary shadow-soft' : 'border-line hover:border-line-strong')}>
                  <div className="aspect-[16/10] w-full" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>{img && <img src={img.url} alt="" loading="lazy" className="h-full w-full object-cover" />}</div>
                  <span className="flex items-center justify-between gap-2 px-2.5 py-2 text-xs font-semibold"><span className="truncate">{catName(c)}</span>{on && <Check className="h-4 w-4 text-brand" />}</span>
                  {!img && <span className="absolute end-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white">{p('بدون صورة', 'no image yet')}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {mode === 'custom' && (
        <div className="space-y-3">
          {customMedia ? <SmartImage media={customMedia} ratio="16 / 9" className="max-w-sm rounded-xl" sizes="384px" /> : <p className="text-sm text-muted">{p('ارفع صورة الإعلان الخاصة بالعرض (يفضل 16:9).', 'Upload your own offer banner (16:9 works best).')}</p>}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => doUpload(e.target.files?.[0])} />
          <Button variant="secondary" icon={Upload} loading={busy} onClick={() => fileRef.current?.click()}>{customMedia ? p('تغيير الصورة', 'Replace image') : p('رفع صورة', 'Upload image')}</Button>
        </div>
      )}
    </div>
  );
}
