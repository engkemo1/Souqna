import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Camera, ClipboardPaste, ImagePlus, PackagePlus, RefreshCcw, Share2, Smartphone } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { api, upload } from '../../lib/api.js';
import { expectedVisualMs, recordVisualMs } from '../../lib/visualTiming.js';
import { useInstall } from '../../lib/pwa.js';
import { useApi } from '../../lib/hooks.js';
import { useDepartments } from '../../lib/departments.js';
import { visualHandoff } from '../../lib/visualHandoff.js';
import { EN_LABELS } from '../../lib/visualLabels.js';
import MarketHeader from '../../components/market/MarketHeader.jsx';
import Brand from '../../components/market/Brand.jsx';
import SearchProgress from '../../components/market/SearchProgress.jsx';
import StylistChat from '../../components/market/StylistChat.jsx';
import ProductCard, { ProductCardSkeleton, ProductGrid } from '../../components/store/ProductCard.jsx';
import Button from '../../components/ui/Button.jsx';
import { errorMessage } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { cx } from '../../components/ui/cx.js';

/** shrink big phone photos before upload (faster on mobile data, same search quality) */
async function shrink(file, max = 800) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b || file), 'image/jpeg', 0.85));
}

export default function VisualSearch() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const install = useInstall();
  const [sp, setSp] = useSearchParams();
  const { data: visualTypeData } = useApi('/visual-search/types');
  const { tops: list, label } = useDepartments();
  const [blob, setBlob] = useState(null);
  const [preview, setPreview] = useState('');
  const [dept, setDept] = useState('');
  const [type, setType] = useState(''); // '' = detect automatically
  const [active, setActive] = useState(0);
  const [state, setState] = useState({ loading: false, data: null, error: null });
  const input = useRef(null);
  const cam = useRef(null);
  const ar = lang === 'ar';
  const requestId = useRef(0);
  const [prog, setProg] = useState({ upload: 0, analysisStart: 0, expected: 6000 });
  const [voted, setVoted] = useState(() => new Set());
  const deptRef = useRef('');
  const canPasteBtn = typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.read);

  useEffect(() => { document.title = `${t('visual.title')} · ${t('app.name')}`; }, [t]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const run = async (b, department, garmentType) => {
    const id = ++requestId.current;
    setState({ loading: true, data: null, error: null });
    setProg({ upload: 0, analysisStart: 0, expected: expectedVisualMs() });
    try {
      const fd = new FormData(); fd.append('file', b, 'photo.jpg'); if (department) fd.append('department', department); if (garmentType) fd.append('type', garmentType);
      let started = 0;
      const data = await upload('/visual-search', fd, (pct) => {
        if (id !== requestId.current) return;
        if (pct >= 100 && !started) { started = Date.now(); setProg((p) => ({ ...p, upload: 100, analysisStart: started })); }
        else if (!started) setProg((p) => ({ ...p, upload: pct }));
      });
      if (!started) started = Date.now();
      if (id === requestId.current) { recordVisualMs(Date.now() - started); setActive(0); setState({ loading: false, data, error: null }); }
    } catch (e) { if (id === requestId.current) setState({ loading: false, data: null, error: e }); }
  };
  const handleFile = async (file) => {
    if (!file || !String(file.type || 'image/jpeg').startsWith('image/')) return;
    let b; try { b = await shrink(file); } catch { b = file; }
    setBlob(b); setPreview(URL.createObjectURL(b)); setType(''); run(b, deptRef.current, '');
  };
  const pick = (e) => { const file = e.target.files?.[0]; e.target.value = ''; handleFile(file); };

  // a photo shared straight from Instagram / WhatsApp / the gallery (installed app → Share → Twist)
  useEffect(() => {
    const token = sp.get('shared'); if (!token) return;
    (async () => {
      try { const r = await fetch(`/api/visual-search/shared/${encodeURIComponent(token)}`); if (r.ok) await handleFile(await r.blob()); }
      catch { /* the photo expired — the normal picker is still there */ }
      setSp({}, { replace: true });
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Ctrl/Cmd+V or long-press → paste anywhere on the page
  useEffect(() => {
    const onPaste = (e) => { const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); handleFile(f); } };
    window.addEventListener('paste', onPaste); return () => window.removeEventListener('paste', onPaste);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pasteFromClipboard = async () => {
    try {
      for (const item of await navigator.clipboard.read()) { const type = item.types.find((x) => x.startsWith('image/')); if (type) { handleFile(await item.getType(type)); return; } }
      toast({ tone: 'error', title: t('visual.pasteEmpty') });
    } catch { toast({ tone: 'error', title: t('visual.pasteEmpty') }); }
  };
  const onDrop = (e) => { e.preventDefault(); handleFile(e.dataTransfer?.files?.[0]); };

  const changeType = (value) => { setType(value); if (blob) run(blob, dept, value); };
  const changeDept = (d) => { setDept(d); deptRef.current = d; if (blob) run(blob, d, type); };

  const groupLabel = (g) => (lang === 'ar' ? g.label : (EN_LABELS[g.type] || g.label));
  const groups = (state.data?.groups || []).filter((g) => g.items.length);
  const current = groups[Math.min(active, Math.max(0, groups.length - 1))];
  const noMatch = Boolean(state.data) && groups.length === 0;
  // «closest alternatives» (below the strict floor, same garment type): shown under the exact matches or under the sourcing offer
  const similarSource = current ? current.similar || [] : (state.data?.groups || []).flatMap((g) => g.similar || []);
  const similar = [...new Map(similarSource.map((p) => [`${p.store.slug}-${p.id}`, p])).values()].slice(0, 12);
  const detectedLabel = (state.data?.detected || []).map(groupLabel).find(Boolean) || '';
  const requestHref = `/request?from=visual&title=${encodeURIComponent(t('visual.requestTitle', { item: detectedLabel || t('visual.itemFallback') }))}`;

  // «مش شبه»: tell us a result does not match, so we can fix the catalogue / model. Counted only; the shopper just gets a thank-you.
  const reportBad = async (p, family) => {
    setVoted((v) => new Set(v).add(p.id));
    try { await api('/visual-feedback', { method: 'POST', body: { product_id: p.id, model: state.data?.model || '', family: family || '' } }); toast({ title: lang === 'ar' ? 'شكراً، هنراجعها' : 'Thanks, we will review it' }); } catch { /* best effort */ }
  };

  const share = async () => {
    try {
      const items = groups.flatMap((g) => g.items.slice(0, 4).map((p) => ({ id: p.id, label: groupLabel(g) }))).slice(0, 12);
      const { url } = await api('/look-share', { method: 'POST', body: { title: t('visual.shareTitle'), kind: 'visual', items } });
      const link = `${window.location.origin}${url}`;
      if (navigator.share) { try { await navigator.share({ title: t('visual.shareTitle'), text: t('visual.shareText'), url: link }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
      window.open(`https://wa.me/?text=${encodeURIComponent(`${t('visual.shareText')} ${link}`)}`, '_blank', 'noopener');
    } catch { toast({ tone: 'error', title: t('visual.shareFailed') }); }
  };

  return (
    <div className="min-h-dvh">
      <MarketHeader />
      <main className="container pb-20 pt-6 sm:pt-10">
        <div className="mx-auto max-w-3xl">
          <input ref={input} type="file" accept="image/*" className="sr-only" onChange={pick} aria-label={t('visual.pick')} />
          <input ref={cam} type="file" accept="image/*" capture="environment" className="sr-only" onChange={pick} aria-label={ar ? 'صوّر دلوقتي' : 'Take a photo'} />
          {!preview ? (
            <>
              <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop} className="relative overflow-hidden rounded-[28px] px-5 pb-6 pt-5 text-center text-white shadow-[0_18px_40px_-22px_rgba(11,31,66,.8)]" style={{ background: 'radial-gradient(120% 120% at 50% 0%, #274a85 0%, #14305c 50%, #0b1f42 100%)' }}>
                <img src="/brand/visual-hero.webp" alt="" aria-hidden="true" width="620" height="410" decoding="async" className="mx-auto h-auto w-[min(78%,290px)] [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)] drop-shadow-[0_18px_22px_rgba(0,0,0,.35)]" />
                <h1 className="mt-1 font-display text-[clamp(1.35rem,1.1rem+2vw,2.2rem)] font-bold leading-tight">{ar ? 'شفت لبس عجبك؟ صوّره ولاقيه' : t('visual.title')}</h1>
                <p className="mx-auto mt-2 max-w-md text-[14.5px] leading-relaxed text-white/75">{ar ? 'صوّر أي حاجة عجبتك أو ارفع صورتها، وهنوريك أقرب القطع الموجودة فعلاً في محلات بنها بسعرها.' : t('visual.sub')}</p>
                <div className="mx-auto mt-5 grid max-w-md gap-2.5 sm:grid-cols-2">
                  <button type="button" onClick={() => cam.current?.click()} className="inline-flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-[#ff8a3d] text-[15px] font-bold text-white shadow-[0_10px_20px_-10px_rgba(255,138,61,.9)] transition active:scale-[0.98]"><Camera className="h-5 w-5" />{ar ? 'صوّر دلوقتي' : 'Take a photo'}</button>
                  <button type="button" onClick={() => input.current?.click()} className="inline-flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-white/10 text-[15px] font-bold text-white ring-1 ring-inset ring-white/25 transition active:scale-[0.98]"><ImagePlus className="h-5 w-5" />{ar ? 'اختار من المعرض' : 'Choose from gallery'}</button>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[13px] text-white/65">
                  {canPasteBtn && <button type="button" onClick={pasteFromClipboard} className="inline-flex items-center gap-1.5 font-semibold text-white/90 underline-offset-4 hover:underline"><ClipboardPaste className="h-4 w-4" />{t('visual.paste')}</button>}
                  <span className="hidden sm:inline">{t('visual.dropHint')}</span>
                </div>
              </div>
              <ol className="mt-5 grid grid-cols-3 gap-2 text-center text-[12.5px] leading-snug text-muted">
                {[[ar ? 'صوّر أو ارفع صورة' : 'Snap or upload'], [ar ? 'بنقارنها بالمحلات' : 'We compare it'], [ar ? 'اختار القطعة واطلبها' : 'Pick and order']].map(([txt], i) => (
                  <li key={i} className="flex flex-col items-center gap-1.5"><span className="grid h-7 w-7 place-items-center rounded-full bg-secondary text-[13px] font-bold text-brand">{i + 1}</span>{txt}</li>
                ))}
              </ol>
            </>
          ) : (
            <>
              <h1 className="sr-only">{t('visual.title')}</h1>
              <div className="flex items-center gap-3 rounded-3xl border border-line bg-elevated p-3 text-start">
                <img src={preview} alt="" className="h-20 w-20 shrink-0 rounded-2xl object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold">{state.loading ? t('visual.searching') : state.error ? t('visual.searchErrorTitle') : groups.length ? t('visual.results', { n: state.data.total }) : state.data ? t('visual.noMatchTitle') : ''}</p>
                  {state.loading ? <SearchProgress uploadPct={prog.upload} analysisStart={prog.analysisStart} expectedMs={prog.expected} /> : <p className="mt-1 text-xs text-muted">{groups.length ? t('visual.previewHint') : ''}</p>}
                </div>
                <Button variant="outline" icon={RefreshCcw} onClick={() => input.current?.click()}>{ar ? 'صورة تانية' : t('visual.again')}</Button>
              </div>
            </>
          )}
          {!preview && !install.installed && install.canPrompt && (
            <div className="mt-5 flex items-center gap-3 rounded-2xl bg-secondary p-4 text-start">
              <Smartphone className="h-6 w-6 shrink-0 text-brand" />
              <p className="flex-1 text-[13.5px] leading-relaxed">{t('visual.installTip')}</p>
              <Button variant="outline" onClick={install.install}>{t('visual.install')}</Button>
            </div>
          )}
        </div>

        {preview && !state.loading && (groups.length > 1 || type) && (
          <section className="mx-auto mt-6 max-w-5xl">
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0 [scrollbar-width:none]" role="tablist" aria-label={t('visual.detected')}>
              {groups.length > 1 && <span className="shrink-0 self-center text-sm font-semibold text-muted">{t('visual.detected')}</span>}
              {groups.length > 1 && groups.map((g, i) => (
                <button key={g.type || i} type="button" role="tab" aria-selected={current === g} onClick={() => setActive(i)}
                  className={cx('shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition', current === g ? 'border-fg bg-fg text-canvas' : 'border-line-strong bg-elevated hover:border-fg')}>
                  {groupLabel(g)} <span className="opacity-70">({g.items.length})</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {preview && !state.loading && (
          <details className="mx-auto mt-5 max-w-5xl rounded-3xl border border-line bg-elevated p-4 sm:p-5" open={Boolean(type)}>
            <summary className="cursor-pointer text-sm font-semibold">{t('visual.notThis')}</summary>
            <div className="mt-3 flex flex-wrap justify-center gap-2" role="group" aria-label={t('visual.chooseType')}>
              <button type="button" aria-pressed={!type} onClick={() => changeType('')}
                className={cx('rounded-full border px-3.5 py-2 text-sm font-medium transition', !type ? 'border-fg bg-fg text-canvas' : 'border-line-strong bg-elevated hover:border-fg')}>{t('visual.auto')}</button>
              {(visualTypeData?.types || []).map((option) => (
                <button key={option.key} type="button" aria-pressed={type === option.key} onClick={() => changeType(option.key)}
                  className={cx('rounded-full border px-3.5 py-2 text-sm font-medium transition', type === option.key ? 'border-fg bg-fg text-canvas' : 'border-line-strong bg-elevated hover:border-fg')}>
                  {lang === 'ar' ? option.ar : (EN_LABELS[option.key] || option.key)}
                </button>
              ))}
            </div>
            <div className="mt-4 border-t border-line pt-4">
              <p className="mb-2 text-center text-sm font-semibold">{t('visual.departmentFilter')}</p>
              <div className="flex flex-wrap justify-center gap-2" role="tablist" aria-label={t('visual.departmentFilter')}>
                {[{ slug: '', name: t('visual.allDepts') }, ...list.map((d) => ({ slug: d.slug, name: label(d.slug) }))].map((d) => (
                  <button key={d.slug} type="button" role="tab" aria-selected={dept === d.slug} onClick={() => changeDept(d.slug)}
                    className={cx('h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition', dept === d.slug ? 'border-fg bg-fg text-canvas' : 'border-line-strong bg-elevated hover:border-fg')}>{d.name}</button>
                ))}
              </div>
            </div>
          </details>
        )}

        <div className="mx-auto mt-8 max-w-6xl">
          {state.data && state.data.reliable === false && !state.loading && <p role="note" className="mx-auto mb-5 max-w-2xl rounded-2xl bg-amber-50 px-4 py-3 text-center text-sm text-amber-900">{lang === 'ar' ? 'البحث دلوقتي بالألوان والشكل بس، فممكن تظهر قطع لونها قريب ونوعها مختلف. لو مش شبه صورتك، دوس على «مش شبه».' : 'Search is matching colours and shape only right now, so some results may be a different type of item.'}</p>}
          {state.loading && <ProductGrid>{Array.from({ length: 8 }, (_, i) => <ProductCardSkeleton key={i} />)}</ProductGrid>}
          {state.error && <div role="alert" className="mx-auto max-w-xl rounded-3xl border border-sale/20 bg-sale/5 p-6 text-center"><p className="font-semibold">{t('visual.searchErrorTitle')}</p><p className="mt-2 text-sm text-muted">{errorMessage(t, state.error)}</p><Button className="mt-4" onClick={() => blob && run(blob, dept, type)}>{t('visual.retry')}</Button></div>}
          {current && (
            <>
              <div className="mb-4 flex items-center justify-between gap-2"><div><h2 className="font-display text-xl font-bold">{ar ? 'الأقرب لصورتك' : t('visual.results', { n: current.items.length })}{groupLabel(current) ? ` — ${groupLabel(current)}` : ''}</h2><p className="mt-0.5 text-[13px] text-muted">{ar ? `${current.items.length} قطعة — افتح أي واحدة للتفاصيل` : t('visual.previewHint')}</p></div><Button variant="outline" icon={Share2} onClick={share}>{t('visual.share')}</Button></div>
              <ProductGrid>{current.items.map((p, i) => (
                <div key={`${p.store.slug}-${p.id}`} className="relative">
                  <ProductCard product={p} slug={p.store.slug} index={i} showStore />
                  <button type="button" disabled={voted.has(p.id)} onClick={() => reportBad(p, current.type)} className="mt-1.5 w-full rounded-lg py-1.5 text-center text-[12.5px] text-muted underline-offset-4 hover:underline disabled:no-underline disabled:opacity-60">{voted.has(p.id) ? (lang === 'ar' ? 'اتسجّل، شكراً' : 'Noted, thanks') : (lang === 'ar' ? 'مش شبه صورتي؟' : 'Not like my photo?')}</button>
                </div>
              ))}</ProductGrid>
              <p className="mt-8 text-center text-sm text-muted">{t('visual.note')}</p>
            </>
          )}
          {noMatch && (
            <div className="mx-auto max-w-xl rounded-3xl border border-line bg-elevated p-6 text-center sm:p-8">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-secondary text-brand"><PackagePlus className="h-6 w-6" /></span>
              <h2 className="mt-4 font-display text-xl font-bold">{t('visual.noMatchTitle')}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{t(similar.length ? 'visual.noMatchBodySimilar' : 'visual.noMatchBody')}</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Link to={requestHref} onClick={() => { visualHandoff.blob = blob; }} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-btn px-5 text-sm font-bold text-on-btn transition hover:opacity-90 active:scale-[0.98]"><PackagePlus className="h-4 w-4" />{t('visual.getIt')}</Link>
                <Button variant="outline" onClick={() => input.current?.click()} icon={RefreshCcw}>{t('visual.again')}</Button>
                {dept && <Button variant="outline" onClick={() => changeDept('')}>{t('visual.tryAllDepts')}</Button>}
              </div>
            </div>
          )}
          {similar.length > 0 && !state.loading && (
            <section className="mt-12" aria-labelledby="similar-title">
              <div className="mb-5"><h2 id="similar-title" className="font-display text-xl font-bold">{t('visual.similarTitle')}</h2><p className="mt-1 text-sm text-muted">{t('visual.similarSub')}</p></div>
              <ProductGrid>{similar.map((p, i) => (
                <div key={`similar-${p.store.slug}-${p.id}`} className="relative">
                  <ProductCard product={p} slug={p.store.slug} index={i} showStore />
                </div>
              ))}</ProductGrid>
            </section>
          )}
        </div>
      </main>
      <footer className="container flex items-center justify-between border-t border-line py-8 text-sm text-muted"><Brand /><p>© {new Date().getFullYear()} {t('market.footer')}</p></footer>
      <StylistChat />
    </div>
  );
}
