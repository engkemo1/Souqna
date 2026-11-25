import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Download, Wand2, Gauge, Users, ListChecks } from 'lucide-react';
import { PageHeader, Panel, KpiCard, FilterTabs } from '../../components/dash/Kit.jsx';
import { ErrorState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import { useAdminApi, adminApi, adminKey, adminSession, fmtNum } from './adminApi.js';

const REASONS = { color: 'اللون', fit: 'التناسب', age_size: 'العمر / المقاس', modesty: 'الحشمة', occasion: 'المناسبة', bad_data: 'صورة / بيانات غلط', other: 'حاجة تانية' };
const PATTERN = { plain: 'سادة', plaid: 'كاروهات', stripe: 'مخطط', subtle_print: 'نقشة هادية', graphic: 'طباعة / جرافيك', logo_heavy: 'لوجو كبير', unknown: 'مش معروف' };
const LOUD = { low: 'هادي', medium: 'متوسط', high: 'صاخب', unknown: 'مش معروف' };
const TIER = { basic: 'بيسيك', casual: 'كاجوال', streetwear: 'ستريت', smart_casual: 'سمارت كاجوال', formal: 'رسمي', unknown: 'مش معروف' };
const SIL = { fitted: 'ضيق', regular: 'عادي', relaxed: 'واسع', oversized: 'أوفر سايز', unknown: 'مش معروف' };
const SRC = { text: 'من النص', image: 'من الصورة', admin: 'تصحيح يدوي' };
const me = () => { try { return localStorage.getItem('bo.reviewer') || ''; } catch { return ''; } };
const pct = (v) => (v == null ? '—' : `${fmtNum(Math.round(v * 100))}٪`);

async function download(path, name) {
  const res = await fetch(`/api/admin${path}`, { headers: { 'x-admin-key': adminKey.get(), 'x-admin-session': adminSession.get() } });
  const url = URL.createObjectURL(await res.blob()); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

function Review({ stats, reloadStats }) {
  const [reviewer, setReviewer] = useState(me());
  const [item, setItem] = useState(undefined); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false); const [reasons, setReasons] = useState([]); const [note, setNote] = useState('');
  const next = useCallback(async () => {
    setErr(null); setRejecting(false); setReasons([]); setNote('');
    try { const d = await adminApi(`/look-review/next?reviewer=${encodeURIComponent(reviewer || 'admin')}`); setItem(d.item); } catch (e) { setErr(e); }
  }, [reviewer]);
  useEffect(() => { next(); }, [next]);
  const save = (name) => { setReviewer(name); try { localStorage.setItem('bo.reviewer', name); } catch { /* ignore */ } };
  const send = async (verdict) => {
    if (verdict === 'reject' && !reasons.length) return;
    setBusy(true);
    try { await adminApi(`/look-review/${item.id}/verdict`, { method: 'POST', body: { verdict, reasons: verdict === 'reject' ? reasons : [], note, reviewer: reviewer || 'admin' } }); reloadStats(); await next(); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const generate = async () => { setBusy(true); try { await adminApi('/look-review/generate', { method: 'POST', body: { count: 30 } }); reloadStats(); await next(); } catch (e) { setErr(e); } finally { setBusy(false); } };
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Panel title="لوك للمراجعة" subtitle="بتشوف اللوك بس: من غير ما تعرف رأي النظام فيه. اقبله لو كنت تنصح عميل بيه، ارفضه وحدد السبب لو لأ.">
        {err ? <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{err.message}</p> : null}
        {item === undefined ? <Skeleton className="h-64 w-full rounded-xl" /> : !item ? (
          <div className="py-10 text-center text-sm text-muted">
            <p>مفيش لوكات مستنية مراجعة.</p>
            <button type="button" onClick={generate} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 font-semibold text-white disabled:opacity-50"><Wand2 className="h-4 w-4" />{busy ? 'بيولّد…' : 'ولّد ٣٠ لوك من الكتالوج'}</button>
          </div>
        ) : (
          <div>
            <p className="mb-3 text-xs text-muted">{item.second ? 'مراجعة تانية (مراجع مختلف) · ' : ''}الجمهور: {item.audience || '—'} · الشهر: {item.month}</p>
            <div className={`grid gap-3 ${item.pieces.length >= 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
              {item.pieces.map((p) => (
                <div key={p.id} className="rounded-xl border border-line p-2 text-xs">
                  <SmartImage media={p.card?.image} alt={p.name_ar || ''} ratio="4 / 5" className="w-full rounded-lg bg-secondary" sizes="(min-width:640px) 20vw, 40vw" />
                  <p dir="auto" className="mt-1.5 line-clamp-2 font-semibold">{p.name_ar || p.card?.name?.ar}</p>
                  <p className="text-muted">{p.key} · {fmtNum(p.price)} ج{p.sizes?.length ? ` · ${p.sizes.slice(0, 4).join(' / ')}` : ''}</p>
                </div>
              ))}
            </div>
            {rejecting ? (
              <div className="mt-4 rounded-xl border border-line p-3">
                <p className="mb-2 text-sm font-semibold">ليه مرفوض؟ (اختار سبب أو أكتر)</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(REASONS).map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setReasons((r) => (r.includes(k) ? r.filter((x) => x !== k) : [...r, k]))} className={`rounded-full border px-3 py-1.5 text-sm ${reasons.includes(k) ? 'border-red-500 bg-red-50 font-semibold text-red-700' : 'border-line'}`}>{l}</button>
                  ))}
                </div>
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="ملاحظة (اختياري)" className="mt-3 w-full rounded-lg border border-line px-3 py-2 text-sm" />
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={busy || !reasons.length} onClick={() => send('reject')} className="rounded-xl bg-red-600 px-4 py-2 font-semibold text-white disabled:opacity-40">تأكيد الرفض</button>
                  <button type="button" onClick={() => setRejecting(false)} className="rounded-xl border border-line px-4 py-2">رجوع</button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex gap-3">
                <button type="button" disabled={busy} onClick={() => send('accept')} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 font-bold text-white disabled:opacity-50"><CheckCircle2 className="h-5 w-5" />مقبول</button>
                <button type="button" disabled={busy} onClick={() => setRejecting(true)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 font-bold text-white disabled:opacity-50"><XCircle className="h-5 w-5" />مرفوض</button>
              </div>
            )}
          </div>
        )}
      </Panel>
      <div className="space-y-4">
        <Panel title="المراجع">
          <input value={reviewer} onChange={(e) => save(e.target.value.slice(0, 40))} placeholder="اسمك (عشان المراجعة التانية)" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
          <p className="mt-2 text-xs text-muted">كل لوك خامس بيتراجع من شخص تاني لقياس الاتفاق بين المراجعين.</p>
        </Panel>
        <Panel title="التقدّم">
          <p className="tabular text-2xl font-extrabold">{fmtNum(stats?.judged || 0)} <span className="text-sm font-normal text-muted">/ {fmtNum(stats?.target || 300)} حكم</span></p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-brand" style={{ width: `${Math.min(100, ((stats?.judged || 0) / (stats?.target || 300)) * 100)}%` }} /></div>
          <p className="mt-2 text-xs text-muted">مقبول {fmtNum(stats?.accept || 0)} · مرفوض {fmtNum(stats?.reject || 0)} · مستني {fmtNum(stats?.pending || 0)}</p>
          <button type="button" onClick={generate} disabled={busy} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm"><Wand2 className="h-4 w-4" />ولّد دفعة جديدة</button>
        </Panel>
        <Panel title="أسباب الرفض">
          {Object.entries(stats?.byReason || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => <div key={k} className="flex justify-between py-1 text-sm"><span>{REASONS[k] || k}</span><span className="tabular font-semibold">{fmtNum(n)}</span></div>)}
          {!Object.keys(stats?.byReason || {}).length ? <p className="text-sm text-muted">لسه مفيش رفض.</p> : null}
        </Panel>
      </div>
    </div>
  );
}

function Evaluate() {
  const { data, error, loading, reload } = useAdminApi('/look-review/evaluate');
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const L = loading && !data;
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="لوكات حكم عليها الفريق" icon={ListChecks} tone="brand" value={data?.total} format={fmtNum} loading={L} hint={data?.note || undefined} />
        <KpiCard label="الخطر: لوك مرفوض بشريًا والنظام بيعديه" icon={XCircle} tone="accent" value={data?.badPassRate} format={pct} loading={L} hint={data ? `${fmtNum(data.badPass)} لوك` : undefined} />
        <KpiCard label="لوكات النظام بيعديها وهي صح (precision)" icon={Gauge} tone="sky" value={data?.precision} format={pct} loading={L} />
        <KpiCard label="لوكات كويسة النظام بيمنعها (recall)" icon={Users} tone="violet" value={data?.recall} format={pct} loading={L} hint={data ? `${fmtNum(data.missedGood)} لوك كويس اتمنع` : undefined} />
      </div>
      <Panel className="mt-6" title="الاتفاق مع الفريق" subtitle={`نسخة القواعد: ${data?.rulesVersion || '—'} · القواعد الحالية متطبقة على لقطات محفوظة، فالنتيجة ثابتة حتى لو الكتالوج اتغير`}>
        <p className="text-sm">نسبة اتفاق النظام مع الحكم البشري: <b className="tabular">{pct(data?.agreement)}</b></p>
        {Object.keys(data?.badPassReasons || {}).length ? <p className="mt-2 text-sm text-muted">أسباب اللوكات اللي عدّت غلط: {Object.entries(data.badPassReasons).map(([k, n]) => `${REASONS[k] || k} (${n})`).join('، ')}</p> : null}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => download('/look-review/export', 'golden-looks.csv')} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm"><Download className="h-4 w-4" />CSV</button>
          <button type="button" onClick={() => download('/look-review/export?format=json', 'golden-looks.json')} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm"><Download className="h-4 w-4" />JSON (للتدريب)</button>
        </div>
      </Panel>
    </div>
  );
}

function Sel({ value, onChange, map, options }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-line bg-white px-2 py-1 text-xs">{options.map((o) => <option key={o} value={o}>{map[o] || o}</option>)}</select>;
}
function TagRow({ it, options, onSaved }) {
  const [t, setT] = useState(it.tags); const [busy, setBusy] = useState(false); const dirty = JSON.stringify(t) !== JSON.stringify(it.tags);
  const save = async () => { setBusy(true); try { await adminApi(`/visual-tags/${it.id}`, { method: 'PUT', body: { ...t, updatedBy: me() || 'admin' } }); onSaved(); } finally { setBusy(false); } };
  const reset = async () => { setBusy(true); try { await adminApi(`/visual-tags/${it.id}`, { method: 'DELETE' }); onSaved(); } finally { setBusy(false); } };
  return (
    <li className="flex flex-wrap items-center gap-2 py-3 text-sm">
      <span dir="auto" className="min-w-0 basis-full font-semibold sm:basis-56">{it.name_ar || it.name_en} <span className="text-xs font-normal text-muted">({it.key})</span></span>
      <Sel value={t.pattern} onChange={(v) => setT({ ...t, pattern: v })} map={PATTERN} options={options.pattern} />
      <Sel value={t.visualLoudness} onChange={(v) => setT({ ...t, visualLoudness: v })} map={LOUD} options={options.visualLoudness} />
      <Sel value={t.styleTier} onChange={(v) => setT({ ...t, styleTier: v })} map={TIER} options={options.styleTier} />
      <Sel value={t.silhouette} onChange={(v) => setT({ ...t, silhouette: v })} map={SIL} options={options.silhouette} />
      {it.hits ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">اتسبّبت في {fmtNum(it.hits)} رفض محتمل</span> : null}
      <span className="text-xs text-muted">{SRC[it.source] || it.source} · ثقة {it.confidence === 'none' ? 'مفيش' : it.confidence}</span>
      <button type="button" disabled={busy || !dirty} onClick={save} className="rounded-lg bg-brand px-3 py-1 text-xs font-semibold text-white disabled:opacity-40">حفظ</button>
      {it.source === 'admin' ? <button type="button" disabled={busy} onClick={reset} className="rounded-lg border border-line px-3 py-1 text-xs">رجوع للتخمين</button> : null}
    </li>
  );
}
function Tags() {
  const [filter, setFilter] = useState('unknown');
  const { data, error, loading, reload } = useAdminApi(`/visual-tags?filter=${filter}&limit=60`);
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const s = data?.summary;
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="قطع علوية (تيشيرت/جاكيت…)" icon={ListChecks} tone="brand" value={s?.upperBodyProducts} format={fmtNum} loading={loading && !data} />
        <KpiCard label="وسومها موثوقة" icon={CheckCircle2} tone="sky" value={s?.reliable} format={fmtNum} loading={loading && !data} hint={s ? `نص ${fmtNum(s.fromText)} · صورة ${fmtNum(s.fromImage)} · يدوي ${fmtNum(s.fromAdmin)}` : undefined} />
        <KpiCard label="ناقصة" icon={XCircle} tone="accent" value={s?.unknown} format={fmtNum} loading={loading && !data} hint={s ? `اتسجّل ${fmtNum(s.wouldRejectLogged30d)} مرة كان هيتمنع لوك بسببها` : undefined} />
        <KpiCard label="نسبة التغطية" icon={Gauge} tone="violet" value={s?.coveragePct} format={pct} loading={loading && !data} hint={s ? `المنع الواضح عند ٨٠٪ · منع الناقص عند ٩٠٪` : undefined} />
      </div>
      {s ? <p className="mt-3 rounded-xl border border-line bg-secondary px-3 py-2 text-sm">وضع الفحص البصري دلوقتي: <b>{{ shadow: 'مراقبة بس (مفيش لوك بيتخفي)', off: 'مقفول', enforce: 'منع الحالات الواضحة بس', full: 'منع كامل' }[s.gate.mode]}</b>. {s.readyForClear ? 'التغطية كفاية لتفعيل المنع الواضح.' : 'التغطية لسه أقل من ٨٠٪: ما تفعّلش المنع.'} الأولوية للقطع اللي بتظهر كتير في الأول.</p> : null}
      <Panel className="mt-6" title="وسوم الشكل البصري" subtitle="دي تصنيفات من اسم ووصف المنتج بس (مش فهم صور)، وده مش قطعي. أي تصحيح منك بيغلب التخمين. المرتّبين بالأكتر ظهورًا في لوكات اتعمل لها فحص."
        action={<FilterTabs value={filter} onChange={setFilter} options={[{ value: 'unknown', label: 'ناقصة' }, { value: 'text', label: 'من النص' }, { value: 'admin', label: 'اتصححت' }, { value: 'all', label: 'الكل' }]} />}>
        {!data ? <Skeleton className="h-48 w-full rounded-xl" /> : !data.items.length ? <p className="py-6 text-center text-sm text-muted">مفيش قطع هنا.</p> : (
          <ul className="divide-y divide-line">{data.items.map((it) => <TagRow key={`${it.id}-${it.source}-${JSON.stringify(it.tags)}`} it={it} options={data.options} onSaved={reload} />)}</ul>
        )}
        {data && data.total > data.items.length ? <p className="mt-3 text-xs text-muted">بيعرض أول {fmtNum(data.items.length)} من {fmtNum(data.total)}.</p> : null}
      </Panel>
    </div>
  );
}

export default function LookReview() {
  const [tab, setTab] = useState('review');
  const { data: stats, reload } = useAdminApi('/look-review/stats');
  return (
    <div>
      <PageHeader title="مراجعة اللوكات (Golden Set)" subtitle="امتحان ثابت لتنسيق تويلا و«كمّل اللوك»: الفريق بيحكم على لوكات حقيقية، والنظام بيتقاس عليها. وبنفس الشاشة بتصحح وسوم شكل القطع."
        actions={<FilterTabs value={tab} onChange={setTab} options={[{ value: 'review', label: 'مراجعة' }, { value: 'eval', label: 'قياس النظام' }, { value: 'tags', label: 'وسوم القطع' }]} />} />
      {tab === 'review' ? <Review stats={stats} reloadStats={reload} /> : tab === 'eval' ? <Evaluate /> : <Tags />}
    </div>
  );
}
