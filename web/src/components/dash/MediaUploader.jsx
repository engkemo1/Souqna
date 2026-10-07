import { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy, sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ImagePlus, Camera, Images, Star, X, GripVertical, AlertCircle, RotateCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { upload } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import SmartImage from '../ui/SmartImage.jsx';
import { errorMessage } from '../ui/States.jsx';
import { cx } from '../ui/cx.js';

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

function Tile({ item, index, total, onRemove, onPrimary, onMove, onRetry, t }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.key, disabled: item.status !== 'done' });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const primary = index === 0 && item.status === 'done';
  return (
    <motion.li ref={setNodeRef} style={style} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }}
      className={cx('group relative list-none', isDragging && 'z-10')}>
      <div className={cx('relative overflow-hidden rounded-2xl bg-surface ring-1 ring-line transition-shadow', isDragging && 'shadow-lift ring-2 ring-primary', primary && 'ring-2 ring-primary')}>
        {item.media ? <SmartImage media={item.media} ratio="4 / 5" sizes="160px" /> : (
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
        {item.status === 'error' && (
          <div className="absolute inset-0 grid place-items-center bg-red-950/60 p-2 text-center text-white">
            <div><AlertCircle className="mx-auto h-6 w-6" /><p className="mt-1 text-xs font-semibold">{item.error || t('editor.uploadFailed')}</p>
              <button type="button" onClick={() => onRetry(item)} className="mt-2 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-neutral-900"><RotateCw className="h-3 w-3" />{t('common.retry')}</button></div>
          </div>
        )}

        {primary && <span className="pointer-events-none absolute start-2 top-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-on-primary"><Star className="h-3 w-3 fill-current" />{t('editor.primary')}</span>}
        <button type="button" onClick={() => onRemove(item)} aria-label={t('editor.removeImage')} className="absolute end-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-neutral-800 shadow-sm transition hover:bg-white hover:text-red-600 active:scale-90">
          <X className="h-4 w-4" />
        </button>
      </div>
      {item.status === 'done' && (
        <div className="mt-1.5 flex items-center justify-between gap-1">
          {!primary ? <button type="button" onClick={() => onPrimary(item)} title={t('editor.makePrimary')} aria-label={t('editor.makePrimary')} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-fg/[0.05] hover:text-amber-600"><Star className="h-4 w-4" /></button> : <span />}
          <span className="flex">
            <button type="button" disabled={index === 0} onClick={() => onMove(index, -1)} aria-label={t('editor.moveEarlier')} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-fg/[0.05] disabled:opacity-30"><ChevronLeft className="h-4 w-4 rtl:-scale-x-100" /></button>
            <button type="button" disabled={index === total - 1} onClick={() => onMove(index, 1)} aria-label={t('editor.moveLater')} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-fg/[0.05] disabled:opacity-30"><ChevronRight className="h-4 w-4 rtl:-scale-x-100" /></button>
          </span>
        </div>
      )}
    </motion.li>
  );
}

/**
 * Product media manager: multi-upload with progress, drag & drop (desktop),
 * gallery/camera pickers (mobile), drag-to-reorder, first image = primary.
 * `value` is the ordered list of uploaded media objects.
 */
export default function MediaUploader({ value, onChange, kind = 'product', max = MAX, error }) {
  const { t } = useI18n();
  const [pending, setPending] = useState([]);
  const [over, setOver] = useState(false);
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

  const addFiles = (files) => {
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

  const done = value.map((m) => ({ key: `m${m.id}`, media: m, status: 'done' }));
  const all = [...done, ...pending];
  const removeItem = (item) => {
    if (item.status === 'done') onChange(value.filter((m) => m.id !== item.media.id));
    else setPending((p) => p.filter((x) => x.key !== item.key));
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
            <p className="mt-3 text-[15px] font-medium">{t('editor.drop')} <button type="button" onClick={() => galleryRef.current?.click()} className="font-semibold text-brand underline-offset-4 hover:underline">{t('editor.browse')}</button></p>
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
                  <Tile key={item.key} item={item} index={i} total={done.length} t={t} onRemove={removeItem} onPrimary={makePrimary} onMove={move} onRetry={start} />
                ))}
              </AnimatePresence>
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
