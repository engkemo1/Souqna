import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ShieldCheck, Sparkles, Wand2 } from 'lucide-react';
import { useApi, invalidate } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { Panel } from './Kit.jsx';
import Button from '../ui/Button.jsx';
import { Switch } from '../ui/Field.jsx';
import { errorMessage } from '../ui/States.jsx';
import { useToast } from '../ui/Toast.jsx';
import { cx } from '../ui/cx.js';

const L = {
  ar: {
    title: 'ألوان متجرك من اللوجو',
    sub: 'اخترنا الألوان من لوجو محلك، وراجعنا إن كل الكلام مقروء. إنت اللي بتقرر تطبّقها ولا لأ.',
    pending: 'جاهزة للتطبيق', applied: 'متطبّقة على المتجر', dismissed: 'مش مطبّقة', idle: 'اقتراح من اللوجو',
    light: 'فاتح', dark: 'داكن', best: 'الأنسب للوجو',
    readable: 'كل النصوص مقروءة', tuned: 'اتظبطت درجات للقراءة',
    apply: 'طبّق الألوان', later: 'مش دلوقتي', again: 'طبّق الاختيار ده',
    auto: 'ألوان متجري تتبع اللوجو تلقائياً',
    autoHint: 'لما تغيّر اللوجو، الألوان تتحدّث لوحدها (بنفس الشكل اللي اخترته). لو قفلتها هنسألك الأول كل مرة.',
    bannerTitle: 'غيّرت اللوجو، تحب نحدّث ألوان المتجر؟',
    bannerBody: 'جهّزنا ألوان مناسبة من اللوجو الجديد، وتقدر تشوفها قبل ما تطبّقها.',
    see: 'شوف الألوان', keep: 'سيب ألواني',
    done: 'اتطبّقت ألوان اللوجو على المتجر', dismissedToast: 'تمام، ألوانك زي ما هي',
    autoOn: 'ألوان المتجر هتتبع اللوجو من هنا ورايح', autoOff: 'هنسألك الأول قبل أي تغيير',
  },
  en: {
    title: 'Store colours from your logo',
    sub: 'We picked colours from your logo and checked that all text stays readable. You decide whether to apply them.',
    pending: 'Ready to apply', applied: 'Applied to your store', dismissed: 'Not applied', idle: 'Suggested from logo',
    light: 'Light', dark: 'Dark', best: 'Best fit for your logo',
    readable: 'All text readable', tuned: 'Some shades tuned for readability',
    apply: 'Apply colours', later: 'Not now', again: 'Apply this one',
    auto: 'Keep my store colours in sync with my logo',
    autoHint: 'When you change your logo, colours update automatically (same look you chose). Off = we ask first, every time.',
    bannerTitle: 'You changed your logo — update the store colours?',
    bannerBody: 'We prepared matching colours from the new logo. Preview them before applying.',
    see: 'See colours', keep: 'Keep my colours',
    done: 'Logo colours applied to your store', dismissedToast: 'OK, your colours stay as they are',
    autoOn: 'Store colours will now follow your logo', autoOff: 'We will ask before any change',
  },
};

const varsOf = (cssVars) => Object.fromEntries(Object.entries(cssVars).filter(([k]) => k.startsWith('--')));

function Dots({ swatches }) {
  return (
    <span className="inline-flex -space-x-1.5 rtl:space-x-reverse" aria-hidden="true">
      {swatches.slice(0, 5).map((s) => <span key={s.hex} className="h-5 w-5 rounded-full ring-2 ring-elevated" style={{ background: s.hex }} />)}
    </span>
  );
}

/** A miniature storefront painted with the candidate tokens. */
function MiniStore({ variant }) {
  return (
    <div style={varsOf(variant.cssVars)} className="overflow-hidden rounded-xl bg-canvas text-fg ring-1 ring-black/10">
      <div className="flex items-center justify-between bg-header px-2.5 py-1.5 text-on-header">
        <span className="h-2 w-10 rounded-full bg-on-header/70" />
        <span className="flex gap-1"><span className="h-2 w-2 rounded-full bg-on-header/50" /><span className="h-2 w-2 rounded-full bg-accent" /></span>
      </div>
      <div className="bg-secondary px-2.5 py-3 text-on-secondary">
        <span className="block h-2 w-16 rounded-full bg-on-secondary/80" />
        <span className="mt-1.5 block h-1.5 w-24 rounded-full bg-on-secondary/40" />
        <span className="mt-2.5 inline-flex rounded-md bg-btn px-2.5 py-1 text-[9px] font-bold text-on-btn">Shop</span>
        <span className="ms-1.5 inline-flex rounded-md border border-line-strong px-2 py-1 text-[9px] font-bold text-brand">New</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5 p-2">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <div className="relative aspect-[4/5] rounded-md bg-surface">
              {i === 1 && <span className="absolute start-1 top-1 rounded-full bg-accent px-1 text-[7px] font-bold text-on-accent">NEW</span>}
              {i === 0 && <span className="absolute start-1 top-1 rounded-full bg-sale px-1 text-[7px] font-bold text-on-sale">-20%</span>}
            </div>
            <span className="mt-1 block h-1 w-8 rounded-full bg-fg/60" />
            <span className={cx('mt-0.5 block h-1 w-5 rounded-full', i === 0 ? 'bg-sale' : 'bg-fg/35')} />
          </div>
        ))}
      </div>
      <div className="bg-footer px-2.5 py-2"><span className="block h-1.5 w-12 rounded-full bg-on-footer/70" /></div>
    </div>
  );
}

/**
 * Suggests store colours taken from the logo.
 *  - full (Theme page): previews both looks, apply / dismiss, and the "follow my logo" switch.
 *  - compact (Settings): a small prompt that only appears right after the logo changed.
 * Colours are never changed here without the owner's tap (unless "follow my logo" is on).
 */
export default function BrandPaletteCard({ compact = false, onApplied }) {
  const { t, lang } = useI18n();
  const T = L[lang === 'ar' ? 'ar' : 'en'];
  const toast = useToast();
  const { data, reload } = useApi('/owner/store/brand-palette');
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState('');
  const brand = data?.brand;
  if (!brand || brand.status === 'none' || !brand.variants?.length) return null;

  const current = sel || brand.variant || brand.recommended || 'light';
  const refresh = () => { invalidate('/owner/store'); invalidate('/stores/'); invalidate('/marketplace'); reload(); };
  const run = async (key, fn) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast({ tone: 'error', title: errorMessage(t, e) }); }
    setBusy('');
  };
  const apply = () => run('apply', async () => {
    const r = await api('/owner/store/brand-palette/apply', { method: 'POST', body: { variant: current } });
    toast({ title: T.done });
    onApplied?.(r.theme);
    refresh();
  });
  const dismiss = () => run('dismiss', async () => {
    await api('/owner/store/brand-palette/dismiss', { method: 'POST' });
    toast({ title: T.dismissedToast });
    refresh();
  });
  const setAuto = (enabled) => run('auto', async () => {
    const r = await api('/owner/store/brand-palette/auto', { method: 'PUT', body: { enabled, variant: current } });
    if (r.theme) onApplied?.(r.theme);
    toast({ title: enabled ? T.autoOn : T.autoOff });
    refresh();
  });

  if (compact) {
    if (brand.status !== 'pending') return null;
    return (
      <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/[0.06] p-4">
        <div className="flex items-center gap-2.5"><Sparkles className="h-5 w-5 shrink-0 text-brand" /><Dots swatches={brand.swatches} /></div>
        <p className="mt-2.5 text-[15px] font-semibold">{T.bannerTitle}</p>
        <p className="mt-1 text-[13px] text-muted">{T.bannerBody}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/dashboard/theme" className="inline-flex h-10 items-center rounded-full bg-btn px-5 text-sm font-semibold text-on-btn">{T.see}</Link>
          <button type="button" onClick={dismiss} disabled={busy === 'dismiss'} className="inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold text-muted hover:text-fg">{T.keep}</button>
        </div>
      </div>
    );
  }

  const status = brand.status;
  const badge = { pending: 'bg-amber-50 text-amber-800', applied: 'bg-emerald-50 text-emerald-700', dismissed: 'bg-fg/[0.06] text-muted', idle: 'bg-fg/[0.06] text-muted' }[status] || 'bg-fg/[0.06] text-muted';
  const isApplied = status === 'applied' && brand.variant === current;

  return (
    <Panel title={T.title} subtitle={T.sub} action={<span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', badge)}>{status === 'applied' && <Check className="h-3.5 w-3.5" strokeWidth={3} />}{T[status]}</span>}>
      <div className="mb-4 flex items-center gap-3"><Dots swatches={brand.swatches} /><span className="text-[13px] text-muted" dir="ltr">{brand.swatches.slice(0, 3).map((s) => s.hex).join('  ·  ')}</span></div>

      <div className="grid grid-cols-2 gap-3">
        {brand.variants.map((v) => {
          const active = current === v.id;
          return (
            <button key={v.id} type="button" onClick={() => setSel(v.id)} aria-pressed={active}
              className={cx('rounded-2xl border-2 p-2.5 text-start transition', active ? 'border-primary bg-primary/[0.04]' : 'border-line hover:border-line-strong')}>
              <MiniStore variant={v} />
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <span className="text-sm font-bold">{T[v.id]}</span>
                {brand.recommended === v.id && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-brand"><Wand2 className="h-3 w-3" />{T.best}</span>}
              </div>
              <p className="mt-1 flex items-center gap-1 text-[12px] text-muted"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />{v.fixed ? T.tuned : T.readable}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <Button onClick={apply} loading={busy === 'apply'} disabled={isApplied}>{status === 'applied' ? T.again : T.apply}</Button>
        {status === 'pending' && <Button variant="outline" onClick={dismiss} loading={busy === 'dismiss'}>{T.later}</Button>}
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <Switch checked={brand.autoSync} onChange={setAuto} disabled={busy === 'auto'} label={T.auto} description={T.autoHint} />
      </div>
    </Panel>
  );
}
