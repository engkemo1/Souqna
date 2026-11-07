import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Copy, Eye, MousePointerClick, Pause, Pencil, Play, Plus, Archive, Trash2, RotateCcw, ImagePlus, Sparkles, AlertTriangle, Check } from 'lucide-react';
import { PageHeader, KpiCard, FilterTabs, SearchInput, ListSkeleton } from '../../components/dash/Kit.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import { Field, Input, Select, Switch, Textarea } from '../../components/ui/Field.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { FeaturedCard } from '../../components/featured/FeaturedSlot.jsx';
import { ColorField, ContrastNote, HomepageMock, useContrast } from '../../components/featured/DesignTools.jsx';
import { adminApi, adminUpload, useAdminApi, fmtNum } from './adminApi.js';

const STATE = {
  draft: ['مسودة', 'neutral'], scheduled: ['مجدولة', 'info'], active: ['شغالة', 'success'],
  paused: ['موقوفة', 'warning'], resting: ['خارج مواعيدها', 'info'], expired: ['منتهية', 'danger'], archived: ['مؤرشفة', 'neutral'],
};
const HEALTH = { advertiser_hidden: 'صفحة المعلن مخفية — الحملة مخفية', offer_unavailable: 'العرض المرتبط مش متاح دلوقتي — الحملة مخفية', store_inactive: 'المحل مش نشط — الحملة مخفية' };
const STEPS = ['نوع الحملة', 'المحتوى', 'التصميم', 'الأماكن والاستهداف', 'الجدولة', 'المعاينة والنشر'];
const STEP_FIELDS = [
  ['type', 'store_id', 'promotion_id', 'advertiser_id'],
  ['title_ar', 'title_en', 'subtitle_ar', 'subtitle_en', 'cta_ar', 'cta_en', 'badge_ar', 'badge_en', 'destination_url', 'desktop_image', 'mobile_image'],
  ['background_color', 'text_color', 'cta_style', 'text_align', 'overlay', 'image_zoom', 'image_x', 'image_y', 'fg_image', 'fg_size', 'fg_pos', 'fg_shape', 'fg_y', 'fg_out', 'layout_width', 'layout_height', 'layout_align'],
  ['placements', 'targeting.audience', 'targeting.stores', 'targeting.categories', 'priority'],
  ['starts_at', 'ends_at', 'repeat'],
  [],
];
const blank = () => ({
  type: 'custom', mode: 'custom', advertiser_id: '', store_id: '', promotion_id: '', product_id: '', category_id: '',
  title_ar: '', title_en: '', subtitle_ar: '', subtitle_en: '', cta_ar: 'اكتشف الآن', cta_en: 'Explore now', badge_ar: '', badge_en: '',
  destination_url: '', desktop_image: '', mobile_image: '', background_color: '', text_color: '', cta_style: 'solid', text_align: 'start', overlay: 65,
  image_zoom: 100, image_x: 50, image_y: 50, fg_image: '', fg_size: 40, fg_pos: 'end', fg_shape: 'none', fg_y: 100, fg_out: false, layout_width: 'wide', layout_height: 'm', layout_align: 'center',
  placements: [], targeting: { audience: 'all', stores: [], categories: [] }, priority: 0, starts_at: '', ends_at: '', repeat: null,
});
const fromCampaign = (c) => ({
  type: c.type, mode: c.advertiserId ? 'advertiser' : c.type, advertiser_id: c.advertiserId ? String(c.advertiserId) : '', store_id: c.storeId ? String(c.storeId) : '', promotion_id: c.promotionId ? String(c.promotionId) : '', product_id: c.productId ? String(c.productId) : '', category_id: c.categoryId ? String(c.categoryId) : '',
  title_ar: c.title.ar, title_en: c.title.en, subtitle_ar: c.subtitle.ar, subtitle_en: c.subtitle.en, cta_ar: c.cta.ar, cta_en: c.cta.en, badge_ar: c.badge.ar, badge_en: c.badge.en,
  destination_url: c.destinationUrl || '', desktop_image: c.desktopImage || '', mobile_image: c.mobileImage || '', background_color: c.backgroundColor || '', text_color: c.textColor || '', cta_style: c.ctaStyle || 'solid', text_align: c.textAlign || 'start', overlay: c.overlay ?? 65,
  image_zoom: c.imageZoom ?? 100, image_x: c.imageX ?? 50, image_y: c.imageY ?? 50, fg_image: c.fgImage || '', fg_size: c.fgSize ?? 40, fg_pos: c.fgPos || 'end', fg_shape: c.fgShape || 'none', fg_y: c.fgY ?? 100, fg_out: !!c.fgOut, layout_width: c.layoutWidth || 'wide', layout_height: c.layoutHeight || 'm', layout_align: c.layoutAlign || 'center',
  placements: c.placements, targeting: { audience: 'all', stores: [], categories: [], ...c.targeting }, priority: c.priority, starts_at: c.startsAt || '', ends_at: c.endsAt || '', repeat: c.repeat || null,
});
const toBody = (f) => ({
  ...f, advertiser_id: f.mode === 'advertiser' && f.advertiser_id ? Number(f.advertiser_id) : null,
  store_id: f.mode !== 'advertiser' && f.store_id ? Number(f.store_id) : null, promotion_id: f.type === 'offer' && f.promotion_id ? Number(f.promotion_id) : null,
  product_id: f.product_id ? Number(f.product_id) : null, category_id: f.category_id ? Number(f.category_id) : null,
  starts_at: f.starts_at || null, ends_at: f.ends_at || null, repeat: f.repeat || null, priority: Number(f.priority) || 0,
  overlay: Number(f.overlay), image_zoom: Number(f.image_zoom), image_x: Number(f.image_x), image_y: Number(f.image_y), fg_size: Number(f.fg_size),
});
const bi = (o, lang = 'ar') => (o && (o[lang] || o.ar || o.en)) || '';
const fmtDt = (s) => (s ? s.replace('T', ' ') : '—');

/* ---- duration helpers (all wall-clock strings are Cairo time, 'YYYY-MM-DDTHH:MM') ---- */
const cairoNow = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};
const wall = (s) => (s ? Date.parse(`${s}:00Z`) : NaN);
const toWall = (ms) => new Date(ms).toISOString().slice(0, 16);
const DURATIONS = [['يوم', 1], ['٣ أيام', 3], ['أسبوع', 7], ['أسبوعين', 14], ['شهر', 30]];
function humanSpan(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60;
  if (d >= 2) return `${d} يوم${h ? ` و${h} ساعة` : ''}`;
  if (d === 1) return `يوم${h ? ` و${h} ساعة` : ''}`;
  if (h) return `${h} ساعة${mi ? ` و${mi} دقيقة` : ''}`;
  return `${mi} دقيقة`;
}

/* ---- recurring schedule (days of week + time windows; Cairo time) ---- */
const DAY_ORDER = [[6, 'السبت'], [0, 'الأحد'], [1, 'الاتنين'], [2, 'التلات'], [3, 'الأربع'], [4, 'الخميس'], [5, 'الجمعة']];
const DAY_NAME = Object.fromEntries(DAY_ORDER);
const REPEAT_PRESETS = [
  ['كل جمعة', { days: [5], windows: [] }],
  ['الويك إند', { days: [5, 6], windows: [] }],
  ['ساعات الذروة (٧–١١ م)', { days: [], windows: [{ from: '19:00', to: '23:00' }] }],
  ['الصبح (٨–١٢)', { days: [], windows: [{ from: '08:00', to: '12:00' }] }],
  ['بعد منتصف الليل', { days: [], windows: [{ from: '00:00', to: '06:00' }] }],
];
const normRepeat = (r) => { const days = [...new Set(r.days)].sort((a, b) => a - b); const all = days.length === 0 || days.length === 7; return all && !r.windows.length ? null : { days: all ? [] : days, windows: r.windows }; };
function repeatText(r) {
  if (!r) return 'كل يوم، طول اليوم';
  const d = r.days?.length ? DAY_ORDER.filter(([k]) => r.days.includes(k)).map(([, n]) => n).join(' و') : 'كل يوم';
  const w = r.windows?.length ? r.windows.map((x) => `من ${x.from} لـ ${x.to}`).join(' و') : 'طول اليوم';
  return `${d} — ${w}`;
}
const nextText = (min) => {
  if (min == null) return null;
  return `هتشتغل تاني بعد ${humanSpan(min * 60000)}`;
};

/** Short Arabic status of the run window, relative to now. */
function runLabel(startsAt, endsAt, now = cairoNow()) {
  const n = wall(now), s = wall(startsAt), e = wall(endsAt);
  if (!Number.isNaN(s) && s > n) return `هتبدأ بعد ${humanSpan(s - n)}${Number.isNaN(e) ? '' : ` وتشتغل ${humanSpan(e - s)}`}`;
  if (!Number.isNaN(e)) return e > n ? `باقي ${humanSpan(e - n)}` : `خلصت من ${humanSpan(n - e)}`;
  return 'من غير تاريخ انتهاء (مفتوحة)';
}

function Confirm({ ask, onClose }) {
  const [busy, setBusy] = useState(false);
  if (!ask) return null;
  const go = async () => { setBusy(true); try { await ask.run(); } finally { setBusy(false); onClose(); } };
  return (
    <Sheet open onClose={() => !busy && onClose()} side="center" size="sm" title={ask.title}
      footer={<div className="flex gap-2"><Button full tone={ask.danger ? 'danger' : undefined} loading={busy} onClick={go}>{ask.cta}</Button><Button variant="outline" onClick={onClose}>إلغاء</Button></div>}>
      <p className="text-sm leading-relaxed text-muted">{ask.body}</p>
    </Sheet>
  );
}

export function ImagePick({ label, hint, value, onChange, error, kind = 'bg' }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const r = await adminUpload(`/featured/image?kind=${kind}`, file);
      onChange(r.image);
      if (r.originalBytes > 150 * 1024 && r.bytes < r.originalBytes) toast({ tone: 'success', title: `الصورة اتضغطت: ${(r.originalBytes / 1048576).toFixed(1)}MB ← ${(r.bytes / 1048576).toFixed(2)}MB (الموقع هيفتح أسرع)` });
    }
    catch (x) { toast({ tone: 'error', title: x.code === 'image_too_small' ? 'الصورة صغيرة (٦٠٠×٣٠٠ على الأقل)' : x.code === 'invalid_image' ? 'الملف ده مش صورة مدعومة' : x.message }); }
    setBusy(false);
  };
  return (
    <Field label={label} hint={hint} error={error}>
      <div className="flex items-center gap-3">
        <div className="grid h-20 w-32 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-line bg-fg/[0.03]">
          {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6 text-muted" />}
        </div>
        <div className="flex flex-col gap-2">
          <label className="cursor-pointer"><input type="file" accept="image/*" className="sr-only" onChange={pick} /><span className="inline-flex h-9 items-center rounded-xl border border-line px-3 text-sm font-medium hover:bg-fg/[0.05]">{busy ? 'بيترفع…' : value ? 'غيّر الصورة' : 'ارفع صورة'}</span></label>
          {value && <button type="button" onClick={() => onChange('')} className="text-start text-xs text-muted hover:text-fg">شيل الصورة</button>}
        </div>
      </div>
    </Field>
  );
}

function Slider({ label, value, min, max, unit, onChange }) {
  return (
    <Field label={`${label}: ${value}${unit}`}>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} className="h-10 w-full accent-[var(--brand,#0b3a73)]" />
    </Field>
  );
}

function Wizard({ editing, meta, onClose, onSaved }) {
  const toast = useToast();
  const isNew = editing === 'new';
  const initial = useMemo(() => (isNew ? blank() : fromCampaign(editing)), [editing, isNew]);
  const [f, setF] = useState(initial);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null); // { message, fields }
  const [offers, setOffers] = useState(null);
  const [targets, setTargets] = useState(null);
  const [preview, setPreview] = useState(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const fe = err?.fields || {};
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target ? e.target.value : e }));

  useEffect(() => {
    if (!dirty) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  useEffect(() => {
    if (f.type !== 'offer' || !f.store_id) { setOffers(null); return; }
    let live = true; setOffers('loading');
    adminApi(`/featured/stores/${f.store_id}/offers`).then((d) => live && setOffers(d.items)).catch(() => live && setOffers([]));
    return () => { live = false; };
  }, [f.type, f.store_id]);
  useEffect(() => {
    if (!f.store_id) { setTargets(null); return; }
    let live = true;
    adminApi(`/featured/stores/${f.store_id}/targets`).then((d) => live && setTargets(d)).catch(() => {});
    return () => { live = false; };
  }, [f.store_id]);
  useEffect(() => {
    if (step !== 5) return undefined;
    let live = true; setPreview(null);
    adminApi('/featured/preview', { method: 'POST', body: toBody(f) }).then((d) => live && setPreview(d)).catch((x) => live && setPreview({ error: x }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const stepOf = (fields) => STEP_FIELDS.findIndex((list) => Object.keys(fields || {}).some((k) => list.includes(k)));
  const submit = async (publish) => {
    setBusy(true); setErr(null);
    try {
      const body = { ...toBody(f), publish };
      if (isNew) await adminApi('/featured/campaigns', { method: 'POST', body });
      else await adminApi(`/featured/campaigns/${editing.id}`, { method: 'PUT', body: { ...body, status: publish ? 'active' : undefined } });
      toast({ title: publish ? 'اتنشرت الحملة' : 'اتحفظت كمسودة' });
      onSaved(); onClose(true);
    } catch (x) {
      setErr({ message: x.message, fields: x.fields || {} });
      const s = stepOf(x.fields); if (s >= 0) setStep(s);
      toast({ tone: 'error', title: x.message });
    }
    setBusy(false);
  };
  const tryClose = () => { if (busy) return; if (dirty) setConfirmClose(true); else onClose(); };

  const togglePlacement = (key) => setF((v) => {
    const has = v.placements.find((p) => p.key === key);
    return { ...v, placements: has ? v.placements.filter((p) => p.key !== key) : [...v.placements, { key, enabled: true, order: 0, priority: 0, devices: ['desktop', 'mobile'] }] };
  });
  const patchPlacement = (key, patch) => setF((v) => ({ ...v, placements: v.placements.map((p) => (p.key === key ? { ...p, ...patch } : p)) }));
  const toggleIn = (list, id) => setF((v) => ({ ...v, targeting: { ...v.targeting, [list]: v.targeting[list].includes(id) ? v.targeting[list].filter((x) => x !== id) : [...v.targeting[list], id] } }));
  const stores = meta?.stores || [];
  const { data: advList } = useAdminApi('/featured/advertisers');
  const livePreview = useMemo(() => ({
    id: 0, placement: 'market_hero', title: { ar: f.title_ar || 'عنوان الإعلان', en: f.title_en || f.title_ar || 'Ad title' }, subtitle: { ar: f.subtitle_ar, en: f.subtitle_en },
    cta: { ar: f.cta_ar, en: f.cta_en }, badge: { ar: f.badge_ar, en: f.badge_en }, href: '/', external: false,
    image: { desktop: f.desktop_image || null, mobile: f.mobile_image || null, offer: null }, bg: f.background_color || '#0f172a', color: f.text_color || '#ffffff', ctaStyle: f.cta_style,
    layout: { width: f.layout_width, height: f.layout_height, align: f.layout_align },
    align: f.text_align, overlay: Number(f.overlay), fit: { zoom: Number(f.image_zoom), x: Number(f.image_x), y: Number(f.image_y) },
    fg: f.fg_image ? { src: f.fg_image, size: Number(f.fg_size), pos: f.fg_pos, shape: f.fg_shape, y: Number(f.fg_y), out: !!f.fg_out } : null, store: null, offer: null,
  }), [f]);
  const contrast = useContrast({ image: f.desktop_image || f.mobile_image, bg: f.background_color, text: f.text_color || '#ffffff', overlay: Number(f.overlay) });
  const [mockDevice, setMockDevice] = useState('desktop');
  const [mockPlacement, setMockPlacement] = useState('');

  const body = (
    <div className="space-y-5">
      <ol className="flex flex-wrap gap-1.5" aria-label="الخطوات">
        {STEPS.map((s, i) => (
          <li key={s}><button type="button" onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${i === step ? 'bg-fg text-canvas' : 'bg-fg/[0.06] text-muted hover:text-fg'}`}>
            <span className="tabular">{i + 1}</span>{s}</button></li>
        ))}
      </ol>
      {err && <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{err.message}</span></div>}

      {step === 0 && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {[['custom', 'إعلان مخصص', 'صورة وعنوان ورابط من اختيارك — لأي حاجة.'], ['offer', 'ترويج عرض محل', 'بتروّج لعرض شغال فعلاً عند المحل. السعر والأهلية بيفضلوا من نظام العروض.'], ['advertiser', 'معلن خارجي', 'لعميل ما عندوش محل على Twist — الإعلان يفتح صفحة تعريفية خفيفة باسمه (صور، موقع، واتساب).']].map(([v, t, d]) => (
              <button key={v} type="button" onClick={() => setF((x) => ({ ...x, mode: v, type: v === 'offer' ? 'offer' : 'custom', ...(v === 'advertiser' ? { store_id: '', promotion_id: '', product_id: '', category_id: '' } : { advertiser_id: '' }) }))} aria-pressed={f.mode === v}
                className={`rounded-2xl border p-4 text-start transition ${f.mode === v ? 'border-fg bg-fg/[0.04]' : 'border-line hover:border-line-strong'}`}>
                <b className="flex items-center gap-2">{f.mode === v && <Check className="h-4 w-4" />}{t}</b><span className="mt-1 block text-sm text-muted">{d}</span>
              </button>
            ))}
          </div>
          {f.mode === 'advertiser' && (
            <Field label="المعلن" error={fe.advertiser_id && 'اختار معلن موجود'} hint="لو المعلن مش في القايمة، ضيفه الأول من صفحة «المعلنين الخارجيين»">
              <Select value={f.advertiser_id} onChange={(e) => {
                const a = (advList?.items || []).find((x) => String(x.id) === e.target.value);
                setF((x) => ({ ...x, advertiser_id: e.target.value, title_ar: x.title_ar || a?.nameAr || '', title_en: x.title_en || a?.nameEn || a?.nameAr || '', cta_ar: x.cta_ar && x.cta_ar !== 'اكتشف الآن' ? x.cta_ar : 'اعرف أكتر', cta_en: x.cta_en && x.cta_en !== 'Explore now' ? x.cta_en : 'Learn more' }));
              }}>
                <option value="">— اختار المعلن —</option>
                {(advList?.items || []).filter((a) => a.status === 'active' || String(a.id) === f.advertiser_id).map((a) => <option key={a.id} value={a.id}>{a.nameAr}{a.status === 'hidden' ? ' (مخفي)' : ''}</option>)}
              </Select>
            </Field>
          )}
          {f.mode !== 'advertiser' && <Field label={f.type === 'offer' ? 'المحل' : 'المحل (اختياري)'} error={fe.store_id && 'اختار المحل'}>
            <Select value={f.store_id} onChange={(e) => setF((x) => ({ ...x, store_id: e.target.value, promotion_id: '', product_id: '', category_id: '' }))}>
              <option value="">— من غير محل —</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{bi(s.name)}</option>)}
            </Select>
          </Field>}
          {f.type === 'offer' && f.store_id && (
            <Field label="العرض" error={fe.promotion_id && 'اختار عرض شغال'} hint="بيظهر هنا العروض الشغالة أو المجدولة بس">
              {offers === 'loading' ? <p className="text-sm text-muted">بنحمّل العروض…</p> : !offers?.length ? <p className="rounded-xl bg-fg/[0.04] p-3 text-sm text-muted">المحل ده مفيهوش عروض شغالة دلوقتي.</p> : (
                <div className="space-y-2">
                  {offers.map((o) => (
                    <button key={o.id} type="button" onClick={() => setF((x) => ({ ...x, promotion_id: String(o.id) }))} aria-pressed={String(o.id) === f.promotion_id}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-start ${String(o.id) === f.promotion_id ? 'border-fg bg-fg/[0.04]' : 'border-line hover:border-line-strong'}`}>
                      <span className="min-w-0"><b className="block truncate text-sm">{bi(o.name)}</b><span className="block truncate text-xs text-muted">{bi(o.headline) || '—'} · {fmtNum(o.productCount)} منتج</span></span>
                      <span className="shrink-0 text-xs text-muted">{fmtDt(o.startsAt)} ← {fmtDt(o.endsAt)}</span>
                    </button>
                  ))}
                </div>
              )}
            </Field>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          {f.type === 'offer' && <p className="rounded-xl bg-fg/[0.04] p-3 text-sm text-muted">سيب العناوين فاضية لو عايز تستخدم نص العرض نفسه. أي حاجة تكتبها هنا بتغيّر الإعلان بس، مش العرض.</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="العنوان (عربي)" error={fe.title_ar && 'مطلوب أو طويل أوي'}><Input value={f.title_ar} onChange={set('title_ar')} maxLength={80} /></Field>
            <Field label="Title (EN)" error={fe.title_en && 'Required or too long'}><Input dir="ltr" value={f.title_en} onChange={set('title_en')} maxLength={80} /></Field>
            <Field label="العنوان الفرعي (عربي)" optional="اختياري"><Textarea rows={2} value={f.subtitle_ar} onChange={set('subtitle_ar')} maxLength={160} /></Field>
            <Field label="Subtitle (EN)" optional="اختياري"><Textarea dir="ltr" rows={2} value={f.subtitle_en} onChange={set('subtitle_en')} maxLength={160} /></Field>
            <Field label="نص الزر (عربي)" optional="اختياري"><Input value={f.cta_ar} onChange={set('cta_ar')} maxLength={30} /></Field>
            <Field label="Button text (EN)" optional="اختياري"><Input dir="ltr" value={f.cta_en} onChange={set('cta_en')} maxLength={30} /></Field>
            <Field label="الشارة (عربي)" optional="اختياري" hint="مثال: خصم ٣٠٪"><Input value={f.badge_ar} onChange={set('badge_ar')} maxLength={24} /></Field>
            <Field label="Badge (EN)" optional="اختياري"><Input dir="ltr" value={f.badge_en} onChange={set('badge_en')} maxLength={24} /></Field>
          </div>
          <Field label="الرابط" optional={f.type === 'offer' || !!f.store_id || f.mode === 'advertiser'} error={fe.destination_url && 'رابط غير آمن — استخدم مسار داخلي (/…) أو https'} hint={f.mode === 'advertiser' ? 'سيبه فاضي — الإعلان هيفتح صفحة المعلن تلقائي.' : 'مسار داخلي زي /search أو رابط https. لو فاضي بنستخدم صفحة المحل/المنتج/القسم.'}>
            <Input dir="ltr" value={f.destination_url} onChange={set('destination_url')} placeholder="/search" />
          </Field>
          {targets && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="منتج بعينه (اختياري)"><Select value={f.product_id} onChange={(e) => setF((x) => ({ ...x, product_id: e.target.value, category_id: '' }))}><option value="">—</option>{targets.products.map((p) => <option key={p.id} value={p.id}>{bi(p.name)}</option>)}</Select></Field>
              <Field label="قسم بعينه (اختياري)"><Select value={f.category_id} onChange={(e) => setF((x) => ({ ...x, category_id: e.target.value, product_id: '' }))}><option value="">—</option>{targets.categories.map((c) => <option key={c.id} value={c.id}>{bi(c.name)}</option>)}</Select></Field>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div className="sticky top-0 z-10 -mx-1 rounded-2xl bg-canvas/95 p-1 backdrop-blur">
            <p className="mb-1.5 text-xs font-semibold text-muted">المعاينة المباشرة (بتتغير وانت بتعدّل)</p>
            <FeaturedCard preview item={livePreview} variant="hero" lang="ar" />
            <div className="mt-2"><ContrastNote value={contrast} /></div>
          </div>
          {f.mode === 'advertiser' && (() => {
            const adv = (advList?.items || []).find((x) => String(x.id) === f.advertiser_id);
            if (!adv?.cover) return null;
            return (
              <div className="flex items-center gap-3 rounded-2xl border border-line bg-fg/[0.03] p-3">
                <img src={adv.cover} alt="" className="h-14 w-20 rounded-lg object-cover" />
                <div className="min-w-0 flex-1"><p className="text-sm font-semibold">غلاف المعلن جاهز</p><p className="text-xs text-muted">استخدم نفس الصورة اللي ضفتها للمعلن كصورة الإعلان (كمبيوتر وموبايل).</p></div>
                <Button type="button" size="sm" variant="outline" onClick={() => setF((x) => ({ ...x, desktop_image: adv.cover, mobile_image: adv.cover }))}>استخدمها</Button>
              </div>
            );
          })()}
          <ImagePick label="الصورة الخلفية — كمبيوتر" hint={f.type === 'offer' ? 'اختيارية — لو فاضية بنستخدم صورة العرض' : 'مطلوبة للنشر (لو مفيش صورة أمامية)'} value={f.desktop_image} onChange={set('desktop_image')} error={fe.desktop_image && 'صورة غير صالحة'} />
          <ImagePick label="الصورة الخلفية — موبايل" hint="اختيارية — لو فاضية بنستخدم صورة الكمبيوتر" value={f.mobile_image} onChange={set('mobile_image')} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Slider label="تكبير الصورة" value={f.image_zoom} min={100} max={300} unit="%" onChange={set('image_zoom')} />
            <Slider label="مكانها أفقياً" value={f.image_x} min={0} max={100} unit="%" onChange={set('image_x')} />
            <Slider label="مكانها رأسياً" value={f.image_y} min={0} max={100} unit="%" onChange={set('image_y')} />
          </div>
          <ImagePick label="صورة إضافية فوق الخلفية (منتج أو لوجو)" hint="يفضل PNG بخلفية شفافة. اختيارية" value={f.fg_image} onChange={set('fg_image')} kind="fg" error={fe.fg_image && 'صورة غير صالحة'} />
          {f.fg_image && (
            <div className="space-y-4 rounded-2xl border border-line p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Slider label="حجم الصورة الإضافية" value={f.fg_size} min={10} max={90} unit="%" onChange={set('fg_size')} />
                <Field label="مكانها (يمين / وسط / شمال)"><Select value={f.fg_pos} onChange={set('fg_pos')}><option value="start">البداية</option><option value="center">النص</option><option value="end">النهاية</option></Select></Field>
              </div>
              <Field label="شكل الصورة">
                <div className="flex flex-wrap gap-2">
                  {[['none', 'زي ما هي'], ['rounded', 'مربع بحواف دايرية'], ['circle', 'دايرة']].map(([k, t]) => (
                    <button key={k} type="button" aria-pressed={f.fg_shape === k} onClick={() => set('fg_shape')(k)}
                      className={`h-10 rounded-full border px-4 text-sm font-semibold transition ${f.fg_shape === k ? 'border-fg bg-fg text-canvas' : 'border-line bg-canvas'}`}>{t}</button>
                  ))}
                </div>
              </Field>
              <Slider label="مكانها رأسياً (٠ فوق ← ١٠٠ تحت)" value={f.fg_y} min={0} max={100} unit="%" onChange={set('fg_y')} />
              <Switch checked={!!f.fg_out} onChange={() => set('fg_out')(!f.fg_out)} label="تطلع نصها برّه حدود البانر" description="مركز الصورة على الحافة (فوق أو تحت حسب المكان الرأسي) ونصها خارج البانر." />
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="لون الخلفية / تدرّج" optional="اختياري" error={fe.background_color && 'لون غير صالح'} hint="اختار لون أو اكتب تدرّج: linear-gradient(135deg,#111,#e11)"><ColorField allowGradient value={f.background_color} onChange={set('background_color')} placeholder="#0b3a73" /></Field>
            <Field label="لون النص" optional="اختياري" error={fe.text_color && 'لون غير صالح'}><ColorField value={f.text_color} onChange={set('text_color')} placeholder="#ffffff" /></Field>
          </div>
          <div className="space-y-3 rounded-2xl border border-line p-3">
            <p className="text-sm font-semibold">حجم الإعلان على الصفحة</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="العرض"><Select value={f.layout_width} onChange={set('layout_width')}><option value="wide">بعرض الصفحة (عادي)</option><option value="full">عرض الشاشة كله</option><option value="narrow">في النص (أضيق)</option></Select></Field>
              <Field label="الارتفاع"><Select value={f.layout_height} onChange={set('layout_height')}><option value="s">قصير</option><option value="m">متوسط</option><option value="l">طويل</option></Select></Field>
              {f.layout_width === 'narrow' && <Field label="مكانه في الصفحة"><Select value={f.layout_align} onChange={set('layout_align')}><option value="start">البداية</option><option value="center">النص</option><option value="end">النهاية</option></Select></Field>}
            </div>
            <p className="text-xs text-muted">العرض والارتفاع بيتطبقوا في الواجهات والشبكة. الشريط المتحرك وخانة البحث ليهم مقاس ثابت.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="مكان النص"><Select value={f.text_align} onChange={set('text_align')}><option value="start">البداية</option><option value="center">النص</option><option value="end">النهاية</option></Select></Field>
            <Slider label="تعتيم الصورة" value={f.overlay} min={0} max={80} unit="%" onChange={set('overlay')} />
            <Field label="شكل الزر"><Select value={f.cta_style} onChange={set('cta_style')}><option value="solid">مصمت</option><option value="outline">إطار</option><option value="light">شفاف</option></Select></Field>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <Field label="الأماكن" error={fe.placements && 'اختار مكان واحد على الأقل'} hint="كل مكان له حد أقصى للحملات في نفس الوقت.">
            <div className="space-y-2">
              {(meta?.placements || []).map((pl) => {
                const cur = f.placements.find((p) => p.key === pl.key);
                return (
                  <div key={pl.key} className={`rounded-xl border p-3 ${cur ? 'border-fg/40' : 'border-line'}`}>
                    <Switch checked={!!cur} onChange={() => togglePlacement(pl.key)} label={pl.ar} description={`الحد الأقصى ${pl.limit} · ${pl.scope === 'store' ? 'صفحة المحل' : 'السوق'}`} />
                    {cur && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-4">
                        <Field label="الترتيب"><Input type="number" min="0" max="99" value={cur.order} onChange={(e) => patchPlacement(pl.key, { order: Number(e.target.value) })} /></Field>
                        <Field label="الأولوية"><Input type="number" min="0" max="100" value={cur.priority} onChange={(e) => patchPlacement(pl.key, { priority: Number(e.target.value) })} /></Field>
                        {['desktop', 'mobile'].map((d) => (
                          <label key={d} className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={cur.devices.includes(d)} onChange={(e) => patchPlacement(pl.key, { devices: e.target.checked ? [...cur.devices, d] : cur.devices.filter((x) => x !== d) })} />{d === 'desktop' ? 'كمبيوتر' : 'موبايل'}</label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Field>
          <Field label="أولوية الحملة" hint="الأعلى بتظهر الأول لو الأماكن متساوية"><Input type="number" min="0" max="100" value={f.priority} onChange={set('priority')} /></Field>
          <Field label="الجمهور"><Select value={f.targeting.audience} onChange={(e) => setF((v) => ({ ...v, targeting: { ...v.targeting, audience: e.target.value } }))}><option value="all">الكل</option><option value="marketplace">السوق بس</option><option value="store">صفحات المحلات بس</option></Select></Field>
          <Field label="محلات مستهدفة (لأماكن صفحة المحل)" optional="اختياري" hint="فاضي = كل المحلات">
            <div className="flex flex-wrap gap-1.5">{stores.map((s) => <button key={s.id} type="button" onClick={() => toggleIn('stores', s.id)} aria-pressed={f.targeting.stores.includes(s.id)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${f.targeting.stores.includes(s.id) ? 'bg-fg text-canvas' : 'bg-fg/[0.06]'}`}>{bi(s.name)}</button>)}</div>
          </Field>
          {targets?.categories?.length > 0 && (
            <Field label="أقسام مستهدفة (خانة البحث)" optional="اختياري" hint="فاضي = كل الأقسام">
              <div className="flex flex-wrap gap-1.5">{targets.categories.map((c) => <button key={c.id} type="button" onClick={() => toggleIn('categories', c.id)} aria-pressed={f.targeting.categories.includes(c.id)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${f.targeting.categories.includes(c.id) ? 'bg-fg text-canvas' : 'bg-fg/[0.06]'}`}>{bi(c.name)}</button>)}</div>
            </Field>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <p className="rounded-xl bg-fg/[0.04] p-3 text-sm text-muted">المواعيد بتوقيت القاهرة. من غير مواعيد = بتشتغل أول ما تتنشر لحد ما توقفها. التفعيل والانتهاء أوتوماتيك.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="البداية" optional="اختياري" error={fe.starts_at && 'تاريخ غير صالح'}><Input type="datetime-local" dir="ltr" value={f.starts_at} onChange={set('starts_at')} /></Field>
            <Field label="النهاية" optional="اختياري" error={fe.ends_at && 'لازم تكون بعد البداية'}><Input type="datetime-local" dir="ltr" value={f.ends_at} onChange={set('ends_at')} /></Field>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">مدة الإعلان (اختصار)</p>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map(([label, days]) => (
                <button key={days} type="button"
                  onClick={() => { const base = f.starts_at || cairoNow(); setF((x) => ({ ...x, starts_at: x.starts_at || base, ends_at: toWall(wall(base) + days * 86400000) })); }}
                  className="h-9 rounded-xl border border-line px-3 text-sm font-medium hover:bg-fg/[0.05]">{label}</button>
              ))}
              <button type="button" onClick={() => setF((x) => ({ ...x, ends_at: '' }))} className="h-9 rounded-xl border border-line px-3 text-sm text-muted hover:bg-fg/[0.05]">من غير نهاية</button>
            </div>
            <p className="mt-2 text-xs text-muted">الضغط على مدة بيحسب النهاية من تاريخ البداية (أو من دلوقتي لو البداية فاضية).</p>
          </div>
          <p className="rounded-xl bg-fg/[0.06] p-3 text-sm font-medium">{runLabel(f.starts_at, f.ends_at)}</p>
          <div className="rounded-2xl border border-line p-4">
            <p className="text-sm font-semibold">تكرار الإعلان (اختياري)</p>
            <p className="mb-3 mt-1 text-xs text-muted">لو عايزه يظهر في أيام أو ساعات معينة بس، من غير ما تدخل تعدّله كل مرة. مفيش اختيار = يظهر طول الوقت جوه فترة البداية والنهاية.</p>
            <div className="mb-3 flex flex-wrap gap-2">
              {REPEAT_PRESETS.map(([label, r]) => (
                <button key={label} type="button" onClick={() => setF((x) => ({ ...x, repeat: normRepeat(r) }))} className="h-8 rounded-lg border border-line px-2.5 text-xs font-medium hover:bg-fg/[0.05]">{label}</button>
              ))}
              {f.repeat && <button type="button" onClick={() => setF((x) => ({ ...x, repeat: null }))} className="h-8 rounded-lg px-2.5 text-xs text-muted hover:text-fg">إلغاء التكرار</button>}
            </div>
            <p className="mb-1.5 text-xs font-medium text-muted">الأيام</p>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {DAY_ORDER.map(([k, n]) => {
                const on = (f.repeat?.days || []).includes(k);
                return <button key={k} type="button" aria-pressed={on}
                  onClick={() => setF((x) => { const r = x.repeat || { days: [], windows: [] }; const days = on ? r.days.filter((d) => d !== k) : [...r.days, k]; return { ...x, repeat: normRepeat({ ...r, days }) }; })}
                  className={`h-8 rounded-lg border px-3 text-xs font-medium ${on ? 'border-fg bg-fg text-canvas' : 'border-line hover:bg-fg/[0.05]'}`}>{n}</button>;
              })}
            </div>
            <p className="mb-1.5 text-xs font-medium text-muted">الساعات (لحد ٤ فترات)</p>
            <div className="space-y-2">
              {(f.repeat?.windows || []).map((w, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted">من</span>
                  <input type="time" dir="ltr" value={w.from} onChange={(e) => setF((x) => ({ ...x, repeat: { ...x.repeat, windows: x.repeat.windows.map((y, j) => (j === i ? { ...y, from: e.target.value } : y)) } }))} className="h-9 rounded-lg border border-line bg-transparent px-2 text-sm" />
                  <span className="text-xs text-muted">لـ</span>
                  <input type="time" dir="ltr" value={w.to} onChange={(e) => setF((x) => ({ ...x, repeat: { ...x.repeat, windows: x.repeat.windows.map((y, j) => (j === i ? { ...y, to: e.target.value } : y)) } }))} className="h-9 rounded-lg border border-line bg-transparent px-2 text-sm" />
                  <button type="button" aria-label="شيل الفترة" onClick={() => setF((x) => ({ ...x, repeat: normRepeat({ ...x.repeat, windows: x.repeat.windows.filter((_, j) => j !== i) }) }))} className="text-xs text-muted hover:text-fg">شيل</button>
                  {w.to <= w.from && w.to !== w.from && <span className="text-xs text-muted">(بتعدّي منتصف الليل)</span>}
                </div>
              ))}
              {(f.repeat?.windows?.length || 0) < 4 && (
                <button type="button" onClick={() => setF((x) => ({ ...x, repeat: { days: x.repeat?.days || [], windows: [...(x.repeat?.windows || []), { from: '19:00', to: '23:00' }] } }))} className="h-8 rounded-lg border border-dashed border-line px-3 text-xs font-medium hover:bg-fg/[0.05]">+ ضيف فترة</button>
              )}
            </div>
            {fe.repeat && <p className="mt-2 text-xs text-red-600">التكرار غير صالح — راجع الأيام والساعات (الفترة لازم تبدأ وتنتهي في وقتين مختلفين).</p>}
            <p className="mt-3 rounded-lg bg-fg/[0.06] p-2 text-xs font-medium">{repeatText(f.repeat)}</p>
          </div>
          {f.starts_at && f.ends_at && wall(f.ends_at) <= wall(f.starts_at) && <p className="text-sm text-red-600">النهاية لازم تكون بعد البداية.</p>}
          {f.ends_at && wall(f.ends_at) <= wall(cairoNow()) && <p className="text-sm text-amber-700">تاريخ النهاية عدّى — الإعلان هيظهر "منتهي" ومش هيتعرض.</p>}
        </div>
      )}

      {step === 5 && (
        <div className="space-y-4">
          {!preview ? <p className="text-sm text-muted">بنجهّز المعاينة…</p> : preview.error ? <ErrorState error={preview.error} compact /> : (
            <>
              {preview.warnings?.length > 0 && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{preview.warnings.map((w) => ({ offer_unavailable: 'العرض مش شغال حالياً — الحملة مش هتظهر.', incomplete: 'محتوى ناقص — الحملة مش هتظهر.', no_image: 'مفيش صورة.' }[w] || w)).join(' ')}</p>}
              {preview.campaign && (() => {
                const enabled = f.placements.filter((p) => p.enabled !== false).map((p) => p.key);
                const pl = enabled.includes(mockPlacement) ? mockPlacement : enabled[0] || 'market_hero';
                return (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={pl} onChange={(e) => setMockPlacement(e.target.value)} aria-label="المكان" size="sm">{enabled.map((k) => <option key={k} value={k}>{meta?.placements?.find((x) => x.key === k)?.ar || k}</option>)}</Select>
                      {['desktop', 'mobile'].map((d) => <button key={d} type="button" onClick={() => setMockDevice(d)} aria-pressed={mockDevice === d} className={`h-9 rounded-full px-4 text-sm font-medium ${mockDevice === d ? 'bg-fg text-canvas' : 'bg-fg/[0.06]'}`}>{d === 'desktop' ? 'كمبيوتر' : 'موبايل'}</button>)}
                    </div>
                    <p className="text-xs text-muted">ده شكل تقريبي للصفحة (الأقسام الرمادية مكان باقي المحتوى). حجم الخط على الموبايل بيتأكد على الموقع نفسه.</p>
                    <HomepageMock item={preview.campaign} placement={pl} lang="ar" device={mockDevice} />
                    <div dir="ltr"><p className="mb-1.5 text-xs font-semibold text-muted">English</p><HomepageMock item={preview.campaign} placement={pl} lang="en" device={mockDevice} /></div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      <Sheet open onClose={tryClose} title={isNew ? 'حملة جديدة' : 'تعديل الحملة'} side="end" size="xl"
        footer={(
          <div className="flex flex-wrap gap-2">
            {step > 0 && <Button variant="outline" onClick={() => setStep(step - 1)}>السابق</Button>}
            {step < 5 ? <Button onClick={() => setStep(step + 1)}>التالي</Button> : <Button loading={busy} onClick={() => submit(true)}>نشر الحملة</Button>}
            <Button variant="outline" loading={busy} onClick={() => submit(false)}>حفظ كمسودة</Button>
            {dirty && <span className="ms-auto self-center text-xs text-amber-700">فيه تعديلات لسه متحفظتش</span>}
          </div>
        )}>{body}</Sheet>
      <Confirm ask={confirmClose ? { title: 'تخرج من غير حفظ؟', body: 'التعديلات اللي عملتها هتضيع.', cta: 'اخرج من غير حفظ', danger: true, run: async () => onClose(true) } : null} onClose={() => setConfirmClose(false)} />
    </>
  );
}

function Analytics({ days, setDays }) {
  const { data, error, loading } = useAdminApi(`/featured/analytics?days=${days}`);
  return (
    <section className="space-y-4" aria-label="الإحصائيات">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-bold"><BarChart3 className="h-4 w-4" />الأداء</h2>
        <Select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="الفترة" size="sm">{[7, 14, 30, 90].map((d) => <option key={d} value={d}>آخر {d} يوم</option>)}</Select>
      </div>
      {error ? <ErrorState error={error} compact /> : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <KpiCard label="مشاهدات" value={data?.totals.views || 0} icon={Eye} loading={loading} />
            <KpiCard label="نقرات" value={data?.totals.clicks || 0} icon={MousePointerClick} loading={loading} />
            <KpiCard label="نسبة النقر" value={data?.totals.ctr ?? 0} format={(n) => (data?.totals.ctr == null ? '—' : `${Math.round(n * 10) / 10}%`)} icon={Sparkles} loading={loading} />
          </div>
          {data?.hours && data.totals.views > 0 && (() => {
            const max = Math.max(...data.hours.map((h) => h.views), 1);
            const best = data.hours.filter((h) => h.views >= 20 && h.ctr != null).sort((a, b) => b.ctr - a.ctr)[0];
            return (
              <div className="rounded-2xl border border-line bg-elevated p-4">
                <p className="mb-1 text-sm font-semibold">المشاهدات حسب ساعة اليوم (توقيت القاهرة)</p>
                {best && <p className="mb-2 text-xs text-muted">أعلى نسبة نقر الساعة {best.hour}:00 ({best.ctr}%)</p>}
                <div className="flex h-20 items-end gap-0.5" role="img" aria-label="المشاهدات حسب الساعة">
                  {data.hours.map((h) => <div key={h.hour} title={`${h.hour}:00 — ${h.views} مشاهدة، ${h.clicks} نقرة`} className="flex-1 rounded-t bg-fg/70" style={{ height: `${Math.max(2, (h.views / max) * 100)}%` }} />)}
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-muted tabular"><span>0</span><span>6</span><span>12</span><span>18</span><span>23</span></div>
              </div>
            );
          })()}
          {data && (data.placements.length > 0 || data.stores.length > 0) && (
            <div className="grid gap-3 md:grid-cols-2">
              {[['حسب المكان', data.placements, (r) => bi(r.label)], ['حسب المحل', data.stores, (r) => bi(r.name) || '—']].map(([t, rows, name]) => (
                <div key={t} className="rounded-2xl border border-line bg-elevated p-4">
                  <p className="mb-2 text-sm font-semibold">{t}</p>
                  <table className="w-full text-sm"><tbody>{rows.slice(0, 6).map((r) => <tr key={r.key} className="border-t border-line first:border-0"><td className="py-1.5">{name(r)}</td><td className="tabular text-muted">{fmtNum(r.views)}</td><td className="tabular text-muted">{fmtNum(r.clicks)}</td><td className="tabular text-end font-medium">{r.ctr == null ? '—' : `${r.ctr}%`}</td></tr>)}</tbody></table>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default function FeaturedAds() {
  const toast = useToast();
  const [state, setState] = useState('');
  const [type, setType] = useState('');
  const [placement, setPlacement] = useState('');
  const [search, setSearch] = useState('');
  const [days, setDays] = useState(30);
  const [editing, setEditing] = useState(null);
  const [ask, setAsk] = useState(null);
  const qs = new URLSearchParams({ ...(state && { state }), ...(type && { type }), ...(placement && { placement }), ...(search && { q: search }) }).toString();
  const { data, error, loading, reload } = useAdminApi(`/featured/campaigns${qs ? `?${qs}` : ''}`);
  const { data: meta } = useAdminApi('/featured/meta');
  const counts = data?.counts || {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const act = useCallback(async (c, action, okMsg) => {
    try { await adminApi(`/featured/campaigns/${c.id}/${action}`, { method: 'POST' }); toast({ title: okMsg }); reload(); }
    catch (x) { toast({ tone: 'error', title: x.message }); }
  }, [toast, reload]);
  const remove = (c) => setAsk({ title: 'حذف نهائي', body: `الحملة «${c.title.ar || c.title.en}» وإحصائياتها هتتمسح ومش هترجع. لو عايز تخفيها بس استخدم الأرشفة.`, cta: 'احذف', danger: true, run: async () => { try { await adminApi(`/featured/campaigns/${c.id}`, { method: 'DELETE' }); toast({ title: 'اتحذفت' }); reload(); } catch (x) { toast({ tone: 'error', title: x.message }); } } });
  const archive = (c) => setAsk({ title: 'أرشفة الحملة', body: 'هتختفي من المتجر فوراً وتقدر ترجّعها كمسودة في أي وقت.', cta: 'أرشف', run: () => act(c, 'archive', 'اتأرشفت') });

  return (
    <div className="space-y-6">
      <PageHeader title="الإعلانات والعروض المميزة" subtitle="حملات بتظهر في السوق وصفحات المحلات"
        actions={<Button icon={Plus} onClick={() => setEditing('new')}>حملة جديدة</Button>} />
      <Analytics days={days} setDays={setDays} />
      <section className="space-y-4" aria-label="الحملات">
        <FilterTabs value={state} onChange={setState} options={[{ value: '', label: 'الكل', count: total }, ...Object.entries(STATE).map(([k, [label]]) => ({ value: k, label, count: counts[k] || 0 }))]} />
        <div className="flex flex-wrap gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="ابحث بالعنوان أو المحل" className="min-w-48 flex-1" />
          <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="النوع"><option value="">كل الأنواع</option><option value="custom">إعلان مخصص</option><option value="offer">عرض محل</option></Select>
          <Select value={placement} onChange={(e) => setPlacement(e.target.value)} aria-label="المكان"><option value="">كل الأماكن</option>{(data?.placements || []).map((p) => <option key={p.key} value={p.key}>{p.ar}</option>)}</Select>
        </div>
        {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <ListSkeleton rows={4} /> : !data?.items.length ? (
          <EmptyState icon={Sparkles} title={total ? 'مفيش حملات بالفلاتر دي' : 'لسه مفيش حملات'} body={total ? 'غيّر الفلاتر أو امسح البحث.' : 'اعمل أول حملة وهتظهر للعملاء أول ما تنشرها.'} action={!total && <Button icon={Plus} onClick={() => setEditing('new')}>حملة جديدة</Button>} />
        ) : (
          <ul className="space-y-3">
            {data.items.map((c) => {
              const [label, tone] = STATE[c.state] || [c.state, 'neutral'];
              const live = ['active', 'scheduled', 'resting'].includes(c.state);
              return (
                <li key={c.id} className="rounded-2xl border border-line bg-elevated p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-fg/[0.05]">{(c.desktopImage || c.mobileImage) && <img src={c.desktopImage || c.mobileImage} alt="" loading="lazy" className="h-full w-full object-cover" />}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><b className="truncate">{c.title.ar || c.title.en || '(من غير عنوان)'}</b><Badge tone={tone} size="sm">{label}</Badge><Badge size="sm">{c.type === 'offer' ? 'عرض محل' : 'إعلان مخصص'}</Badge></div>
                      <p className="mt-1 text-xs text-muted">{c.store ? bi(c.store.name) : 'من غير محل'} · أولوية {c.priority} · {fmtDt(c.startsAt)} ← {fmtDt(c.endsAt)}</p>
                      {c.state !== 'draft' && c.state !== 'archived' && <p className="mt-1 text-xs font-medium text-fg">{c.state === 'resting' ? nextText(c.repeatNextInMin) : runLabel(c.startsAt, c.endsAt)}</p>}
                      {c.repeat && <p className="mt-1 text-xs text-muted">🔁 {repeatText(c.repeat)}</p>}
                      <p className="mt-1 text-xs text-muted">{c.placements.filter((p) => p.enabled !== false).map((p) => (data.placements.find((x) => x.key === p.key)?.ar || p.key)).join(' · ')}</p>
                      {c.health && <p className="mt-1 flex items-center gap-1 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />{HEALTH[c.health]}</p>}
                    </div>
                    <div className="tabular text-end text-xs text-muted"><p>{fmtNum(c.stats.views)} مشاهدة</p><p>{fmtNum(c.stats.clicks)} نقرة</p><p className="font-semibold text-fg">{c.stats.ctr == null ? '—' : `${c.stats.ctr}%`}</p></div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {c.state !== 'archived' && <Button size="sm" variant="outline" icon={Pencil} onClick={() => setEditing(c)}>تعديل</Button>}
                    {c.state === 'paused' && <Button size="sm" variant="outline" icon={Play} onClick={() => act(c, 'resume', 'اتفعّلت')}>استئناف</Button>}
                    {c.state !== 'paused' && live && <Button size="sm" variant="outline" icon={Pause} onClick={() => act(c, 'pause', 'اتوقفت')}>إيقاف</Button>}
                    <Button size="sm" variant="outline" icon={Copy} onClick={() => act(c, 'duplicate', 'اتعملها نسخة كمسودة')}>نسخ</Button>
                    {c.state === 'archived' ? <Button size="sm" variant="outline" icon={RotateCcw} onClick={() => act(c, 'restore', 'اترجعت كمسودة')}>استرجاع</Button> : <Button size="sm" variant="outline" icon={Archive} onClick={() => archive(c)}>أرشفة</Button>}
                    <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(c)}>حذف</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {editing && <Wizard key={editing === 'new' ? 'new' : editing.id} editing={editing} meta={meta} onSaved={reload} onClose={() => setEditing(null)} />}
      <Confirm ask={ask} onClose={() => setAsk(null)} />
    </div>
  );
}
