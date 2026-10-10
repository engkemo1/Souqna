import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Lock, Wand2, ShoppingBag, Heart, Search, RotateCcw, ShieldCheck, Monitor, Smartphone, ArrowRight } from 'lucide-react';
import { buildTheme, THEME_FIELDS, THEME_PRESETS, normalizeHex } from '@souqna/shared/theme';
import { useApi, invalidate } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { formatMoney } from '../../lib/format.js';
import { PageHeader, Panel } from '../../components/dash/Kit.jsx';
import Button from '../../components/ui/Button.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import { Segmented } from '../../components/ui/Field.jsx';
import { ErrorState, errorMessage } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { StoreLogo } from '../../components/store/StoreChrome.jsx';
import PageTransition from '../../components/PageTransition.jsx';
import { cx } from '../../components/ui/cx.js';

function ColorField({ field, value, onChange, fixedTo }) {
  const { t } = useI18n();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-elevated p-2.5">
      <label className="relative h-11 w-11 shrink-0 cursor-pointer overflow-hidden rounded-lg ring-1 ring-inset ring-black/10" style={{ background: value }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={t(`theme.field.${field}`)} />
      </label>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{t(`theme.field.${field}`)}</p>
        <input value={text} dir="ltr" onChange={(e) => { setText(e.target.value); const n = normalizeHex(e.target.value); if (n) onChange(n); }} spellCheck={false}
          className="w-full bg-transparent font-mono text-[13px] uppercase text-muted outline-none focus:text-fg" aria-label={`${t(`theme.field.${field}`)} hex`} />
      </div>
      {fixedTo && (
        <span title={t('theme.fixed')} className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-1.5 py-1 text-amber-800">
          <Wand2 className="h-3.5 w-3.5" /><span className="h-4 w-4 rounded-full ring-1 ring-inset ring-black/10" style={{ background: fixedTo }} />
        </span>
      )}
    </div>
  );
}

/** A miniature storefront rendered with the *candidate* tokens, scoped to this element. */
function LivePreview({ theme, store, products, device, lang }) {
  const { t } = useI18n();
  const tr = (o) => (o ? o[lang] || o.en : '');
  const money = (n) => formatMoney(n, lang);
  const mobile = device === 'mobile';
  return (
    <div className={cx('mx-auto overflow-hidden rounded-[28px] border-[6px] border-neutral-900 bg-neutral-900 shadow-lift transition-all duration-500', mobile ? 'max-w-[300px]' : 'max-w-full')}>
      <div style={Object.fromEntries(Object.entries(theme.cssVars).filter(([k]) => k.startsWith('--')))} className="bg-canvas text-fg" dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang}>
        <div className="bg-footer py-1.5 text-center text-[10px] font-medium text-on-footer">{t('store.freeShippingOver', { v: money(store.freeShippingOver) })}</div>
        <div className="flex items-center justify-between bg-header px-3.5 py-2.5 text-on-header">
          <div className="flex items-center gap-2"><StoreLogo store={store} size={26} className="h-[26px] w-[26px]" /><span className="font-display text-sm font-bold">{tr(store.name)}</span></div>
          {!mobile && <div className="flex gap-3 text-xs font-medium opacity-80"><span>{t('store.home')}</span><span>{t('store.shopAll')}</span><span className="text-sale">{t('store.onSale')}</span></div>}
          <div className="flex items-center gap-2.5"><Search className="h-3.5 w-3.5" /><Heart className="h-3.5 w-3.5" /><span className="relative"><ShoppingBag className="h-3.5 w-3.5" /><span className="absolute -end-1.5 -top-1.5 grid h-3 min-w-3 place-items-center rounded-full bg-accent px-0.5 text-[7px] font-bold text-on-accent">2</span></span></div>
        </div>
        <div className="bg-secondary px-5 py-6 text-on-secondary">
          <p className="text-[9px] font-semibold tracking-[0.2em] opacity-70">{lang === 'ar' ? 'الموسم الجديد' : 'NEW SEASON'}</p>
          <p className="mt-1 font-display text-xl font-bold leading-tight">{t('theme.previewHero')}</p>
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-btn-outline bg-btn px-3 py-1.5 text-xs font-semibold text-on-btn">{t('store.shopAll')}<ArrowRight className="h-3 w-3 rtl:-scale-x-100" /></span>
          <span className="ms-2 inline-flex rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-brand">{t('store.newArrivals')}</span>
        </div>
        <div className={cx('grid gap-3 p-3.5', mobile ? 'grid-cols-2' : 'grid-cols-3')}>
          {(products?.length ? products : [null, null, null]).slice(0, mobile ? 2 : 3).map((p, i) => (
            <div key={p?.id ?? i}>
              <div className="relative overflow-hidden rounded-xl bg-surface">
                {p ? <SmartImage media={p.image} ratio="4 / 5" sizes="160px" /> : <div className="aspect-[4/5]" />}
                {i === 0 && <span className="absolute start-1.5 top-1.5 rounded-full bg-sale px-1.5 py-0.5 text-[8px] font-bold text-white">-20%</span>}
                {i === 1 && <span className="absolute start-1.5 top-1.5 rounded-full bg-accent px-1.5 py-0.5 text-[8px] font-bold text-on-accent">{t('product.new')}</span>}
              </div>
              <p className="mt-1.5 truncate text-xs font-medium">{p ? tr(p.name) : t('theme.previewProduct')}</p>
              <p className="text-xs font-semibold"><span className={i === 0 ? 'text-sale' : ''}>{money(p?.price || 799)}</span>{i === 0 && <span className="ms-1 text-[9px] font-normal text-muted line-through">{money(Math.round((p?.price || 799) * 1.25))}</span>}</p>
            </div>
          ))}
        </div>
        <div className="px-3.5 pb-3.5">
          <div className="flex items-center justify-between rounded-xl border border-line bg-elevated p-2.5">
            <span className="text-xs text-muted">{t('cart.total')}</span><span className="text-xs font-semibold">{money(1598)}</span>
          </div>
          <span className="mt-2 block rounded-lg border border-btn-outline bg-btn py-2 text-center text-xs font-semibold text-on-btn">{t('cart.checkout')}</span>
        </div>
        <div className="bg-footer px-4 py-4 text-on-footer">
          <p className="font-display text-sm font-bold">{tr(store.name)}</p>
          <p className="mt-1 text-[10px] text-footer-muted">{t('store.cod')} · {t('store.exchange')}</p>
        </div>
      </div>
    </div>
  );
}

export default function ThemeEditor() {
  const { t, lang } = useI18n();
  const { store, setStore } = useAuth();
  const toast = useToast();
  const { data, error, reload } = useApi('/owner/store');
  const { data: home } = useApi(`/stores/${store.slug}/home`);
  const [input, setInput] = useState(null);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState('mobile');
  const [tab, setTab] = useState('colors');

  useEffect(() => { if (data) { setInput(data.store.theme.input); setSaved(data.store.theme.input); } }, [data]);
  const theme = useMemo(() => (input ? buildTheme(input) : null), [input]);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!input || !theme) return <div className="space-y-4"><Skeleton className="h-8 w-60" /><div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-[520px] rounded-2xl" /><Skeleton className="h-[520px] rounded-2xl" /></div></div>;

  const dirty = JSON.stringify(input) !== JSON.stringify(saved);
  const fixes = Object.fromEntries(theme.report.filter((r) => r.level !== 'error').map((r) => [r.field, r.to]));
  const products = home?.newArrivals?.slice(0, 3);
  const activePreset = Object.entries(THEME_PRESETS).find(([, p]) => THEME_FIELDS.every((f) => p[f].toUpperCase() === (input[f] || '').toUpperCase()))?.[0];

  const save = async () => {
    setBusy(true);
    try {
      const r = await api('/owner/store/theme', { method: 'PUT', body: input });
      setSaved(r.theme.input);
      setStore({ ...store, theme: r.theme });
      invalidate(`/stores/${store.slug}`);
      invalidate('/marketplace');
      toast({ title: t('theme.saved') });
    } catch (e) { toast({ tone: 'error', title: errorMessage(t, e) }); }
    setBusy(false);
  };

  const controls = (
    <div className="space-y-4">
      <Panel title={t('theme.presets')}>
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6 lg:grid-cols-3 xl:grid-cols-6">
          {Object.entries(THEME_PRESETS).map(([key, p]) => (
            <button key={key} type="button" onClick={() => setInput({ ...p })} aria-pressed={activePreset === key}
              className={cx('group rounded-xl border-2 p-1.5 text-center transition', activePreset === key ? 'border-primary' : 'border-transparent hover:border-line-strong')}>
              <span className="relative block overflow-hidden rounded-lg ring-1 ring-black/5" style={{ background: p.background }}>
                <span className="block h-3" style={{ background: p.header === p.background ? p.secondary : p.header }} />
                <span className="flex h-9 items-center justify-center gap-1"><span className="h-3.5 w-3.5 rounded-full" style={{ background: p.primary }} /><span className="h-3.5 w-3.5 rounded-full" style={{ background: p.accent }} /></span>
                <span className="block h-3" style={{ background: p.footer }} />
                {activePreset === key && <span className="absolute end-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-primary text-white"><Check className="h-2.5 w-2.5" strokeWidth={3} /></span>}
              </span>
              <span className="mt-1.5 block text-xs font-medium">{t(`theme.preset.${key}`)}</span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel title={t('theme.custom')} action={dirty && <button type="button" onClick={() => setInput(saved)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg"><RotateCcw className="h-4 w-4" />{t('theme.reset')}</button>}>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {THEME_FIELDS.map((f) => <ColorField key={f} field={f} value={input[f]} fixedTo={fixes[f]} onChange={(v) => setInput((x) => ({ ...x, [f]: v }))} />)}
        </div>
      </Panel>

      <Panel title={t('theme.accessibility')}>
        <ul className="divide-y divide-line">
          {theme.checks.map((c) => (
            <li key={c.pair} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 text-sm">
              <span>{t(`theme.pair.${c.pair}`)}</span>
              <span className="flex items-center gap-2"><span className="font-mono text-xs text-muted">{c.ratio.toFixed(1)}:1</span>
                <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', c.pass ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800')}>{c.pass ? <><ShieldCheck className="h-3.5 w-3.5" />AA</> : 'AA Large'}</span></span>
            </li>
          ))}
        </ul>
        {theme.report.length > 0 && (
          <div className="mt-4 space-y-2 rounded-xl bg-amber-50 p-3.5 text-[13px] text-amber-900">
            {theme.report.map((r) => (
              <p key={r.field + r.code} className="flex items-center gap-2"><Wand2 className="h-3.5 w-3.5 shrink-0" />
                <span>{t('theme.adjustedShort', { field: t(`theme.field.${r.field}`) })}</span>
                <span className="ms-auto flex items-center gap-1" dir="ltr"><span className="h-4 w-4 rounded ring-1 ring-black/10" style={{ background: r.from }} />→<span className="h-4 w-4 rounded ring-1 ring-black/10" style={{ background: r.to }} /></span>
              </p>
            ))}
          </div>
        )}
      </Panel>

      <div className="flex gap-3 rounded-2xl border border-dashed border-line-strong p-4">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
        <div><p className="text-sm font-semibold">{t('theme.locked')}</p><p className="mt-1 text-sm text-muted">{t('theme.lockedBody')}</p></div>
      </div>
    </div>
  );

  const preview = (
    <div className="rounded-2xl border border-line bg-[repeating-linear-gradient(45deg,rgb(var(--c-surface)),rgb(var(--c-surface))_10px,rgb(var(--c-background))_10px,rgb(var(--c-background))_20px)] p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-semibold">{t('theme.preview')}</p>
        <Segmented size="sm" value={device} onChange={setDevice} options={[{ value: 'mobile', label: <Smartphone className="h-4 w-4" aria-label="Mobile" /> }, { value: 'desktop', label: <Monitor className="h-4 w-4" aria-label="Desktop" /> }]} />
      </div>
      <motion.div layout transition={{ duration: 0.4 }}>
        <LivePreview theme={theme} store={store} products={products} device={device} lang={lang} />
      </motion.div>
    </div>
  );

  return (
    <PageTransition className="pb-24">
      <PageHeader title={t('theme.title')} subtitle={t('theme.body')}
        actions={<Button onClick={save} loading={busy} disabled={!dirty} className="hidden md:inline-flex">{t('theme.save')}</Button>} />
      <div className="mb-4 lg:hidden"><Segmented value={tab} onChange={setTab} className="w-full [&>button]:flex-1" options={[{ value: 'colors', label: t('theme.custom') }, { value: 'preview', label: t('theme.preview') }]} /></div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] xl:grid-cols-[minmax(0,1fr)_520px]">
        <div className={cx(tab !== 'colors' && 'hidden lg:block')}>{controls}</div>
        <div className={cx('lg:sticky lg:top-6', tab !== 'preview' && 'hidden lg:block')}>{preview}</div>
      </div>
      {dirty && (
        <div className="fixed inset-x-0 bottom-[calc(64px+var(--safe-b))] z-20 flex gap-3 border-t border-line bg-elevated/95 px-4 py-3 backdrop-blur-md md:hidden">
          <Button variant="outline" onClick={() => setInput(saved)}>{t('theme.reset')}</Button>
          <Button full onClick={save} loading={busy}>{t('theme.save')}</Button>
        </div>
      )}
    </PageTransition>
  );
}
