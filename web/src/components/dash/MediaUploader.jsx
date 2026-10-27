import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy, sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ImagePlus, Camera, Images, Star, X, GripVertical, AlertCircle, RotateCw, ChevronLeft, ChevronRight, Lightbulb, Check, Eye, Palette } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDashBase } from '../../lib/dashBase.js';
import { api, upload } from '../../lib/api.js';
import { useToast } from '../ui/Toast.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import SmartImage from '../ui/SmartImage.jsx';
import { errorMessage } from '../ui/States.jsx';
import { cx } from '../ui/cx.js';
import { previewLooks } from '../../lib/photoPreview.js';

const MAX = 12;
let uid = 0;

/** Downscale big photos on-device before upload — much faster on mobile data. */
async function compress(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.2 * 1024 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }) : file;
  } catch { return file; }
}


/** Photo guidelines shown with the product uploader so every store ends up with a clean, consistent catalogue. */
function Tips({ t, empty }) {
  const base = useDashBase();
  return (
    <details open={empty} className="mb-3 rounded-2xl border border-line bg-secondary/40 p-4 text-sm [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold"><Lightbulb className="h-4 w-4 text-brand" />{t('editor.tipsTitle')}</summary>
      <p className="mt-3 flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-[13px] font-medium leading-relaxed text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"><Check className="mt-0.5 h-4 w-4 shrink-0" />{t('editor.tipsLead')}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-center text-[12px] font-medium text-muted" aria-hidden="true">
        <div><div className="relative mx-auto grid aspect-[4/5] w-20 place-items-center rounded-xl bg-white ring-2 ring-emerald-500"><span className="h-10 w-9 rounded-md bg-[#1d4e89] shadow-sm" /><span className="absolute -end-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white"><Check className="h-3 w-3" /></span></div><p className="mt-1.5">{t('editor.tipGood')}</p></div>
        <div><div className="relative mx-auto grid aspect-[4/5] w-20 place-items-center overflow-hidden rounded-xl ring-2 ring-red-400" style={{ background: 'repeating-linear-gradient(45deg,#c9b79c,#c9b79c 6px,#8a9a7b 6px,#8a9a7b 12px)' }}><span className="h-10 w-9 -rotate-6 rounded-md bg-[#1d4e89]/80" /><span className="absolute -end-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-red-500 text-white"><X className="h-3 w-3" /></span></div><p className="mt-1.5">{t('editor.tipBad')}</p></div>
      </div>
      <ul className="mt-3 list-disc space-y-1.5 ps-5 text-[13.5px] leading-relaxed text-muted marker:text-brand">
        {[1, 2, 3, 4, 5].map((n) => <li key={n}>{t(`editor.tip${n}`)}</li>)}
      </ul>
      {base === '/dashboard' && <Link to="/dashboard/services" className="mt-3 inline-block text-[13px] font-semibold text-brand hover:underline">{t('editor.tipsPhoto')}</Link>}
    </details>
  );
}

/** Background choice, right where photos are added. Saved on the store; applies to the next uploads. */
function PhotoStyleBar({ t }) {
  const toast = useToast();
  const [style, setStyle] = useState(null);
  useEffect(() => { let off = false; api('/owner/photo-style').then((r) => { if (!off) setStyle(r.style); }).catch(() => {}); return () => { off = true; }; }, []);
  if (!style) return null;
  const opts = [['white', t('settings.photoWhite'), '#ffffff'], ['cream', t('settings.photoCream'), '#f5efe6'], ['original', t('settings.photoOriginal'), null]];
  const pick = async (v) => {
    if (v === style) return;
    const prev = style; setStyle(v);
    try { await api('/owner/photo-style', { method: 'PUT', body: { style: v } }); }
    catch (e) { setStyle(prev); toast({ tone: 'error', title: e.message || t('editor.uploadFailed') }); }
  };
  return (
    <div className="mb-3 rounded-2xl border border-line bg-elevated p-3">
      <p className="text-sm font-semibold">{t('editor.photoStyleLabel')}</p>
      <div role="radiogroup" aria-label={t('editor.photoStyleLabel')} className="mt-2 grid grid-cols-3 gap-2">
        {opts.map(([v, label, bg]) => (
          <button key={v} type="button" role="radio" aria-checked={style === v} onClick={() => pick(v)}
            className={cx('flex flex-col items-center gap-1.5 rounded-xl p-2 text-xs font-semibold ring-1 transition active:scale-[.97]', style === v ? 'bg-fg/[0.05] ring-2 ring-fg' : 'ring-line hover:bg-fg/[0.03]')}>
            <span className="grid h-12 w-10 place-items-center overflow-hidden rounded-md ring-1 ring-line" style={bg ? { background: bg } : { background: 'linear-gradient(135deg,#9aa4b2,#4b5563 55%,#cbd5e1)' }} aria-hidden="true"><span className="h-6 w-5 rounded-[4px] bg-[#1d4e89] shadow-sm" /></span>
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-muted">{t('editor.photoStyleNote')}</p>
    </div>
  );
}

function Tile({ item, index, total, onRemove, onPrimary, onMove, onRetry, onRestyle, t }) {
  const [orig, setOrig] = useState(false);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const q = item.media?.q;
  const level = q == null ? null : q >= 75 ? 'great' : q >= 50 ? 'ok' : 'weak';
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.key, disabled: item.status !== 'done' });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const primary = index === 0 && item.status === 'done';
  return (
    <motion.li ref={setNodeRef} style={style} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }}
      className={cx('group relative list-none', isDragging && 'z-10')}>
      <div className={cx('relative overflow-hidden rounded-2xl bg-surface ring-1 ring-line transition-shadow', isDragging && 'shadow-lift ring-2 ring-primary', primary && 'ring-2 ring-primary')}>
        {item.media ? (orig ? <div className="relative aspect-[4/5] bg-neutral-100"><img src={`${item.media.base}/source.jpg`} alt="" className="absolute inset-0 h-full w-full object-contain" loading="lazy" /></div> : <SmartImage media={item.media} ratio="4 / 5" sizes="160px" />) : (
          <div className="relative aspect-[4/5]">
            {item.preview && <img src={item.preview} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />}
          </div>
        )}
        {/* drag handle covers image on desktop; explicit handle on touch */}
        {item.status === 'done' && <button type="button" {...attributes} {...listeners} aria-label={`Drag ${index + 1}`} className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing [@media(hover:none)]:hidden" />}
        {item.status === 'done' && (
          <button type="button" {...attributes} {...listeners} aria-label={`Drag ${index + 1}`} className="absolute bottom-1.5 start-1.5 grid h-9 w-9 touch-none place-items-center rounded-full bg-white/90 text-neutral-800 shadow-sm [@media(hover:hover)]:hidden">
            <GripVertical className="h-4 w-4" />
          </button>
        )}

        {(item.status === 'uploading' || item.status === 'processing') && (
          <div className="absolute inset-0 grid place-items-center bg-black/30 p-3 text-center text-white">
            <div className="w-full">
              <div className="mx-auto h-1.5 w-4/5 overflow-hidden rounded-full bg-white/30">
                <motion.div className="h-full rounded-full bg-white" animate={{ width: `${item.status === 'processing' ? 100 : item.progress}%` }} transition={{ duration: 0.2 }} />
              </div>
              <p className="mt-2 text-xs font-semibold">{item.status === 'processing' ? t('editor.processing') : t('editor.uploading', { p: item.progress })}</p>
            </div>
          </div>
        )}
        {busy && <div className="absolute inset-0 grid place-items-center bg-black/35 text-xs font-semibold text-white">{t('editor.bgBusy')}</div>}
        {item.status === 'error' && (
          <div className="absolute inset-0 grid place-items-center bg-red-950/60 p-2 text-center text-white">
            <div><AlertCircle className="mx-auto h-6 w-6" /><p className="mt-1 text-xs font-semibold">{item.error || t('editor.uploadFailed')}</p>
              <button type="button" onClick={() => onRetry(item)} className="mt-2 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-neutral-900"><RotateCw className="h-3 w-3" />{t('common.retry')}</button></div>
          </div>
        )}

        {level && <span className={cx('pointer-events-none absolute bottom-1.5 end-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold shadow-sm', level === 'great' ? 'bg-emerald-500 text-white' : level === 'ok' ? 'bg-amber-400 text-neutral-900' : 'bg-red-500 text-white')}>{t(level === 'great' ? 'editor.qGreat' : level === 'ok' ? 'editor.qOk' : 'editor.qWeak')}</span>}
        {primary && <span className="pointer-events-none absolute start-2 top-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-on-primary"><Star className="h-3 w-3 fill-current" />{t('editor.primary')}</span>}
        <button type="button" onClick={() => onRemove(item)} aria-label={t('editor.removeImage')} className="absolute end-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-neutral-800 shadow-sm transition hover:bg-white hover:text-red-600 active:scale-90">
          <X className="h-4 w-4" />
        </button>
      </div>
      {item.status === 'done' && q != null && (
        <div className="relative mt-1">
          <button type="button" onClick={() => setMenu((v) => !v)} aria-expanded={menu} disabled={busy} className="flex w-full items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-muted ring-1 ring-line hover:bg-fg/[0.04] disabled:opacity-50"><Palette className="h-3.5 w-3.5" />{t('editor.bgChange')}</button>
          {menu && (
            <ul className="mt-1 space-y-0.5 rounded-xl bg-elevated p-1 text-[12px] font-medium ring-1 ring-line">
              {[['white', t('settings.photoWhite')], ['cream', t('settings.photoCream')], ['original', t('editor.bgOriginal')], ['asis', t('editor.bgAsis')]].map(([v, label]) => (
                <li key={v}><button type="button" onClick={async () => { setMenu(false); setBusy(true); try { await onRestyle(item, v); } finally { setBusy(false); } }} className="w-full rounded-lg px-2 py-1.5 text-start hover:bg-fg/[0.06]">{label}</button></li>
              ))}
            </ul>
          )}
        </div>
      )}
      {item.status === 'done' && (
        <div className="mt-1.5 flex items-center justify-between gap-1">
          {!primary ? <button type="button" onClick={() => onPrimary(item)} title={t('editor.makePrimary')} aria-label={t('editor.makePrimary')} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-fg/[0.05] hover:text-amber-600"><Star className="h-4 w-4" /></button> : <span />}
          {q != null && <button type="button" onClick={() => setOrig((v) => !v)} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-muted hover:bg-fg/[0.05]"><Eye className="h-3.5 w-3.5" />{orig ? t('editor.viewResult') : t('editor.viewOriginal')}</button>}
          <span className="flex">
            <button type="button" disabled={index === 0} onClick={() => onMove(index, -1)} aria-label={t('editor.moveEarlier')} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-fg/[0.05] disabled:opacity-30"><ChevronLeft className="h-4 w-4 rtl:-scale-x-100" /></button>
            <button type="button" disabled={index === total - 1} onClick={() => onMove(index, 1)} aria-label={t('editor.moveLater')} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-fg/[0.05] disabled:opacity-30"><ChevronRight className="h-4 w-4 rtl:-scale-x-100" /></button>
          </span>
        </div>
      )}
    </motion.li>
  );
}

/** Optional step before the first upload: shows (approximately) how the photo will look, lets the owner pick the background. */
function PreviewSheet({ t, files, onConfirm, onCancel }) {
  const toast = useToast();
  const [style, setStyle] = useState('white');
  const [info, setInfo] = useState(undefined);
  const [skip, setSkip] = useState(false);
  useEffect(() => {
    let off = false;
    api('/owner/photo-style').then((r) => { if (!off) setStyle(r.style); }).catch(() => {});
    previewLooks(files[0]).then((r) => { if (!off) setInfo(r); });
    return () => { off = true; };
  }, [files]);
  const opts = [['white', t('settings.photoWhite')], ['cream', t('settings.photoCream')], ['original', t('settings.photoOriginal')]];
  const go = async () => {
    try { await api('/owner/photo-style', { method: 'PUT', body: { style } }); } catch (e) { toast({ tone: 'error', title: e.message || t('editor.uploadFailed') }); }
    try { if (skip) localStorage.setItem('souqna.skipPhotoPreview', '1'); } catch { /* storage unavailable */ }
    onConfirm(style);
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={t('editor.pvTitle')}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-elevated p-4 shadow-lift sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-center justify-between"><h3 className="text-base font-bold">{t('editor.pvTitle')}</h3>
          <button type="button" onClick={onCancel} aria-label={t('common.cancel')} className="grid h-9 w-9 place-items-center rounded-full hover:bg-fg/[0.06]"><X className="h-4 w-4" /></button></div>
        <div className="mt-3 grid grid-cols-3 gap-2.5">
          {opts.map(([v, label]) => (
            <button key={v} type="button" onClick={() => setStyle(v)} aria-pressed={style === v} className={cx('rounded-2xl p-1.5 text-center text-xs font-semibold ring-1 transition active:scale-[.98]', style === v ? 'bg-fg/[0.05] ring-2 ring-fg' : 'ring-line')}>
              <span className="block aspect-[4/5] overflow-hidden rounded-xl bg-surface">
                {info ? <img src={info.looks[v]} alt="" className="h-full w-full object-cover" /> : info === null ? <img src={URL.createObjectURL(files[0])} alt="" className="h-full w-full object-cover" onLoad={(e) => URL.revokeObjectURL(e.currentTarget.src)} /> : <span className="block h-full w-full animate-pulse bg-fg/[0.06]" />}
              </span>
              <span className="mt-1.5 block">{label}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted">{info && !info.studio ? t('editor.pvNoStudio') : t('editor.pvNote')}</p>
        {files.length > 1 && <p className="mt-1 text-[12.5px] text-muted">{t('editor.pvMany', { n: files.length })}</p>}
        <label className="mt-3 flex items-center gap-2 text-[13px] text-muted"><input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} className="h-4 w-4" />{t('editor.pvSkip')}</label>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={go} className="h-11 flex-1 rounded-xl bg-primary text-sm font-semibold text-on-primary active:scale-[.98]">{t('editor.pvGo')}</button>
          <button type="button" onClick={onCancel} className="h-11 rounded-xl px-4 text-sm font-semibold text-muted ring-1 ring-line">{t('common.cancel')}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Product media manager: multi-upload with progress, drag & drop (desktop),
 * gallery/camera pickers (mobile), drag-to-reorder, first image = primary.
 * `value` is the ordered list of uploaded media objects.
 */
export default function MediaUploader({ value, onChange, kind = 'product', max = MAX, error }) {
  const { t } = useI18n();
  const toast = useToast();
  const [pending, setPending] = useState([]);
  const [over, setOver] = useState(false);
  const [staged, setStaged] = useState(null);
  const [styleKey, setStyleKey] = useState(0);
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const start = useCallback(async (item) => {
    setPending((p) => p.map((x) => (x.key === item.key ? { ...x, status: 'uploading', progress: 0, error: null } : x)));
    try {
      const file = await compress(item.file);
      const fd = new FormData();
      fd.append('files', file);
      const res = await upload(`/owner/media?kind=${kind}`, fd, (progress) => {
        setPending((p) => p.map((x) => (x.key === item.key ? { ...x, progress, status: progress >= 100 ? 'processing' : 'uploading' } : x)));
      });
      setPending((p) => p.filter((x) => x.key !== item.key));
      if (item.preview) URL.revokeObjectURL(item.preview);
      onChange([...valueRef.current, ...res.media]);
    } catch (e) {
      setPending((p) => p.map((x) => (x.key === item.key ? { ...x, status: 'error', error: errorMessage(t, e) } : x)));
    }
  }, [kind, onChange, t]);

  const doAdd = (files) => {
    const room = max - value.length - pending.length;
    const list = [...files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name)).slice(0, Math.max(0, room));
    const items = list.map((file) => ({ key: `u${++uid}`, file, preview: URL.createObjectURL(file), status: 'uploading', progress: 0 }));
    setPending((p) => [...p, ...items]);
    // two at a time keeps phones responsive
    (async () => {
      const queue = [...items];
      const worker = async () => { while (queue.length) await start(queue.shift()); };
      await Promise.all([worker(), worker()]);
    })();
  };

  const addFiles = (files) => {
    const list = [...files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    if (!list.length) return;
    let skip = false;
    try { skip = localStorage.getItem('souqna.skipPhotoPreview') === '1'; } catch { /* storage unavailable */ }
    if (kind !== 'product' || skip || !/^image\/(jpeg|png|webp)$/.test(list[0].type)) doAdd(list);
    else setStaged(list);
  };

  const done = value.map((m) => ({ key: `m${m.id}`, media: m, status: 'done' }));
  const all = [...done, ...pending];
  const removeItem = (item) => {
    if (item.status === 'done') onChange(value.filter((m) => m.id !== item.media.id));
    else setPending((p) => p.filter((x) => x.key !== item.key));
  };
  const restyle = async (item, style) => {
    try {
      const r = await api(`/owner/media/${item.media.id}/restyle`, { method: 'POST', body: { style } });
      onChange(valueRef.current.map((m) => (m.id === item.media.id ? r.media : m)));
    } catch (e) { toast({ tone: 'error', title: errorMessage(t, e) }); }
  };
  const makePrimary = (item) => onChange([item.media, ...value.filter((m) => m.id !== item.media.id)]);
  const move = (i, d) => onChange(arrayMove(value, i, i + d));
  const onDragEnd = ({ active, over: o }) => {
    if (!o || active.id === o.id) return;
    const from = done.findIndex((x) => x.key === active.id);
    const to = done.findIndex((x) => x.key === o.id);
    if (from >= 0 && to >= 0) onChange(arrayMove(value, from, to));
  };

  const full = all.length >= max;
  return (
    <div>
      {kind === 'product' && <PhotoStyleBar key={styleKey} t={t} />}
      {staged && <PreviewSheet t={t} files={staged} onCancel={() => setStaged(null)} onConfirm={() => { const f = staged; setStaged(null); setStyleKey((k) => k + 1); doAdd(f); }} />}
      {kind === 'product' && <Tips t={t} empty={value.length === 0 && pending.length === 0} />}
      <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />

      {!full && (
        <>
          {/* desktop dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}
            className={cx('hidden flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-9 text-center transition-colors [@media(hover:hover)]:flex',
              over ? 'border-primary bg-primary/[0.05]' : error ? 'border-sale/50' : 'border-line-strong hover:border-fg/30')}>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-brand"><ImagePlus className="h-6 w-6" /></span>
            <p className="mt-3 text-base font-medium">{t('editor.drop')} <button type="button" onClick={() => galleryRef.current?.click()} className="font-semibold text-brand underline-offset-4 hover:underline">{t('editor.browse')}</button></p>
            <p className="mt-1.5 text-[13px] text-muted">{t('editor.imagesHint')}</p>
          </div>
          {/* touch: gallery + camera */}
          <div className="grid grid-cols-2 gap-3 [@media(hover:hover)]:hidden">
            <button type="button" onClick={() => galleryRef.current?.click()} className={cx('flex h-24 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed bg-elevated text-sm font-semibold transition active:scale-[.98]', error ? 'border-sale/50' : 'border-line-strong')}>
              <Images className="h-6 w-6 text-brand" />{t('editor.gallery')}
            </button>
            <button type="button" onClick={() => cameraRef.current?.click()} className="flex h-24 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong bg-elevated text-sm font-semibold transition active:scale-[.98]">
              <Camera className="h-6 w-6 text-brand" />{t('editor.camera')}
            </button>
            <p className="col-span-2 text-center text-xs text-muted">{t('editor.imagesHint')}</p>
          </div>
        </>
      )}
      {error && <p className="mt-2 text-[13px] font-medium text-sale" role="alert">{error}</p>}

      {all.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={done.map((d) => d.key)} strategy={rectSortingStrategy}>
            <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              <AnimatePresence initial={false}>
                {all.map((item, i) => (
                  <Tile key={item.key} item={item} index={i} total={done.length} t={t} onRemove={removeItem} onPrimary={makePrimary} onMove={move} onRetry={start} onRestyle={restyle} />
                ))}
              </AnimatePresence>
            </ul>
          </SortableContext>
        </DndContext>
      )}
      {kind === 'product' && done.length > 0 && (
        <div className="mt-3 space-y-1.5 text-[13px] leading-relaxed">
          <p className="text-muted">{t('editor.previewNote')}</p>
          {value.some((m) => m.q != null && m.q < 50) && <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />{t('editor.qWeakNote')} {t('editor.qWeakTip')}</p>}
          {!value.some((m) => m.q != null && m.q < 50) && value.some((m) => m.q != null && m.q < 75) && <p className="text-muted">{t('editor.qOkTip')}</p>}
        </div>
      )}
    </div>
  );
}
