import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronUp, ChevronDown, Sparkles, ExternalLink, Wand2, Eye, EyeOff, Shirt, Smartphone } from 'lucide-react';
import { THEME_PRESETS, mix } from '@souqna/shared/theme';
import {
  TEMPLATES, TEMPLATE_IDS, SEASONS, SEASON_IDS, CARD_STYLES, CAT_STYLES, GRID_STYLES, HERO_STYLES, TYPE_STYLES,
  SECTION_IDS, OPTIONAL_SECTIONS, resolveDesign, completeness,
} from '@souqna/shared/layout';
import { useApi, invalidate } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { PageHeader, Panel } from '../../components/dash/Kit.jsx';
import Button from '../../components/ui/Button.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { Field, Input, Textarea, Switch } from '../../components/ui/Field.jsx';
import { ErrorState, errorMessage } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import PageTransition from '../../components/PageTransition.jsx';
import { cx } from '../../components/ui/cx.js';

const SECTION_LABEL = {
  hero: ['الغلاف (الهيرو)', 'Hero'], ticker: ['الشريط المتحرك', 'Scrolling ticker'], free_shipping: ['شريط الشحن المجاني', 'Free-shipping bar'],
  flash: ['عدّاد العرض', 'Offer countdown'], trust: ['شريط المزايا', 'Trust strip'], new_arrivals: ['وصل حديثًا', 'New arrivals'],
  categories: ['التصنيفات', 'Categories'], best_sellers: ['الأكثر مبيعًا', 'Best sellers'], offers: ['الكوبونات', 'Coupons'],
  on_sale: ['التخفيضات', 'On sale'], story: ['قصة المحل', 'Our story'], visit: ['العنوان والخريطة', 'Visit us'],
};
const KIND = [['women', 'حريمي'], ['men', 'رجالي'], ['kids', 'أطفال'], ['sport', 'رياضي'], ['wedding', 'فساتين ومناسبات'], ['shoes', 'أحذية'], ['mixed', 'كل حاجة']];
const VIBE = [['luxury', 'فخم'], ['soft', 'ناعم'], ['street', 'شبابي'], ['simple', 'بسيط'], ['deals', 'عروض'], ['classic', 'كلاسيك']];
const OPT = {
  hero: { auto: ['تلقائي', 'Auto'], cover: ['صورة غلاف', 'Cover'], slider: ['بنرات', 'Slider'], split: ['مقسوم', 'Split'], compact: ['مضغوط', 'Compact'] },
  card: { round: ['مدوّر', 'Rounded'], flat: ['حاد/بدون حدود', 'Flat'], soft: ['ناعم بخلفية', 'Soft'], bordered: ['بإطار', 'Bordered'] },
  cat: { tiles: ['مربعات كبيرة', 'Tiles'], circles: ['دواير', 'Circles'], list: ['أزرار نصية', 'Pills'] },
  grid: { cozy: ['متوازن', 'Balanced'], dense: ['كثيف', 'Dense'], airy: ['واسع', 'Airy'] },
  type: { normal: ['عادي', 'Normal'], light: ['خفيف وأنيق', 'Light'], bold: ['تقيل وجريء', 'Bold'] },
};
const OPT_TITLE = { hero: ['شكل الغلاف', 'Hero'], card: ['شكل كارت المنتج', 'Product card'], cat: ['شكل التصنيفات', 'Categories'], grid: ['كثافة المنتجات', 'Product density'], type: ['شكل الخط', 'Type style'] };
const STANDARD = SECTION_IDS.filter((s) => !OPTIONAL_SECTIONS.includes(s));

const chip = (on) => cx('inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-medium transition active:scale-95', on ? 'border-fg bg-fg text-canvas' : 'border-line-strong hover:border-fg');

/** معاينة مصغّرة للقالب: بتترسم من إعدادات القالب نفسها (الغلاف، ترتيب الأقسام، شكل التصنيفات والكروت، الخط) بألوانه، فتبان كأنها صفحة متجر حقيقية. */
function Thumb({ tpl, palette }) {
  const p = palette;
  const ink = p.text;
  const soft = (c, t) => mix(c, p.background, t);
  const photo = (i = 0) => ({ background: `linear-gradient(${150 + i * 25}deg, ${soft(p.primary, 0.78)}, ${soft(p.accent, 0.62)})` });
  const radius = { round: 7, flat: 0, soft: 10, bordered: 3 }[tpl.card];
  const bar = (w, o = 0.55, h = 3) => <span className="block rounded-full" style={{ width: w, height: h, background: ink, opacity: o }} />;
  const weight = tpl.type === 'bold' ? 4 : tpl.type === 'light' ? 2 : 3;
  const cols = tpl.grid === 'dense' ? 4 : tpl.grid === 'airy' ? 2 : 3;
  const btn = (w = 22) => <span className="block rounded-full" style={{ width: w, height: 6, background: p.button }} />;

  const product = (i, sale) => (
    <span key={i} className="relative block min-w-0 flex-1" style={{ background: tpl.card === 'soft' ? p.secondary : 'transparent', borderRadius: radius, border: tpl.card === 'bordered' ? `1px solid ${ink}2e` : 'none', padding: tpl.card === 'soft' || tpl.card === 'bordered' ? 2 : 0 }}>
      <span className="grid aspect-[4/5] place-items-center" style={{ ...photo(i), borderRadius: tpl.card === 'soft' ? 7 : radius }}><Shirt style={{ width: 11, height: 11, color: p.background, opacity: 0.7 }} /></span>
      {sale && <span className="absolute start-0.5 top-0.5 rounded-sm px-[3px] text-[5px] font-bold leading-[8px] text-white" style={{ background: '#be2626' }}>-30%</span>}
      <span className="mt-[3px] block"><span className="block h-[2px] w-4/5 rounded-full" style={{ background: ink, opacity: 0.5 }} /><span className="mt-[2px] block h-[2px] w-2/5 rounded-full" style={{ background: p.accent }} /></span>
    </span>
  );
  const products = (key, sale) => (
    <span key={key} className="block px-1.5">
      <span className="mb-1 flex items-center justify-between">{bar(weight * 9, 0.85, weight)}{bar(8, 0.3, 2)}</span>
      <span className="flex gap-1">{Array.from({ length: cols }, (_, i) => product(i, sale && i === 0))}</span>
    </span>
  );
  const hero = () => {
    if (tpl.hero === 'split') {
      return (
        <span key="hero" className="flex h-[58px]" style={{ background: p.secondary }}>
          <span className="flex flex-1 flex-col justify-center gap-1 px-2">{bar('80%', 0.9, weight + 1)}{bar('55%', 0.4, 2)}{btn()}</span>
          <span className="grid w-[46%] place-items-center" style={photo(1)}><Shirt style={{ width: 18, height: 18, color: p.background, opacity: 0.6 }} /></span>
        </span>
      );
    }
    if (tpl.hero === 'compact') {
      return (
        <span key="hero" className="flex h-[22px] items-center justify-between px-2" style={{ background: p.primary }}>
          <span className="block rounded-full" style={{ width: '45%', height: 3, background: p.background, opacity: 0.9 }} />
          <span className="block rounded-full" style={{ width: 18, height: 6, background: p.accent }} />
        </span>
      );
    }
    return (
      <span key="hero" className="relative block h-[62px]" style={{ background: `linear-gradient(120deg, ${p.primary}, ${soft(p.accent, 0.35)})` }}>
        <span className="absolute inset-x-2 bottom-2 flex flex-col gap-1">
          <span className="block rounded-full" style={{ width: '62%', height: weight + 2, background: p.background, opacity: 0.95 }} />
          <span className="block rounded-full" style={{ width: '38%', height: 2, background: p.background, opacity: 0.6 }} />
          <span className="block rounded-full" style={{ width: 24, height: 6, background: p.background }} />
        </span>
        {tpl.hero === 'slider' && <span className="absolute inset-x-0 bottom-0.5 flex justify-center gap-[3px]">{[0, 1, 2].map((i) => <span key={i} className="block rounded-full" style={{ width: i === 0 ? 8 : 3, height: 3, background: p.background, opacity: i === 0 ? 1 : 0.5 }} />)}</span>}
      </span>
    );
  };
  const categories = () => (
    <span key="categories" className="block px-1.5">
      {tpl.cat === 'circles' ? <span className="flex justify-around">{[0, 1, 2, 3].map((i) => <span key={i} className="grid h-[17px] w-[17px] place-items-center rounded-full" style={{ ...photo(i), boxShadow: `0 0 0 1.5px ${p.accent}` }} />)}</span>
        : tpl.cat === 'list' ? <span className="flex gap-1">{[26, 20, 24].map((w, i) => <span key={i} className="block rounded-full" style={{ width: w, height: 8, border: `1px solid ${ink}55`, background: i === 0 ? ink : 'transparent', opacity: i === 0 ? 0.85 : 1 }} />)}</span>
          : <span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="relative block h-[26px] flex-1 overflow-hidden" style={{ ...photo(i), borderRadius: radius }}><span className="absolute inset-x-1 bottom-1 block rounded-full" style={{ height: 2, background: p.background }} /></span>)}</span>}
    </span>
  );
  const block = (id) => {
    switch (id) {
      case 'hero': return hero();
      case 'ticker': return <span key={id} className="flex h-[9px] items-center gap-2 overflow-hidden px-1" style={{ background: p.accent }}>{[0, 1, 2, 3, 4].map((i) => <span key={i} className="block shrink-0 rounded-full" style={{ width: 16, height: 2, background: p.background, opacity: 0.9 }} />)}</span>;
      case 'free_shipping': return <span key={id} className="mx-1.5 block rounded-full p-[3px]" style={{ background: p.secondary }}><span className="block h-[3px] w-3/5 rounded-full" style={{ background: p.accent }} /></span>;
      case 'flash': return <span key={id} className="mx-1.5 flex items-center justify-between rounded px-1.5 py-1" style={{ background: p.footer }}>{bar(26, 0.9, 3)}<span className="flex gap-[2px]">{[0, 1, 2].map((i) => <span key={i} className="block rounded-sm" style={{ width: 7, height: 8, background: p.accent }} />)}</span></span>;
      case 'trust': return <span key={id} className="mx-1.5 flex justify-around py-0.5">{[0, 1, 2].map((i) => <span key={i} className="flex items-center gap-[3px]"><span className="block h-[6px] w-[6px] rounded-full" style={{ background: p.accent }} />{bar(14, 0.4, 2)}</span>)}</span>;
      case 'categories': return categories();
      case 'new_arrivals': case 'best_sellers': return products(id, false);
      case 'on_sale': return products(id, true);
      case 'offers': return <span key={id} className="mx-1.5 block rounded px-2 py-1" style={{ border: `1px dashed ${p.accent}`, background: soft(p.accent, 0.9) }}>{bar('45%', 0.8, 3)}</span>;
      case 'story': return <span key={id} className="mx-1.5 flex gap-1.5"><span className="block h-[26px] w-[34%]" style={{ ...photo(2), borderRadius: radius }} /><span className="flex flex-1 flex-col justify-center gap-[3px]">{bar('70%', 0.8, 3)}{bar('95%', 0.35, 2)}{bar('85%', 0.35, 2)}</span></span>;
      case 'visit': return <span key={id} className="mx-1.5 block h-[18px] rounded" style={{ background: p.secondary, border: `1px solid ${ink}1f` }} />;
      default: return null;
    }
  };
  const shown = tpl.sections.slice(0, 7);
  return (
    <span className="block aspect-[3/4] overflow-hidden rounded-lg ring-1 ring-black/10" style={{ background: p.background }}>
      <span className="flex h-[15px] items-center justify-between px-1.5" style={{ background: p.header, borderBottom: `1px solid ${ink}18` }}>
        <span className="block rounded-sm" style={{ width: 14, height: 6, background: p.primary }} />
        <span className="flex gap-[3px]">{[0, 1, 2].map((i) => <span key={i} className="block rounded-full" style={{ width: 5, height: 5, background: ink, opacity: 0.35 }} />)}</span>
      </span>
      <span className="flex flex-col gap-[7px] pb-2">{shown.map((id) => block(id))}</span>
    </span>
  );
}

/** معاينة حية: متجرك الحقيقي جوه إطار موبايل، وبيتحدّث فورًا مع كل اختيار من غير حفظ. بتتبعت الإعدادات للإطار بـ postMessage (StoreLayout بيسمعها). */
function LivePreview({ slug, payload, L, onClose }) {
  const ref = useRef(null);
  const [ready, setReady] = useState(0);
  useEffect(() => {
    const on = (e) => { if (e.origin === window.location.origin && e.data?.type === 'souqna-design-ready' && e.source === ref.current?.contentWindow) setReady((n) => n + 1); };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, []);
  useEffect(() => {
    if (!ready || !ref.current?.contentWindow) return undefined;
    const id = setTimeout(() => ref.current?.contentWindow?.postMessage({ type: 'souqna-design-preview', payload }, window.location.origin), 120);
    return () => clearTimeout(id);
  }, [ready, payload]);
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex w-full items-center justify-between">
        <p className="text-sm font-bold">{L('معاينة حية', 'Live preview')}</p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" to={`/s/${slug}`} target="_blank"><ExternalLink className="h-3.5 w-3.5" />{L('فتح المتجر', 'Open store')}</Button>
          {onClose && <Button size="sm" variant="outline" onClick={onClose}>{L('إغلاق', 'Close')}</Button>}
        </div>
      </div>
      <div className="relative w-[320px] max-w-full rounded-[2.4rem] bg-fg p-[9px] shadow-[0_24px_60px_-24px_rgba(3,36,77,.5)]">
        <span className="absolute left-1/2 top-[14px] z-10 h-[5px] w-16 -translate-x-1/2 rounded-full bg-canvas/25" />
        <div className="relative overflow-hidden rounded-[1.9rem] bg-white" style={{ height: 600 }}>
          {!ready && <div className="absolute inset-0 grid place-items-center bg-white text-xs text-muted">{L('جاري تحميل المعاينة…', 'Loading preview…')}</div>}
          <iframe ref={ref} title="store preview" src={`/s/${slug}?preview=design`} className="h-full w-full border-0" />
        </div>
      </div>
      <p className="max-w-[320px] text-center text-[12px] leading-relaxed text-muted">{L('بتتغير فورًا وإنت بتختار. مفيش حاجة بتتنشر لحد ما تدوس حفظ.', 'Updates instantly as you choose. Nothing is published until you save.')}</p>
    </div>
  );
}


function CompletenessMeter({ store, L }) {
  const c = completeness(store);
  return (
    <Panel title={L('اكتمال متجرك', 'Store completeness')}>
      <div className="flex items-center gap-3">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${c.percent}%` }} /></div>
        <span className="font-display text-lg font-bold tabular-nums">{c.percent}%</span>
      </div>
      {c.next.length > 0 ? (
        <ul className="mt-3 space-y-1.5 text-sm text-muted">{c.next.map((n) => <li key={n.id} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-accent" />{L(n.hint_ar, n.hint_en)}</li>)}</ul>
      ) : <p className="mt-3 text-sm font-medium text-brand">{L('متجرك مكتمل. شغل ممتاز!', 'Your store is complete. Great job!')}</p>}
    </Panel>
  );
}

export default function StoreDesigner() {
  const { t, lang } = useI18n();
  const L = (ar, en) => (lang === 'ar' ? ar : en);
  const { store, setStore } = useAuth();
  const toast = useToast();
  const { data, error, reload } = useApi('/owner/store');
  const [design, setDesign] = useState(null);
  const [flash, setFlash] = useState(null);
  const [wa, setWa] = useState(null);
  const [order, setOrder] = useState([]);
  const [hidden, setHidden] = useState(new Set());
  const [applyPreset, setApplyPreset] = useState(null);
  const [texts, setTexts] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState({ kind: '', vibe: '', note: '', busy: false, result: null });
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!data) return;
    const cz = data.store.customization || {};
    const d = cz.design || {};
    setDesign({ template: TEMPLATES[d.template] ? d.template : 'classic', season: SEASONS[d.season] ? d.season : null, overrides: d.overrides || {} });
    setFlash({ enabled: false, title_ar: '', title_en: '', endsAt: '', target: 'sale', ...(cz.flash || {}) });
    setWa({ enabled: false, message_ar: '', message_en: '', ...(cz.whatsapp || {}) });
    const base = resolveDesign(cz);
    const explicit = Array.isArray(cz.sectionsOrder) && cz.sectionsOrder.length ? cz.sectionsOrder : base.sections;
    const full = [...new Set([...explicit, ...STANDARD])];
    const all = [...full, ...OPTIONAL_SECTIONS.filter((o) => !full.includes(o))];
    setOrder(all);
    setHidden(new Set([...(cz.hiddenSections || []), ...OPTIONAL_SECTIONS.filter((o) => !explicit.includes(o))]));
    setDirty(false);
  }, [data]);

  const resolved = useMemo(() => (design ? resolveDesign({ design }) : null), [design]);
  // اللي بيتبعت للمعاينة الحية: الشكل + ترتيب الأقسام + الألوان (موسم > قالب/ألوان مختارة > ألوان المحل الحالية)
  const previewPayload = useMemo(() => {
    if (!design || !data) return null;
    const palette = (design.season && SEASONS[design.season]?.palette) || (applyPreset && THEME_PRESETS[applyPreset]) || null;
    return { design, sectionsOrder: order, hiddenSections: [...hidden], palette, flash };
  }, [design, data, order, hidden, applyPreset, flash]);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!design || !flash || !wa || !resolved) return <div className="space-y-4"><Skeleton className="h-8 w-60" /><Skeleton className="h-64 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>;

  const touch = (fn) => { fn(); setDirty(true); };
  const palette = (id) => THEME_PRESETS[TEMPLATES[id].preset] || { ...THEME_PRESETS.noir, ...(data.store.theme?.input || {}) };

  const pickTemplate = (id) => touch(() => {
    const t = TEMPLATES[id];
    setDesign((d) => ({ ...d, template: id, overrides: {} }));
    const full = [...new Set([...t.sections, ...STANDARD])];
    setOrder([...full, ...OPTIONAL_SECTIONS.filter((o) => !full.includes(o))]);
    setHidden(new Set(OPTIONAL_SECTIONS.filter((o) => !t.sections.includes(o))));
    setApplyPreset(t.preset);
  });
  const setOverride = (k, v) => touch(() => setDesign((d) => {
    const o = { ...d.overrides };
    if (v === TEMPLATES[d.template][k]) delete o[k]; else o[k] = v;
    return { ...d, overrides: o };
  }));
  const move = (i, dir) => touch(() => setOrder((o) => { const n = [...o]; const j = i + dir; if (j < 1 || j >= n.length) return o; [n[i], n[j]] = [n[j], n[i]]; return n; }));
  const toggle = (id) => touch(() => setHidden((h) => { const n = new Set(h); if (n.has(id)) n.delete(id); else n.add(id); return n; }));

  const suggest = async () => {
    setAi((a) => ({ ...a, busy: true, result: null }));
    try {
      const r = await api('/owner/store/design/ai', { method: 'POST', body: { kind: ai.kind, vibe: ai.vibe, note: ai.note } });
      setAi((a) => ({ ...a, busy: false, result: r }));
    } catch (e) { setAi((a) => ({ ...a, busy: false })); toast({ tone: 'error', title: errorMessage(t, e) }); }
  };
  const applyAi = () => {
    const r = ai.result; if (!r) return;
    pickTemplate(r.template);
    setApplyPreset(r.preset);
    setTexts({ tagline_ar: r.tagline_ar, about_ar: r.about_ar, announcement_ar: r.announcement_ar });
    toast({ title: L('اتطبّق الاقتراح. راجعه واحفظ.', 'Suggestion applied. Review and save.') });
  };

  const save = async () => {
    setBusy(true);
    try {
      const flashBody = { ...flash, endsAt: flash.endsAt ? new Date(flash.endsAt).toISOString() : '' };
      let r = await api('/owner/store/design', { method: 'PUT', body: { design, flash: flashBody, whatsapp: wa } });
      await api('/owner/store/customization', { method: 'PUT', body: { sectionsOrder: order, hiddenSections: [...hidden] } });
      if (applyPreset && THEMES_OK(applyPreset)) await api('/owner/store/theme', { method: 'PUT', body: THEME_PRESETS[applyPreset] });
      if (texts) {
        const cz = data.store.customization || {};
        await api('/owner/store', { method: 'PUT', body: { name_ar: data.store.name.ar, name_en: data.store.name.en, tagline_ar: texts.tagline_ar } });
        await api('/owner/store/customization', { method: 'PUT', body: {
          announcement: { enabled: true, text_ar: texts.announcement_ar, text_en: cz.announcement?.text_en || '', link: cz.announcement?.link || '' },
          story: { enabled: true, title_ar: cz.story?.title_ar || 'عن المحل', title_en: cz.story?.title_en || 'About us', text_ar: texts.about_ar, text_en: cz.story?.text_en || '', image: cz.story?.image || '', instagram: cz.story?.instagram || '', tiktok: cz.story?.tiktok || '', facebook: cz.story?.facebook || '' },
        } });
      }
      invalidate('/owner/store'); invalidate(`/stores/${store.slug}`); invalidate('/marketplace');
      setApplyPreset(null); setTexts(null); setAi((a) => ({ ...a, result: null }));
      reload();
      setStore({ ...store, customization: r.customization });
      toast({ title: L('اتحفظ تصميم المتجر', 'Store design saved') });
    } catch (e) { toast({ tone: 'error', title: errorMessage(t, e) }); }
    setBusy(false);
  };

  const cur = TEMPLATES[design.template];
  return (
    <PageTransition className="pb-28">
      <PageHeader title={L('مصمّم المتجر', 'Store designer')} subtitle={L('اختار شكل متجرك وظبّطه بنفسك. كل حاجة اختيارية وتقدر ترجع للشكل الأصلي في أي وقت.', 'Pick a look and fine-tune it. Everything is optional.')}
        actions={<div className="hidden gap-2 md:flex"><Button variant="outline" to={`/s/${store.slug}`} target="_blank"><ExternalLink className="h-4 w-4" />{L('شوف متجرك', 'View store')}</Button><Button onClick={save} loading={busy} disabled={!dirty}>{L('حفظ', 'Save')}</Button></div>} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        <div className="xl:hidden"><Button variant="outline" full onClick={() => setShowPreview(true)}><Smartphone className="h-4 w-4" />{L('معاينة حية للمتجر', 'Live store preview')}</Button></div>
        <CompletenessMeter store={data.store} L={L} />

        <Panel title={L('تويلا تصمّم متجرك', 'Twila designs your store')} subtitle={L('احكيلها نوع محلك والإحساس اللي عايزه، وهي تقترح قالب وألوان وجمل جاهزة بالعامية. إنت اللي بتقرر وتعدّل.', 'Tell Twila your store type and vibe; she suggests a template, colours and copy.')}>
          <div className="space-y-4">
            <div><p className="mb-2 text-sm font-semibold">{L('نوع المحل', 'Store type')}</p><div className="flex flex-wrap gap-2">{KIND.map(([v, l]) => <button key={v} type="button" aria-pressed={ai.kind === v} onClick={() => setAi((a) => ({ ...a, kind: v }))} className={chip(ai.kind === v)}>{l}</button>)}</div></div>
            <div><p className="mb-2 text-sm font-semibold">{L('الإحساس', 'Vibe')}</p><div className="flex flex-wrap gap-2">{VIBE.map(([v, l]) => <button key={v} type="button" aria-pressed={ai.vibe === v} onClick={() => setAi((a) => ({ ...a, vibe: v }))} className={chip(ai.vibe === v)}>{l}</button>)}</div></div>
            <Field label={L('تحب تضيف حاجة؟', 'Anything to add?')} optional={L('اختياري', 'optional')}><Input maxLength={200} value={ai.note} onChange={(e) => setAi((a) => ({ ...a, note: e.target.value }))} placeholder={L('مثلاً: بنبيع فساتين سواريه للعرايس', 'e.g. we sell evening dresses for brides')} /></Field>
            <Button onClick={suggest} loading={ai.busy} disabled={!ai.kind && !ai.vibe}><Wand2 className="h-4 w-4" />{L('صمّم لي', 'Design for me')}</Button>
            {ai.result && (
              <div className="space-y-3 rounded-2xl border border-line bg-secondary/50 p-4">
                <div className="flex items-center gap-3"><div className="w-24 shrink-0"><Thumb tpl={TEMPLATES[ai.result.template]} palette={THEME_PRESETS[ai.result.preset] || palette(ai.result.template)} /></div>
                  <div className="min-w-0"><p className="font-display font-bold">{L(TEMPLATES[ai.result.template].ar, TEMPLATES[ai.result.template].en)}</p><p className="text-xs text-muted">{ai.result.source === 'ai' ? L('اقتراح بالذكاء الاصطناعي', 'AI suggestion') : L('اقتراح جاهز', 'Ready-made suggestion')}</p></div></div>
                <Field label={L('جملة تعريفية', 'Tagline')}><Input value={ai.result.tagline_ar} onChange={(e) => setAi((a) => ({ ...a, result: { ...a.result, tagline_ar: e.target.value } }))} /></Field>
                <Field label={L('عن المحل', 'About')}><Textarea rows={3} value={ai.result.about_ar} onChange={(e) => setAi((a) => ({ ...a, result: { ...a.result, about_ar: e.target.value } }))} /></Field>
                <Field label={L('شريط الإعلان', 'Announcement')}><Input value={ai.result.announcement_ar} onChange={(e) => setAi((a) => ({ ...a, result: { ...a.result, announcement_ar: e.target.value } }))} /></Field>
                <Button onClick={applyAi}><Sparkles className="h-4 w-4" />{L('طبّق على متجري', 'Apply to my store')}</Button>
              </div>
            )}
          </div>
        </Panel>

        <Panel title={L('اختار قالب', 'Choose a template')} subtitle={L('كل قالب بيغيّر الغلاف وترتيب الأقسام وشكل التصنيفات والكروت والكثافة. ألوانك مش بتتغير إلا لو وافقت.', 'Each template changes hero, section order, categories, cards and density.')}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
            {TEMPLATE_IDS.map((id) => {
              const t = TEMPLATES[id]; const on = design.template === id;
              return (
                <button key={id} type="button" onClick={() => pickTemplate(id)} aria-pressed={on} className={cx('relative rounded-2xl border-2 p-2 text-start transition active:scale-[.98]', on ? 'border-primary' : 'border-transparent ring-1 ring-line hover:ring-line-strong')}>
                  <Thumb tpl={t} palette={palette(id)} />
                  <span className="mt-2 block text-sm font-bold">{L(t.ar, t.en)}</span>
                  <span className="mt-0.5 line-clamp-3 block text-[12px] leading-snug text-muted">{L(t.desc_ar, t.desc_en)}</span>
                  {on && <span className="absolute end-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-primary text-on-primary"><Check className="h-3 w-3" strokeWidth={3} /></span>}
                </button>
              );
            })}
          </div>
          {cur.preset && (
            <div className="mt-4"><Switch checked={!!applyPreset} onChange={(v) => touch(() => setApplyPreset(v ? cur.preset : null))} label={L('طبّق ألوان القالب كمان', 'Also apply the template colours')} description={L('لو قفلتها، ألوانك الحالية تفضل زي ما هي.', 'Off keeps your current colours.')} /></div>
          )}
        </Panel>

        <Panel title={L('ظبّط التفاصيل', 'Fine-tune')} subtitle={L('غيّر أي جزء لوحده من غير ما تغيّر القالب.', 'Change one part without changing the template.')}>
          <div className="space-y-5">
            {['hero', 'card', 'cat', 'grid', 'type'].map((k) => {
              const list = { hero: HERO_STYLES, card: CARD_STYLES, cat: CAT_STYLES, grid: GRID_STYLES, type: TYPE_STYLES }[k];
              return (
                <div key={k}><p className="mb-2 text-sm font-semibold">{L(OPT_TITLE[k][0], OPT_TITLE[k][1])}</p>
                  <div className="flex flex-wrap gap-2" role="group">{list.map((v) => <button key={v} type="button" aria-pressed={resolved[k] === v} onClick={() => setOverride(k, v)} className={chip(resolved[k] === v)}>{L(OPT[k][v][0], OPT[k][v][1])}</button>)}</div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title={L('ترتيب وإظهار الأقسام', 'Section order & visibility')} subtitle={L('الغلاف دايمًا الأول. استخدم الأسهم للترتيب والعين للإخفاء.', 'Hero stays first. Use arrows to reorder, the eye to hide.')}>
          <ul className="divide-y divide-line">
            {order.map((id, i) => (
              <li key={id} className="flex items-center gap-2 py-2.5">
                <span className={cx('flex-1 text-sm font-medium', hidden.has(id) && 'text-muted line-through')}>{L(SECTION_LABEL[id][0], SECTION_LABEL[id][1])}{OPTIONAL_SECTIONS.includes(id) && <span className="ms-2 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted">{L('اختياري', 'optional')}</span>}</span>
                {id !== 'hero' && <>
                  <button type="button" aria-label="up" disabled={i <= 1} onClick={() => move(i, -1)} className="grid h-9 w-9 place-items-center rounded-full ring-1 ring-line disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                  <button type="button" aria-label="down" disabled={i === order.length - 1} onClick={() => move(i, 1)} className="grid h-9 w-9 place-items-center rounded-full ring-1 ring-line disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
                  <button type="button" aria-label="toggle" aria-pressed={!hidden.has(id)} onClick={() => toggle(id)} className="grid h-9 w-9 place-items-center rounded-full ring-1 ring-line">{hidden.has(id) ? <EyeOff className="h-4 w-4 text-muted" /> : <Eye className="h-4 w-4" />}</button>
                </>}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={L('سكن الموسم', 'Seasonal skin')} subtitle={L('ألوان وجملة إعلان جاهزة للموسم. بتتركّب فوق ألوان متجرك وتتشال بضغطة.', 'Seasonal colours and a ready announcement; removable anytime.')}>
          <div className="flex flex-wrap gap-2" role="group">
            <button type="button" aria-pressed={!design.season} onClick={() => touch(() => setDesign((d) => ({ ...d, season: null })))} className={chip(!design.season)}>{L('بدون', 'None')}</button>
            {SEASON_IDS.map((id) => <button key={id} type="button" aria-pressed={design.season === id} onClick={() => touch(() => setDesign((d) => ({ ...d, season: id })))} className={chip(design.season === id)}>{SEASONS[id].emoji} {L(SEASONS[id].ar, SEASONS[id].en)}</button>)}
          </div>
        </Panel>

        <Panel title={L('عدّاد العرض', 'Offer countdown')} subtitle={L('عدّاد حقيقي بينتهي في الموعد وبعدها بيختفي لوحده. فعّله من قسم "عدّاد العرض" فوق.', 'A real countdown that disappears when it ends.')}>
          <div className="space-y-4">
            <Switch checked={flash.enabled} onChange={(v) => touch(() => setFlash((f) => ({ ...f, enabled: v })))} label={L('تفعيل العدّاد', 'Enable countdown')} />
            {flash.enabled && <>
              <Field label={L('عنوان العرض', 'Offer title')}><Input maxLength={70} value={flash.title_ar} onChange={(e) => touch(() => setFlash((f) => ({ ...f, title_ar: e.target.value })))} placeholder={L('مثلاً: عرض اليوم الواحد على الجواكت', 'e.g. One-day jacket sale')} /></Field>
              <Field label={L('ينتهي في', 'Ends at')}><Input type="datetime-local" dir="ltr" value={toLocalInput(flash.endsAt)} onChange={(e) => touch(() => setFlash((f) => ({ ...f, endsAt: e.target.value })))} /></Field>
              <Field label={L('الزرار بيودّي فين؟', 'Link to')}><div className="flex flex-wrap gap-2">{[['sale', L('التخفيضات', 'Sale')], ['new', L('وصل حديثًا', 'New')], ['shop', L('كل المنتجات', 'All')]].map(([v, l]) => <button key={v} type="button" aria-pressed={flash.target === v} onClick={() => touch(() => setFlash((f) => ({ ...f, target: v })))} className={chip(flash.target === v)}>{l}</button>)}</div></Field>
              {!hidden.has('flash') ? null : <p className="rounded-xl bg-amber-50 p-3 text-[13px] text-amber-900">{L('قسم "عدّاد العرض" مخفي في الترتيب فوق. اضغط العين عشان يظهر.', 'The countdown section is hidden above; show it.')}</p>}
            </>}
          </div>
        </Panel>

        <Panel title={L('زر الواتساب الذكي', 'Smart WhatsApp button')} subtitle={L('زر عايم بهوية المحل. على صفحة أي منتج بيبعت لينك المنتج جاهز، وبيوضّح لو المحل بيرد دلوقتي.', 'Floating button that sends the product link on product pages.')}>
          <div className="space-y-4">
            <Switch checked={wa.enabled} onChange={(v) => touch(() => setWa((w) => ({ ...w, enabled: v })))} label={L('تفعيل الزر', 'Enable button')} description={!data.store.whatsapp ? L('لازم تضيف رقم الواتساب في الإعدادات الأول.', 'Add your WhatsApp number in Settings first.') : undefined} />
            {wa.enabled && <Field label={L('الرسالة الافتراضية', 'Default message')} optional={L('اختياري', 'optional')}><Input maxLength={140} value={wa.message_ar} onChange={(e) => touch(() => setWa((w) => ({ ...w, message_ar: e.target.value })))} placeholder={L('أهلاً، عندي استفسار', 'Hi, I have a question')} /></Field>}
          </div>
        </Panel>
      </div>
      <aside className="hidden xl:block"><div className="sticky top-4 rounded-3xl border border-line bg-elevated p-4"><LivePreview slug={store.slug} payload={previewPayload} L={L} /></div></aside>
      </div>
      {showPreview && <div className="fixed inset-0 z-50 overflow-y-auto bg-canvas/95 p-4 backdrop-blur xl:hidden"><LivePreview slug={store.slug} payload={previewPayload} L={L} onClose={() => setShowPreview(false)} /></div>}

      <div className="fixed inset-x-0 bottom-[calc(64px+var(--safe-b))] z-20 flex gap-3 border-t border-line bg-elevated/95 px-4 py-3 backdrop-blur-md md:hidden">
        <Button variant="outline" to={`/s/${store.slug}`} target="_blank"><ExternalLink className="h-4 w-4" /></Button>
        <Button full onClick={save} loading={busy} disabled={!dirty}>{L('حفظ', 'Save')}</Button>
      </div>
    </PageTransition>
  );
}

const THEMES_OK = (id) => !!THEME_PRESETS[id];
function toLocalInput(v) {
  if (!v) return '';
  if (/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(v)) return v;
  const d = new Date(v); if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
