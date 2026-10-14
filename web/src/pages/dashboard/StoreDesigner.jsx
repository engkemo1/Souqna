import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronUp, ChevronDown, Sparkles, ExternalLink, Wand2, Eye, EyeOff } from 'lucide-react';
import { THEME_PRESETS } from '@souqna/shared/theme';
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

/** رسمة مصغّرة بألوان القالب: بتوضّح شكل الغلاف والتصنيفات والكروت من غير ما نحمّل المتجر كله. */
function Thumb({ tpl, palette }) {
  const p = palette;
  const r = { round: 8, flat: 0, soft: 12, bordered: 4 }[tpl.card];
  const card = (i) => (
    <span key={i} style={{ background: p.secondary, borderRadius: r, border: tpl.card === 'bordered' ? `1px solid ${p.text}33` : 'none', padding: tpl.card === 'soft' ? 3 : 0 }} className="block flex-1">
      <span className="block aspect-[4/5]" style={{ background: `${p.primary}33`, borderRadius: tpl.card === 'soft' ? 8 : r }} />
      <span className="mt-1 block h-1 w-3/4 rounded" style={{ background: `${p.text}55` }} />
    </span>
  );
  const cards = Array.from({ length: tpl.grid === 'dense' ? 4 : tpl.grid === 'airy' ? 2 : 3 }, (_, i) => card(i));
  return (
    <span className="block overflow-hidden rounded-lg ring-1 ring-black/10" style={{ background: p.background }}>
      <span className="block h-2" style={{ background: p.footer }} />
      {tpl.hero === 'split' ? (
        <span className="flex h-12" style={{ background: p.secondary }}><span className="flex flex-1 flex-col justify-center gap-1 px-2"><span className="h-1.5 w-3/4 rounded" style={{ background: p.text }} /><span className="h-1 w-1/2 rounded" style={{ background: `${p.text}77` }} /></span><span className="w-1/2" style={{ background: `${p.primary}55` }} /></span>
      ) : tpl.hero === 'compact' ? (
        <span className="flex h-5 items-center gap-1 px-2" style={{ background: p.primary }}><span className="h-2.5 w-2.5 rounded-full" style={{ background: p.background }} /><span className="h-1 w-1/3 rounded" style={{ background: p.background }} /></span>
      ) : (
        <span className="relative block h-12" style={{ background: p.primary }}><span className="absolute inset-x-2 bottom-1.5 h-1.5 w-1/2 rounded" style={{ background: p.background }} /></span>
      )}
      <span className="block p-1.5">
        {tpl.cat === 'circles' ? <span className="mb-1.5 flex justify-center gap-1.5">{[0, 1, 2, 3].map((i) => <span key={i} className="h-3.5 w-3.5 rounded-full" style={{ background: p.accent }} />)}</span>
          : tpl.cat === 'list' ? <span className="mb-1.5 flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="h-2.5 w-7 rounded-full" style={{ border: `1px solid ${p.text}55` }} />)}</span>
            : <span className="mb-1.5 flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="h-5 flex-1 rounded" style={{ background: `${p.primary}44` }} />)}</span>}
        <span className="flex gap-1">{cards}</span>
      </span>
    </span>
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
      <div className="space-y-5">
        <CompletenessMeter store={data.store} L={L} />

        <Panel title={L('مودة تصمّم متجرك', 'Moda designs your store')} subtitle={L('احكيلها نوع محلك والإحساس اللي عايزه، وهي تقترح قالب وألوان وجمل جاهزة بالعامية. إنت اللي بتقرر وتعدّل.', 'Tell Moda your store type and vibe; she suggests a template, colours and copy.')}>
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
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
