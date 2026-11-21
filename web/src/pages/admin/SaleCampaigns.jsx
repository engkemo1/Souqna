import { useEffect, useMemo, useState } from 'react';
import { Percent, Truck, Play, Square, Trash2, Pencil, Plus, BarChart3, Calculator, Sparkles, X, Search } from 'lucide-react';
import { PageHeader, Panel } from '../../components/dash/Kit.jsx';
import { ErrorState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { cx } from '../../components/ui/cx.js';
import { adminApi, useAdminApi, fmtNum } from './adminApi.js';
import { THEMES, DENSITY, DEFAULT_HYPE, HYPE_STAGES, look } from '../../lib/campaignTheme.js';
import { HeroBanner, TopBar, FallCanvas } from '../../components/campaign/parts.jsx';

const MODES = [
  { id: 'best', t: 'الأكبر يكسب (الافتراضي)', d: 'العميل ياخد الأحسن ليه: خصم الحملة على السعر الأصلي أو خصم المحل الحالي — الأكبر منهم. مفيش تضارب ومفيش خصم بيقل.' },
  { id: 'skip', t: 'استثناء المنتجات المخفّضة', d: 'أي منتج عليه خصم من المحل بيتساب زي ما هو. الحملة على باقي المنتجات بس.' },
  { id: 'override', t: 'الحملة تلغي خصم المحل', d: 'سعر الحملة بيحل مكان خصم المحل، وبيظهر عليه شارة الحملة دايماً.' },
  { id: 'stack', t: 'جمع الخصمين', d: 'نسبة الحملة بتتاخد فوق سعر المحل بعد خصمه. أكبر خسارة علينا — استخدمه بحذر.' },
];
const STATUS = { draft: ['مسودة', 'bg-secondary text-muted'], active: ['شغالة', 'bg-green-600/15 text-green-700'], ended: ['خلصت', 'bg-secondary text-muted'] };
const PHASE = { scheduled: ['مجدولة', 'bg-blue-600/15 text-blue-700'], soon: ['معلنة — قريباً', 'bg-amber-500/20 text-amber-700'], live: ['شغالة دلوقتي', 'bg-green-600/15 text-green-700'] };
const REASON = { budget: 'وقفت لما الميزانية خلصت', manual: 'اتقفلت يدوي', time: 'وقتها خلص' };

const pad = (n) => String(n).padStart(2, '0');
const toLocal = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fromLocal = (s) => { const t = new Date(s).getTime(); return Number.isFinite(t) ? t : Date.now(); };
const when = (ms) => new Date(ms).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const egp = (n) => `${fmtNum(n)} ج`;
const arN = (n) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 1 }).format(n);

function blank(kind = 'discount') {
  const s = Date.now();
  return {
    kind, name: kind === 'shipping' ? 'شحن مجاني' : 'حملة تخفيضات', startsAt: s, endsAt: s + 24 * 3600e3, percent: 30, deptPercent: {}, mode: 'best',
    allowCoupons: false, respectExcl: true, minSubtotal: 0, storeIds: [], budget: 0, headline: '', sub: '',
    announceAt: null, showHype: true, hype: {}, showBar: true, showFall: true, showHero: true, status: 'draft', theme: 'blackfriday', color1: '', color2: '', fallGlyphs: '', fallDensity: 'low', fallSpeed: 'calm',
  };
}
/** Black Friday: Friday 27 Nov 2026, Cairo time (UTC+2). */
function blackFriday(kind) {
  const start = Date.UTC(2026, 10, 26, 22, 0); // 27 Nov 00:00 Cairo
  const end = Date.UTC(2026, 10, 27, 21, 59); // 27 Nov 23:59 Cairo
  return kind === 'shipping'
    ? { ...blank('shipping'), name: 'شحن مجاني — بلاك فرايدي', startsAt: start, endsAt: end, headline: 'الشحن علينا', sub: 'شحن مجاني على كل طلباتك النهارده بس' }
    : { ...blank('discount'), name: 'بلاك فرايدي', startsAt: start, endsAt: end, percent: 30, headline: 'بلاك فرايدي', sub: 'خصومات على كل المنتجات لحد آخر النهار' };
}

/** New Year's Eve: 31 Dec 2026 12:00 → 1 Jan 2027 23:59, Cairo time. */
function newYear(kind) {
  const start = Date.UTC(2026, 11, 31, 10, 0);
  const end = Date.UTC(2027, 0, 1, 21, 59);
  return kind === 'shipping'
    ? { ...blank('shipping'), theme: 'newyear', name: 'شحن مجاني — رأس السنة', startsAt: start, endsAt: end, headline: 'الشحن علينا في رأس السنة', sub: 'سنة جديدة بتوصيل مجاني' }
    : { ...blank('discount'), theme: 'newyear', name: 'عروض رأس السنة', startsAt: start, endsAt: end, percent: 25, headline: 'كل سنة وإنت طيب 🎆', sub: 'خصومات رأس السنة على كل المنتجات' };
}

function Switch({ on, onChange, label, hint }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1.5">
      <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className={cx('mt-0.5 h-6 w-11 shrink-0 rounded-full p-0.5 transition', on ? 'bg-btn' : 'bg-secondary border border-line')}>
        <span className={cx('block h-5 w-5 rounded-full bg-white shadow transition', on ? '-translate-x-5' : '')} />
      </button>
      <span className="text-sm"><span className="font-semibold">{label}</span>{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
    </label>
  );
}
const Field = ({ label, hint, children }) => (<label className="block text-sm"><span className="mb-1 block font-semibold">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}</label>);
const inp = 'w-full rounded-xl border border-line bg-elevated px-3 py-2 text-sm outline-none focus:border-brand';

/** الخلاصة بلغة بسيطة من أرقام الحاسبة. */
function plainSummary(est) {
  const t = est.totals;
  const ship = est.kind === 'shipping';
  const x1 = est.uplift[0];
  const x3 = est.uplift[2];
  const out = [];
  if (t.orders30 > 0) {
    out.push(`لو الناس اشترت بنفس معدّلنا المعتاد (حوالي ${fmtNum(x1.orders)} طلب في ${arN(est.days)} يوم) هنخسر تقريباً ${egp(x1.cost)}.`);
    out.push(`ولو الطلبات زادت ٣ أضعاف (حوالي ${fmtNum(x3.orders)} طلب) هنخسر تقريباً ${egp(x3.cost)}.`);
  } else {
    out.push('لسه مفيش طلبات في آخر ٣٠ يوم نقيس عليها، فاعتمد على جدول «لو اشترى عدد من العملاء» تحت.');
  }
  out.push(`كل طلب بيكلّفنا في المتوسط ${egp(t.avgPerOrder)}.`);
  if (!ship) out.push(`أسوأ حالة نظرية (كل المخزون الموجود يتباع بالخصم) ${egp(t.maxExposure || 0)}.`);
  if (est.budget && t.avgPerOrder > 0) out.push(`الميزانية اللي حطّيتها (${egp(est.budget)}) تكفي حوالي ${fmtNum(Math.floor(est.budget / t.avgPerOrder))} طلب، وبعدها الحملة بتقفل لوحدها.`);
  return out;
}

/** شرح خطوات الحساب بأرقام حقيقية من أكبر محل. */
function HowWeCount({ est }) {
  const top = est.stores[0];
  const ship = est.kind === 'shipping';
  const step = (n, title, body) => (<li className="flex gap-2.5"><span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold">{n}</span><span><b>{title}</b><span className="block text-xs text-muted">{body}</span></span></li>);
  return (
    <details className="rounded-xl border border-line p-3">
      <summary className="cursor-pointer text-sm font-bold">إزاي بنحسب؟ (اضغط للشرح)</summary>
      <ol className="mt-3 space-y-2.5 text-sm">
        {ship ? (
          <>
            {step(1, 'الشحن اللي هنتنازل عنه', 'بناخد متوسط الشحن اللي كان بيتحسب على طلبات آخر ٣٠ يوم لكل محل. لو حطيت حد أدنى للسلة بنحسب بس الطلبات اللي سلتها توصل للحد ده.')}
            {step(2, 'خسارة الطلب الواحد', top ? `في أكبر محل: متوسط الشحن بعد استثناء الطلبات الأصغر من الحد ≈ ${egp(top.perOrder)} للطلب.` : 'متوسط الشحن للطلب.')}
            {step(3, 'لو اشترى N عميل', 'بنضرب خسارة الطلب المتوسطة × عدد الطلبات.')}
          </>
        ) : (
          <>
            {step(1, 'نسبة الخصم الفعلية على كل محل', `بنحسب الخصم على كل منتج حسب النسبة ووضع التضارب اللي اخترته، وبعدين نقارنه بقيمة المخزون كله. ${top ? `مثلاً في أكبر محل النسبة الفعلية ${top.ratio}% (منتجات المحل اللي بره الحملة بتنزّل النسبة)` : ''}.`)}
            {step(2, 'متوسط الطلب', `بناخد متوسط سلة العملاء في آخر ٣٠ يوم. لو المحل ملوش طلبات بناخد متوسط سعر القطعة. ${top ? `في أكبر محل: ${egp(top.avgBasket)}.` : ''}`)}
            {step(3, 'خسارة الطلب الواحد', top ? `متوسط الطلب × نسبة الخصم = ${egp(top.avgBasket)} × ${top.ratio}% ≈ ${egp(top.perOrder)}.` : 'متوسط الطلب × نسبة الخصم.')}
            {step(4, 'لو اشترى N عميل', 'بنضرب متوسط خسارة الطلب (على كل المحلات) × عدد الطلبات.')}
            {step(5, 'لو الطلبات زادت عن المعتاد', 'بناخد عدد طلبات آخر ٣٠ يوم ونحوّله لمدة الحملة، ونضربه في المضاعف (×٢ ، ×٣ ...) ونضرب في خسارة الطلب.')}
            {step(6, 'أقصى خسارة', 'لو كل قطعة في المخزون الموجود دلوقتي اتباعت بالخصم. المنتج اللي مخزونه مش متتبّع بنعتبره ٥ قطع. ده سقف نظري مش توقّع.')}
          </>
        )}
      </ol>
      <p className="mt-3 text-xs text-muted">كل ده تقدير بيعتمد على اللي حصل في آخر ٣٠ يوم. الرقم الحقيقي هتشوفه في «تقرير» الحملة وهو شغّال.</p>
    </details>
  );
}

/** حاسبة الخسارة: بتتحسب على المنتجات الموجودة دلوقتي + آخر ٣٠ يوم طلبات، وبتتحدّث وإنت بتغيّر الإعدادات. */
function LossCalculator({ draft }) {
  const [est, setEst] = useState(null);
  const [err, setErr] = useState('');
  const [all, setAll] = useState(false);
  const key = JSON.stringify([draft.kind, draft.percent, draft.deptPercent, draft.mode, draft.respectExcl, draft.minSubtotal, draft.storeIds, draft.startsAt, draft.endsAt, draft.budget]);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      adminApi('/sale-campaigns/estimate', { method: 'POST', body: draft }).then((r) => { if (live) { setEst(r); setErr(''); } }).catch((e) => live && setErr(e.message));
    }, 400);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (err) return <ErrorState error={{ message: err }} />;
  if (!est) return <Skeleton className="h-40 w-full" />;
  const t = est.totals;
  const isShip = est.kind === 'shipping';
  const rows = all ? est.stores : est.stores.slice(0, 8);
  const over = est.budget && t.maxExposure != null && t.maxExposure > est.budget;
  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
        <div className="mb-1 font-bold">الخلاصة بالبسيط</div>
        <ul className="list-disc space-y-1 ps-5 text-[13px] leading-relaxed">{plainSummary(est).map((s) => <li key={s}>{s}</li>)}</ul>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['محلات داخلة', fmtNum(t.stores)],
          [isShip ? 'منتجات شغالة' : 'منتجات هتتخفّض', isShip ? fmtNum(t.products) : `${fmtNum(t.affected)} من ${fmtNum(t.products)}`],
          ['خسارة الطلب الواحد (متوسط)', egp(t.avgPerOrder)],
          [isShip ? 'طلبات آخر ٣٠ يوم' : 'أقصى خسارة ممكنة', isShip ? fmtNum(t.orders30) : egp(t.maxExposure || 0)],
        ].map(([l, v]) => (<div key={l} className="rounded-xl border border-line bg-elevated p-3"><div className="text-xs text-muted">{l}</div><div className="mt-1 text-lg font-bold">{v}</div></div>))}
      </div>
      {!isShip && <p className="text-xs text-muted">«أقصى خسارة» = لو كل المخزون الموجود دلوقتي اتباع بالخصم. ده أسوأ سيناريو مستحيل تقريباً، بس بيحط سقف للأمان.</p>}
      {over && <p className="rounded-xl bg-red-500/10 p-2 text-xs font-semibold text-red-600">أقصى خسارة أكبر من الميزانية — الحملة هتقف لوحدها لما توصل للميزانية ({egp(est.budget)}).</p>}

      <div>
        <h4 className="mb-1.5 font-bold">لو اشترى عدد من العملاء (طلب متوسط)</h4>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {est.customers.map((c) => (<div key={c.orders} className="rounded-xl bg-secondary p-2 text-center"><div className="text-xs text-muted">{fmtNum(c.orders)} طلب</div><div className="font-bold text-sale">{egp(c.cost)}</div></div>))}
        </div>
      </div>
      <div>
        <h4 className="mb-1.5 font-bold">لو الطلبات زادت عن المعتاد (المعتاد = آخر ٣٠ يوم)</h4>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {est.uplift.map((u) => (<div key={u.x} className="rounded-xl bg-secondary p-2 text-center"><div className="text-xs text-muted">×{arN(u.x)} (~{fmtNum(u.orders)} طلب)</div><div className="font-bold text-sale">{egp(u.cost)}</div></div>))}
        </div>
        <p className="mt-1 text-xs text-muted">مدة الحملة {arN(est.days)} يوم. لو مفيش طلبات قبل كده، الحساب على متوسط سعر القطعة.</p>
      </div>
      <div>
        <h4 className="mb-1.5 font-bold">الخسارة حسب المحل</h4>
        <div className="space-y-2 sm:hidden">
          {rows.map((s) => (
            <div key={s.id} className="rounded-xl border border-line p-3">
              <div className="mb-2 font-bold">{s.name}</div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                {[['منتجات', fmtNum(s.products)], [isShip ? 'طلب ٣٠ يوم' : 'هتتخفّض', isShip ? fmtNum(s.orders30) : fmtNum(s.affected)], ...(isShip ? [] : [['طلب ٣٠ يوم', fmtNum(s.orders30)]]), ['خسارة الطلب', egp(s.perOrder)], ...(isShip ? [] : [['أقصى خسارة', egp(s.maxExposure)]])].map(([l, v]) => (<div key={l} className="flex items-baseline justify-between gap-2"><dt className="text-muted">{l}</dt><dd className="font-semibold">{v}</dd></div>))}
              </dl>
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto rounded-xl border border-line sm:block">
          <table className="w-full min-w-[520px] text-xs">
            <thead className="bg-secondary text-muted"><tr><th className="p-2 text-start">المحل</th><th className="p-2">منتجات</th><th className="p-2">هتتخفّض</th><th className="p-2">طلب ٣٠ يوم</th><th className="p-2">خسارة/طلب</th>{!isShip && <th className="p-2">أقصى خسارة</th>}</tr></thead>
            <tbody>{rows.map((s) => (<tr key={s.id} className="border-t border-line text-center"><td className="p-2 text-start font-semibold">{s.name}</td><td className="p-2">{fmtNum(s.products)}</td><td className="p-2">{fmtNum(s.affected)}</td><td className="p-2">{fmtNum(s.orders30)}</td><td className="p-2">{egp(s.perOrder)}</td>{!isShip && <td className="p-2 font-semibold text-sale">{egp(s.maxExposure)}</td>}</tr>))}</tbody>
          </table>
        </div>
        {est.stores.length > 8 && <button type="button" onClick={() => setAll(!all)} className="mt-2 text-xs font-semibold text-brand">{all ? 'أقل' : `اعرض كل المحلات (${est.stores.length})`}</button>}
      </div>
      <HowWeCount est={est} />
    </div>
  );
}

function StorePicker({ stores, value, onChange }) {
  const [s, setS] = useState('');
  const list = stores.filter((x) => !s || x.name.includes(s));
  const set = new Set(value);
  return (
    <div className="rounded-xl border border-line p-2">
      <div className="relative mb-2"><Search size={14} className="absolute start-2 top-2.5 text-muted" /><input className={cx(inp, 'ps-7')} placeholder="دوّر على محل" value={s} onChange={(e) => setS(e.target.value)} /></div>
      <div className="max-h-44 space-y-0.5 overflow-auto">
        {list.map((x) => (<label key={x.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-secondary"><input type="checkbox" checked={set.has(x.id)} onChange={() => onChange(set.has(x.id) ? value.filter((i) => i !== x.id) : [...value, x.id])} />{x.name}</label>))}
      </div>
    </div>
  );
}

/** Live preview of exactly what customers will see (banner, top bar, falling shapes). */
function LookPreview({ d }) {
  const [t0] = useState(() => Date.now());
  const [ph, setPh] = useState('l_mid'); // the time stage being previewed
  const st = HYPE_STAGES.find((x) => x.key === ph) || HYPE_STAGES[6];
  const soon = !!st.soon;
  const startsAt = soon ? t0 + st.preview.startsIn : t0 - st.preview.elapsed;
  const end = soon ? startsAt + 24 * 3600e3 : t0 + st.preview.endsIn;
  const c = { id: 0, kind: d.kind, phase: soon ? 'soon' : 'live', showHype: d.showHype, hype: d.hype, headline: d.headline, sub: d.sub, percent: d.percent, min: d.minSubtotal, startsAt, endsAt: end, theme: d.theme, color1: d.color1, color2: d.color2, glyphs: d.fallGlyphs, density: d.fallDensity, speed: d.fallSpeed, name: d.name };
  const l = look(c);
  const k = `${d.theme}|${d.color1}|${d.color2}|${d.fallGlyphs}|${d.fallDensity}|${d.fallSpeed}|${d.percent}`;
  return (
    <div className="space-y-3">
      <label className="block text-xs font-semibold text-muted">شوف الشكل في أي وقت:
        <select value={ph} onChange={(e) => setPh(e.target.value)} className={cx(inp, 'mt-1 text-fg')}>
          {['قبل البداية', 'أثناء الحملة'].map((g) => (<optgroup key={g} label={g}>{HYPE_STAGES.filter((x) => x.group === g).map((x) => (<option key={x.key} value={x.key}>{x.label}</option>))}</optgroup>))}
        </select>
      </label>
      <div className="overflow-hidden rounded-xl border border-line"><TopBar key={ph} items={[c]} preview /></div>
      <HeroBanner key={`h${ph}`} c={c} preview />
      {!soon && d.showFall && d.fallDensity !== 'off' && (
        <div className="relative h-40 overflow-hidden rounded-xl border border-line bg-elevated"><span className="absolute inset-0 grid place-items-center text-xs text-muted">كده بيبان النزول على الصفحة</span><FallCanvas key={k} c={c} contained /></div>
      )}
      <p className="text-xs text-muted">المعاينة حيّة: غيّر اللون أو الأشكال فوق وهتشوفها هنا. الألوان الأساسية: <span className="inline-block h-3 w-3 rounded-full align-middle" style={{ background: l.c1 }} /> <span className="inline-block h-3 w-3 rounded-full align-middle" style={{ background: l.c2 }} /></p>
    </div>
  );
}

function Editor({ init, meta, onClose, onSaved }) {
  const toast = useToast();
  const [d, setD] = useState(init);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [deptOpen, setDeptOpen] = useState(Object.keys(init.deptPercent || {}).length > 0);
  const [scoped, setScoped] = useState((init.storeIds || []).length > 0);
  const [annMode, setAnnMode] = useState(init.announceAt ? 'at' : 'start'); // start = only when it starts · now = teaser from now · at = teaser from a chosen time
  const set = (p) => setD((x) => ({ ...x, ...p }));
  const ship = d.kind === 'shipping';
  const upcoming = d.startsAt > Date.now();

  const save = async (status) => {
    setBusy(true);
    try {
      const announceAt = !upcoming ? null : annMode === 'now' ? Date.now() - 1000 : annMode === 'at' ? d.announceAt : null;
      if (annMode === 'at' && upcoming && !announceAt) throw new Error('حدد وقت ظهور الإعلان');
      const body = { ...d, status, announceAt, storeIds: scoped ? d.storeIds : [] };
      const r = d.id ? await adminApi(`/sale-campaigns/${d.id}`, { method: 'PUT', body }) : await adminApi('/sale-campaigns', { method: 'POST', body });
      toast({ title: status === 'active' ? (upcoming ? 'الحملة اتجدولت' : 'الحملة شغالة دلوقتي') : 'اتحفظت' });
      onSaved(r.campaign);
    } catch (e) { toast({ tone: 'error', title: e.message || 'حصلت مشكلة' }); } finally { setBusy(false); setConfirm(false); }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] [&>*]:min-w-0">
      <Panel title={d.id ? 'تعديل الحملة' : ship ? 'حملة شحن مجاني جديدة' : 'حملة تخفيض جديدة'} action={<button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-secondary"><X size={16} /></button>}>
        <div className="space-y-4">
          {!d.id && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setD({ ...blank('discount') })} className={cx('rounded-xl border px-3 py-1.5 text-sm font-semibold', !ship ? 'border-brand bg-brand/10 text-brand' : 'border-line')}><Percent size={14} className="me-1 inline" />خصم</button>
              <button type="button" onClick={() => setD({ ...blank('shipping') })} className={cx('rounded-xl border px-3 py-1.5 text-sm font-semibold', ship ? 'border-brand bg-brand/10 text-brand' : 'border-line')}><Truck size={14} className="me-1 inline" />شحن مجاني</button>
              <button type="button" onClick={() => setD(blackFriday(d.kind))} className="rounded-xl bg-btn px-3 py-1.5 text-sm font-semibold text-on-btn"><Sparkles size={14} className="me-1 inline" />جهّز بلاك فرايدي ٢٧ نوفمبر</button>
              <button type="button" onClick={() => setD(newYear(d.kind))} className="rounded-xl bg-btn px-3 py-1.5 text-sm font-semibold text-on-btn"><Sparkles size={14} className="me-1 inline" />جهّز رأس السنة</button>
            </div>
          )}
          <Field label="اسم الحملة (للإدارة)"><input className={inp} value={d.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="تبدأ"><input type="datetime-local" className={inp} value={toLocal(d.startsAt)} onChange={(e) => set({ startsAt: fromLocal(e.target.value) })} /></Field>
            <Field label="تخلص"><input type="datetime-local" className={inp} value={toLocal(d.endsAt)} onChange={(e) => set({ endsAt: fromLocal(e.target.value) })} /></Field>
          </div>

          <div className="space-y-2 rounded-xl border border-line p-3">
            <div className="text-sm font-bold">إمتى العملاء يشوفوا الحملة؟</div>
            {!upcoming ? (
              <p className="text-xs text-muted">وقت البداية جه، فالحملة بتظهر مباشرة أول ما تشغّلها.</p>
            ) : (
              <>
                {[
                  ['start', 'وقت البداية بس', 'مفيش أي حاجة بتظهر على الموقع لحد ما الحملة تبدأ.'],
                  ['now', 'أظهرها من دلوقتي (قريباً)', 'بانر وشريط «قريباً» وعدّاد بيعد لحد وقت البداية — من غير أي خصم لسه.'],
                  ['at', 'حدد إمتى يبدأ الإعلان يظهر', 'نفس الإعلان والعدّاد بس بيبدأ في الوقت اللي تختاره.'],
                ].map(([k, t, hint]) => (
                  <label key={k} className={cx('flex cursor-pointer gap-2 rounded-xl border p-2.5', annMode === k ? 'border-brand bg-brand/5' : 'border-line')}>
                    <input type="radio" name="ann" checked={annMode === k} onChange={() => { setAnnMode(k); if (k === 'at' && !d.announceAt) set({ announceAt: Math.max(Date.now() + 60e3, d.startsAt - 24 * 3600e3) }); }} className="mt-1" />
                    <span className="text-sm"><span className="font-semibold">{t}</span><span className="block text-xs text-muted">{hint}</span></span>
                  </label>
                ))}
                {annMode === 'at' && (
                  <div className="space-y-2 ps-1">
                    <input type="datetime-local" className={inp} value={d.announceAt ? toLocal(d.announceAt) : ''} onChange={(e) => set({ announceAt: fromLocal(e.target.value) })} />
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      <span className="self-center text-muted">قبل البداية بـ</span>
                      {[['ساعة', 1], ['يوم', 24], ['٣ أيام', 72], ['أسبوع', 168]].map(([l, h]) => (<button key={l} type="button" onClick={() => set({ announceAt: d.startsAt - h * 3600e3 })} className="rounded-lg border border-line px-2.5 py-1 font-semibold">{l}</button>))}
                    </div>
                    {d.announceAt && d.announceAt >= d.startsAt && <p className="text-xs font-semibold text-red-600">وقت الإعلان لازم يكون قبل وقت البداية.</p>}
                  </div>
                )}
              </>
            )}
            <p className="rounded-lg bg-secondary p-2 text-xs leading-relaxed text-muted">العدّاد على مرحلتين: قبل البداية بيعد لحد ما الحملة تبدأ. وأول ما تبدأ بيتحوّل لوحده ويعد لحد وقت «تخلص» (يعني عدّاد خاص باليوم نفسه). مش محتاج تعمل حاجة. لازم تضغط «حفظ وتشغيل» عشان الإعلان يظهر، المسودة مش بتظهر.</p>
          </div>

          {!ship ? (
            <>
              <Field label="نسبة الخصم على كل المنتجات (%)" hint="الخصم علينا إحنا (تويست) — المحل بياخد فلوسه كاملة."><input type="number" min={0} max={90} className={inp} value={d.percent} onChange={(e) => set({ percent: Number(e.target.value) })} /></Field>
              <div>
                <button type="button" onClick={() => setDeptOpen(!deptOpen)} className="text-sm font-semibold text-brand">{deptOpen ? '− إخفاء' : '+ نسبة مختلفة لكل قسم (اختياري)'}</button>
                {deptOpen && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {(meta.departments || []).map((x) => (
                      <label key={x.slug} className="flex items-center gap-2 text-sm"><span className="w-24 truncate">{x.name}</span>
                        <input type="number" min={0} max={90} placeholder={`${d.percent}`} className={cx(inp, 'w-20')} value={d.deptPercent?.[x.slug] ?? ''} onChange={(e) => { const v = e.target.value; const n = { ...(d.deptPercent || {}) }; if (v === '') delete n[x.slug]; else n[x.slug] = Number(v); set({ deptPercent: n }); }} />
                        <span className="text-xs text-muted">%</span></label>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="mb-1 text-sm font-semibold">لو المنتج عليه خصم من المحل أصلاً</div>
                <div className="space-y-1.5">
                  {MODES.map((m) => (
                    <label key={m.id} className={cx('flex cursor-pointer gap-2 rounded-xl border p-2.5', d.mode === m.id ? 'border-brand bg-brand/5' : 'border-line')}>
                      <input type="radio" name="mode" checked={d.mode === m.id} onChange={() => set({ mode: m.id })} className="mt-1" />
                      <span className="text-sm"><span className="font-semibold">{m.t}</span><span className="block text-xs text-muted">{m.d}</span></span>
                    </label>
                  ))}
                </div>
              </div>
              <Switch on={d.respectExcl} onChange={(v) => set({ respectExcl: v })} label="احترم «استثناء من العروض» على المنتج" hint="المنتجات اللي المحل علّم عليها إنها بره العروض مش بتدخل الحملة." />
              <Switch on={d.allowCoupons} onChange={(v) => set({ allowCoupons: v })} label="اسمح بالكوبونات مع الحملة" hint="مقفولة افتراضياً عشان الخصم ما يتجمعش مع كوبون." />
            </>
          ) : (
            <Field label="الحد الأدنى للسلة (جنيه)" hint="0 = الشحن مجاني على كل الطلبات. لو كتبت رقم، الشحن مجاني من السلة اللي توصل له. الشحن بتتحمّله تويست."><input type="number" min={0} className={inp} value={d.minSubtotal} onChange={(e) => set({ minSubtotal: Number(e.target.value) })} /></Field>
          )}

          <div>
            <Switch on={scoped} onChange={(v) => setScoped(v)} label="محلات محددة بس" hint="مقفول = كل المحلات." />
            {scoped && <StorePicker stores={meta.stores || []} value={d.storeIds || []} onChange={(v) => set({ storeIds: v })} />}
          </div>
          <Field label="ميزانية الحملة (جنيه) — اختياري" hint="لما إجمالي الخسارة الفعلي يوصل للرقم ده الحملة بتقفل لوحدها. 0 = من غير حد."><input type="number" min={0} className={inp} value={d.budget} onChange={(e) => set({ budget: Number(e.target.value) })} /></Field>

          <div className="space-y-3 rounded-xl border border-line p-3">
            <div className="text-sm font-bold">الشكل على الموقع</div>
            <div>
              <div className="mb-1 text-xs font-semibold text-muted">الثيم (بيظبط الألوان والأشكال تلقائي — تقدر تعدّل بعده)</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(THEMES).map(([k, t]) => (
                  <button key={k} type="button" onClick={() => set({ theme: k, color1: '', color2: '', fallGlyphs: '' })} className={cx('flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold', d.theme === k ? 'border-brand bg-brand/10 text-brand' : 'border-line')}>
                    <span className="h-4 w-4 rounded-full border border-white/40" style={{ background: `linear-gradient(135deg, ${t.c1} 50%, ${t.c2} 50%)` }} />{t.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="اللون الأساسي" hint="فاضي = لون الثيم"><span className="flex items-center gap-2"><input type="color" value={d.color1 || THEMES[d.theme].c1} onChange={(e) => set({ color1: e.target.value })} className="h-9 w-12 cursor-pointer rounded-lg border border-line bg-transparent" />{d.color1 && <button type="button" onClick={() => set({ color1: '' })} className="text-xs text-muted">رجّع للثيم</button>}</span></Field>
              <Field label="لون التمييز (الأزرار والعدّاد)" hint="فاضي = لون الثيم"><span className="flex items-center gap-2"><input type="color" value={d.color2 || THEMES[d.theme].c2} onChange={(e) => set({ color2: e.target.value })} className="h-9 w-12 cursor-pointer rounded-lg border border-line bg-transparent" />{d.color2 && <button type="button" onClick={() => set({ color2: '' })} className="text-xs text-muted">رجّع للثيم</button>}</span></Field>
            </div>
            <Field label="العنوان الكبير"><input className={inp} value={d.headline} placeholder={ship ? 'الشحن علينا' : THEMES[d.theme].name} onChange={(e) => set({ headline: e.target.value })} /></Field>
            <Field label="سطر تحته"><input className={inp} value={d.sub} onChange={(e) => set({ sub: e.target.value })} /></Field>
            <Switch on={d.showHype} onChange={(v) => set({ showHype: v })} label="جملة تحميس بالعامية في البانر" hint="سطر واحد بيتغيّر لوحده: قبل البداية، أثناء الحملة، وفي آخر ٣ ساعات. سيب الخانة فاضية وهنكتب لك جملة جاهزة." />
            {d.showHype && (
              <details className="rounded-xl border border-line p-3">
                <summary className="cursor-pointer text-sm font-semibold">تعديل الجمل لكل مرحلة (سيب أي خانة فاضية وهنكتب لك جملة جاهزة)</summary>
                <div className="mt-3 space-y-2">
                  {['قبل البداية', 'أثناء الحملة'].map((g) => (
                    <div key={g} className="space-y-2">
                      <div className="text-xs font-bold text-muted">{g}</div>
                      {HYPE_STAGES.filter((x) => x.group === g).map((x) => (
                        <Field key={x.key} label={x.label}><input className={inp} maxLength={100} value={d.hype?.[x.key] || ''} placeholder={DEFAULT_HYPE[ship ? 'shipping' : 'discount'][x.key][0]} onChange={(e) => set({ hype: { ...(d.hype || {}), [x.key]: e.target.value } })} /></Field>
                      ))}
                    </div>
                  ))}
                </div>
              </details>
            )}
            <Switch on={d.showHero} onChange={(v) => set({ showHero: v })} label="بانر كبير متحرّك في أول الصفحة الرئيسية" />
            <Switch on={d.showBar} onChange={(v) => set({ showBar: v })} label="شريط رفيع فوق كل الصفحات بعدّاد (العميل يقدر يقفله)" />
            <Switch on={d.showFall} onChange={(v) => set({ showFall: v })} label="أشكال بتنزل من فوق على كل الصفحات (بتتقفل في السلة والدفع، وللي مفعّل «تقليل الحركة»)" />
            {d.showFall && (
              <div className="space-y-3 ps-2">
                <Field label="الأشكال اللي بتنزل" hint="اكتب أي رموز أو إيموجي بدون مسافات، مثال: 🎉✨🎆 — فاضي = أشكال الثيم."><input className={inp} value={d.fallGlyphs} placeholder={THEMES[d.theme].glyphs.join('')} onChange={(e) => set({ fallGlyphs: e.target.value })} /></Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="الكثافة"><div className="flex gap-1.5">{[['low', 'خفيفة'], ['medium', 'متوسطة'], ['high', 'كتير']].map(([k, l]) => (<button key={k} type="button" onClick={() => set({ fallDensity: k })} className={cx('flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold', d.fallDensity === k ? 'border-brand bg-brand/10 text-brand' : 'border-line')}>{l}</button>))}</div></Field>
                  <Field label="السرعة"><div className="flex gap-1.5">{[['calm', 'هادية'], ['normal', 'عادية'], ['lively', 'سريعة']].map(([k, l]) => (<button key={k} type="button" onClick={() => set({ fallSpeed: k })} className={cx('flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold', d.fallSpeed === k ? 'border-brand bg-brand/10 text-brand' : 'border-line')}>{l}</button>))}</div></Field>
                </div>
                <p className="text-xs text-muted">الافتراضي «خفيفة + هادية» عشان العين ترتاح. على الموبايل بنقلّل العدد تلقائي.</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <button type="button" disabled={busy} onClick={() => save(d.status === 'active' ? 'active' : 'draft')} className="rounded-xl border border-line px-4 py-2 text-sm font-semibold">{d.status === 'active' ? 'حفظ التعديل' : 'حفظ كمسودة'}</button>
            {d.status !== 'active' && (confirm
              ? <><button type="button" disabled={busy} onClick={() => save('active')} className="rounded-xl bg-btn px-4 py-2 text-sm font-bold text-on-btn">{upcoming ? 'أيوه، جدولها' : 'أيوه، شغّلها'}</button><button type="button" onClick={() => setConfirm(false)} className="text-sm text-muted">لأ</button></>
              : <button type="button" disabled={busy} onClick={() => setConfirm(true)} className="rounded-xl bg-btn px-4 py-2 text-sm font-bold text-on-btn"><Play size={14} className="me-1 inline" />{upcoming ? 'حفظ وجدولة' : 'حفظ وتشغيل'}</button>)}
          </div>
          {confirm && <p className="text-xs text-muted">{upcoming ? 'الحملة هتبدأ لوحدها في وقت البداية، والإعلان هيظهر حسب اختيارك فوق.' : 'الوقت جه فالحملة هتشتغل فوراً.'} راجع الحاسبة الأول.</p>}
        </div>
      </Panel>
      <div className="space-y-4">
        <Panel title="معاينة الشكل" subtitle="ده اللي العميل هيشوفه"><LookPreview d={d} /></Panel>
        <Panel title="حاسبة الخسارة" subtitle="هنخسر قد إيه لو شغّلنا الحملة دي؟" action={<Calculator size={16} className="text-muted" />}><LossCalculator draft={{ ...d, storeIds: scoped ? d.storeIds : [] }} /></Panel>
      </div>
    </div>
  );
}

function Report({ id, onClose }) {
  const { data, error } = useAdminApi(`/sale-campaigns/${id}/report`, { every: 15000 });
  if (error) return <ErrorState error={error} />;
  if (!data) return <Skeleton className="h-32 w-full" />;
  const { campaign: c, stores, spent, budgetLeft, cancelled } = data;
  return (
    <Panel title={`تقرير: ${c.name}`} action={<button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-secondary"><X size={16} /></button>}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 text-sm">
        {[['طلبات بالحملة', fmtNum(spent.orders)], ['خصم دفعناه', egp(spent.discount)], ['شحن اتحمّلناه', egp(spent.shipping)], ['إجمالي الخسارة', egp(spent.total)], ['طلبات ملغية', fmtNum(cancelled)]].map(([l, v]) => (<div key={l} className="rounded-xl border border-line bg-elevated p-3"><div className="text-xs text-muted">{l}</div><div className="mt-1 text-lg font-bold">{v}</div></div>))}
      </div>
      {budgetLeft != null && <p className="mt-2 text-xs text-muted">المتبقي من الميزانية: {egp(budgetLeft)} من {egp(c.budget)}</p>}
      <div className="mt-3 space-y-2 sm:hidden">
        {stores.map((s) => (
          <div key={s.id} className="rounded-xl border border-line p-3">
            <div className="mb-2 font-bold">{s.name}</div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              {[['طلبات', fmtNum(s.orders)], ['خصم', egp(s.discount)], ['شحن', egp(s.shipping)], ['مبيعات', egp(s.revenue)]].map(([l, v]) => (<div key={l} className="flex items-baseline justify-between gap-2"><dt className="text-muted">{l}</dt><dd className="font-semibold">{v}</dd></div>))}
            </dl>
          </div>
        ))}
        {!stores.length && <div className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-muted">لسه مفيش طلبات.</div>}
      </div>
      <div className="mt-3 hidden overflow-x-auto rounded-xl border border-line sm:block">
        <table className="w-full min-w-[420px] text-xs"><thead className="bg-secondary text-muted"><tr><th className="p-2 text-start">المحل</th><th className="p-2">طلبات</th><th className="p-2">خصم</th><th className="p-2">شحن</th><th className="p-2">مبيعات</th></tr></thead>
          <tbody>{stores.map((s) => (<tr key={s.id} className="border-t border-line text-center"><td className="p-2 text-start font-semibold">{s.name}</td><td className="p-2">{fmtNum(s.orders)}</td><td className="p-2">{egp(s.discount)}</td><td className="p-2">{egp(s.shipping)}</td><td className="p-2">{egp(s.revenue)}</td></tr>))}{!stores.length && <tr><td colSpan={5} className="p-4 text-center text-muted">لسه مفيش طلبات.</td></tr>}</tbody></table>
      </div>
      <p className="mt-2 text-xs text-muted">الخصم ده بنحاسب بيه المحلات في «مستحقات المنصة» (زي كوبونات تويست) — المحل بياخد فلوسه كاملة.</p>
    </Panel>
  );
}

export default function SaleCampaigns() {
  const toast = useToast();
  const { data, error, loading, reload } = useAdminApi('/sale-campaigns', { every: 30000 });
  const [edit, setEdit] = useState(null);
  const [report, setReport] = useState(null);
  const meta = useMemo(() => ({ stores: data?.stores || [], departments: data?.departments || [] }), [data]);

  const act = async (fn, ok) => { try { await fn(); if (ok) toast({ title: ok }); reload(); } catch (e) { toast({ tone: 'error', title: e.message || 'حصلت مشكلة' }); } };

  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  return (
    <div className="space-y-4">
      <PageHeader title="حملات التخفيضات" subtitle="بلاك فرايدي وأي حملة خصم أو شحن مجاني على مستوى المنصة — بنتحمّل إحنا التكلفة والمحلات بتاخد فلوسها كاملة."
        actions={!edit && <button type="button" onClick={() => setEdit(blank())} className="rounded-xl bg-btn px-4 py-2 text-sm font-bold text-on-btn"><Plus size={14} className="me-1 inline" />حملة جديدة</button>} />
      {edit && <Editor key={edit.id || 'new'} init={edit} meta={meta} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {report && <Report id={report} onClose={() => setReport(null)} />}
      {loading && !data ? <Skeleton className="h-40 w-full" /> : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0">
          {(data?.campaigns || []).map((c) => {
            const [sl, sc] = STATUS[c.status] || STATUS.draft;
            return (
              <div key={c.id} className="rounded-2xl border border-line bg-elevated p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><div className="flex items-center gap-1.5 font-bold">{c.kind === 'shipping' ? <Truck size={16} /> : <Percent size={16} />}<span className="truncate">{c.name}</span></div>
                    <div className="mt-0.5 text-xs text-muted">{when(c.startsAt)} ← {when(c.endsAt)}</div>
                    {c.announceAt && c.phase !== 'live' && c.phase !== 'ended' && <div className="mt-0.5 text-xs text-amber-700">الإعلان بيظهر من {when(c.announceAt)}</div>}</div>
                  <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold', (PHASE[c.phase] || [0, sc])[1])}>{(PHASE[c.phase] || [sl])[0]}</span>
                </div>
                <div className="mt-2 text-sm text-muted">
                  {c.kind === 'shipping' ? (c.minSubtotal ? `شحن مجاني من ${egp(c.minSubtotal)}` : 'شحن مجاني على كل الطلبات') : `${c.percent ? `${c.percent}%` : 'نسب أقسام'}${Object.keys(c.deptPercent || {}).length ? ' + نسب أقسام' : ''} — ${MODES.find((m) => m.id === c.mode)?.t}`}
                  {c.storeIds.length ? ` · ${c.storeIds.length} محل` : ' · كل المحلات'}
                </div>
                {(c.spent.orders > 0 || c.budget > 0) && <div className="mt-1 text-xs">طلبات: <b>{fmtNum(c.spent.orders)}</b> · خسارة فعلية: <b className="text-sale">{egp(c.spent.total)}</b>{c.budget > 0 && ` من ${egp(c.budget)}`}</div>}
                {c.status === 'ended' && c.endedReason && <div className="mt-1 text-xs text-muted">{REASON[c.endedReason]}</div>}
                <div className="mt-3 flex flex-wrap gap-1.5 text-xs font-semibold">
                  {c.status !== 'active' && c.endsAt > Date.now() && <button type="button" onClick={() => act(() => adminApi(`/sale-campaigns/${c.id}/status`, { method: 'POST', body: { status: 'active' } }), 'الحملة اتفعّلت')} className="rounded-lg bg-btn px-2.5 py-1.5 text-on-btn"><Play size={12} className="me-1 inline" />تشغيل</button>}
                  {c.phase === 'scheduled' && <button type="button" onClick={() => act(() => adminApi(`/sale-campaigns/${c.id}`, { method: 'PUT', body: { announceAt: Date.now() - 1000 } }), 'الإعلان ظهر على الموقع')} className="rounded-lg bg-amber-500 px-2.5 py-1.5 text-black"><Sparkles size={12} className="me-1 inline" />أظهر الإعلان دلوقتي</button>}
                  {c.phase === 'soon' && <button type="button" onClick={() => act(() => adminApi(`/sale-campaigns/${c.id}`, { method: 'PUT', body: { announceAt: null } }), 'الإعلان اتخفى')} className="rounded-lg border border-line px-2.5 py-1.5">إخفاء الإعلان</button>}
                  {c.status === 'active' && <button type="button" onClick={() => act(() => adminApi(`/sale-campaigns/${c.id}/status`, { method: 'POST', body: { status: 'ended' } }), 'الحملة اتقفلت')} className="rounded-lg bg-red-600 px-2.5 py-1.5 text-white"><Square size={12} className="me-1 inline" />إيقاف</button>}
                  <button type="button" onClick={() => { setReport(null); setEdit(c); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="rounded-lg border border-line px-2.5 py-1.5"><Pencil size={12} className="me-1 inline" />تعديل</button>
                  <button type="button" onClick={() => { setEdit(null); setReport(c.id); }} className="rounded-lg border border-line px-2.5 py-1.5"><BarChart3 size={12} className="me-1 inline" />تقرير</button>
                  {c.status !== 'active' && <button type="button" onClick={() => act(() => adminApi(`/sale-campaigns/${c.id}`, { method: 'DELETE' }), 'اتمسحت')} className="rounded-lg border border-line px-2.5 py-1.5 text-red-600"><Trash2 size={12} className="me-1 inline" />مسح</button>}
                </div>
              </div>
            );
          })}
          {!(data?.campaigns || []).length && !edit && <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted md:col-span-2">لسه مفيش حملات. دوس «حملة جديدة» وبعدها «جهّز بلاك فرايدي».</div>}
        </div>
      )}
    </div>
  );
}
