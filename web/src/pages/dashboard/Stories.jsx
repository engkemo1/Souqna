import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Clock, ImagePlus, Lock, Type, Image as ImageIcon, Eye, MousePointerClick, Check, Search, X, ShoppingBag } from 'lucide-react';
import { useApi } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';
import { PageHeader, ListSkeleton } from '../../components/dash/Kit.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import Button from '../../components/ui/Button.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import { ErrorState, errorMessage } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import PageTransition from '../../components/PageTransition.jsx';

const BGS = ['#1B1B1B', '#7C3AED', '#DB2777', '#EA580C', '#059669', '#2563EB'];
const textBg = (c) => ({ backgroundColor: c, backgroundImage: 'linear-gradient(160deg, rgba(255,255,255,.14), rgba(0,0,0,.28))' });
const LABELS = { ar: ['تسوق الكوليكشن', 'تسوق الآن', 'شوف العروض', 'زور المحل'], en: ['Shop the collection', 'Shop now', 'See offers', 'Visit store'] };
const STORY_ERR = {
  stories_disabled: ['الستوري مش مفعّلة لمحلك. كلّم دعم Twist.', 'Stories are not enabled for your store.'],
  story_limit: ['وصلت للحد الأقصى من الستوري الشغالة.', 'Active story limit reached.'],
  story_empty: ['اكتب كلمتين أو اختار صورة أو فيديو.', 'Write some text or add a photo or video.'],
  invalid_product: ['اختار من منتجات محلك الشغالة بس.', 'Choose your own active products.'],
  invalid_category: ['القسم ده مش موجود في محلك.', 'That section does not exist.'],
  video_unsupported: ['صيغة الفيديو مش مدعومة. استخدم MP4.', 'Unsupported video format. Use MP4.'],
  video_codec: ['صيغة الفيديو دي مش مدعومة. صوّره بإعداد «الأكثر توافقًا» (H.264) أو جرّب فيديو تاني.', 'Unsupported video format. Use H.264 / most compatible.'],
  video_too_long: ['الفيديو أطول من الحد المسموح.', 'Video is too long.'],
  video_too_big: ['الفيديو كبير جدًا.', 'Video is too large.'],
  video_failed: ['معرفناش نعالج الفيديو ده. جرّب ملف تاني.', 'Could not process this video.'],
};
const left = (iso, ar) => {
  const ms = new Date(String(iso).replace(' ', 'T') + 'Z').getTime() - Date.now();
  const h = Math.max(0, Math.ceil(ms / 3600000));
  return ar ? `يختفي بعد ${h} ساعة` : `Expires in ${h}h`;
};

export default function Stories() {
  const { t, lang } = useI18n();
  const ar = lang === 'ar';
  const nm = (n) => (n ? (ar ? n.ar : n.en || n.ar) : '');
  const toast = useToast();
  const { data, error, reload, mutate } = useApi('/owner/stories');
  const [term, setTerm] = useState('');
  const [dterm, setDterm] = useState('');
  useEffect(() => { const id = setTimeout(() => setDterm(term.trim()), 300); return () => clearTimeout(id); }, [term]);
  const { data: prods, loading: prodsLoading } = useApi(`/owner/products?limit=60&status=active${dterm ? `&q=${encodeURIComponent(dterm)}` : ''}`);
  const { data: cats } = useApi('/owner/categories');
  const fileRef = useRef(null);

  const [mode, setMode] = useState('media'); // media | text
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [isVideo, setIsVideo] = useState(false);
  const [caption, setCaption] = useState('');
  const [bg, setBg] = useState(BGS[0]);
  const [picked, setPicked] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [known, setKnown] = useState({}); // المنتجات اللي اتختارت (عشان تفضل ظاهرة حتى لو البحث اتغير)
  const [withBtn, setWithBtn] = useState(false);
  const [btnKind, setBtnKind] = useState('store');
  const [btnCat, setBtnCat] = useState('');
  const [btnLabel, setBtnLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const maxSec = data?.video?.maxSeconds || 30;
  const maxMb = data?.video?.maxMb || 30;
  const items = data?.items || [];
  const max = data?.max || 8;
  const full = items.length >= max;
  const products = prods?.items || [];
  const pickedProducts = picked.map((id) => known[id]).filter(Boolean);
  const topCats = (cats?.items || []).filter((c) => !c.parentId);

  const pick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const vid = f.type.startsWith('video/');
    if (vid && f.size > 40 * 1048576) { toast({ tone: 'error', title: ar ? `الفيديو كبير. الحد ${maxMb} ميجا تقريبًا.` : 'Video is too large.' }); e.target.value = ''; return; }
    const url = URL.createObjectURL(f);
    const accept = () => { if (preview) URL.revokeObjectURL(preview); setFile(f); setPreview(url); setIsVideo(vid); };
    if (!vid) { accept(); return; }
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      if (v.duration > maxSec + 0.5) { URL.revokeObjectURL(url); e.target.value = ''; toast({ tone: 'error', title: ar ? `الفيديو أطول من ${maxSec} ثانية. قصّه الأول.` : `Video must be ${maxSec}s or less.` }); return; }
      accept();
    };
    v.onerror = accept; // المتصفح مش قادر يقرا الصيغة: السيرفر هو اللي يحكم
    v.src = url;
  };
  const reset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null); setPreview(''); setIsVideo(false); setCaption(''); setPicked([]); setTerm(''); setWithBtn(false); setBtnKind('store'); setBtnCat(''); setBtnLabel('');
    if (fileRef.current) fileRef.current.value = '';
  };
  const toggleProduct = (p) => {
    setKnown((k) => ({ ...k, [p.id]: p }));
    setPicked((cur) => (cur.includes(p.id) ? cur.filter((x) => x !== p.id) : cur.length >= 4 ? cur : [...cur, p.id]));
  };

  const canPublish = !busy && !full && (mode === 'text' ? caption.trim().length > 0 : !!file) && (!withBtn || btnKind !== 'category' || btnCat);
  const publish = async () => {
    setBusy(true);
    try {
      const fd = new FormData();
      if (mode === 'media' && file) fd.append('file', file);
      if (caption.trim()) fd.append('caption', caption.trim());
      if (mode === 'text') fd.append('bg', bg);
      if (picked.length) fd.append('productIds', JSON.stringify(picked));
      if (withBtn) { fd.append('ctaKind', btnKind); if (btnKind === 'category') fd.append('ctaCategory', btnCat); if (btnLabel.trim()) fd.append('ctaLabel', btnLabel.trim()); }
      const r = await api('/owner/stories', { method: 'POST', body: fd });
      mutate(r); reset();
      toast({ title: ar ? 'الستوري اتنشرت على الصفحة الرئيسية' : 'Story is live on the home page' });
    } catch (e) { toast({ tone: 'error', title: STORY_ERR[e.code]?.[ar ? 0 : 1] || errorMessage(t, e) }); }
    setBusy(false);
  };
  const remove = async (id) => {
    try { mutate(await api(`/owner/stories/${id}`, { method: 'DELETE' })); } catch (e) { toast({ tone: 'error', title: errorMessage(t, e) }); }
  };

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (data && data.allowed === false) return (
    <PageTransition>
      <PageHeader title={ar ? 'الستوري' : 'Stories'} />
      <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-5 text-sm">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
        <p>{ar ? 'الستوري مش مفعّلة لمحلك لسه. كلّم دعم Twist لو عايز تفعّلها وتنزل إعلاناتك وتشكيلاتك الجديدة على الصفحة الرئيسية.' : 'Stories are not enabled for your store yet. Contact Twist support to turn them on.'}</p>
      </div>
    </PageTransition>
  );

  const ctaText = withBtn ? (btnLabel.trim() || (ar ? { store: 'زور المحل', new: 'شوف الأحدث', sale: 'شوف العروض', category: 'تسوق الكوليكشن' }[btnKind] : 'Shop')) : '';
  const tab = (id, Icon, label) => (
    <button type="button" onClick={() => setMode(id)} className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold ${mode === id ? 'bg-fg text-canvas' : 'border border-line'}`}><Icon className="h-4 w-4" />{label}</button>
  );

  return (
    <PageTransition>
      <PageHeader title={ar ? 'الستوري' : 'Stories'} subtitle={ar ? 'انزل صورة أو فيديو أو كلام بس. بتظهر لأهل بنها في الصفحة الرئيسية وبتختفي بعد 24 ساعة. المنتجات والزرار اختياريين.' : 'Post a photo, video or text. It shows on the home page and disappears after 24 hours. Products and button are optional.'} />

      <div className="mb-8 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="mb-4 flex gap-2">{tab('media', ImageIcon, ar ? 'صورة / فيديو' : 'Photo / Video')}{tab('text', Type, ar ? 'كلام بس' : 'Text')}</div>
        <div className="flex flex-col gap-5 sm:flex-row">
          {/* معاينة */}
          <div className="mx-auto shrink-0 sm:mx-0">
            <div className="relative aspect-[9/16] w-44 overflow-hidden rounded-2xl bg-neutral-900" style={mode === 'text' ? textBg(bg) : undefined}>
              {mode === 'media' && (
                <button type="button" onClick={() => fileRef.current?.click()} disabled={full} className="absolute inset-0 grid place-items-center text-white/80 disabled:opacity-50">
                  {preview ? (isVideo ? <video src={preview} muted playsInline autoPlay loop className="absolute inset-0 h-full w-full object-cover" /> : <img src={preview} alt="" className="absolute inset-0 h-full w-full object-cover" />)
                    : <span className="flex flex-col items-center gap-2 px-2 text-center text-xs"><ImagePlus className="h-8 w-8" />{ar ? 'اختار صورة أو فيديو' : 'Choose photo or video'}<span className="text-[10px] opacity-70">{ar ? `فيديو لحد ${maxSec} ثانية` : `Video up to ${maxSec}s`}</span></span>}
                </button>
              )}
              {mode === 'text' && <div className="absolute inset-0 flex items-center justify-center p-4 text-center"><span className="line-clamp-6 text-lg font-extrabold leading-snug text-white" dir="auto">{caption || (ar ? 'اكتب هنا' : 'Type here')}</span></div>}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 space-y-1.5 bg-gradient-to-t from-black/80 to-transparent p-2 pt-10">
                {mode === 'media' && caption && <p className="line-clamp-2 text-[10px] text-white">{caption}</p>}
                {pickedProducts.slice(0, 2).map((p) => <div key={p.id} className="flex items-center gap-1.5 rounded-lg bg-white p-1"><SmartImage media={p.image} ratio="1 / 1" sizes="32px" className="h-6 w-6 shrink-0 rounded" /><span className="truncate text-[9px] font-semibold text-neutral-900">{nm(p.name)}</span></div>)}
                {pickedProducts.length > 2 && <p className="text-center text-[9px] text-white">+{pickedProducts.length - 2}</p>}
                {ctaText && <div className="rounded-full bg-white py-1.5 text-center text-[10px] font-bold text-neutral-900">{ctaText}</div>}
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" className="hidden" onChange={pick} />
            {mode === 'media' && file && <button type="button" onClick={() => { if (preview) URL.revokeObjectURL(preview); setFile(null); setPreview(''); setIsVideo(false); if (fileRef.current) fileRef.current.value = ''; }} className="mt-2 text-xs text-muted underline">{ar ? 'غيّر الملف' : 'Change file'}</button>}
          </div>

          <div className="min-w-0 flex-1 space-y-5">
            {mode === 'text' && (
              <div className="flex gap-2" aria-label={ar ? 'لون الخلفية' : 'Background'}>
                {BGS.map((c) => <button key={c} type="button" onClick={() => setBg(c)} aria-label={c} className="grid h-8 w-8 place-items-center rounded-full ring-offset-2 ring-offset-surface" style={{ backgroundColor: c, boxShadow: bg === c ? `0 0 0 2px ${c}` : undefined }}>{bg === c && <Check className="h-4 w-4 text-white" />}</button>)}
              </div>
            )}
            <label className="block text-sm font-medium">{mode === 'text' ? (ar ? 'الكلام' : 'Text') : (ar ? 'كلمتين على الستوري (اختياري)' : 'Caption (optional)')}
              <textarea value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 140))} rows={3} className="mt-1 w-full rounded-xl border border-line bg-canvas p-3 text-sm" placeholder={ar ? 'مثال: وصلنا تشكيلة الشتا الجديدة' : 'e.g. New winter collection is here'} />
              <span className="text-xs text-muted">{caption.length}/140</span>
            </label>

            {/* منتجات */}
            <div>
              <p className="mb-1 text-sm font-medium">{ar ? 'منتجات في الستوري (اختياري)' : 'Products in the story (optional)'}</p>
              <p className="mb-2 text-xs text-muted">{ar ? 'الزبون يدوس على المنتج ويفتح صفحته على طول. لحد 4 منتجات.' : 'Customers tap a product to open it. Up to 4.'}</p>
              {pickedProducts.length > 0 && (
                <div className="mb-2 space-y-2">
                  {pickedProducts.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 rounded-xl border border-line p-2">
                      <SmartImage media={p.image} ratio="1 / 1" sizes="56px" className="h-12 w-12 shrink-0 rounded-lg" />
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{nm(p.name)}</p><p className="text-xs text-muted">{formatMoney(p.price, lang)}</p></div>
                      <button type="button" onClick={() => toggleProduct(p)} aria-label={ar ? 'شيل' : 'Remove'} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface"><X className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              )}
              {picked.length < 4 && (
                <button type="button" onClick={() => setPickerOpen(true)} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line text-sm font-semibold hover:bg-surface">
                  <ShoppingBag className="h-4 w-4" />{picked.length ? (ar ? 'ضيف منتج تاني' : 'Add another product') : (ar ? 'اختار منتج' : 'Choose a product')}
                </button>
              )}
            </div>

            {/* زرار */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={withBtn} onChange={(e) => setWithBtn(e.target.checked)} className="h-4 w-4" />{ar ? 'ضيف زرار في الستوري (اختياري)' : 'Add a button (optional)'}</label>
              {withBtn && (
                <div className="mt-3 space-y-3 rounded-xl border border-line p-3">
                  <div className="flex flex-wrap gap-1.5">{LABELS[ar ? 'ar' : 'en'].map((l) => <button key={l} type="button" onClick={() => setBtnLabel(l)} className={`rounded-full border px-3 py-1 text-xs ${btnLabel === l ? 'border-fg bg-fg text-canvas' : 'border-line'}`}>{l}</button>)}</div>
                  <input value={btnLabel} onChange={(e) => setBtnLabel(e.target.value.slice(0, 24))} placeholder={ar ? 'أو اكتب كلمة الزرار' : 'Or type the button text'} className="w-full rounded-xl border border-line bg-canvas p-2.5 text-sm" />
                  <label className="block text-xs font-medium">{ar ? 'الزرار يودّي لـ' : 'Button opens'}
                    <select value={btnKind} onChange={(e) => setBtnKind(e.target.value)} className="mt-1 w-full rounded-xl border border-line bg-canvas p-2.5 text-sm">
                      <option value="store">{ar ? 'صفحة المحل' : 'My store'}</option>
                      <option value="new">{ar ? 'أحدث المنتجات' : 'Newest products'}</option>
                      <option value="sale">{ar ? 'العروض والتخفيضات' : 'Offers'}</option>
                      <option value="category">{ar ? 'قسم / كوليكشن معين' : 'A section / collection'}</option>
                    </select>
                  </label>
                  {btnKind === 'category' && (
                    <select value={btnCat} onChange={(e) => setBtnCat(e.target.value)} className="w-full rounded-xl border border-line bg-canvas p-2.5 text-sm">
                      <option value="">{ar ? 'اختار القسم' : 'Choose a section'}</option>
                      {topCats.map((c) => <option key={c.id} value={c.slug}>{nm(c.name)}</option>)}
                    </select>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button icon={Plus} onClick={publish} disabled={!canPublish} loading={busy}>{ar ? 'انشر الستوري' : 'Publish story'}</Button>
              {(file || caption || picked.length > 0 || withBtn) && <Button variant="secondary" onClick={reset}>{ar ? 'إلغاء' : 'Cancel'}</Button>}
            </div>
            {busy && isVideo && <p role="status" className="text-xs text-muted">{ar ? 'بنرفع الفيديو ونجهّزه للعرض على الموبايل. ممكن ياخد من ثواني لحد دقيقة حسب حجمه، فمتقفلش الصفحة. الأسرع: فيديو MP4 أقل من 30 ثانية.' : 'Uploading and preparing your video. This can take a few seconds up to a minute, so keep this page open. Fastest: an MP4 under 30 seconds.'}</p>}
            {full && <p className="text-xs text-red-600">{ar ? `وصلت للحد الأقصى (${max}). امسح ستوري أو استنى لحد ما يخلص.` : `Limit reached (${max}). Delete one or wait for it to expire.`}</p>}
          </div>
        </div>
      </div>

      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title={ar ? `اختار المنتجات (${picked.length}/4)` : `Choose products (${picked.length}/4)`} side="auto" desktop="end" size="lg"
        footer={<Button full size="lg" onClick={() => setPickerOpen(false)}>{ar ? `تم${picked.length ? ` (${picked.length})` : ''}` : `Done${picked.length ? ` (${picked.length})` : ''}`}</Button>}>
        <div className="space-y-3 py-4">
          <div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder={ar ? 'دوّر باسم المنتج' : 'Search by name'} className="h-12 w-full rounded-xl border border-line bg-canvas pe-3 ps-9 text-base" /></div>
          {products.length === 0 && !prodsLoading ? <p className="py-8 text-center text-sm text-muted">{dterm ? (ar ? 'مفيش منتج بالاسم ده.' : 'No matches.') : (ar ? 'مفيش منتجات شغالة.' : 'No active products.')}</p> : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {products.map((p) => {
                const on = picked.includes(p.id);
                const blocked = !on && picked.length >= 4;
                return (
                  <button key={p.id} type="button" disabled={blocked} onClick={() => toggleProduct(p)} className={`relative overflow-hidden rounded-2xl border text-start transition disabled:opacity-40 ${on ? 'border-fg ring-2 ring-fg' : 'border-line'}`}>
                    <SmartImage media={p.image} ratio="1 / 1" sizes="200px" className="w-full" />
                    {on && <span className="absolute end-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-fg text-canvas"><Check className="h-4 w-4" /></span>}
                    <span className="block p-2"><span className="line-clamp-2 block text-sm font-medium leading-tight">{nm(p.name)}</span><span className="mt-0.5 block text-xs text-muted">{formatMoney(p.price, lang)}</span></span>
                  </button>
                );
              })}
            </div>
          )}
          {picked.length >= 4 && <p className="text-center text-xs text-muted">{ar ? 'وصلت لـ 4 منتجات. شيل واحد لو عايز تغيّر.' : 'Limit of 4 reached.'}</p>}
        </div>
      </Sheet>

      <h2 className="mb-3 text-sm font-semibold">{ar ? `الستوري الشغال دلوقتي (${items.length}/${max})` : `Active stories (${items.length}/${max})`}</h2>
      {!data ? <ListSkeleton /> : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">{ar ? 'مفيش ستوري شغال.' : 'No active stories.'}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {items.map((s) => (
            <div key={s.id} className="overflow-hidden rounded-xl border border-line bg-surface">
              {s.kind === 'video' ? <video src={s.video.src} poster={s.video.poster || undefined} preload="metadata" muted playsInline controls className="aspect-[9/16] w-full bg-black object-cover" />
                : s.kind === 'text' ? <div className="flex aspect-[9/16] w-full items-center justify-center p-3 text-center" style={textBg(s.bg || BGS[0])}><span className="line-clamp-6 text-sm font-extrabold text-white" dir="auto">{s.caption}</span></div>
                : <SmartImage media={s.image} ratio="9 / 16" sizes="200px" className="w-full" />}
              <div className="space-y-1 p-2">
                {s.kind !== 'text' && s.caption && <p className="line-clamp-2 text-xs">{s.caption}</p>}
                <p className="text-[11px] text-muted">{[s.products.length ? (ar ? `${s.products.length} منتج` : `${s.products.length} products`) : '', s.cta ? (ar ? 'زرار' : 'button') : ''].filter(Boolean).join(' · ')}</p>
                <p className="flex items-center gap-3 text-[11px] text-muted"><span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" />{s.views}</span><span className="inline-flex items-center gap-1"><MousePointerClick className="h-3 w-3" />{s.clicks}</span></p>
                <p className="flex items-center gap-1 text-[11px] text-muted"><Clock className="h-3 w-3" />{left(s.expiresAt, ar)}</p>
                <button type="button" onClick={() => remove(s.id)} className="inline-flex items-center gap-1 text-xs text-red-600"><Trash2 className="h-3.5 w-3.5" />{ar ? 'مسح' : 'Delete'}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageTransition>
  );
}
