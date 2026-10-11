import { useEffect, useState } from 'react';
import { Star, Camera, X, Check } from 'lucide-react';
import { api } from '../../lib/api.js';
import { invalidate } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { Field, Textarea } from '../ui/Field.jsx';
import Button from '../ui/Button.jsx';
import { errorMessage } from '../ui/States.jsx';
import { cx } from '../ui/cx.js';

/** Shrink a phone photo before upload (2000px+ originals are wasted bytes on a review). */
async function shrink(file, max = 1400) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.82));
    return blob ? new File([blob], 'review.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}

/** One delivered item → stars + comment + up to 3 photos. Only reachable through the private order link. */
export default function ReviewForm({ token, item, storeSlug, onDone }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(item.reviewed);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const urls = files.map((f) => URL.createObjectURL(f));
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [files]); // eslint-disable-line react-hooks/exhaustive-deps

  if (done) return <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><Check className="h-3.5 w-3.5" />{t('rev.done')}</span>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-brand underline-offset-2 hover:underline">{t('rev.write')}</button>;

  const pick = async (e) => {
    const list = await Promise.all([...e.target.files].slice(0, 3 - files.length).map((f) => shrink(f)));
    setFiles((x) => [...x, ...list].slice(0, 3)); e.target.value = '';
  };
  const submit = async (e) => {
    e.preventDefault();
    if (!rating) { setErr(t('rev.rate')); return; }
    setBusy(true); setErr('');
    const fd = new FormData(); fd.set('productId', item.productId); fd.set('rating', rating); fd.set('comment', comment);
    files.forEach((f) => fd.append('photos', f));
    try { await api(`/track/${token}/review`, { method: 'POST', body: fd }); invalidate('/stores/'); setDone(true); onDone?.(); }
    catch (x) { setErr(errorMessage(t, x)); }
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="mt-3 w-full space-y-3 rounded-2xl border border-line bg-surface p-4">
      <div>
        <p className="mb-1.5 text-sm font-medium">{t('rev.rate')}</p>
        <div className="flex gap-1" role="radiogroup" aria-label={t('rev.rate')}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n}`} onClick={() => setRating(n)} className="p-0.5"><Star className={cx('h-8 w-8 transition', n <= rating ? 'fill-amber-400 text-amber-400' : 'text-line-strong')} /></button>
          ))}
        </div>
      </div>
      <Field label={t('rev.comment')} optional={t('req.optional')}><Textarea rows={3} maxLength={600} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('rev.commentPh')} /></Field>
      <div>
        <div className="flex flex-wrap gap-2">
          {urls.map((u, i) => (
            <span key={u} className="relative h-20 w-20 overflow-hidden rounded-xl"><img src={u} alt="" className="h-full w-full object-cover" />
              <button type="button" aria-label="remove" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="absolute end-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white"><X className="h-3.5 w-3.5" /></button></span>
          ))}
          {files.length < 3 && <label className="grid h-20 w-20 cursor-pointer place-items-center rounded-xl border border-dashed border-line-strong text-muted hover:bg-fg/[0.04]"><Camera className="h-6 w-6" /><input type="file" accept="image/*" multiple className="sr-only" onChange={pick} /></label>}
        </div>
        <p className="mt-1.5 text-[13px] text-muted">{t('rev.addPhotos')}</p>
      </div>
      {err && <p role="alert" className="text-[13px] font-medium text-sale">{err}</p>}
      <Button type="submit" loading={busy} size="sm">{t('rev.submit')}</Button>
    </form>
  );
}
