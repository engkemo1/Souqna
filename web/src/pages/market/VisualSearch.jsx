import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, RefreshCcw } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { useApi } from '../../lib/hooks.js';
import { useDepartments } from '../../lib/departments.js';
import MarketHeader from '../../components/market/MarketHeader.jsx';
import Brand from '../../components/market/Brand.jsx';
import StylistChat from '../../components/market/StylistChat.jsx';
import ProductCard, { ProductCardSkeleton, ProductGrid } from '../../components/store/ProductCard.jsx';
import Button from '../../components/ui/Button.jsx';
import { errorMessage } from '../../components/ui/States.jsx';
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
  const { data: visualTypeData } = useApi('/visual-search/types');
  const { list, label } = useDepartments();
  const [blob, setBlob] = useState(null);
  const [preview, setPreview] = useState('');
  const [dept, setDept] = useState('');
  const [type, setType] = useState('');
  const [state, setState] = useState({ loading: false, items: null, error: null });
  const input = useRef(null);
  const typeSection = useRef(null);
  const requestId = useRef(0);

  useEffect(() => { document.title = `${t('visual.title')} · ${t('app.name')}`; }, [t]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const run = async (b, department, garmentType) => {
    const id = ++requestId.current;
    setState({ loading: true, items: null, error: null });
    try {
      const fd = new FormData(); fd.append('file', b, 'photo.jpg'); if (department) fd.append('department', department); fd.append('type', garmentType);
      const res = await fetch('/api/visual-search', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error('x'), { code: data?.error?.code });
      if (id === requestId.current) setState({ loading: false, items: data.items || [], error: null });
    } catch (e) { if (id === requestId.current) setState({ loading: false, items: null, error: e }); }
  };
  const pick = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    let b; try { b = await shrink(file); } catch { b = file; }
    setBlob(b); setPreview(URL.createObjectURL(b)); if (type) run(b, dept, type);
  };
  const changeType = (value) => { setType(value); if (blob) run(blob, dept, value); };
  const changeDept = (d) => { setDept(d); if (blob && type) run(blob, d, type); };
  const typeLabels = lang === 'ar' ? {} : {
    tops: 'Tops', bottoms: 'Bottoms', dresses: 'Dresses & one-piece', suiting: 'Suits & tailoring',
    outerwear: 'Jackets & coats', modest: 'Modest wear', shoes: 'Shoes', bags: 'Bags',
    accessories: 'Accessories', sport: 'Sportswear', underwear_sleep: 'Underwear & sleepwear',
  };

  return (
    <div className="min-h-dvh">
      <MarketHeader />
      <main className="container pb-20 pt-6 sm:pt-10">
        <div className="mx-auto max-w-3xl text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-secondary text-brand"><Camera className="h-7 w-7" /></span>
          <h1 className="mt-4 font-display text-[clamp(1.8rem,1.2rem+2.4vw,2.8rem)] font-bold leading-tight">{t('visual.title')}</h1>
          <p className="mt-3 text-[16px] leading-relaxed text-muted">{t('visual.sub')}</p>

          <div ref={typeSection} className="mt-6 rounded-3xl border border-line bg-elevated p-4 sm:p-5">
            <p className="mb-3 text-sm font-semibold">{t('visual.stepType')}</p>
            <div className="flex flex-wrap justify-center gap-2" role="group" aria-label={t('visual.chooseType')}>
              {(visualTypeData?.types || []).map((option) => (
                <button key={option.key} type="button" aria-pressed={type === option.key} onClick={() => changeType(option.key)}
                  className={cx('rounded-full border px-3.5 py-2 text-sm font-medium transition', type === option.key ? 'border-fg bg-fg text-canvas' : 'border-line-strong bg-elevated hover:border-fg')}>
                  {lang === 'ar' ? option.ar : (typeLabels[option.key] || option.key)}
                </button>
              ))}
            </div>
          </div>

          <input ref={input} type="file" accept="image/*" className="sr-only" onChange={pick} aria-label={t('visual.pick')} />
          <p className="mb-2 mt-4 text-sm font-semibold">{t('visual.stepPhoto')}</p>
          {!preview ? (
            <button type="button" disabled={!type} onClick={() => input.current?.click()}
              className="mt-3 flex w-full flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-line-strong bg-elevated px-6 py-10 transition hover:border-fg active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 sm:py-12">
              <ImagePlus className="h-9 w-9 text-brand" /><span className="text-lg font-bold">{t('visual.pick')}</span><span className="text-sm text-muted">{type ? t('visual.pickHint') : t('visual.chooseTypeFirst')}</span>
            </button>
          ) : (
            <div className="mt-7 flex items-center gap-4 rounded-3xl border border-line bg-elevated p-3 text-start">
              <img src={preview} alt="" className="h-24 w-24 shrink-0 rounded-2xl object-cover" />
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{state.loading ? t('visual.searching') : state.error ? t('visual.searchErrorTitle') : state.items?.length ? t('visual.results', { n: state.items.length }) : state.items ? t('visual.none') : ''}</p><p className="mt-1 text-xs text-muted">{state.loading ? t('visual.searchingHint') : state.items?.length ? t('visual.previewHint') : ''}</p></div>
              <Button variant="outline" icon={RefreshCcw} onClick={() => input.current?.click()}>{t('visual.again')}</Button>
            </div>
          )}
        </div>

        {preview && type && (
          <section className="mx-auto mt-6 max-w-5xl rounded-3xl border border-line bg-elevated p-4 sm:p-5">
            <p className="mb-3 text-sm font-semibold">{t('visual.departmentFilter')}</p>
            <div className="flex flex-wrap justify-center gap-2" role="tablist" aria-label={t('visual.departmentFilter')}>
            {[{ slug: '', name: t('visual.allDepts') }, ...list.map((d) => ({ slug: d.slug, name: label(d.slug) }))].map((d) => (
              <button key={d.slug} type="button" role="tab" aria-selected={dept === d.slug} onClick={() => changeDept(d.slug)}
                className={cx('h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition', dept === d.slug ? 'border-fg bg-fg text-canvas' : 'border-line-strong bg-elevated hover:border-fg')}>{d.name}</button>
            ))}
            </div>
          </section>
        )}

        <div className="mx-auto mt-8 max-w-6xl">
          {state.loading && <ProductGrid>{Array.from({ length: 8 }, (_, i) => <ProductCardSkeleton key={i} />)}</ProductGrid>}
          {state.error && <div role="alert" className="mx-auto max-w-xl rounded-3xl border border-sale/20 bg-sale/5 p-6 text-center"><p className="font-semibold">{t('visual.searchErrorTitle')}</p><p className="mt-2 text-sm text-muted">{errorMessage(t, state.error)}</p><Button className="mt-4" onClick={() => blob && run(blob, dept, type)}>{t('visual.retry')}</Button></div>}
          {state.items && (state.items.length ? (
            <>
              <div className="mb-5 flex flex-wrap items-end justify-between gap-2"><h2 className="font-display text-xl font-bold">{t('visual.results', { n: state.items.length })}</h2><p className="text-sm text-muted">{t('visual.previewHint')}</p></div>
              <ProductGrid>{state.items.map((p, i) => (
                <div key={`${p.store.slug}-${p.id}`} className="relative">
                  <ProductCard product={p} slug={p.store.slug} index={i} showStore />
                </div>
              ))}</ProductGrid>
              <p className="mt-8 text-center text-sm text-muted">{t('visual.note')}</p>
            </>
          ) : <div className="mx-auto max-w-xl rounded-3xl border border-line bg-elevated p-6 text-center sm:p-8"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-secondary text-brand"><Camera className="h-6 w-6" /></span><h2 className="mt-4 font-display text-xl font-bold">{t('visual.none')}</h2><p className="mt-2 text-sm leading-6 text-muted">{t('visual.noneBody')}</p><div className="mt-5 flex flex-wrap justify-center gap-2"><Button variant="outline" disabled={!dept} onClick={() => changeDept('')}>{t('visual.tryAllDepts')}</Button><Button variant="outline" onClick={() => { typeSection.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>{t('visual.changeType')}</Button><Button onClick={() => input.current?.click()} icon={RefreshCcw}>{t('visual.again')}</Button></div></div>)}
        </div>
      </main>
      <footer className="container flex items-center justify-between border-t border-line py-8 text-sm text-muted"><Brand /><p>© {new Date().getFullYear()} {t('market.footer')}</p></footer>
      <StylistChat />
    </div>
  );
}
