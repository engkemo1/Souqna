import { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, Search, X, Image as ImageIcon, Type, BadgeCheck } from 'lucide-react';
import { PageHeader, Panel } from '../../components/dash/Kit.jsx';
import { ErrorState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { cx } from '../../components/ui/cx.js';
import { adminApi, adminKey, adminSession, useAdminApi, fmtNum } from './adminApi.js';

const BGS = ['#1B1B1B', '#7C3AED', '#DB2777', '#EA580C', '#059669', '#2563EB'];
const PRESETS = [
  { id: 'none', label: 'من غير زرار', href: '', cta: '' },
  { id: 'shop', label: 'تسوق دلوقتي', href: '/shop', cta: 'تسوق دلوقتي' },
  { id: 'new', label: 'أحدث المنتجات', href: '/shop?sort=newest', cta: 'شوف الأحدث' },
  { id: 'sale', label: 'العروض', href: '/shop?sale=1', cta: 'شوف العروض' },
  { id: 'custom', label: 'رابط تاني', href: '', cta: 'اعرف أكتر' },
];
const HOURS = [[24, 'يوم'], [48, 'يومين'], [72, '3 أيام'], [168, 'أسبوع']];
const ERR = {
  story_empty: 'اكتب نص أو ضيف صورة أو فيديو.',
  story_limit: 'وصلت للحد الأقصى من ستوري تويست الشغالة. امسح واحدة الأول.',
  invalid_product: 'اختار المنتجات من القايمة (منتجات شغالة بس).',
  invalid_link: 'الرابط لازم يبدأ بـ / ويكون جوه الموقع، زي /shop أو /c/women.',
  video_codec: 'نوع الفيديو ده مش مدعوم. صوّره بصيغة H.264 أو جرّب فيديو تاني.',
  video_too_long: 'الفيديو أطول من الحد المسموح.',
  video_too_big: 'حجم الفيديو كبير.',
  video_unsupported: 'استخدم فيديو MP4 أو WebM.',
  video_failed: 'ماقدرناش نجهّز الفيديو ده. جرّب ملف تاني.',
  invalid_image: 'الملف ده مش صورة مدعومة.',
  image_too_small: 'الصورة صغيرة. استخدم صورة أكبر من 480 بكسل.',
};

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** نشر ستوري تويست الرسمي: صورة/فيديو/نص، منتجات من أي محل، زرار لأي صفحة، ومدة بتختارها. */
function TwistComposer({ info, onDone }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [mode, setMode] = useState('media');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [caption, setCaption] = useState('');
  const [bg, setBg] = useState(BGS[0]);
  const [hours, setHours] = useState(24);
  const [picked, setPicked] = useState([]);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [preset, setPreset] = useState('none');
  const [customHref, setCustomHref] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const q = useDebounced(term);
  const isVideo = !!file && file.type.startsWith('video/');
  const cur = PRESETS.find((p) => p.id === preset);
  const href = preset === 'custom' ? customHref.trim() : cur.href;

  useEffect(() => {
    if (!file) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    let live = true; setSearching(true);
    adminApi(`/stories/products?q=${encodeURIComponent(q)}`).then((d) => { if (live) setResults(d.items || []); }).catch(() => { if (live) setResults([]); }).finally(() => { if (live) setSearching(false); });
    return () => { live = false; };
  }, [q]);

  const toggle = (p) => setPicked((cur2) => (cur2.some((x) => x.id === p.id) ? cur2.filter((x) => x.id !== p.id) : cur2.length >= 4 ? cur2 : [...cur2, p]));
  const pickPreset = (id) => { setPreset(id); const p = PRESETS.find((x) => x.id === id); setLabel(p.cta); };
  const canPublish = !busy && (mode === 'text' ? caption.trim() : file || caption.trim());

  const publish = async () => {
    setBusy(true);
    try {
      const fd = new FormData();
      if (mode === 'media' && file) fd.append('file', file);
      fd.append('caption', caption);
      if (mode === 'text') fd.append('bg', bg);
      fd.append('hours', String(hours));
      fd.append('productIds', JSON.stringify(picked.map((p) => p.id)));
      if (href) { fd.append('ctaHref', href); fd.append('ctaLabel', label || cur.cta); }
      let res;
      try { res = await fetch('/api/admin/stories/platform', { method: 'POST', headers: { 'x-admin-key': adminKey.get(), 'x-admin-session': adminSession.get() }, body: fd }); } catch { throw new Error('مفيش اتصال بالسيرفر'); }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { const e = data?.error || {}; throw new Error(ERR[e.code] || e.message || 'حصلت مشكلة'); }
      toast({ title: 'اتنشرت ستوري تويست' });
      setFile(null); setCaption(''); setPicked([]); setPreset('none'); setCustomHref(''); setLabel(''); if (fileRef.current) fileRef.current.value = '';
      onDone();
    } catch (e) { toast({ tone: 'error', title: e.message || 'حصلت مشكلة' }); }
    setBusy(false);
  };

  const maxMb = info?.video?.maxMb || 100; const maxSec = info?.video?.maxSeconds || 60;
  return (
    <Panel className="mb-6" title="انشر ستوري تويست (رسمي)" subtitle={`بتظهر الأولى في الصفحة الرئيسية بعلامة رسمي. صور بجودة عالية، وفيديو لحد ${maxSec} ثانية و${maxMb} ميجا بدقة 1080، ومنتجات من أي محل، وزرار لأي صفحة.`}>
      <div className="grid gap-5 md:grid-cols-[1fr_210px]">
        <div className="space-y-4">
          <div className="flex gap-2">
            {[['media', 'صورة / فيديو', ImageIcon], ['text', 'نص', Type]].map(([id, name, Icon]) => (
              <button key={id} type="button" onClick={() => setMode(id)} className={cx('inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold', mode === id ? 'border-fg bg-fg text-canvas' : 'border-line')}><Icon className="h-4 w-4" />{name}</button>
            ))}
          </div>

          {mode === 'media' ? (
            <div>
              <input ref={fileRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full rounded-xl border border-dashed border-line bg-canvas p-3 text-sm file:me-3 file:rounded-lg file:border-0 file:bg-fg file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-canvas" />
              <p className="mt-1 text-xs text-muted">الأفضل صورة أو فيديو طولي (9:16). الصور بتتحفظ بجودة عالية من غير قص.</p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {BGS.map((c) => <button key={c} type="button" aria-label={c} onClick={() => setBg(c)} style={{ backgroundColor: c }} className={cx('h-8 w-8 rounded-full border-2', bg === c ? 'border-fg ring-2 ring-offset-2 ring-fg' : 'border-transparent')} />)}
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-sm font-semibold">{mode === 'text' ? 'النص' : 'كلمة على الستوري (اختياري)'}</span>
            <textarea value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 140))} rows={mode === 'text' ? 3 : 2} dir="auto" className="w-full rounded-xl border border-line bg-canvas p-3 text-sm" />
            <span className="text-xs text-muted">{caption.length}/140</span>
          </label>

          <div>
            <p className="mb-1 text-sm font-semibold">المنتجات (اختياري، لحد 4 من أي محل)</p>
            {picked.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {picked.map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 ps-3 pe-1.5 text-xs">
                    <span className="max-w-[140px] truncate">{p.name.ar} · {p.storeName}</span>
                    <button type="button" aria-label="شيل" onClick={() => toggle(p)} className="grid h-5 w-5 place-items-center rounded-full hover:bg-fg/10"><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="دوّر على منتج أو محل" className="w-full rounded-xl border border-line bg-canvas py-2.5 pe-3 ps-9 text-sm" />
            </div>
            <ul className="mt-2 max-h-56 divide-y divide-line overflow-y-auto rounded-xl border border-line">
              {results.map((p) => {
                const on = picked.some((x) => x.id === p.id);
                return (
                  <li key={p.id}>
                    <button type="button" onClick={() => toggle(p)} disabled={!on && picked.length >= 4} className={cx('flex w-full items-center gap-3 p-2 text-start disabled:opacity-40', on && 'bg-fg/5')}>
                      <SmartImage media={p.image} ratio="1 / 1" sizes="48px" className="h-10 w-10 shrink-0 rounded-lg bg-fg/5" />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{p.name.ar}</span><span className="block truncate text-xs text-muted">{p.storeName} · {fmtNum(p.price)} ج.م</span></span>
                      <span className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px]', on ? 'border-fg bg-fg text-canvas' : 'border-line')}>{on ? '✓' : ''}</span>
                    </button>
                  </li>
                );
              })}
              {!results.length && <li className="p-4 text-center text-xs text-muted">{searching ? 'بندوّر…' : 'مفيش نتايج.'}</li>}
            </ul>
          </div>

          <div>
            <p className="mb-1 text-sm font-semibold">زرار (اختياري)</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => <button key={p.id} type="button" onClick={() => pickPreset(p.id)} className={cx('rounded-full border px-3 py-1.5 text-xs font-semibold', preset === p.id ? 'border-fg bg-fg text-canvas' : 'border-line')}>{p.label}</button>)}
            </div>
            {preset === 'custom' && <input value={customHref} onChange={(e) => setCustomHref(e.target.value)} dir="ltr" placeholder="/c/women  أو  /s/اسم-المحل" className="mt-2 w-full rounded-xl border border-line bg-canvas p-2.5 text-sm" />}
            {preset !== 'none' && <input value={label} onChange={(e) => setLabel(e.target.value.slice(0, 24))} placeholder="الكلمة على الزرار" className="mt-2 w-full rounded-xl border border-line bg-canvas p-2.5 text-sm" />}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-semibold">تفضل
              <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="rounded-lg border border-line bg-canvas px-2 py-1.5 text-sm">
                {(info?.hours || HOURS.map((h) => h[0])).map((h) => <option key={h} value={h}>{(HOURS.find((x) => x[0] === h) || [h, `${h} س`])[1]}</option>)}
              </select>
            </label>
            <button type="button" disabled={!canPublish} onClick={publish} className="ms-auto rounded-xl bg-fg px-5 py-2.5 text-sm font-bold text-canvas disabled:opacity-50">{busy ? (isVideo ? 'بيرفع ويجهّز الفيديو…' : 'بينشر…') : 'انشر دلوقتي'}</button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold text-muted">معاينة</p>
          <div className="relative mx-auto aspect-[9/16] w-[190px] overflow-hidden rounded-2xl bg-black shadow-md">
            {mode === 'text'
              ? <div className="flex h-full items-center justify-center p-4 text-center" style={{ backgroundColor: bg, backgroundImage: 'linear-gradient(160deg, rgba(255,255,255,.14), rgba(0,0,0,.28))' }}><span className="text-lg font-extrabold leading-snug text-white" dir="auto">{caption || 'النص هنا'}</span></div>
              : preview ? (isVideo ? <video src={preview} muted playsInline controls className="h-full w-full object-contain" /> : <img src={preview} alt="" className="h-full w-full object-contain" />)
                : <div className="grid h-full place-items-center text-xs text-white/60">اختار صورة أو فيديو</div>}
            <div className="absolute inset-x-0 top-0 flex items-center gap-1.5 bg-gradient-to-b from-black/60 to-transparent p-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-white text-[11px] font-black">T</span><span className="text-[11px] font-semibold text-white">تويست</span><BadgeCheck className="h-3.5 w-3.5 text-sky-400" /></div>
            {(picked.length > 0 || href || (mode === 'media' && caption)) && (
              <div className="absolute inset-x-0 bottom-0 space-y-1.5 bg-gradient-to-t from-black/85 to-transparent p-2 pt-8">
                {mode === 'media' && caption && <p className="text-[11px] leading-snug text-white" dir="auto">{caption}</p>}
                {picked.length > 0 && <div className="rounded-lg bg-white px-2 py-1 text-[10px] font-semibold">{picked.length} منتج</div>}
                {href && <div className="rounded-full bg-white px-2 py-1.5 text-center text-[11px] font-bold">{label || cur.cta}</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}

export default function AdminStories() {
  const toast = useToast();
  const { data, error, loading, reload } = useAdminApi('/stories');
  const [term, setTerm] = useState('');
  const [busy, setBusy] = useState('');
  const stores = data?.stores || [];
  const shown = useMemo(() => stores.filter((s) => !term.trim() || `${s.name.ar} ${s.name.en} ${s.slug}`.toLowerCase().includes(term.trim().toLowerCase())), [stores, term]);
  const enabledCount = stores.filter((s) => s.enabled).length;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;

  const call = async (key, path, body, ok) => {
    setBusy(key);
    try { await adminApi(path, { method: body === undefined ? 'DELETE' : 'PUT', body }); reload(); if (ok) toast({ title: ok }); } catch (e) { toast({ tone: 'error', title: e.message || 'حصلت مشكلة' }); }
    setBusy('');
  };

  return (
    <div>
      <PageHeader title="ستوري المحلات" subtitle="انت اللي بتحدد أنهي محل يقدر ينزل ستوري (صورة أو فيديو) على الصفحة الرئيسية. كله مقفول افتراضيًا، والستوري بتختفي بعد 24 ساعة."
        actions={<div className="flex gap-2">
          <button type="button" disabled={!!busy} onClick={() => call('all', '/stories/stores', { enabled: true }, 'اتفعلت لكل المحلات')} className="rounded-lg bg-fg px-3 py-2 text-sm font-semibold text-canvas disabled:opacity-50">فعّلها للكل</button>
          <button type="button" disabled={!!busy} onClick={() => call('none', '/stories/stores', { enabled: false }, 'اتقفلت لكل المحلات')} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold disabled:opacity-50">اقفلها للكل</button>
        </div>} />

      <TwistComposer info={data?.platform} onDone={reload} />

      <Panel title={`المحلات (${fmtNum(enabledCount)} مفعّل من ${fmtNum(stores.length)})`}>
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="دوّر على محل" className="w-full rounded-xl border border-line bg-canvas py-2.5 pe-3 ps-9 text-sm" />
        </div>
        {loading && !data ? <Skeleton className="h-48 w-full rounded-xl" /> : (
          <ul className="divide-y divide-line">
            {shown.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{s.name.ar}</p>
                  <p className="text-xs text-muted">{s.active ? `${fmtNum(s.active)} ستوري شغال دلوقتي` : 'مفيش ستوري شغال'}</p>
                </div>
                <button type="button" role="switch" aria-checked={s.enabled} aria-label={s.name.ar} disabled={busy === s.slug}
                  onClick={() => call(s.slug, `/stories/stores/${s.slug}`, { enabled: !s.enabled })}
                  className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50', s.enabled ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-600')}>
                  <span className={cx('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all', s.enabled ? 'start-[1.375rem]' : 'start-0.5')} />
                </button>
              </li>
            ))}
            {!shown.length && <li className="py-6 text-center text-sm text-muted">مفيش محلات.</li>}
          </ul>
        )}
      </Panel>

      <Panel className="mt-6" title={`الستوري الشغال دلوقتي (${fmtNum(data?.items?.length || 0)})`} subtitle="لو في محتوى مش مناسب امسحه من هنا.">
        {!data?.items?.length ? <p className="py-6 text-center text-sm text-muted">مفيش ستوري شغال.</p> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {data.items.map((s) => (
              <div key={s.id} className="overflow-hidden rounded-xl border border-line bg-surface">
                {s.kind === 'video'
                  ? <video src={s.video.src} poster={s.video.poster || undefined} preload="metadata" muted playsInline controls className="aspect-[9/16] w-full bg-black object-cover" />
                  : s.kind === 'text'
                    ? <div className="flex aspect-[9/16] w-full items-center justify-center p-3 text-center" style={{ backgroundColor: s.bg || '#1B1B1B' }}><span className="line-clamp-6 text-sm font-extrabold text-white" dir="auto">{s.caption}</span></div>
                    : <SmartImage media={s.image} ratio="9 / 16" sizes="200px" className="w-full" />}
                <div className="space-y-1 p-2">
                  <p className="flex items-center gap-1 truncate text-xs font-semibold">{s.platform && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-sky-500" />}<span className="truncate">{s.store.name}</span></p>
                  <p className="text-[11px] text-muted">{fmtNum(s.views || 0)} مشاهدة · {fmtNum(s.clicks || 0)} ضغطة</p>
                  {s.kind !== 'text' && s.caption && <p className="line-clamp-2 text-xs">{s.caption}</p>}
                  <button type="button" disabled={busy === `d${s.id}`} onClick={() => call(`d${s.id}`, `/stories/${s.id}`, undefined, 'اتمسح')} className="inline-flex items-center gap-1 text-xs text-red-600"><Trash2 className="h-3.5 w-3.5" />مسح</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
