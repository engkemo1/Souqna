import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Monitor, Smartphone, Check, Wand2 } from 'lucide-react';
import { useApi } from '../../lib/hooks.js';
import { api, upload } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useAuth } from '../../lib/auth.jsx';
import Button from '../../components/ui/Button.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import { Field, Input, Select, Segmented } from '../../components/ui/Field.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { cx } from '../../components/ui/cx.js';
import { BANNER_TEMPLATES, PHOTO_LAYOUTS, composeBanner, composePhotoBanner, mediaUrl } from '../../lib/bannerArt.js';
import { BANNER_FONTS, bannerFontFamily, loadBannerFont, readableOn } from '../../lib/bannerFonts.js';

const SIZE = { desktop: [1920, 800], mobile: [1080, 1350] };
const COLORS = ['#1B3A6B', '#0F766E', '#B45309', '#9D174D', '#6D28D9', '#111111', '#C0392B', '#2F5D3A'];
const TEXT_COLORS = ['', '#FFFFFF', '#111111', '#F5D77A'];
/** photo layouts whose background is light (text must be dark and sit below the picture on mobile) */
const LIGHT_PHOTO = new Set(['ph_editorial', 'ph_triptych', 'ph_arch', 'ph_grid']);
const LINKS = [['/shop', 'كل المنتجات', 'All products'], ['/shop?sort=newest', 'وصل حديثاً', 'New arrivals'], ['/shop?sale=1', 'التخفيضات', 'On sale']];

const toneOf = (kind, id, pick) => (kind === 'library' ? (pick?.tone === 'light' ? 'light' : 'dark') : kind === 'photo' ? (LIGHT_PHOTO.has(id) ? 'light' : 'dark') : (BANNER_TEMPLATES.find((t) => t.id === id)?.tone === 'light' ? 'light' : 'dark'));

const loadImg = (url) => new Promise((res) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });

/** Library photo. Wide: cover-fit. Portrait: crop around the subject (focus x, 0..1); a light photo goes at the bottom on plain
 *  background so the headline sits clear above it (the storefront puts light-tone text at the top on mobile). */
async function composeLibrary(canvas, pick, w, h) {
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = await loadImg(pick.url);
  if (!img) { ctx.fillStyle = '#222'; ctx.fillRect(0, 0, w, h); return { ok: false }; }
  const fx = Number.isFinite(pick.fx) ? pick.fx : 0.5;
  const portrait = h / w >= 0.9;
  if (portrait && pick.tone === 'light') {
    ctx.fillStyle = pick.bg || '#FFFFFF'; ctx.fillRect(0, 0, w, h);
    const side = Math.min(img.width, img.height); const sx = Math.min(img.width - side, Math.max(0, img.width * fx - side / 2));
    ctx.drawImage(img, sx, 0, side, side * 1, 0, h - w, w, w);
    return { ok: true };
  }
  const k = Math.max(w / img.width, h / img.height); const sw = w / k, sh = h / k;
  const sx = Math.min(img.width - sw, Math.max(0, img.width * fx - sw / 2));
  ctx.drawImage(img, sx, (img.height - sh) / 2, sw, sh, 0, 0, w, h);
  return { ok: true };
}

/** A light portrait banner has its art on top and plain colour below; the storefront puts light-tone text at the TOP on mobile,
 *  so move the art block to the bottom and fill the top with the template's own plain colour. */
function artToBottom(canvas, fromTop) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const px = ctx.getImageData(Math.round(w * 0.5), fromTop ? 2 : h - 3, 1, 1).data; // plain colour: the art's top edge (gradient templates) or the bottom strip (photo layouts)
  const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h; tmp.getContext('2d').drawImage(canvas, 0, 0);
  const artH = Math.round(h * 0.56);
  ctx.fillStyle = `rgb(${px[0]},${px[1]},${px[2]})`; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(tmp, 0, 0, w, artH, 0, h - artH, w, artH);
}

async function render(canvas, pick, device, { color, products }) {
  const [w, h] = SIZE[device];
  if (pick.kind === 'library') await composeLibrary(canvas, pick, w, h);
  else if (pick.kind === 'photo') await composePhotoBanner(canvas, pick.id, w, h, { color, products });
  else await composeBanner(canvas, pick.id, w, h, { color, products });
  if (device === 'mobile' && toneOf(pick.kind, pick.id, pick) === 'light' && pick.kind !== 'library') artToBottom(canvas, pick.kind === 'art');
}

function Thumb({ pick, color, products, active, onClick, lang }) {
  const ref = useRef(null);
  const key = `${pick.kind}:${pick.id}:${color}:${products.map((p) => p.id).join(',')}`;
  useEffect(() => {
    let off = false;
    (async () => {
      const c = document.createElement('canvas');
      await render(c, pick, 'desktop', { color, products });
      if (off || !ref.current) return;
      const t = ref.current; t.width = 320; t.height = 133; t.getContext('2d').drawImage(c, 0, 0, 320, 133);
    })();
    return () => { off = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cx('group relative overflow-hidden rounded-xl border text-start transition', active ? 'border-fg ring-2 ring-fg' : 'border-line-strong hover:border-fg')}>
      <canvas ref={ref} className="block w-full bg-surface" style={{ aspectRatio: '320 / 133' }} />
      <span className="block truncate px-2 py-1.5 text-[12px] font-semibold">{lang === 'ar' ? pick.ar : pick.en || pick.ar}</span>
      {active && <span className="absolute end-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-fg text-canvas"><Check className="h-3 w-3" /></span>}
    </button>
  );
}

export default function BannerStudio({ open, onClose, onCreated }) {
  const { lang } = useI18n();
  const toast = useToast();
  const { store } = useAuth();
  const ar = lang === 'ar';
  const [tab, setTab] = useState('art');
  const [pick, setPick] = useState({ kind: 'art', id: BANNER_TEMPLATES[0].id });
  const [color, setColor] = useState(store?.theme?.input?.brand || '#1B3A6B');
  const [chosen, setChosen] = useState([]);
  const [device, setDevice] = useState('desktop');
  const [f, setF] = useState({ title_ar: '', title_en: '', subtitle_ar: '', subtitle_en: '', cta_ar: 'تسوّق الآن', cta_en: 'Shop now', link: '/shop', text_color: '', font: '' });
  const [busy, setBusy] = useState(false);
  const [lib, setLib] = useState([]);
  const [libType, setLibType] = useState('');
  const canvasRef = useRef(null);
  const prods = useApi(open ? '/owner/products?limit=40&status=active' : '');
  const withPhotos = useMemo(() => (prods.data?.items || []).filter((p) => p.image?.base), [prods.data]);
  const products = useMemo(() => chosen.map((id) => withPhotos.find((p) => p.id === id)?.image).filter(Boolean).map((m, i) => ({ ...m, id: chosen[i] })), [chosen, withPhotos]);

  useEffect(() => { // the ready-made photo library (shipped by the platform); the tab only shows when it exists
    if (!open) return;
    let off = false;
    fetch('/banner-library/manifest.json').then((r) => (r.ok ? r.json() : null)).then((m) => {
      if (off || !m || typeof m !== 'object') return;
      setLib(Object.entries(m.types || m).flatMap(([type, v]) => (Array.isArray(v?.files) ? v.files : []).map((x, i) => {
        const e = typeof x === 'string' ? { file: x } : x;
        return { type, label: v.ar || type, url: `/banner-library/${type}/${e.file}`, i, fx: e.fx, tone: e.tone, bg: e.bg };
      })));
    }).catch(() => {});
    return () => { off = true; };
  }, [open]);

  const tone = toneOf(pick.kind, pick.id, pick);
  useEffect(() => {
    if (!open) return undefined;
    let off = false;
    const run = async () => {
      const c = document.createElement('canvas');
      await render(c, pick, device, { color, products });
      if (off || !canvasRef.current) return;
      const t = canvasRef.current; t.width = c.width; t.height = c.height; t.getContext('2d').drawImage(c, 0, 0);
    };
    run();
    return () => { off = true; };
  }, [open, pick, device, color, products]);

  const toggleProd = (id) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= 4 ? c : [...c, id]));
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const needs = pick.kind === 'photo' ? PHOTO_LAYOUTS.find((x) => x.id === pick.id)?.needs || 1 : 0;

  const save = useCallback(async () => {
    if (!f.title_ar && !f.title_en) { toast({ tone: 'error', title: ar ? 'اكتب عنوان البانر الأول' : 'Add a headline first' }); return; }
    setBusy(true);
    try {
      const ids = {};
      for (const d of ['desktop', 'mobile']) {
        const c = document.createElement('canvas');
        await render(c, pick, d, { color, products });
        const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.9));
        if (!blob) throw new Error('canvas');
        const fd = new FormData(); fd.append('files', new File([blob], `banner-${d}.jpg`, { type: 'image/jpeg' }));
        const r = await upload('/owner/media?kind=banner', fd);
        ids[d] = r.media[0].id;
      }
      const r = await api('/owner/banners', { method: 'POST', body: { media_id: ids.desktop, mobile_media_id: ids.mobile, eyebrow_ar: '', eyebrow_en: '', title_ar: f.title_ar, title_en: f.title_en, subtitle_ar: f.subtitle_ar, subtitle_en: f.subtitle_en, cta_ar: f.cta_ar, cta_en: f.cta_en, link: f.link, align: 'start', tone, mirror_rtl: true, fit: 'cover', focus: 'center', height: 'auto', text_color: f.text_color, font: f.font, active: true } });
      onCreated?.(r.items);
      toast({ title: ar ? 'تم إنشاء البانر' : 'Banner created' });
      onClose();
    } catch (e) { toast({ tone: 'error', title: e?.message || (ar ? 'تعذّر إنشاء البانر' : 'Could not create the banner') }); }
    setBusy(false);
  }, [f, pick, color, products, tone, ar, toast, onCreated, onClose]);

  const title = ar ? f.title_ar : f.title_en;
  const sub = ar ? f.subtitle_ar : f.subtitle_en;
  const cta = ar ? f.cta_ar : f.cta_en;
  const mobile = device === 'mobile';
  const light = tone === 'light';
  const arts = BANNER_TEMPLATES.map((t) => ({ kind: 'art', id: t.id, ar: t.ar, en: t.en }));
  const photos = PHOTO_LAYOUTS.map((t) => ({ kind: 'photo', id: t.id, ar: t.name, en: t.name }));
  const libs = lib.filter((x) => !libType || x.type === libType).map((x) => ({ kind: 'library', id: `${x.type}/${x.i}`, ar: `${x.label} ${x.i + 1}`, url: x.url, fx: x.fx, tone: x.tone, bg: x.bg }));
  const types = [...new Set(lib.map((x) => x.type))];
  const list = tab === 'art' ? arts : tab === 'photo' ? photos : libs;

  return (
    <Sheet open={open} onClose={onClose} title={ar ? 'استوديو البانرات' : 'Banner studio'} side="auto" desktop="end" size="lg"
      footer={<Button full size="lg" icon={Wand2} onClick={save} loading={busy}>{ar ? 'اعمل البانر' : 'Create banner'}</Button>}>
      <div className="space-y-6 py-4">
        <div className="rounded-2xl bg-surface p-3">
          <div className="mb-3 flex justify-center">
            <Segmented size="sm" value={device} onChange={setDevice} options={[{ value: 'desktop', label: <Monitor className="h-4 w-4" aria-label="Desktop" /> }, { value: 'mobile', label: <Smartphone className="h-4 w-4" aria-label="Mobile" /> }]} />
          </div>
          <div className={cx('relative mx-auto overflow-hidden rounded-xl bg-surface', mobile ? 'w-52' : 'w-full')} style={{ aspectRatio: mobile ? '4 / 5' : '12 / 5' }} dir={ar ? 'rtl' : 'ltr'}>
            <canvas ref={canvasRef} className={cx('absolute inset-0 h-full w-full', ar && !mobile && '-scale-x-100')} />
            {!light && <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-black/10" />}
            <div className={cx('absolute inset-0 flex p-4', mobile ? (light ? 'items-start justify-center text-center' : 'items-end justify-center text-center') : 'items-center')}>
              <div className={cx(mobile ? 'max-w-full' : 'max-w-[60%]', light ? 'text-neutral-900' : 'text-white')} style={{ color: f.text_color || undefined, fontFamily: bannerFontFamily(f.font) }}>
                <p className={cx('font-display font-bold leading-tight', mobile ? 'text-sm' : 'text-lg')}>{title || (ar ? 'عنوان البانر' : 'Your headline')}</p>
                {sub && <p className="mt-1 text-[10px] opacity-90">{sub}</p>}
                {cta && <span className={cx('mt-2 inline-block rounded-full px-3 py-1 text-[10px] font-semibold', !f.text_color && (light ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-900'))} style={f.text_color ? { backgroundColor: f.text_color, color: readableOn(f.text_color) } : undefined}>{cta}</span>}
              </div>
            </div>
          </div>
        </div>

        <div>
          <Segmented value={tab} onChange={(v) => { setTab(v); if (v === 'art') setPick({ kind: 'art', id: BANNER_TEMPLATES[0].id }); else if (v === 'photo') setPick({ kind: 'photo', id: PHOTO_LAYOUTS[0].id }); else if (libs[0]) setPick(libs[0]); }} className="mb-3 w-full [&>button]:flex-1"
            options={[{ value: 'art', label: ar ? 'قوالب جاهزة' : 'Templates' }, { value: 'photo', label: ar ? 'بصور منتجاتك' : 'Your photos' }, ...(lib.length ? [{ value: 'library', label: ar ? 'مكتبة الصور' : 'Photo library' }] : [])]} />
          {tab === 'library' && types.length > 1 && <Select value={libType} onChange={(e) => setLibType(e.target.value)} className="mb-3"><option value="">{ar ? 'كل الأنواع' : 'All types'}</option>{types.map((x) => <option key={x} value={x}>{lib.find((l) => l.type === x)?.label || x}</option>)}</Select>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {list.map((p) => <Thumb key={`${p.kind}:${p.id}`} pick={p} color={color} products={products} lang={lang} active={pick.kind === p.kind && pick.id === p.id} onClick={() => setPick(p)} />)}
          </div>
        </div>

        {pick.kind !== 'library' && (
          <Field label={ar ? 'لون البانر' : 'Banner colour'}>
            <div className="flex flex-wrap items-center gap-2">
              {COLORS.map((c) => <button key={c} type="button" aria-label={c} aria-pressed={color.toLowerCase() === c.toLowerCase()} onClick={() => setColor(c)} className={cx('h-9 w-9 rounded-full ring-2 ring-offset-2 ring-offset-canvas', color.toLowerCase() === c.toLowerCase() ? 'ring-fg' : 'ring-line-strong')} style={{ backgroundColor: c }} />)}
              <label className="relative inline-flex h-9 w-9 cursor-pointer overflow-hidden rounded-full ring-2 ring-line-strong ring-offset-2 ring-offset-canvas"><span className="absolute inset-0" style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }} /><input type="color" value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#1B3A6B'} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" /></label>
            </div>
          </Field>
        )}

        {pick.kind !== 'library' && (
          <Field label={ar ? 'صور من منتجاتك' : 'Photos from your products'} hint={needs ? (ar ? `القالب ده يحتاج ${needs} صور. اختار لحد 4.` : `This layout uses ${needs}. Pick up to 4.`) : (ar ? 'اختياري: اختار لحد 4 منتجات.' : 'Optional: pick up to 4 products.')}>
            {withPhotos.length ? (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {withPhotos.map((p) => { const on = chosen.includes(p.id); return (
                  <button key={p.id} type="button" onClick={() => toggleProd(p.id)} aria-pressed={on} className={cx('relative aspect-[4/5] overflow-hidden rounded-lg border bg-surface', on ? 'border-fg ring-2 ring-fg' : 'border-line-strong')}>
                    <img src={mediaUrl(p.image, 240)} alt="" loading="lazy" className="h-full w-full object-cover" />
                    {on && <span className="absolute end-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-fg text-[11px] font-bold text-canvas">{chosen.indexOf(p.id) + 1}</span>}
                  </button>
                ); })}
              </div>
            ) : <p className="text-sm text-muted">{ar ? 'ضيف منتجات بصور الأول عشان تظهر هنا.' : 'Add products with photos to see them here.'}</p>}
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`${ar ? 'العنوان' : 'Headline'} (AR)`}><Input dir="rtl" value={f.title_ar} onChange={set('title_ar')} /></Field>
          <Field label={`${ar ? 'العنوان' : 'Headline'} (EN)`}><Input dir="ltr" value={f.title_en} onChange={set('title_en')} /></Field>
          <Field label={`${ar ? 'سطر تحت العنوان' : 'Subtitle'} (AR)`}><Input dir="rtl" value={f.subtitle_ar} onChange={set('subtitle_ar')} /></Field>
          <Field label={`${ar ? 'سطر تحت العنوان' : 'Subtitle'} (EN)`}><Input dir="ltr" value={f.subtitle_en} onChange={set('subtitle_en')} /></Field>
          <Field label={`${ar ? 'الزرار' : 'Button'} (AR)`}><Input dir="rtl" value={f.cta_ar} onChange={set('cta_ar')} /></Field>
          <Field label={`${ar ? 'الزرار' : 'Button'} (EN)`}><Input dir="ltr" value={f.cta_en} onChange={set('cta_en')} /></Field>
        </div>
        <Field label={ar ? 'الزرار يودّي فين' : 'Button links to'}><Select value={f.link} onChange={set('link')}>{LINKS.map(([v, a, e]) => <option key={v} value={v}>{ar ? a : e}</option>)}</Select></Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={ar ? 'لون الكلام' : 'Text colour'}>
            <div className="flex flex-wrap items-center gap-2">
              {TEXT_COLORS.map((c) => <button key={c || 'auto'} type="button" aria-pressed={f.text_color === c} onClick={() => setF((x) => ({ ...x, text_color: c }))} className={cx('h-9 rounded-full border px-3 text-[13px] font-semibold', f.text_color === c ? 'border-fg bg-fg text-canvas' : 'border-line-strong')} style={c ? { backgroundColor: c, color: readableOn(c) } : undefined}>{c ? '' : (ar ? 'تلقائي' : 'Auto')}{c && <span className="inline-block w-3" />}</button>)}
            </div>
          </Field>
          <Field label={ar ? 'نوع الخط' : 'Font'}>
            <Select value={f.font} onChange={(e) => { loadBannerFont(e.target.value); setF((x) => ({ ...x, font: e.target.value })); }}>{BANNER_FONTS.map((x) => <option key={x.key || 'default'} value={x.key}>{x.ar}</option>)}</Select>
          </Field>
        </div>
        <p className="text-xs leading-6 text-muted">{ar ? 'الصورة بتتحفظ كبانر عادي، وتقدر تعدّل الكلام أو الشكل بعد كده من صفحة البانرات.' : 'It is saved as a regular banner; edit text or look later from the Banners page.'}</p>
      </div>
    </Sheet>
  );
}
