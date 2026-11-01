import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, FolderUp, Upload, Sparkles, Trash2, Link2Off, Search, Check, X, Images, Copy, RefreshCw } from 'lucide-react';
import { PageHeader, Panel, FilterTabs } from '../../components/dash/Kit.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import { ErrorState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { adminApi, adminUpload, adminUploadMany, adminBlobUrl, useAdminApi, fmtNum } from './adminApi.js';

const STATUS = {
  ok: { tone: 'success', label: 'له صورة' },
  missing: { tone: 'danger', label: 'من غير صورة' },
  legacy: { tone: 'warning', label: 'صورة قديمة (رابط)' },
  broken: { tone: 'danger', label: 'صورة مفقودة' },
};
const RESULT = {
  assigned: ['success', 'اتربطت'], unmatched: ['warning', 'اتحفظت في المكتبة (مفيش قسم بالاسم ده)'], skipped_has_image: ['neutral', 'القسم عنده صورة (اتحفظت في المكتبة)'], failed: ['danger', 'فشل'],
};
const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const errMsg = (x) => ({ image_too_small: 'الصورة صغيرة (300 بكسل على الأقل)', image_too_large: 'الصورة أكبر من 8 ميجا', invalid_image: 'الملف ده مش صورة مدعومة (JPG / PNG / WebP / AVIF)' }[x.code] || x.message);

function Thumb({ url, className = 'h-12 w-12' }) {
  const [bad, setBad] = useState(false);
  return url && !bad
    ? <img src={url} alt="" loading="lazy" onError={() => setBad(true)} className={`${className} shrink-0 rounded-lg bg-fg/5 object-cover`} />
    : <span className={`${className} grid shrink-0 place-items-center rounded-lg bg-fg/5 text-xs text-muted`}>—</span>;
}

/** Pick a stored image for a section. */
function AssetPicker({ open, onClose, assets, onPick }) {
  const [term, setTerm] = useState('');
  const list = (assets || []).filter((a) => !term || `${a.filename} ${a.used_by.map((u) => `${u.slug} ${u.name.ar} ${u.name.en}`).join(' ')}`.toLowerCase().includes(term.toLowerCase()));
  return (
    <Sheet open={open} onClose={onClose} title="اختار صورة من المكتبة" size="lg">
      <div className="relative mb-3"><Search className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-muted" /><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="ابحث باسم الملف أو القسم" className="h-10 w-full rounded-xl border border-line bg-elevated ps-9 pe-3 text-sm" /></div>
      <div className="grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
        {list.map((a) => (
          <button key={a.id} type="button" onClick={() => onPick(a)} className="group overflow-hidden rounded-xl border border-line text-start transition hover:border-brand">
            <img src={a.urls.card} alt="" loading="lazy" className="aspect-square w-full object-cover" />
            <span className="block truncate px-2 py-1 text-[11px] text-muted">{a.filename || `#${a.id}`}</span>
          </button>
        ))}
        {!list.length && <p className="col-span-full py-8 text-center text-sm text-muted">مفيش صور في المكتبة.</p>}
      </div>
    </Sheet>
  );
}

/** Explicit, admin-driven generation: prompt → preview → accept / reject / regenerate. One provider call per click. */
function GenerateSheet({ item, onClose, onDone, replacePending = false }) {
  const toast = useToast();
  const [prompt, setPrompt] = useState('');
  const [cand, setCand] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!item) return undefined;
    setCand(null); setPreview('');
    adminApi(`/image-library/prompt/${item.slug}`).then((r) => setPrompt(r.prompt)).catch(() => {});
    return undefined;
  }, [item]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  if (!item) return null;
  const run = async (regenerate) => {
    setBusy(true);
    try {
      const r = await adminApi('/image-library/generate', { method: 'POST', body: { slug: item.slug, prompt, regenerate } });
      setCand(r); setPreview(await adminBlobUrl(`/image-library/candidates/${r.id}/preview`));
    } catch (x) { toast({ tone: 'error', title: x.code === 'candidate_pending' ? 'فيه صورة مولّدة مستنية قرارك. اقبلها أو ارفضها، أو اضغط إعادة توليد.' : x.message }); }
    setBusy(false);
  };
  const decide = async (verb) => {
    setBusy(true);
    try { await adminApi(`/image-library/candidates/${cand.id}/${verb}`, { method: 'POST' }); toast({ title: verb === 'approve' ? 'اتحفظت في المكتبة واتربطت بالقسم' : 'اترفضت ومفيش حاجة اتحفظت' }); onDone(); onClose(); }
    catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy(false);
  };
  return (
    <Sheet open onClose={onClose} title={`توليد صورة: ${item.name.ar}`} description="التوليد بيحصل مرة واحدة لكل ضغطة، وبيتخزن بس لو وافقت." size="lg">
      <label className="block text-sm font-semibold">وصف الصورة (بالإنجليزي أدق)
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} className="mt-1 w-full rounded-xl border border-line bg-elevated p-3 text-sm" dir="ltr" />
      </label>
      {preview && <img src={preview} alt="" className="mx-auto mt-4 max-h-80 rounded-xl" />}
      <div className="mt-4 flex flex-wrap gap-2">
        {!cand ? <Button icon={Sparkles} loading={busy} onClick={() => run(replacePending)}>{replacePending ? 'ولّد بديلة' : 'ولّد صورة'}</Button> : (
          <>
            <Button icon={Check} loading={busy} onClick={() => decide('approve')}>اقبلها واحفظها</Button>
            <Button variant="secondary" icon={X} disabled={busy} onClick={() => decide('reject')}>ارفضها</Button>
            <Button variant="secondary" icon={RefreshCw} disabled={busy} onClick={() => run(true)}>ولّد من جديد</Button>
          </>
        )}
      </div>
    </Sheet>
  );
}

const SCOPES = { missing: 'الأقسام من غير صورة', main: 'الأقسام الرئيسية فقط', missing_or_legacy: 'من غير صورة + اللي صورتها رابط قديم' };
const JOB_ERR = (e) => (/daily|limit/i.test(e || '') ? `${e} (وصلنا حد التوليد)` : e);

/** Candidate card with an authenticated preview. */
function CandidateCard({ c, item, selected, onSelect, onApprove, onReject, onRegen, busy }) {
  const [src, setSrc] = useState('');
  useEffect(() => { let url; let off = false; adminBlobUrl(`/image-library/candidates/${c.id}/preview`).then((u) => { url = u; if (!off) setSrc(u); }).catch(() => {}); return () => { off = true; if (url) URL.revokeObjectURL(url); }; }, [c.id]);
  const main = item?.level === 0;
  return (
    <div className={`overflow-hidden rounded-xl border ${selected ? 'border-brand' : 'border-line'} ${main ? 'sm:col-span-2' : ''}`}>
      <div className="relative">
        {src ? <img src={src} alt={item?.name?.en || c.department_slug} className={`w-full object-cover ${main ? 'aspect-[16/9]' : 'aspect-square'}`} /> : <Skeleton className={`w-full ${main ? 'aspect-[16/9]' : 'aspect-square'}`} />}
        <label className="absolute start-2 top-2 rounded-md bg-black/50 p-1"><input type="checkbox" checked={selected} onChange={() => onSelect(c.id)} /></label>
        <span className="absolute end-2 top-2"><Badge tone={main ? 'info' : 'neutral'} size="sm">{main ? 'رئيسي' : 'فرعي'}</Badge></span>
      </div>
      <div className="space-y-1.5 p-2.5 text-xs">
        <p className="truncate text-sm font-bold">{item?.name?.ar || c.department_slug} <span className="font-normal text-muted" dir="ltr">{c.department_slug}</span></p>
        {c.near?.length > 0 && <p className="rounded-md bg-amber-500/10 px-2 py-1 text-amber-700">شبه صورة موجودة (صورة #{c.near.map((n) => n.asset ?? n.candidate).join('، #')}). راجعها قبل القبول.</p>}
        <div className="flex flex-wrap gap-1.5">
          <Button size="xs" icon={Check} disabled={busy} onClick={() => onApprove(c.id)}>قبول</Button>
          <Button size="xs" variant="secondary" icon={X} disabled={busy} onClick={() => onReject(c.id)}>رفض</Button>
          <Button size="xs" variant="secondary" icon={RefreshCw} disabled={busy} onClick={() => onRegen(c)}>إعادة توليد</Button>
        </div>
      </div>
    </div>
  );
}

/** Batch controls, live progress, failures and the review grid. Every provider call here is started by an admin click. */
function ReviewPanel({ items, generation, onChanged }) {
  const toast = useToast();
  const batchesQ = useAdminApi('/image-library/batches');
  const candQ = useAdminApi('/image-library/generation');
  const readyQ = useAdminApi('/image-library/readiness');
  const [scope, setScope] = useState('missing');
  const [size, setSize] = useState(12);
  const [sel, setSel] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [regen, setRegen] = useState(null);
  const by = useMemo(() => new Map(items.map((i) => [i.slug, i])), [items]);
  const batches = batchesQ.data?.batches || [];
  const active = batches.find((b) => b.active || b.status === 'running');
  const last = active || batches[0];
  const cands = candQ.data?.candidates || [];
  useEffect(() => {                                    // poll only while a batch is actually running
    if (!active) return undefined;
    const t = setInterval(() => { batchesQ.reload(); candQ.reload(); }, 3000);
    return () => clearInterval(t);
  }, [active?.id, active?.counts?.done]); // eslint-disable-line react-hooks/exhaustive-deps
  const wrap = async (fn, ok) => { setBusy(true); try { await fn(); if (ok) toast({ title: ok }); } catch (x) { toast({ tone: 'error', title: x.code === 'daily_limit' ? 'وصلت للحد اليومي للتوليد. كمّل بكره أو ارفع الحد من الإعدادات.' : x.message }); } batchesQ.reload(); candQ.reload(); onChanged(); setBusy(false); };
  const post = (path, body) => adminApi(path, { method: 'POST', body });
  const eligible = batchesQ.data?.eligible?.[scope] ?? 0;
  const left = Math.max(0, (batchesQ.data?.daily_limit ?? 0) - (batchesQ.data?.used_today ?? 0));
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const approveMany = () => wrap(async () => { for (const id of sel) await post(`/image-library/candidates/${id}/approve`); setSel(new Set()); }, 'اتقبلت واتحفظت على R2');
  const total = last?.total || 0;
  const doneN = last ? (last.counts.done + last.counts.failed + last.counts.cancelled) : 0;

  const checks = readyQ.data?.checks || [];
  const checklist = checks.length > 0 && !readyQ.data?.ready && (
    <ul className="mt-3 space-y-1 text-sm">{checks.map((c) => <li key={c.id} className="flex items-center gap-2"><Badge size="sm" tone={c.ok ? 'success' : 'danger'}>{c.ok ? 'موجود' : 'ناقص'}</Badge><span dir="ltr">{c.label}</span></li>)}</ul>
  );
  if (!generation?.configured) return <Panel title="التوليد غير مفعّل"><p className="text-sm text-muted">محتاج CF_AI_TOKEN و CF_ACCOUNT_ID على السيرفر (نفس بيانات Workers AI). بعد ما تضيفهم وتعمل إعادة تشغيل هيظهر التحكم هنا. الرفع اليدوي شغال في الأثناء.</p>{checklist}</Panel>;
  return (
    <div className="space-y-4">
      {checklist && <Panel title="إعدادات ناقصة قبل التجربة الحقيقية">{checklist}</Panel>}
      <Panel title="توليد على دفعات" subtitle="مفيش توليد بيحصل غير لما تضغط. كل دفعة بحد أقصى 30 قسم، والنتيجة بتستنى مراجعتك قبل ما تتحفظ.">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-semibold">النطاق
            <select value={scope} onChange={(e) => setScope(e.target.value)} className="mt-1 block h-10 rounded-xl border border-line bg-elevated px-3 text-sm">{Object.entries(SCOPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="text-sm font-semibold">حجم الدفعة
            <input type="number" min={1} max={30} value={size} onChange={(e) => setSize(Math.min(30, Math.max(1, Number(e.target.value) || 1)))} className="mt-1 block h-10 w-24 rounded-xl border border-line bg-elevated px-3 text-sm" /></label>
          <Button icon={Sparkles} loading={busy} disabled={!!active || !eligible || !left} onClick={() => wrap(() => post('/image-library/batches', { scope, size }), 'بدأت الدفعة')}>ابدأ دفعة</Button>
          <p className="text-xs text-muted">مؤهل: {fmtNum(eligible)} قسم · استُخدم النهارده {fmtNum(batchesQ.data?.used_today ?? 0)} من {fmtNum(batchesQ.data?.daily_limit ?? 0)} ({generation.provider})</p>
        </div>
        {last && (
          <div className="mt-4 space-y-2 rounded-xl border border-line p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-bold">دفعة #{last.id} · {SCOPES[last.scope]} <Badge size="sm" tone={last.active ? 'info' : last.status === 'done' ? 'success' : 'neutral'}>{last.active ? 'شغالة' : { done: 'خلصت', paused: 'متوقفة', cancelled: 'اتلغت', running: 'متقطعة (كمّل)' }[last.status] || last.status}</Badge></span>
              <span className="tabular text-xs text-muted">تمت {last.counts.done} · فشلت {last.counts.failed} · مستنية {last.counts.queued + last.counts.running} من {total}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-fg/10"><div className="h-full bg-brand transition-all" style={{ width: `${total ? (doneN / total) * 100 : 0}%` }} /></div>
            <div className="flex flex-wrap gap-2">
              {last.active && <Button size="xs" variant="secondary" disabled={busy} onClick={() => wrap(() => post(`/image-library/batches/${last.id}/pause`))}>إيقاف مؤقت</Button>}
              {!last.active && ['running', 'paused'].includes(last.status) && last.counts.queued + last.counts.running > 0 && <Button size="xs" disabled={busy} onClick={() => wrap(() => post(`/image-library/batches/${last.id}/resume`))}>كمّل</Button>}
              {['running', 'paused'].includes(last.status) && <Button size="xs" variant="danger-ghost" disabled={busy} onClick={() => wrap(() => post(`/image-library/batches/${last.id}/cancel`), 'اتلغت')}>إلغاء الدفعة</Button>}
              {last.counts.failed > 0 && !last.active && <Button size="xs" variant="secondary" icon={RefreshCw} disabled={busy} onClick={() => wrap(() => post(`/image-library/batches/${last.id}/retry-failed`))}>أعد المحاولة للفاشل</Button>}
            </div>
            {last.failed.length > 0 && (
              <div className="rounded-lg bg-red-500/5 p-2 text-xs">
                <p className="mb-1 font-bold text-red-700">أقسام فشل توليدها ({last.failed.length}):</p>
                {last.failed.map((f) => <p key={f.slug} className="text-muted"><span dir="ltr">{f.slug}</span> — {by.get(f.slug)?.name?.ar} · {JOB_ERR(f.error)} · محاولات: {f.attempts}</p>)}
              </div>
            )}
          </div>
        )}
      </Panel>

      <Panel title={`صور مستنية المراجعة (${cands.length})`} subtitle="مفيش حاجة اتحفظت على R2 لسه. القبول بيرفع الصورة ويربطها بالقسم.">
        {cands.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button size="xs" variant="secondary" onClick={() => setSel(sel.size === cands.length ? new Set() : new Set(cands.map((c) => c.id)))}>{sel.size === cands.length ? 'إلغاء التحديد' : 'تحديد الكل'}</Button>
            <Button size="xs" icon={Check} disabled={busy || !sel.size} onClick={approveMany}>قبول المحدد ({sel.size})</Button>
            <Button size="xs" variant="secondary" icon={X} disabled={busy || !sel.size} onClick={() => wrap(async () => { for (const id of sel) await post(`/image-library/candidates/${id}/reject`); setSel(new Set()); }, 'اترفضت')}>رفض المحدد</Button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cands.map((c) => <CandidateCard key={c.id} c={c} item={by.get(c.department_slug)} selected={sel.has(c.id)} onSelect={toggle} busy={busy}
            onApprove={(id) => wrap(() => post(`/image-library/candidates/${id}/approve`), 'اتحفظت على R2 واتربطت')}
            onReject={(id) => wrap(() => post(`/image-library/candidates/${id}/reject`), 'اترفضت')} onRegen={setRegen} />)}
          {!cands.length && <p className="col-span-full py-8 text-center text-sm text-muted">مفيش صور مستنية. ابدأ دفعة من فوق.</p>}
        </div>
      </Panel>
      <GenerateSheet replacePending item={regen ? by.get(regen.department_slug) : null} onClose={() => setRegen(null)} onDone={() => { batchesQ.reload(); candQ.reload(); onChanged(); }} />
    </div>
  );
}

export default function ImageLibrary() {
  const { data, error, loading, reload } = useAdminApi('/image-library/status');
  const assetsQ = useAdminApi('/image-library/assets');
  const dupQ = useAdminApi('/image-library/duplicates');
  const toast = useToast();
  const [tab, setTab] = useState('sections');
  const [status, setStatus] = useState('all');
  const [term, setTerm] = useState('');
  const [busy, setBusy] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [report, setReport] = useState(null);
  const [picker, setPicker] = useState(null);
  const [gen, setGen] = useState(null);
  const [links, setLinks] = useState(null);
  const folderRef = useRef(null);
  const filesRef = useRef(null);
  useEffect(() => { folderRef.current?.setAttribute('webkitdirectory', ''); }, []);

  const refresh = () => { reload(); assetsQ.reload(); dupQ.reload(); };
  const items = data?.items || [];
  const sum = data?.summary;
  const visible = useMemo(() => items.filter((i) => (status === 'all' || i.status === status)
    && (!term || `${i.name.ar} ${i.name.en} ${i.slug}`.toLowerCase().includes(term.toLowerCase()))), [items, status, term]);
  const nameOf = useMemo(() => { const by = new Map(items.map((i) => [i.slug, i])); return (it) => { const p = []; for (let x = it, n = 0; x && n < 8; x = by.get(x.parent), n++) p.unshift(x.name.ar); return p.join(' › '); }; }, [items]);

  const bulk = async (fileList) => {
    const files = [...fileList].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|avif)$/i.test(f.name));
    if (!files.length) { toast({ tone: 'error', title: 'مفيش صور في الاختيار' }); return; }
    setBusy(true); setReport(null);
    const all = { results: [], summary: { total: 0, assigned: 0, unmatched: 0, skipped: 0, failed: 0, duplicates: 0 } };
    try {
      for (let i = 0; i < files.length; i += 20) {            // batches keep each request small
        const r = await adminUploadMany('/image-library/upload', files.slice(i, i + 20), { overwrite });
        all.results.push(...r.results); for (const k of Object.keys(all.summary)) all.summary[k] += r.summary[k];
      }
      setReport(all); refresh();
      toast({ title: `اتربط ${all.summary.assigned} من ${all.summary.total}` });
    } catch (x) { toast({ tone: 'error', title: errMsg(x) }); }
    setBusy(false);
  };
  const replace = async (it, file) => {
    if (!file) return;
    setBusy(true);
    try { const r = await adminUpload(`/departments/${it.id}/image`, file); toast({ title: r.duplicate ? 'الصورة دي موجودة في المكتبة واتربطت' : 'اتحفظت واتربطت' }); refresh(); }
    catch (x) { toast({ tone: 'error', title: errMsg(x) }); }
    setBusy(false);
  };
  const act = async (fn, ok) => { setBusy(true); try { await fn(); if (ok) toast({ title: ok }); refresh(); } catch (x) { toast({ tone: 'error', title: x.code === 'asset_in_use' ? 'الصورة مستخدمة في أقسام. استبدلها أو شيلها الأول.' : x.message }); } setBusy(false); };
  const generation = data?.generation;

  return (
    <div className="space-y-5">
      <PageHeader title="مكتبة صور الأقسام" subtitle="الصورة بتتحفظ مرة واحدة على Cloudflare R2 وبتتستخدم في الموقع كله. مفيش رفع ولا توليد بيحصل وقت تصفح العملاء." />

      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <Skeleton className="h-28 w-full" /> : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[['كل الأقسام', sum.total, 'all'], ['له صورة', sum.ok, 'ok'], ['من غير صورة', sum.missing, 'missing'], ['صورة قديمة', sum.legacy, 'legacy'], ['صورة مفقودة', sum.broken, 'broken']].map(([l, n, k]) => (
              <button key={k} type="button" onClick={() => { setTab('sections'); setStatus(k); }} className="rounded-2xl border border-line bg-elevated p-4 text-start transition hover:border-brand">
                <span className="block text-2xl font-black tabular">{fmtNum(n)}</span><span className="text-xs text-muted">{l}</span>
              </button>
            ))}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-fg/10"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${sum.total ? (sum.ok / sum.total) * 100 : 0}%` }} /></div>

          <Panel title="رفع الصور" subtitle="الملف بيتربط بالقسم لو اسمه = الـ slug أو الاسم الإنجليزي أو العربي (مثال: modest_open_abayas.jpg). الملفات اللي مفيش لها قسم بتتحفظ في المكتبة.">
            <div className="flex flex-wrap items-center gap-2">
              <input ref={filesRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" onChange={(e) => { bulk(e.target.files); e.target.value = ''; }} />
              <input ref={folderRef} type="file" multiple className="sr-only" onChange={(e) => { bulk(e.target.files); e.target.value = ''; }} />
              <Button icon={Upload} loading={busy} onClick={() => filesRef.current?.click()}>رفع صور</Button>
              <Button variant="secondary" icon={FolderUp} disabled={busy} onClick={() => folderRef.current?.click()}>رفع مجلد كامل</Button>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} /> استبدل الصور الموجودة</label>
              <Button variant="secondary" icon={Link2Off} disabled={busy} onClick={async () => { setBusy(true); try { setLinks(await adminApi('/image-library/check-links', { method: 'POST' })); } catch (x) { toast({ tone: 'error', title: x.message }); } setBusy(false); }}>افحص الروابط</Button>
              <Badge tone={generation?.configured ? 'success' : 'neutral'}>{generation?.configured ? `التوليد شغال (${generation.provider})` : 'التوليد غير مفعّل (الرفع متاح)'}</Badge>
            </div>
            {links && <p className="mt-3 text-sm">{links.broken.length ? `روابط مكسورة: ${links.broken.map((b) => b.slug).join('، ')}` : 'كل الروابط الخارجية سليمة.'}</p>}
            {report && (
              <div className="mt-4 max-h-64 overflow-y-auto rounded-xl border border-line">
                <p className="border-b border-line bg-fg/[0.03] px-3 py-2 text-sm font-semibold">اتربط {report.summary.assigned} · من غير قسم {report.summary.unmatched} · اتخطى {report.summary.skipped} · فشل {report.summary.failed} · مكرر {report.summary.duplicates}</p>
                {report.results.map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 border-b border-line/60 px-3 py-1.5 text-xs last:border-0">
                    <span className="truncate" dir="ltr">{r.filename}</span>
                    <span className="flex shrink-0 items-center gap-2">{r.duplicate && <Badge tone="info" size="sm">نفس الصورة موجودة</Badge>}{r.department && <span className="text-muted" dir="ltr">{r.department}</span>}<Badge tone={(RESULT[r.status] || RESULT.failed)[0]} size="sm">{r.status === 'failed' ? errMsg({ code: r.error, message: r.message }) : (RESULT[r.status] || RESULT.failed)[1]}</Badge></span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <FilterTabs value={tab} onChange={setTab} options={[{ value: 'sections', label: 'الأقسام', count: items.length }, { value: 'review', label: 'التوليد والمراجعة', count: generation?.pending ?? undefined }, { value: 'library', label: 'المكتبة', count: assetsQ.data?.assets?.length }, { value: 'duplicates', label: 'مكررات' }]} />

          {tab === 'sections' && (
            <Panel>
              <div className="mb-3 flex flex-wrap gap-2">
                <div className="relative min-w-52 flex-1"><Search className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-muted" /><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="ابحث باسم القسم أو الـ slug" className="h-10 w-full rounded-xl border border-line bg-elevated ps-9 pe-3 text-sm" /></div>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-xl border border-line bg-elevated px-3 text-sm">
                  <option value="all">كل الحالات</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <ul className="divide-y divide-line">
                {visible.map((it) => (
                  <li key={it.slug} className="flex flex-wrap items-center gap-3 py-2.5" style={{ paddingInlineStart: `${it.level * 14}px` }}>
                    <Thumb url={it.asset?.urls?.thumb || it.legacy_url} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{it.name.ar} <span className="font-normal text-muted" dir="ltr">{it.slug}</span></p>
                      <p className="truncate text-xs text-muted">{it.level === 0 ? 'قسم رئيسي' : nameOf(it)}{it.asset ? ` · ${it.asset.width}×${it.asset.height} · ${kb(it.asset.bytes)}` : ''}</p>
                    </div>
                    <Badge tone={STATUS[it.status].tone} size="sm">{STATUS[it.status].label}</Badge>
                    <div className="flex items-center gap-1.5">
                      <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-surface px-3 text-xs font-semibold ring-1 ring-line hover:bg-fg/[0.06]">
                        <ImagePlus className="h-3.5 w-3.5" />{it.status === 'ok' ? 'استبدال' : 'رفع'}
                        <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" disabled={busy} onChange={(e) => { replace(it, e.target.files?.[0]); e.target.value = ''; }} />
                      </label>
                      <Button size="xs" variant="secondary" icon={Images} onClick={() => setPicker(it)}>من المكتبة</Button>
                      {generation?.configured && <Button size="xs" variant="secondary" icon={Sparkles} onClick={() => setGen(it)}>{it.has_pending_candidate ? 'صورة مستنية' : 'توليد'}</Button>}
                      {it.status !== 'missing' && <Button size="xs" variant="danger-ghost" icon={Trash2} aria-label="شيل الصورة" disabled={busy} onClick={() => act(() => adminApi('/image-library/unassign', { method: 'POST', body: { slug: it.slug } }), 'اتشالت من القسم (فضلت في المكتبة)')} />}
                    </div>
                  </li>
                ))}
                {!visible.length && <li className="py-8 text-center text-sm text-muted">مفيش أقسام بالفلتر ده.</li>}
              </ul>
            </Panel>
          )}

          {tab === 'review' && <ReviewPanel items={items} generation={generation} onChanged={refresh} />}

          {tab === 'library' && (
            <Panel>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                {(assetsQ.data?.assets || []).map((a) => (
                  <div key={a.id} className="overflow-hidden rounded-xl border border-line">
                    <img src={a.urls.card} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                    <div className="space-y-1 p-2 text-xs">
                      <p className="truncate font-semibold" dir="ltr">{a.filename || `#${a.id}`}</p>
                      <p className="text-muted">{a.width}×{a.height} · {kb(a.bytes)} · {a.format.toUpperCase()}</p>
                      <p className="text-muted">{a.used_by.length ? `مستخدمة في: ${a.used_by.map((u) => u.name.ar).join('، ')}` : 'غير مستخدمة'}</p>
                      <Button size="xs" variant="danger-ghost" icon={Trash2} disabled={busy || a.used_by.length > 0} onClick={() => act(() => adminApi(`/image-library/assets/${a.id}`, { method: 'DELETE' }), 'اتمسحت من المكتبة')}>مسح</Button>
                    </div>
                  </div>
                ))}
                {!(assetsQ.data?.assets || []).length && <p className="col-span-full py-8 text-center text-sm text-muted">المكتبة فاضية. ارفع صور من فوق.</p>}
              </div>
            </Panel>
          )}

          {tab === 'duplicates' && (
            <Panel title="الصور المتكررة" subtitle="الملف المطابق تمامًا بيترفض أوتوماتيك. الصور المتشابهة جدًا (نفس الصورة بحجم أو ضغط مختلف) بتظهر هنا للمراجعة.">
              <div className="space-y-4 text-sm">
                <div><h3 className="mb-1 font-bold"><Copy className="me-1 inline h-4 w-4" />صور بتتستخدم في أكتر من قسم</h3>
                  {(dupQ.data?.reused || []).length ? dupQ.data.reused.map((r) => <p key={r.asset_id} className="text-muted">صورة #{r.asset_id}: <span dir="ltr">{r.departments.join('، ')}</span></p>) : <p className="text-muted">مفيش.</p>}</div>
                <div><h3 className="mb-1 font-bold">صور متشابهة جدًا</h3>
                  {(dupQ.data?.near_duplicates || []).length ? dupQ.data.near_duplicates.map((p, i) => <p key={i} className="text-muted">#{p.a} و #{p.b} (فرق {p.distance})</p>) : <p className="text-muted">مفيش.</p>}</div>
              </div>
            </Panel>
          )}
        </>
      )}

      <AssetPicker open={!!picker} onClose={() => setPicker(null)} assets={assetsQ.data?.assets} onPick={(a) => { const it = picker; setPicker(null); act(() => adminApi('/image-library/assign', { method: 'POST', body: { slug: it.slug, asset_id: a.id } }), 'اتربطت بالقسم'); }} />
      <GenerateSheet item={gen} onClose={() => setGen(null)} onDone={refresh} />
    </div>
  );
}
