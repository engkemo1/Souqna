import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { X, ShoppingBag, Store, Volume2, VolumeX, ChevronLeft, Play } from 'lucide-react';
import { useApi } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';
import SmartImage from '../ui/SmartImage.jsx';
import { StoreLogo } from '../store/StoreChrome.jsx';

const SEEN_KEY = 'twist_seen_stories';
const STORY_MS = 5000;
const textBg = (c) => ({ backgroundColor: c || '#1B1B1B', backgroundImage: 'linear-gradient(160deg, rgba(255,255,255,.14), rgba(0,0,0,.28))' });

const readSeen = () => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { return new Set(); } };
const writeSeen = (set) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-400))); } catch { /* storage may be blocked */ } };
const ping = (id, ev) => { try { fetch(`/api/stories/${id}/${ev}`, { method: 'POST', keepalive: true }).catch(() => {}); } catch { /* ignore */ } };

const ago = (iso, ar) => {
  const t = new Date(String(iso).replace(' ', 'T') + 'Z').getTime();
  if (!t) return '';
  const h = Math.max(0, Math.floor((Date.now() - t) / 3600000));
  if (h < 1) return ar ? 'دلوقتي' : 'now';
  return ar ? `من ${h} س` : `${h}h`;
};

function Viewer({ groups, start, startItem = 0, onClose, onSeen }) {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const [g, setG] = useState(start);
  const [i, setI] = useState(startItem);
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(true);
  const holdRef = useRef(false);
  const pressAt = useRef(0);
  const heldLong = useRef(false);
  const videoRef = useRef(null);
  const group = groups[g];
  const item = group?.items[i];
  const isVideo = item?.kind === 'video';
  const isText = item?.kind === 'text';

  const next = useCallback(() => {
    if (i < group.items.length - 1) { setI(i + 1); setProgress(0); return; }
    if (g < groups.length - 1) { setG(g + 1); setI(0); setProgress(0); return; }
    onClose();
  }, [i, g, group, groups.length, onClose]);
  const prev = useCallback(() => {
    if (i > 0) { setI(i - 1); setProgress(0); return; }
    if (g > 0) { setG(g - 1); setI(0); setProgress(0); return; }
    setProgress(0);
  }, [i, g]);

  useEffect(() => { if (item) onSeen(item.id); }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!item || isVideo) return undefined; // الفيديو بيمشي بوقته (onTimeUpdate)
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      if (!holdRef.current) setProgress((p) => Math.min(1, p + (now - last) / (isText ? STORY_MS + 1500 : STORY_MS)));
      last = now;
    }, 50);
    return () => clearInterval(id);
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (progress >= 1 && !isVideo) next(); }, [progress]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') (ar ? prev : next)();
      if (e.key === 'ArrowLeft') (ar ? next : prev)();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
  }, [ar, next, prev, onClose]);

  if (!item) return null;
  const nm = (n) => (ar ? n.ar : n.en || n.ar);
  const storeName = nm(group.store.name);
  const click = () => { ping(item.id, 'click'); onClose(); };
  const hold = (on) => { if (on) pressAt.current = Date.now(); else heldLong.current = Date.now() - pressAt.current > 250; holdRef.current = on; if (isVideo) { if (on) videoRef.current?.pause(); else videoRef.current?.play?.().catch(() => {}); } };

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-neutral-950" role="dialog" aria-modal="true" dir="ltr">
      <div className="relative h-full w-full max-w-[430px] overflow-hidden bg-black sm:h-[min(100vh,860px)] sm:rounded-2xl">
        {/* progress */}
        <div className="absolute inset-x-0 top-0 z-20 flex gap-1 px-2 pt-2">
          {group.items.map((it, idx) => (
            <div key={it.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
              <div className="h-full bg-white" style={{ width: `${idx < i ? 100 : idx === i ? progress * 100 : 0}%` }} />
            </div>
          ))}
        </div>
        {/* header */}
        <div className="absolute inset-x-0 top-3 z-20 flex items-center gap-2 bg-gradient-to-b from-black/60 to-transparent px-3 pb-6 pt-3" dir={ar ? 'rtl' : 'ltr'}>
          <StoreLogo store={group.store} size={36} className="h-9 w-9" />
          <Link to={`/s/${group.store.slug}`} onClick={onClose} className="truncate text-sm font-semibold text-white">{storeName}</Link>
          <span className="text-xs text-white/70">{ago(item.createdAt, ar)}</span>
          <span className="ms-auto" />
          {isVideo && <button type="button" onClick={() => setMuted((m) => !m)} aria-label={ar ? 'الصوت' : 'Sound'} className="relative z-30 grid h-9 w-9 place-items-center rounded-full text-white hover:bg-white/10">{muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}</button>}
          <button type="button" onClick={onClose} aria-label={ar ? 'إغلاق' : 'Close'} className="relative z-30 grid h-9 w-9 place-items-center rounded-full text-white hover:bg-white/10"><X className="h-6 w-6" /></button>
        </div>
        {/* body */}
        <div className="absolute inset-0" style={isText ? textBg(item.bg) : undefined}>
          {isText && <div className="flex h-full items-center justify-center px-8 text-center"><p className="text-[28px] font-extrabold leading-snug text-white" dir="auto">{item.caption}</p></div>}
          {isVideo && (
            <video key={item.id} ref={videoRef} src={item.video.src} poster={item.video.poster || undefined} autoPlay playsInline muted={muted} preload="auto" className="h-full w-full bg-black object-contain"
              onTimeUpdate={(e) => { const d = e.currentTarget.duration; if (d) setProgress(Math.min(1, e.currentTarget.currentTime / d)); }} onEnded={next} onError={next} />
          )}
          {!isVideo && !isText && <SmartImage media={item.image} alt={item.caption || storeName} fit="contain" priority sizes="430px" className="h-full w-full bg-black" imgClassName="h-full w-full object-contain" />}
        </div>
        {/* tap zones */}
        <div className="absolute inset-0 z-10 flex" onPointerDown={() => hold(true)} onPointerUp={() => hold(false)} onPointerLeave={() => holdRef.current && hold(false)}>
          <button type="button" aria-label={ar ? 'السابق' : 'Previous'} className="h-full w-1/3" onClick={() => { if (!heldLong.current) prev(); heldLong.current = false; }} />
          <button type="button" aria-label={ar ? 'التالي' : 'Next'} className="h-full w-2/3" onClick={() => { if (!heldLong.current) next(); heldLong.current = false; }} />
        </div>
        {/* caption + products + button */}
        {(item.products.length > 0 || item.cta || (item.caption && !isText)) && (
          <div className="absolute inset-x-0 bottom-0 z-20 space-y-3 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-3 pb-5 pt-16" dir={ar ? 'rtl' : 'ltr'}>
            {item.caption && !isText && <p className="px-1 text-[15px] leading-snug text-white">{item.caption}</p>}
            {item.products.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {item.products.map((p) => (
                  <Link key={p.id} to={`/s/${p.storeSlug || group.store.slug}/p/${p.slug}`} onClick={click} className={`flex shrink-0 items-center gap-2.5 rounded-2xl bg-white p-2 text-neutral-900 ${item.products.length === 1 ? 'w-full' : 'w-[200px]'}`}>
                    <SmartImage media={p.image} ratio="1 / 1" sizes="64px" className="h-14 w-14 shrink-0 rounded-xl bg-neutral-100" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 block text-[13px] font-semibold leading-tight">{nm(p.name)}</span>
                      <span className="mt-0.5 block text-[13px] font-bold">{formatMoney(p.price, lang)}</span>
                    </span>
                    <ShoppingBag className="h-5 w-5 shrink-0 text-neutral-500" />
                  </Link>
                ))}
              </div>
            )}
            {item.cta && (
              <Link to={item.cta.href || `/s/${group.store.slug}`} onClick={click} className="flex items-center justify-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-bold text-neutral-900">
                {item.cta.kind === 'store' ? <Store className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}{item.cta.label}<ChevronLeft className={`h-4 w-4 ${ar ? '' : 'rotate-180'}`} />
              </Link>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** كارت الستوري في الصفحة الرئيسية (شكل الفيسبوك): معاينة آخر ستوري + لوجو المحل + الاسم. */
function Card({ grp, done, onOpen, ar }) {
  const it = grp.items[grp.items.length - 1];
  const name = ar ? grp.store.name.ar : grp.store.name.en || grp.store.name.ar;
  return (
    <button type="button" onClick={onOpen} className="relative h-[190px] w-[108px] shrink-0 overflow-hidden rounded-2xl bg-neutral-800 text-start shadow-sm ring-1 ring-black/5 sm:h-[220px] sm:w-[124px]">
      {it.kind === 'image' && <div className="absolute inset-0"><SmartImage media={it.image} sizes="130px" className="h-full w-full" imgClassName="h-full w-full object-cover" /></div>}
      {it.kind === 'video' && (it.video.poster ? <img src={it.video.poster} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <video src={`${it.video.src}#t=0.1`} preload="metadata" muted playsInline className="absolute inset-0 h-full w-full object-cover" />)}
      {it.kind === 'text' && <div className="absolute inset-0 flex items-center justify-center p-3 text-center" style={textBg(it.bg)}><span className="line-clamp-5 text-[13px] font-bold leading-snug text-white" dir="auto">{it.caption}</span></div>}
      <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/70" />
      {it.kind === 'video' && <span className="absolute bottom-9 end-2 grid h-6 w-6 place-items-center rounded-full bg-black/50 text-white"><Play className="h-3 w-3 fill-current" /></span>}
      <span className={`absolute start-2 top-2 rounded-full p-[2.5px] ${done ? 'bg-neutral-300' : 'bg-gradient-to-tr from-sky-400 via-blue-500 to-blue-700'}`}>
        <span className="block rounded-full bg-white p-[1.5px]"><StoreLogo store={grp.store} size={34} className="h-[34px] w-[34px]" /></span>
      </span>
      <span className="absolute inset-x-2 bottom-2 line-clamp-2 text-[12px] font-bold leading-tight text-white drop-shadow">{name}</span>
    </button>
  );
}

export default function StoriesBar() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const { data } = useApi('/stories');
  const [seen, setSeen] = useState(readSeen);
  const [open, setOpen] = useState(null);

  const groups = data?.items || [];
  if (!groups.length) return null;

  const markSeen = (id) => setSeen((prev) => {
    if (prev.has(id)) return prev;
    ping(id, 'view');
    const n = new Set(prev); n.add(id); writeSeen(n); return n;
  });
  const allSeen = (grp) => grp.items.every((it) => seen.has(it.id));
  const ordered = [...groups].sort((a, b) => Number(allSeen(a)) - Number(allSeen(b))); // الجديد الأول

  return (
    <section aria-label={ar ? 'ستوري المحلات' : 'Store stories'} className="mx-auto w-full max-w-7xl px-3 pt-3 sm:px-4">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" dir={ar ? 'rtl' : 'ltr'}>
        {ordered.map((grp, idx) => <Card key={grp.store.slug} grp={grp} ar={ar} done={allSeen(grp)} onOpen={() => setOpen({ list: ordered, start: idx, startItem: Math.max(0, ordered[idx].items.findIndex((it) => !seen.has(it.id))) })} />)}
      </div>
      {open && <Viewer groups={open.list} start={open.start} startItem={open.startItem} onClose={() => setOpen(null)} onSeen={markSeen} />}
    </section>
  );
}
