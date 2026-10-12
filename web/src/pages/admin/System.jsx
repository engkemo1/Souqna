import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, Download, DatabaseBackup, Sparkles, Search, Plus, Trash2, HardDrive, Database, Cloud } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { PageHeader, Panel } from '../../components/dash/Kit.jsx';
import { Switch, Input, Textarea, Select } from '../../components/ui/Field.jsx';
import { ErrorState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { useAdminApi, adminApi, adminUpload, adminKey, adminSession, fmtDateTime, fmtMoney } from './adminApi.js';

const uptime = (s) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return [d && `${d} يوم`, h && `${h} ساعة`, `${m} دقيقة`].filter(Boolean).join(' ') ; };

function VisualPanel() {
  const toast = useToast();
  const { data, reload } = useAdminApi('/visual');
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  if (data && !f) setF({ enabled: data.enabled, model: data.model, dailyFree: String(data.dailyFree) });
  if (!data || !f) return <Panel title="البحث بالصورة"><Skeleton className="h-40 w-full" /></Panel>;
  const dirty = f.enabled !== data.enabled || f.model !== data.model || Number(f.dailyFree) !== data.dailyFree;
  const save = async () => {
    setBusy(true);
    try { await adminApi('/visual', { method: 'PUT', body: { enabled: f.enabled, model: f.model, dailyFree: Number(f.dailyFree) || 0 } }); toast({ title: 'اتحفظ' }); setF(null); reload(); }
    catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy(false);
  };
  const idx = data.indexed || {};
  const P = data.providers || {};
  const jinaReady = Boolean(P.jina?.configured);
  const OPTS = [
    ['color', 'مقارنة الألوان والشكل', 'مجاني وبيخلي الصور داخل سيرفر بنها. مناسب للألوان والتشابه العام، لكنه مش بيفهم نوع القطعة بدقة.', true],
    ['jina', 'فهم بصري ذكي (Jina)', 'يقارن الصورة بمعناها البصري، وده الاختيار الأفضل لتقليل نتائج الملابس غير المشابهة. يحتاج مفتاح Jina.', jinaReady],
  ];
  const Opt = ({ id, title, body, available }) => {
    return (
      <button type="button" disabled={!available} onClick={() => setF({ ...f, model: id })} aria-pressed={f.model === id}
        className={`rounded-xl border p-3 text-start transition disabled:cursor-not-allowed disabled:opacity-60 ${f.model === id ? 'border-fg bg-secondary' : 'border-line-strong hover:border-fg'}`}>
        <p className="font-semibold">{title}</p><p className="mt-0.5 text-[12.5px] text-muted">{body}</p>
        {id === 'jina' && !available && <p className="mt-1.5 text-[12px] font-medium text-sale">أضف <span dir="ltr">JINA_API_KEY</span> في Railway لتفعيل الاختيار.</p>}
      </button>
    );
  };
  return (
    <Panel title="البحث بالصورة" subtitle="«صوّرها ولاقيها في بنها»" className="lg:col-span-2">
      <div className="space-y-4">
        <Switch checked={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} label="تفعيل البحث بالصورة للزباين" description="لو اتقفل، الزرار بيختفي من الموقع والبحث بيتوقف." />
        <div>
          <p className="mb-2 text-sm font-medium">نوع التحليل</p>
          <div className="grid gap-2 sm:grid-cols-2">{OPTS.map(([id, title, body, available]) => <Opt key={id} id={id} title={title} body={body} available={available} />)}</div>
          <p className="mt-2 text-[12.5px] text-muted">اختيار Jina يرسل صور المنتجات وصور البحث إلى خدمة Jina لتحليلها، وتُعاد فهرسة صور المنتجات على دفعات في الخلفية. لن يتم إرسال الصور عند اختيار مقارنة الألوان. راجع سياسة الخصوصية قبل تشغيل الخدمة.</p>
        </div>
        <label className="block max-w-xs"><span className="mb-1.5 block text-sm font-medium">عمليات بحث مجانية لكل زائر في اليوم</span>
          <Input type="number" dir="ltr" min={0} max={1000} value={f.dailyFree} onChange={(e) => setF({ ...f, dailyFree: e.target.value })} className="text-start" />
          <span className="mt-1 block text-[12px] text-muted">0 = من غير حد. ده الأساس لو حبينا نعمل باقة مدفوعة بعدين.</span></label>
        <div className="flex flex-wrap items-center gap-3"><Button onClick={save} loading={busy} disabled={!dirty}>حفظ</Button>{dirty && <span className="text-[13px] text-muted">في تغييرات لسه ما اتحفظتش</span>}</div>
        <dl className="grid gap-2 border-t border-line pt-4 text-sm sm:grid-cols-2">
          {[['مفهرس بمقارنة الألوان', idx['color-v1'] || 0], ['مفهرس بالتحليل الذكي', idx['jina-embeddings-v5-omni-nano'] || 0], ['منتجات تنتظر الفهرسة', data.pending || 0], ['إجمالي المنتجات النشطة', data.total],
            ['حالة مفتاح Jina', jinaReady ? 'متصل' : 'غير مضاف']].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="font-medium" dir="auto">{v}</dd></div>
          ))}
        </dl>
      </div>
    </Panel>
  );
}

function StylistPanel() {
  const toast = useToast();
  const { data, reload } = useAdminApi('/stylist');
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  if (data && !f) setF({ enabled: data.enabled, provider: data.provider, dailyFree: String(data.dailyFree), nameAr: data.name.ar, nameEn: data.name.en });
  if (!data || !f) return <Panel title="المساعد الذكي"><Skeleton className="h-40 w-full" /></Panel>;
  const dirty = f.enabled !== data.enabled || f.provider !== data.provider || Number(f.dailyFree) !== data.dailyFree || f.nameAr !== data.name.ar || f.nameEn !== data.name.en;
  const save = async () => {
    setBusy(true);
    try { const saved = await adminApi('/stylist', { method: 'PUT', body: { enabled: f.enabled, provider: f.provider, dailyFree: Number(f.dailyFree) || 0, nameAr: f.nameAr, nameEn: f.nameEn } }); window.dispatchEvent(new CustomEvent('stylist-settings-updated', { detail: { name: saved.name } })); toast({ title: 'اتحفظ' }); setF(null); reload(); }
    catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy(false);
  };
  const PROV = [['cloudflare', 'Llama على Cloudflare', 'فيه 10,000 Neurons مجاناً كل يوم؛ على الخطة المجانية الطلبات بتقف بعد استهلاكها. أقل دقة شوية في العربي.', 'CF_AI_TOKEN'], ['anthropic', 'Claude (Anthropic)', 'أدق في فهم العامية المصرية، لكنه مدفوع حسب الاستخدام.', 'ANTHROPIC_API_KEY']];
  return (
    <Panel title="المساعد الذكي" subtitle="بيرشّح لوك كامل من منتجات المحلات الحقيقية (نص أو صوت)" className="lg:col-span-2">
      <div className="space-y-4">
        <Switch checked={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} label="تفعيل المساعد للزباين" description="لو اتقفل، زرار المساعد بيختفي من الموقع." />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1.5 block text-sm font-medium">اسم المساعد (عربي)</span><Input value={f.nameAr} maxLength={20} onChange={(e) => setF({ ...f, nameAr: e.target.value })} /></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium">اسم المساعد (إنجليزي)</span><Input dir="ltr" value={f.nameEn} maxLength={20} onChange={(e) => setF({ ...f, nameEn: e.target.value })} className="text-start" /></label>
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-line-strong p-3">
          <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-secondary"><img src={data.avatar || '/moda/moda.webp'} alt="" className="h-full w-full object-contain" /></div>
          <div className="min-w-0">
            <p className="text-sm font-medium">صورة {data.name.ar}</p>
            <p className="mt-0.5 text-[12.5px] text-muted">الصورة الافتراضية متحركة بالكامل (رمش، كلام، عيون بتتابعك). لو رفعت صورة تانية هتتحرك حركة أبسط (تنفّس وميلان وتموّجات) لأن الرمش والكلام متظبطين على الصورة الافتراضية بس.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center rounded-full border border-line-strong px-3.5 py-1.5 text-[13px] font-semibold hover:border-fg">رفع صورة
                <input type="file" accept="image/*" hidden onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; setBusy(true); try { await adminUpload('/stylist/avatar', file); toast({ title: 'اتغيرت الصورة' }); setF(null); reload(); } catch (x) { toast({ tone: 'error', title: x.code === 'image_too_small' ? 'الصورة صغيرة (200 بكسل على الأقل)' : x.message }); } setBusy(false); }} /></label>
              {data.avatar && <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await adminApi('/stylist/avatar', { method: 'DELETE' }); setF(null); reload(); } catch (x) { toast({ tone: 'error', title: x.message }); } setBusy(false); }} className="rounded-full border border-line-strong px-3.5 py-1.5 text-[13px] font-semibold hover:border-fg">رجّع الافتراضية</button>}
            </div>
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">الموديل اللي بيفهم الكلام</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {PROV.map(([id, title, body, need]) => {
              const miss = !data.providers[id].configured;
              return (
                <button key={id} type="button" disabled={miss} onClick={() => setF({ ...f, provider: id })} aria-pressed={f.provider === id}
                  className={'rounded-xl border p-3 text-start transition ' + (f.provider === id ? 'border-fg bg-secondary' : 'border-line-strong hover:border-fg') + (miss ? ' cursor-not-allowed opacity-60' : '')}>
                  <p className="font-semibold">{title}</p><p className="mt-0.5 text-[12.5px] text-muted">{body}</p>
                  {miss && <p className="mt-1.5 text-[12px] font-medium text-sale">محتاج متغير <span dir="ltr">{need}</span> في Railway{id === 'cloudflare' ? ' (و CF_ACCOUNT_ID أو R2_ACCOUNT_ID)' : ''}</p>}
                </button>
              );
            })}
          </div>
        </div>
        <label className="block max-w-xs"><span className="mb-1.5 block text-sm font-medium">رسايل مجانية لكل زائر في اليوم</span>
          <Input type="number" dir="ltr" min={0} max={1000} value={f.dailyFree} onChange={(e) => setF({ ...f, dailyFree: e.target.value })} className="text-start" />
          <span className="mt-1 block text-[12px] text-muted">0 = من غير حد لكل زائر؛ خلي رقم صغير عشان تتحكم في الاستهلاك.</span></label>
        <div className="flex flex-wrap items-center gap-3"><Button onClick={save} loading={busy} disabled={!dirty} icon={Sparkles}>حفظ</Button>{dirty && <span className="text-[13px] text-muted">في تغييرات لسه ما اتحفظتش</span>}</div>
        {data.lastError && <p className="rounded-xl bg-sale/10 px-3 py-2 text-[13px] text-sale" dir="auto">آخر خطأ من الموديل: {data.lastError}</p>}
      </div>
    </Panel>
  );
}

function ModaTestLabPanel() {
  const toast = useToast();
  const { data, reload } = useAdminApi('/stylist/lab');
  const [form, setForm] = useState({ name: '', message: '', expectedGarment: '', expectedAudience: '', maxBudget: '' });
  const [result, setResult] = useState(null);
  const [correction, setCorrection] = useState('');
  const [busy, setBusy] = useState('');
  const field = 'w-full rounded-xl border border-line-strong bg-elevated px-3 py-2 text-sm';
  const run = async (values = form) => {
    if (values.message.trim().length < 2) return;
    setBusy('run'); setResult(null);
    try { setResult(await adminApi('/stylist/lab/run', { method: 'POST', body: { ...values, maxBudget: values.maxBudget ? Number(values.maxBudget) : null } })); }
    catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy('');
  };
  const saveScenario = async () => {
    setBusy('save');
    try {
      await adminApi('/stylist/lab/scenarios', { method: 'POST', body: { ...form, maxBudget: form.maxBudget ? Number(form.maxBudget) : null } });
      toast({ title: 'اتحفظ السيناريو' }); reload();
    } catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy('');
  };
  const removeScenario = async (id) => {
    setBusy(id);
    try { await adminApi('/stylist/lab/scenarios/' + encodeURIComponent(id), { method: 'DELETE' }); toast({ title: 'اتحذف السيناريو' }); reload(); }
    catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy('');
  };
  const saveCorrection = async () => {
    if (correction.trim().length < 10) return;
    setBusy('lesson');
    try {
      await adminApi('/stylist/training/lessons', { method: 'POST', body: {
        topic: 'تصحيح من استوديو اختبار مودة', question: form.message.trim(), answer: correction.trim(),
        tags: `استوديو الاختبار، ${form.expectedGarment || ''}`.slice(0, 160),
      } });
      toast({ title: 'اتحفظ التصحيح كدرس لمودة' }); setCorrection('');
    } catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy('');
  };
  const chooseScenario = (item) => {
    const next = { name: item.name || '', message: item.message || '', expectedGarment: item.expectedGarment || '', expectedAudience: item.expectedAudience || '', maxBudget: item.maxBudget ? String(item.maxBudget) : '' };
    setForm(next); setCorrection(''); run(next);
  };
  return (
    <Panel title="استوديو اختبار مودة" subtitle="جرّبوا كلام الزباين على المنتجات الحقيقية، راجعوا فهم مودة، واحفظوا التصحيح كدرس" className="lg:col-span-2">
      <div className="space-y-4">
        <p className="rounded-xl border border-brand/20 bg-brand/5 p-3 text-sm leading-relaxed text-muted">الاختبار يستخدم محرك مودة والكتالوج الحالي مباشرة، من غير استدعاء Cloudflare أو أي موديل مدفوع. السيناريو المحفوظ يفضل متاحًا للمراجعة بعدين.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs font-medium text-muted">اسم السيناريو (اختياري)</span><Input maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: تمييز كوتشي من كوتش" /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-muted">القطعة المتوقع فهمها</span><select className={field} value={form.expectedGarment} onChange={(e) => setForm({ ...form, expectedGarment: e.target.value })}><option value="">من غير توقع</option>{(data?.garments || []).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-muted">الطلب لمين؟ (اختياري)</span><select className={field} value={form.expectedAudience} onChange={(e) => setForm({ ...form, expectedAudience: e.target.value })}><option value="">من غير توقع</option><option value="women">حريمي</option><option value="women_hijab">محجبة</option><option value="men">رجالي</option><option value="boys">ولد</option><option value="girls">بنت</option></select></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-muted">أقصى ميزانية (اختياري، جنيه)</span><Input type="number" min={1} max={1000000} value={form.maxBudget} onChange={(e) => setForm({ ...form, maxBudget: e.target.value })} placeholder="مثال: 2000" /></label>
        </div>
        <label className="block"><span className="mb-1 block text-xs font-medium text-muted">رسالة الزبون</span><Textarea rows={2} maxLength={400} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="مثال: عايزة كوتشي أبيض يمشي مع بنطلون جينز" /></label>
        <div className="flex flex-wrap gap-2"><Button size="sm" icon={Sparkles} loading={busy === 'run'} disabled={form.message.trim().length < 2 || !!busy} onClick={() => run()}>اختبر مودة</Button><Button size="sm" variant="outline" icon={Plus} loading={busy === 'save'} disabled={form.message.trim().length < 2 || !!busy} onClick={saveScenario}>احفظ السيناريو</Button></div>
        {result && <section className="space-y-3 rounded-2xl border border-line bg-canvas/50 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">نتيجة الاختبار · {({ shop: 'اقتراح منتجات', clarify: 'طلب توضيح', chat: 'رد محادثة', none: 'من غير منتجات', partial: 'اقتراح جزئي', full: 'اقتراح كامل', over_budget: 'فوق الميزانية', alternatives: 'بدائل' })[result.state] || result.state}</h3><span className={'rounded-full px-3 py-1 text-xs font-semibold ' + (result.passed === null ? 'bg-secondary text-muted' : result.passed ? 'bg-emerald-600/10 text-emerald-700' : 'bg-sale/10 text-sale')}>{result.passed === null ? 'مفيش قواعد مقارنة' : result.passed ? 'الاختبار ناجح' : 'محتاج مراجعة'}</span></div>
          <p className="rounded-xl bg-elevated p-3 text-sm leading-relaxed">{result.say}</p>
          <div className="grid gap-2 text-sm sm:grid-cols-2"><p><span className="text-muted">القطع اللي فهمها:</span> {result.parsed.garments.length ? result.parsed.garments.map((g) => data?.garments?.find((item) => item.key === g.key)?.label || g.text || g.key).join('، ') : 'مفهمتش قطعة محددة'}</p><p><span className="text-muted">الشخص:</span> {result.parsed.persons.join('، ') || 'غير محدد'}</p></div>
          {result.checks.length > 0 && <ul className="space-y-1.5">{result.checks.map((check) => <li key={check.id} className="flex items-center justify-between gap-3 rounded-lg border border-line p-2 text-sm"><span>{check.label}{check.id === 'budget' ? ` · المتوقع حتى ${check.expected} جنيه، الفعلي ${check.actual ?? 'غير متاح'}` : ''}</span><strong className={check.passed ? 'text-emerald-700' : 'text-sale'}>{check.passed ? 'تمام' : 'راجع'}</strong></li>)}</ul>}
          {result.selected.length > 0 ? <div><p className="mb-1 text-xs font-medium text-muted">المنتجات التي رشحها من الكتالوج · الإجمالي {result.total?.toLocaleString('ar-EG')} جنيه</p><ul className="space-y-1">{result.selected.map((item, i) => <li key={`${item.key}-${i}`} className="flex justify-between gap-3 rounded-lg bg-elevated px-3 py-2 text-sm"><span>{item.name || item.label || item.key}{item.store ? ` · ${item.store}` : ''}</span><span className="shrink-0">{item.price != null ? `${Number(item.price).toLocaleString('ar-EG')} ج.م` : ''}</span></li>)}</ul></div> : <p className="text-sm text-muted">مفيش منتجات متاحة للطلب ده حاليًا.</p>}
          <div className="space-y-2 border-t border-line pt-3"><Textarea rows={2} maxLength={1000} value={correction} onChange={(e) => setCorrection(e.target.value)} placeholder="لو النتيجة غلط، اكتب التصحيح اللي مودة تتعلمه…" /><Button size="sm" loading={busy === 'lesson'} disabled={correction.trim().length < 10 || !!busy} onClick={saveCorrection}>احفظ التصحيح كدرس</Button></div>
        </section>}
        {data?.scenarios?.length > 0 && <section className="space-y-2 border-t border-line pt-3"><h3 className="font-semibold">السيناريوهات المحفوظة ({data.scenarios.length})</h3>{data.scenarios.map((item) => <article key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3"><button type="button" disabled={!!busy} onClick={() => chooseScenario(item)} className="min-w-0 flex-1 text-start"><p className="truncate text-sm font-medium">{item.name}</p><p className="truncate text-xs text-muted">{item.message}</p></button><button type="button" disabled={!!busy} aria-label="حذف السيناريو" onClick={() => removeScenario(item.id)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line-strong text-muted hover:border-sale hover:text-sale disabled:opacity-50"><Trash2 className="h-4 w-4" /></button></article>)}</section>}
      </div>
    </Panel>
  );
}

function ModaTrainingPanel() {
  const toast = useToast();
  const { data, reload } = useAdminApi('/stylist/training');
  const { data: feedbackData, reload: reloadFeedback } = useAdminApi('/stylist/feedback');
  const [guidance, setGuidance] = useState('');
  const [baseline, setBaseline] = useState(null);
  const [busy, setBusy] = useState('');
  const [lessonForm, setLessonForm] = useState({ topic: '', question: '', answer: '', tags: '' });
  const [feedbackAnswers, setFeedbackAnswers] = useState({});
  useEffect(() => {
    if (!data || baseline !== null) return;
    setGuidance(data.guidance || '');
    setBaseline(data.guidance || '');
  }, [data, baseline]);
  useEffect(() => {
    const refresh = () => reload();
    window.addEventListener('stylist-training-updated', refresh);
    return () => window.removeEventListener('stylist-training-updated', refresh);
  }, [reload]);
  if (!data || baseline === null) return <Panel title="تعليم مودة"><Skeleton className="h-40 w-full" /></Panel>;
  const save = async () => {
    setBusy('save');
    try {
      await adminApi('/stylist/training', { method: 'PUT', body: { guidance } });
      setBaseline(guidance);
      toast({ title: 'مودة حفظت توجيه الذوق' });
      reload();
    } catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy('');
  };
  const remove = async (id) => {
    setBusy(id);
    try { await adminApi('/stylist/training/examples/' + encodeURIComponent(id), { method: 'DELETE' }); toast({ title: 'اتحذف المثال من تعليم مودة' }); reload(); }
    catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy('');
  };
  const addLesson = async (event) => {
    event.preventDefault();
    setBusy('lesson');
    try {
      const result = await adminApi('/stylist/training/lessons', { method: 'POST', body: lessonForm });
      setLessonForm({ topic: '', question: '', answer: '', tags: '' });
      toast({ title: result.added ? 'مودة حفظت الدرس وهتستفيد منه في الأسئلة المشابهة' : 'الدرس ده موجود عند مودة بالفعل' });
      reload();
    } catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy('');
  };
  const removeLesson = async (id) => {
    setBusy(id);
    try { await adminApi('/stylist/training/lessons/' + encodeURIComponent(id), { method: 'DELETE' }); toast({ title: 'اتحذف الدرس من تعليم مودة' }); reload(); }
    catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy('');
  };
  const dismissFeedback = async (id) => {
    setBusy(id);
    try { await adminApi('/stylist/feedback/' + encodeURIComponent(id), { method: 'DELETE' }); toast({ title: 'الملاحظة اتحذفت من المراجعة' }); reloadFeedback(); }
    catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy('');
  };
  const teachFeedback = async (item) => {
    const answer = String(feedbackAnswers[item.id] || '').trim();
    if (answer.length < 10) return;
    setBusy(item.id);
    try {
      await adminApi('/stylist/feedback/' + encodeURIComponent(item.id) + '/lesson', { method: 'POST', body: { answer } });
      toast({ title: 'مودة اتعلمت من الدرس المعتمد' });
      setFeedbackAnswers((all) => { const next = { ...all }; delete next[item.id]; return next; });
      reload(); reloadFeedback();
    } catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy('');
  };
  const audienceName = { women: 'حريمي', men: 'رجالي', kids: 'أطفال' };
  return (
    <Panel title="تعليم مودة" subtitle="اختياراتك المعتمدة وتوجيهك بيفضلوا محفوظين وبيساعدوا مودة في اقتراحاتها الجديدة" className="lg:col-span-2">
      <div className="space-y-4">
        <div className="rounded-xl border border-brand/20 bg-brand/5 p-3 text-sm leading-relaxed text-muted">هنا بنحفظ قواعد الذوق ودروس الخبير وأمثلة الأوتفيتات. دي بتساعد مسار الردود اللي بيستخدم نموذج ذكاء؛ ترشيح المنتجات الأساسي بيتحدد من نوع المنتج ودرجة رسميته وقواعد التنسيق. لو نوع قطعة متصنف غلط، صحّح اسمها أو قسمها في بيانات المنتج.</div>
        <section className="space-y-3 rounded-2xl border border-line bg-canvas/50 p-3 sm:p-4">
          <div><h3 className="font-semibold">ملاحظات الزباين على اقتراحات مودة</h3><p className="mt-1 text-xs text-muted">راجعوا الأسباب، واكتبوا الإجابة اللي شايفينها صح قبل ما تتحول الملاحظة لدرس تتعلم منه.</p></div>
          {feedbackData?.items?.length ? feedbackData.items.map((item) => <article key={item.id} className="space-y-2 rounded-xl border border-line bg-elevated p-3">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs text-muted">{item.rating === 'good' ? 'تقييم إيجابي' : 'محتاج مراجعة'}{item.reason ? ` · ${{ mismatch: 'القطع مش متناسقة', color: 'الألوان', occasion: 'المناسبة', price: 'السعر أو الميزانية', fit: 'المقاس أو الراحة', other: 'سبب آخر' }[item.reason] || item.reason}` : ''} · {new Date(item.createdAt).toLocaleDateString('ar-EG')}</p><p className="mt-1 text-sm font-medium">طلب الزبون: {item.question}</p>{item.reply && <p className="mt-1 text-sm text-muted">رد مودة: {item.reply}</p>}{item.items?.length > 0 && <p className="mt-1 text-xs text-muted">القطع: {item.items.join('، ')}</p>}{item.note && <p className="mt-1 text-sm text-muted">ملاحظة: {item.note}</p>}</div>
              <button type="button" disabled={!!busy} onClick={() => dismissFeedback(item.id)} className="shrink-0 rounded-lg border border-line-strong px-2.5 py-1.5 text-xs text-muted hover:border-sale hover:text-sale">حذف</button></div>
            {item.rating === 'bad' && <><Textarea rows={2} maxLength={1000} value={feedbackAnswers[item.id] || ''} onChange={(e) => setFeedbackAnswers((all) => ({ ...all, [item.id]: e.target.value }))} placeholder="اكتبوا نصيحة التنسيق الصحيحة عشان تتحفظ كدرس معتمد…" />
              <Button size="sm" loading={busy === item.id} disabled={(feedbackAnswers[item.id] || '').trim().length < 10 || !!busy} onClick={() => teachFeedback(item)}>حوّلها لدرس لمودة</Button></>}
          </article>) : <p className="text-sm text-muted">مفيش ملاحظات جديدة لحد دلوقتي.</p>}
        </section>
        <label className="block"><span className="mb-1.5 block text-sm font-medium">قواعد الذوق اللي عايز مودة تلتزم بيها</span><Textarea rows={3} maxLength={1600} value={guidance} onChange={(e) => setGuidance(e.target.value)} placeholder="مثال: اختاري ألوان متناسقة ومناسبة للمناسبة، وراعي الاحتشام والعمر، وما تقترحيش قطع مش راكبة على بعض." /></label>
        <div className="flex flex-wrap items-center gap-3"><Button onClick={save} loading={busy === 'save'} disabled={guidance === baseline}>حفظ التوجيه</Button><span className="text-xs text-muted">{data.lessons.length} درس و{data.examples.length} أوتفيت محفوظين لمودة</span></div>
        <form onSubmit={addLesson} className="space-y-3 rounded-2xl border border-line bg-canvas/50 p-3 sm:p-4">
          <h3 className="font-semibold">علّمها سؤال وإجابة خبير</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-1 block text-xs font-medium text-muted">الموضوع (اختياري)</span><Input maxLength={80} value={lessonForm.topic} onChange={(e) => setLessonForm({ ...lessonForm, topic: e.target.value })} placeholder="تنسيق ألوان، لبس مقابلة، ميزانية…" /></label>
            <label className="block"><span className="mb-1 block text-xs font-medium text-muted">كلمات تساعد مودة تلاقي الدرس (اختياري)</span><Input maxLength={160} value={lessonForm.tags} onChange={(e) => setLessonForm({ ...lessonForm, tags: e.target.value })} placeholder="كحلي، بيج، فرح، ١٥٠٠ جنيه…" /></label>
          </div>
          <label className="block"><span className="mb-1 block text-xs font-medium text-muted">السؤال أو الموقف</span><Textarea required rows={2} minLength={4} maxLength={400} value={lessonForm.question} onChange={(e) => setLessonForm({ ...lessonForm, question: e.target.value })} placeholder="مثال: أعمل طقم كامل لفرح بميزانية ١٥٠٠ جنيه؟" /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-muted">الإجابة اللي تحب مودة تتعلم منها</span><Textarea required rows={3} minLength={10} maxLength={1000} value={lessonForm.answer} onChange={(e) => setLessonForm({ ...lessonForm, answer: e.target.value })} placeholder="اكتب نصيحة خبير واضحة، ووضح القطع الأساسية وإزاي نوازن الميزانية…" /></label>
          <Button type="submit" size="sm" icon={Plus} loading={busy === 'lesson'} disabled={lessonForm.question.trim().length < 4 || lessonForm.answer.trim().length < 10}>حفظ الدرس</Button>
        </form>
        {data.lessons.length > 0 && <div className="space-y-2">
          <h3 className="font-semibold">دروس الأسئلة والإجابات</h3>
          {data.lessons.map((lesson) => <article key={lesson.id} className="flex min-w-0 items-start justify-between gap-3 rounded-xl border border-line p-3">
            <div className="min-w-0"><p className="font-semibold">{lesson.topic || lesson.question}</p><p className="mt-1 text-xs text-muted">س: {lesson.question}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">ج: {lesson.answer}</p>{lesson.tags && <p className="mt-1 text-xs text-muted">كلمات: {lesson.tags}</p>}</div>
            <button type="button" disabled={!!busy} aria-label="حذف الدرس" onClick={() => removeLesson(lesson.id)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line-strong text-muted hover:border-sale hover:text-sale disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
          </article>)}
        </div>}
        {data.examples.length > 0 ? <div className="space-y-2">
          {data.examples.map((example) => (
            <article key={example.id} className="flex min-w-0 items-start justify-between gap-3 rounded-xl border border-line p-3">
              <div className="min-w-0"><p className="font-semibold">{example.occasion} · {audienceName[example.audience] || 'فئة أخرى'}{example.age ? ` · ${example.age}` : ''}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{example.pieces.map((piece) => `${piece.role}: ${piece.nameAr || piece.nameEn}`).join('، ')}</p>
                {example.lesson && <p className="mt-1 text-xs text-muted">ذوق مودة: {example.lesson}</p>}
              </div>
              <button type="button" disabled={!!busy} aria-label="حذف المثال" onClick={() => remove(example.id)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line-strong text-muted hover:border-sale hover:text-sale disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
            </article>
          ))}
        </div> : <p className="text-sm text-muted">لسه مفيش أمثلة. من «لوك النهارده» اختار أوتفيت مناسب واضغط «علّم مودة منه» عشان يبدأ سجل ذوقها.</p>}
      </div>
    </Panel>
  );
}

const LOOK_OCCASIONS = ['أوتفيت خروجة', 'أوتفيت مقابلة شغل', 'أوتفيت سهرة', 'أوتفيت خطوبة', 'أوتفيت كتب كتاب', 'أوتفيت فرح', 'أوتفيت مناسبة خاصة', 'أوتفيت خروجة أطفال', 'أوتفيت عيد أطفال'];
const LOOK_PIECE_SUGGESTIONS = ['تيشيرت', 'قميص', 'بنطلون', 'فستان', 'جاكيت', 'حذاء', 'شنطة', 'كاب (إكسسوار)', 'طاقية (إكسسوار)'];
const blankOutfit = () => ({ audience: 'women', age: '', occasion: '', say: '', tips: '', pieces: [] });
function lookOfDayForm(data) {
  const manual = data.manual || {};
  return {
    mode: data.mode || 'ai',
    manual: { outfits: (manual.outfits || []).map((outfit) => ({
      audience: outfit.audience || 'women', age: outfit.age || '', say: outfit.say || '', tips: outfit.tips || '', occasion: outfit.occasion || '',
      pieces: (outfit.pieces || []).map((piece) => ({ label: piece.label || '', productId: piece.product ? piece.productId : null, product: piece.product || null })),
    })) },
  };
}

function LookProductPicker({ product, onChange }) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setItems([]); setBusy(false); return undefined; }
    let active = true;
    const id = setTimeout(() => {
      setBusy(true);
      adminApi('/look-of-day/products?q=' + encodeURIComponent(q))
        .then((result) => { if (active) setItems(result.items || []); })
        .catch(() => { if (active) setItems([]); })
        .finally(() => { if (active) setBusy(false); });
    }, 250);
    return () => { active = false; clearTimeout(id); };
  }, [query]);

  if (product) return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-brand/30 bg-secondary/40 p-2">
      {product.image?.base ? <img src={product.image.base + '/thumb.webp'} alt="" className="h-12 w-10 shrink-0 rounded-lg object-cover" /> : <span className="h-12 w-10 shrink-0 rounded-lg bg-secondary" />}
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{product.name?.ar || product.name?.en}</p><p className="truncate text-xs text-muted">{product.store?.name?.ar} · {fmtMoney(product.price)}</p></div>
      <button type="button" onClick={() => onChange(null)} className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-sale hover:bg-sale/10">تغيير</button>
    </div>
  );

  return (
    <div className="relative min-w-0">
      <div className="relative"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث باسم المنتج أو المحل" className="ps-9" /></div>
      {query.trim().length >= 2 && (
        <div className="mt-1 max-h-56 overflow-y-auto rounded-xl border border-line bg-elevated shadow-soft">
          {busy ? <p className="p-3 text-sm text-muted">بدور على المنتجات…</p> : items.length ? items.map((item) => (
            <button key={item.id} type="button" onClick={() => { onChange(item); setQuery(''); setItems([]); }} className="flex w-full min-w-0 items-center gap-2 border-b border-line p-2 text-start last:border-0 hover:bg-secondary/60">
              {item.image?.base ? <img src={item.image.base + '/thumb.webp'} alt="" className="h-12 w-10 shrink-0 rounded-lg object-cover" /> : <span className="h-12 w-10 shrink-0 rounded-lg bg-secondary" />}
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{item.name?.ar || item.name?.en}</span><span className="block truncate text-xs text-muted">{item.store?.name?.ar} · {fmtMoney(item.price)}</span></span>
            </button>
          )) : <p className="p-3 text-sm text-muted">مفيش منتجات متاحة بالبحث ده.</p>}
        </div>
      )}
    </div>
  );
}

function LookOfDayPanel() {
  const toast = useToast();
  const { data, error, reload } = useAdminApi('/look-of-day');
  const [f, setF] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState('');
  const [teachingIndex, setTeachingIndex] = useState(null);
  useEffect(() => {
    if (!data) return;
    const next = lookOfDayForm(data);
    setF(next);
    setBaseline(next);
  }, [data]);
  if (error && !data) return <Panel title="لوك النهارده"><ErrorState error={error} onRetry={reload} /></Panel>;
  if (!data || !f || !baseline) return <Panel title="لوك النهارده"><Skeleton className="h-48 w-full" /></Panel>;

  const dirty = JSON.stringify(f) !== JSON.stringify(baseline);
  const outfitReady = (outfit) => {
    const completePieces = outfit.pieces.filter((piece) => piece.label.trim() && piece.productId).length;
    const partialPieces = outfit.pieces.some((piece) => piece.label.trim() || piece.productId)
      && outfit.pieces.some((piece) => !piece.label.trim() || !piece.productId);
    return outfit.occasion.trim().length >= 2 && (outfit.audience !== 'kids' || outfit.age.trim().length > 0)
      && completePieces >= 2 && !partialPieces;
  };
  const touchesOutfit = (outfit) => outfit.occasion.trim() || outfit.age.trim() || outfit.say.trim() || outfit.tips.trim()
    || outfit.pieces.some((piece) => piece.label.trim() || piece.productId);
  const manualOutfits = f.manual.outfits.filter(touchesOutfit);
  const manualReady = manualOutfits.length > 0 && manualOutfits.every(outfitReady);
  const changeOutfit = (index, fn) => setF((current) => ({
    ...current,
    manual: { outfits: current.manual.outfits.map((outfit, i) => i === index ? fn(outfit) : outfit) },
  }));
  const save = async () => {
    setBusy(true);
    const manual = { outfits: manualOutfits.filter((outfit) => outfit.pieces.filter((piece) => piece.label.trim() && piece.productId).length >= 2)
      .map((outfit) => ({
        audience: outfit.audience, age: outfit.age.trim(), say: outfit.say.trim(), tips: outfit.tips.trim(), occasion: outfit.occasion.trim(),
        pieces: outfit.pieces.filter((piece) => piece.label.trim() && piece.productId).map((piece) => ({ label: piece.label.trim(), productId: Number(piece.productId) })),
      })) };
    try {
      const saved = await adminApi('/look-of-day', { method: 'PUT', body: { mode: f.mode, manual } });
      const next = lookOfDayForm(saved);
      setF(next); setBaseline(next);
      toast({ title: 'اتحفظ إعداد لوك النهارده' }); reload();
    } catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy(false);
  };
  const teachOutfit = async (index) => {
    const outfit = f.manual.outfits[index];
    if (!outfitReady(outfit)) return;
    setTeachingIndex(index);
    try {
      const result = await adminApi('/stylist/training/examples', { method: 'POST', body: {
        audience: outfit.audience, age: outfit.age.trim(), occasion: outfit.occasion.trim(),
        lesson: [outfit.say, outfit.tips].map((x) => x.trim()).filter(Boolean).join(' — '),
        pieces: outfit.pieces.filter((piece) => piece.label.trim() && piece.productId).map((piece) => ({ label: piece.label.trim(), productId: Number(piece.productId) })),
      } });
      window.dispatchEvent(new Event('stylist-training-updated'));
      toast({ title: result.added ? 'مودة اتعلمت من الأوتفيت ده' : 'مودة مسجلة الأوتفيت ده قبل كده' });
    } catch (x) { toast({ tone: 'error', title: x.message }); }
    setTeachingIndex(null);
  };
  const generateAiProposal = async () => {
    setAiBusy('generate');
    try { await adminApi('/look-of-day/ai-proposal', { method: 'POST', body: {} }); toast({ title: 'جهزت اقتراحات للمراجعة في الأدمن' }); reload(); }
    catch (x) { toast({ tone: 'error', title: x.message }); }
    setAiBusy('');
  };
  const approveAiProposal = async () => {
    setAiBusy('approve');
    try { await adminApi('/look-of-day/approve-ai', { method: 'POST', body: {} }); toast({ title: 'تم اعتماد الاقتراحات ونشرها' }); reload(); }
    catch (x) { toast({ tone: 'error', title: x.message }); }
    setAiBusy('');
  };
  const discardAiProposal = async () => {
    setAiBusy('discard');
    try { await adminApi('/look-of-day/ai-proposal', { method: 'DELETE' }); toast({ title: 'اتشالت الاقتراحات من المراجعة' }); reload(); }
    catch (x) { toast({ tone: 'error', title: x.message }); }
    setAiBusy('');
  };
  const modes = [
    ['ai', 'اقتراحات الذكاء الاصطناعي', 'الاقتراحات تفضل خاصة في الأدمن لحد ما تراجعها وتعتمدها. لو مفيش اعتماد، مفيش اقتراح AI جديد هيظهر للزوار.'],
    ['manual', 'اختيار يدوي من الإدارة', 'ضيف كذا أوتفيت في اليوم، وحدد الفئة والعمر والمناسبة وقطع كل طقم. من غير استدعاء AI.'],
    ['off', 'إخفاء القسم', 'القسم مش هيظهر للزوار. اختياراتك اليدوية هتفضل محفوظة.'],
  ];
  return (
    <Panel title="لوك النهارده" subtitle="اختار طريقة تجهيز اللوك الظاهر في الصفحة الرئيسية" className="lg:col-span-2">
      <div className="space-y-4">
        <div className="grid gap-2 md:grid-cols-3">
          {modes.map(([mode, title, body]) => (
            <button key={mode} type="button" onClick={() => setF({ ...f, mode })} aria-pressed={f.mode === mode}
              className={'min-w-0 rounded-xl border p-3 text-start transition ' + (f.mode === mode ? 'border-brand bg-brand/5 ring-1 ring-brand/20' : 'border-line-strong hover:border-fg')}>
              <span className="block text-sm font-semibold">{title}</span><span className="mt-1 block text-xs leading-relaxed text-muted">{body}</span>
            </button>
          ))}
        </div>
        {f.mode === 'ai' && (
          <div className="space-y-3 border-t border-line pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="font-semibold">اقتراحات الذكاء الاصطناعي</p><p className="text-xs text-muted">ولّد اقتراحات، راجع القطع والأسعار، وبعدها اعتمد المناسب بس.</p></div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" icon={Sparkles} loading={aiBusy === 'generate'} disabled={!!aiBusy} onClick={generateAiProposal}>توليد اقتراحات للمراجعة</Button>
                {data.proposal?.entries?.length > 0 && <Button size="sm" loading={aiBusy === 'approve'} disabled={!!aiBusy} onClick={approveAiProposal}>اعتماد ونشر الاقتراحات</Button>}
                {data.proposal?.entries?.length > 0 && <Button size="sm" variant="outline" icon={Trash2} loading={aiBusy === 'discard'} disabled={!!aiBusy} onClick={discardAiProposal}>تجاهل الاقتراحات</Button>}
              </div>
            </div>
            {data.approvedAt && <p className="text-xs text-emerald-700">آخر اعتماد: {fmtDateTime(data.approvedAt)}. اللوك المعتمد يفضل ظاهرًا لحد اعتماد اقتراح جديد أو تغيير طريقة العرض.</p>}
            {data.proposal?.entries?.length ? <div className="grid gap-3 md:grid-cols-2">
              {data.proposal.entries.map((entry, index) => (
                <section key={`${entry.audience}-${index}`} className="space-y-2 rounded-xl border border-line bg-canvas/60 p-3">
                  <div><p className="font-semibold">{entry.audience === 'women' ? 'حريمي' : entry.audience === 'men' ? 'رجالي' : `أطفال ${entry.age || ''}`} · {entry.occasion}</p>{entry.say && <p className="mt-1 text-xs text-muted">{entry.say}</p>}</div>
                  <div className="space-y-2">{entry.looks.map((look) => {
                    const item = look.items?.[look.pick];
                    return item ? <div key={look.label} className="flex min-w-0 items-center gap-2 rounded-lg bg-elevated p-2">
                      {item.image?.base ? <img src={`${item.image.base}/thumb.webp`} alt="" className="h-12 w-10 shrink-0 rounded-md object-cover" /> : <span className="h-12 w-10 shrink-0 rounded-md bg-secondary" />}
                      <div className="min-w-0"><p className="truncate text-xs text-muted">{look.label}</p><p className="truncate text-sm font-medium">{item.name?.ar || item.name?.en}</p><p className="text-xs">{fmtMoney(item.price)}</p></div>
                    </div> : null;
                  })}</div>
                  {entry.tips && <p className="text-xs text-muted">{entry.tips}</p>}
                  <p className="text-xs font-semibold">الإجمالي: {fmtMoney(entry.total)}</p>
                </section>
              ))}
            </div> : <p className="rounded-xl bg-secondary/50 p-3 text-sm text-muted">مفيش اقتراحات AI للمراجعة حاليًا. التوليد مش هيأثر على اللي ظاهر للزوار قبل الاعتماد.</p>}
          </div>
        )}
        {f.mode === 'manual' && (
          <div className="space-y-4 border-t border-line pt-4">
            <p className="text-sm text-muted">ضيف عدة أوتفيتات كاملة لليوم. لكل طقم اختار الفئة (حريمي، رجالي أو أطفال)، والعمر لو مناسب، والمناسبة، ثم اختار القطع المتناسقة من منتجات المحلات. الكاب والطاقية ضمن الإكسسوارات.</p>
            <datalist id="look-of-day-occasions">{LOOK_OCCASIONS.map((occasion) => <option key={occasion} value={occasion} />)}</datalist>
            <datalist id="look-of-day-pieces">{LOOK_PIECE_SUGGESTIONS.map((piece) => <option key={piece} value={piece} />)}</datalist>
            <div className="space-y-3">
              {f.manual.outfits.map((outfit, outfitIndex) => (
                <section key={outfitIndex} className="min-w-0 space-y-3 rounded-2xl border border-line bg-canvas/60 p-3 sm:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">أوتفيت {outfitIndex + 1}</h3><div className="flex items-center gap-2"><Button size="sm" variant="outline" icon={Sparkles} loading={teachingIndex === outfitIndex} disabled={!outfitReady(outfit) || teachingIndex !== null} onClick={() => teachOutfit(outfitIndex)}>علّم مودة منه</Button><button type="button" aria-label="حذف الأوتفيت" onClick={() => setF((current) => ({ ...current, manual: { outfits: current.manual.outfits.filter((_, i) => i !== outfitIndex) } }))} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line-strong text-muted hover:border-sale hover:text-sale"><Trash2 className="h-4 w-4" /></button></div></div>
                  <div className="grid min-w-0 gap-3 sm:grid-cols-3">
                    <label className="block min-w-0"><span className="mb-1 block text-xs font-medium text-muted">الفئة</span><Select value={outfit.audience} onChange={(e) => changeOutfit(outfitIndex, (x) => ({ ...x, audience: e.target.value }))}><option value="women">حريمي</option><option value="men">رجالي</option><option value="kids">أطفال</option></Select></label>
                    <label className="block min-w-0"><span className="mb-1 block text-xs font-medium text-muted">العمر أو الفئة العمرية{outfit.audience === 'kids' ? ' — مطلوب' : ' (اختياري)'}</span><Input value={outfit.age} maxLength={40} onChange={(e) => changeOutfit(outfitIndex, (x) => ({ ...x, age: e.target.value }))} placeholder="مثال: ٨–١٠ سنين" /></label>
                    <label className="block min-w-0"><span className="mb-1 block text-xs font-medium text-muted">المناسبة — مطلوبة</span><Input list="look-of-day-occasions" value={outfit.occasion} maxLength={80} onChange={(e) => changeOutfit(outfitIndex, (x) => ({ ...x, occasion: e.target.value }))} placeholder="أوتفيت كتب كتاب" /></label>
                  </div>
                  <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                    <label className="block min-w-0"><span className="mb-1 block text-xs font-medium text-muted">تعليق مودة (اختياري)</span><Input value={outfit.say} maxLength={700} onChange={(e) => changeOutfit(outfitIndex, (x) => ({ ...x, say: e.target.value }))} /></label>
                    <label className="block min-w-0"><span className="mb-1 block text-xs font-medium text-muted">نصيحة تنسيق (اختياري)</span><Textarea rows={2} value={outfit.tips} maxLength={300} onChange={(e) => changeOutfit(outfitIndex, (x) => ({ ...x, tips: e.target.value }))} /></label>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">قطع الأوتفيت</p>
                    {outfit.pieces.map((piece, pieceIndex) => (
                      <div key={pieceIndex} className="grid min-w-0 gap-2 rounded-xl border border-line bg-elevated p-3 sm:grid-cols-[minmax(120px,.65fr)_minmax(0,1.35fr)_auto] sm:items-end">
                        <label className="block min-w-0"><span className="mb-1 block text-xs font-medium text-muted">دورها في الأوتفيت</span><Input list="look-of-day-pieces" value={piece.label} maxLength={50} onChange={(e) => changeOutfit(outfitIndex, (x) => ({ ...x, pieces: x.pieces.map((p, i) => i === pieceIndex ? { ...p, label: e.target.value } : p) }))} placeholder="فستان، حذاء، كاب (إكسسوار)…" /></label>
                        <div className="min-w-0"><span className="mb-1 block text-xs font-medium text-muted">المنتج</span><LookProductPicker product={piece.product} onChange={(product) => changeOutfit(outfitIndex, (x) => ({ ...x, pieces: x.pieces.map((p, i) => i === pieceIndex ? { ...p, product, productId: product?.id || null } : p) }))} /></div>
                        <button type="button" aria-label="حذف القطعة" onClick={() => changeOutfit(outfitIndex, (x) => ({ ...x, pieces: x.pieces.filter((_, i) => i !== pieceIndex) }))} className="grid h-11 w-11 place-items-center rounded-xl border border-line-strong text-muted hover:border-sale hover:text-sale"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>
                  <Button size="sm" variant="outline" icon={Plus} onClick={() => changeOutfit(outfitIndex, (x) => ({ ...x, pieces: [...x.pieces, { label: '', productId: null, product: null }] }))}>إضافة قطعة</Button>
                </section>
              ))}
              <Button size="sm" variant="outline" icon={Plus} disabled={f.manual.outfits.length >= 12} onClick={() => setF((current) => ({ ...current, manual: { outfits: [...current.manual.outfits, blankOutfit()] } }))}>إضافة أوتفيت</Button>
              <p className="text-xs text-muted">تقدر تضيف لحد ١٢ أوتفيت في اليوم. الكاب والطاقية يتضافوا كإكسسوار من منتجات المحلات.</p>
            </div>
            {!manualReady && <p className="text-xs text-sale">لكل أوتفيت مضاف: اختار الفئة والمناسبة، وأضف منتجين على الأقل. أوتفيت الأطفال لازم يتحدد له العمر.</p>}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Button onClick={save} loading={busy} disabled={!dirty || busy || (f.mode === 'manual' && !manualReady)}>حفظ الإعداد</Button>
          {dirty && <span className="text-[13px] text-muted">في تغييرات لسه ما اتحفظتش</span>}
        </div>
      </div>
    </Panel>
  );
}

function BackupPanel({ data, reload }) {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const download = async () => {
    setBusy('dl');
    try {
      const res = await fetch('/api/admin/backup/db', { headers: { 'x-admin-key': adminKey.get(), 'x-admin-session': adminSession.get() } });
      if (!res.ok) throw new Error('تعذر تحميل النسخة');
      const a = document.createElement('a'); a.href = URL.createObjectURL(await res.blob()); a.download = 'banha-outfit-' + new Date().toISOString().slice(0, 10) + '.db'; a.click(); URL.revokeObjectURL(a.href);
    } catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy('');
  };
  const run = async () => {
    setBusy('run');
    try { await adminApi('/backup/run', { method: 'POST', body: {} }); toast({ title: 'تم أخذ النسخة المحلية' }); reload(); } catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy('');
  };
  const runOffsite = async () => {
    setBusy('offsite');
    try { await adminApi('/backup/offsite', { method: 'POST', body: {} }); toast({ title: 'تم رفع نسخة قاعدة البيانات إلى R2' }); reload(); } catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy('');
  };
  const b = data.backup;
  const offsite = data.offsite || {};
  const localDate = b?.at ? fmtDateTime(b.at.slice(0, 19).replace('T', ' ')) : '';
  const offsiteDate = offsite.last?.at ? fmtDateTime(offsite.last.at.slice(0, 19).replace('T', ' ')) : '';
  return (
    <Panel title="النسخ الاحتياطي" subtitle="النسخ المحلية منفصلة عن نسخ Railway المدمجة وCloudflare R2">
      <div className="space-y-4">
        <section>
          <p className="font-medium">نسخة على قرص Railway الدائم — قاعدة البيانات والصور</p>
          <p className="mt-1 text-sm text-muted">{data.backupDir ? (b ? 'آخر نسخة: ' + localDate + ' — ' + (b.bytes / 1048576).toFixed(1) + ' ميجا، صور جديدة: ' + (b.media?.copied || 0) : 'مفيش نسخة لسه — هتتاخد تلقائياً بعد تشغيل السيرفر بدقيقة.') : 'غير مفعّلة: اضبط BACKUP_DIR على مجلد مربوط بقرص دائم.'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.backupDir && <Button size="sm" variant="outline" icon={DatabaseBackup} loading={busy === 'run'} onClick={run}>خد نسخة محلية دلوقتي</Button>}
            <Button size="sm" variant="outline" icon={Download} loading={busy === 'dl'} onClick={download}>تحميل نسخة من قاعدة البيانات</Button>
          </div>
        </section>
        <section className="border-t border-line pt-4">
          <p className="font-medium">نسخة خارج Railway على Cloudflare R2 — قاعدة البيانات فقط</p>
          <p className="mt-1 text-sm text-muted">{offsite.enabled ? (offsite.last ? 'آخر رفع ناجح: ' + offsiteDate + ' — ' + (offsite.last.bytes / 1048576).toFixed(1) + ' ميجا.' : 'الإعداد موجود، لكن لسه مفيش رفع ناجح مسجل. شغّل نسخة دلوقتي للتأكد.') : 'غير مفعّلة. اضبط R2_ACCOUNT_ID وBACKUP_R2_BUCKET وR2_ACCESS_KEY_ID وR2_SECRET_ACCESS_KEY، أو مفاتيح BACKUP_R2 المخصصة.'}</p>
          <p className="mt-2 text-[12px] text-muted">استخدم bucket منفصل وخاص (Private) مع صلاحية كتابة للمفاتيح. CF_AI_TOKEN خاص بالذكاء الاصطناعي ولا يصلح للنسخ الاحتياطي. نسخة R2 تشمل قاعدة البيانات فقط؛ الصور تحتاج BACKUP_DIR على قرص دائم.</p>
          <div className="mt-3">
            <Button size="sm" variant="outline" icon={DatabaseBackup} loading={busy === 'offsite'} disabled={!offsite.enabled} onClick={runOffsite}>ارفع نسخة R2 دلوقتي</Button>
          </div>
        </section>
        <p className="text-[12px] text-muted">النسخ على نفس القرص لا تحميك لو القرص اتمسح. احتفظ بنسخة إضافية على جهازك أو Google Drive.</p>
      </div>
    </Panel>
  );
}

const fmtBytes = (n) => {
  if (!Number.isFinite(Number(n))) return 'غير متاح';
  const units = ['بايت', 'KB', 'MB', 'GB', 'TB'];
  let value = Number(n), i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value.toFixed(i < 2 ? 0 : 1)} ${units[i]}`;
};

function ResourcePanel() {
  const { data, error, loading, reload } = useAdminApi('/resources');
  const disk = data?.disk;
  const database = data?.database;
  const r2 = data?.r2;
  const diskPercent = disk?.totalBytes ? Math.min(100, disk.usedBytes / disk.totalBytes * 100) : 0;
  const standardGB = (r2?.standardBytes || 0) / (1024 ** 3);
  const freeGB = Math.max(0, 10 - standardGB);
  return (
    <Panel title="مساحة الاستضافة والتخزين" subtitle="قياس السيرفر مباشر؛ قياس R2 قد يتأخر عدة دقائق." className="lg:col-span-3">
      {error && !data ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <Skeleton className="h-36 w-full" /> : (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-line bg-secondary/30 p-4">
            <div className="mb-3 flex items-center gap-2"><HardDrive className="h-5 w-5 text-brand" /><h3 className="font-semibold">قرص السيرفر</h3></div>
            {disk?.totalBytes ? <>
              <p className="text-sm">المستخدم <b>{fmtBytes(disk.usedBytes)}</b> من <b>{fmtBytes(disk.totalBytes)}</b></p>
              <div className="my-3 h-2 overflow-hidden rounded-full bg-line"><div className={`h-full rounded-full ${diskPercent > 90 ? 'bg-sale' : 'bg-brand'}`} style={{ width: `${diskPercent}%` }} /></div>
              <p className="text-sm text-muted">المتاح: {fmtBytes(disk.freeBytes)} · {diskPercent.toFixed(1)}% مستخدم</p>
              <p className="mt-2 break-all text-xs text-muted" dir="ltr">{disk.path}</p>
              <p className="mt-2 text-xs text-muted">ده حجم نظام الملفات على قرص قاعدة البيانات؛ حد Railway أو حجم الـVolume راجعه من لوحة الاستضافة.</p>
              {diskPercent >= 85 && <p className="mt-3 rounded-xl bg-sale/10 px-3 py-2 text-sm font-medium text-sale">المساحة قربت تمتلئ؛ راجع الملفات أو كبّر الـVolume.</p>}
            </> : <p className="text-sm text-muted">تعذر قراءة مساحة القرص{disk?.error ? `: ${disk.error}` : ' من السيرفر'}.</p>}
            <p className="mt-3 border-t border-line pt-3 text-sm text-muted">حجم قاعدة البيانات: <b className="text-fg">{database?.bytes != null ? fmtBytes(database.bytes) : 'غير متاح'}</b></p>
          </section>
          <section className="rounded-2xl border border-line bg-secondary/30 p-4">
            <div className="mb-3 flex items-center gap-2"><Database className="h-5 w-5 text-brand" /><h3 className="font-semibold">ذاكرة التطبيق</h3></div>
            <p className="text-sm">استهلاك العملية: <b>{fmtBytes(data?.memory?.rssBytes)}</b></p>
            <p className="mt-1 text-sm text-muted">ذاكرة JavaScript: {fmtBytes(data?.memory?.heapUsedBytes)} من {fmtBytes(data?.memory?.heapTotalBytes)}</p>
            <p className="mt-2 text-xs text-muted">ده استهلاك تطبيق Node نفسه، مش حد الذاكرة أو الفاتورة. راجع Metrics في Railway للحد الكامل.</p>
          </section>
          <section className="rounded-2xl border border-line bg-secondary/30 p-4">
            <div className="mb-3 flex items-center gap-2"><Cloud className="h-5 w-5 text-brand" /><h3 className="font-semibold">Cloudflare R2</h3></div>
            {r2?.standardBytes != null ? <>
              <p className="text-sm">Standard: <b>{fmtBytes(r2.standardBytes)}</b> · {Number(r2.standardObjects || 0).toLocaleString('ar-EG')} عنصر</p>
              {!!r2.infrequentAccessBytes && <p className="mt-1 text-sm">Infrequent Access: <b>{fmtBytes(r2.infrequentAccessBytes)}</b></p>}
              <div className="my-3 h-2 overflow-hidden rounded-full bg-line"><div className={`h-full rounded-full ${standardGB >= 10 ? 'bg-sale' : 'bg-brand'}`} style={{ width: `${Math.min(100, standardGB / 10 * 100)}%` }} /></div>
              <p className="text-sm text-muted">متبقي تقديري من 10 GB-month المجانية: {freeGB.toFixed(2)} GB-month.</p>
              <p className="mt-2 text-xs text-muted">الرقم يشمل كل buckets الحساب، وقد يتأخر. 10 GB-month حد مجاني للفوترة وليس حدًا يمنع التخزين؛ الفاتورة تعتمد متوسط التخزين خلال الشهر.</p>
              <p className="mt-2 text-xs text-muted">آخر قياس: {r2.measuredAt ? fmtDateTime(r2.measuredAt.slice(0, 19).replace('T', ' ')) : '—'}</p>
            </> : <p className="text-sm text-muted">{r2?.error ? `تعذر جلب قياس R2: ${r2.error}` : 'لإظهار القياس، اضبط CF_R2_METRICS_TOKEN بصلاحية قراءة R2. يستخدم CF_ACCOUNT_ID أو R2_ACCOUNT_ID.'}</p>}
          </section>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-muted">{data?.checkedAt ? `آخر فحص: ${fmtDateTime(data.checkedAt.slice(0, 19).replace('T', ' '))}` : ''}</p><Button size="xs" variant="outline" loading={loading} onClick={reload}>تحديث المساحة</Button></div>
    </Panel>
  );
}

export default function System() {
  const { data, error, loading, reload } = useAdminApi('/status');
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const required = (data?.checks || []).filter((c) => !c.optional);
  const bad = required.filter((c) => !c.ok);
  return (
    <div>
      <PageHeader title="النظام والأمان" subtitle="جاهزية الموقع للإنتاج" />
      {loading && !data ? <Skeleton className="h-64 w-full rounded-2xl" /> : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="قائمة الجاهزية" className="lg:col-span-2" subtitle={bad.length ? `${bad.length} حاجة لازم تتظبط قبل الإنتاج` : 'كل الإعدادات الأساسية تمام'}>
            <ul className="space-y-3">
              {data.checks.map((c) => (
                <li key={c.id} className="flex items-start gap-3">
                  {c.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : c.optional ? <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-sale" />}
                  <div><p className="font-medium">{c.label}</p>{!c.ok && <p className="text-[13px] text-muted">{c.fix}</p>}</div>
                </li>
              ))}
            </ul>
          </Panel>
          <BackupPanel data={data} reload={reload} />
          <ResourcePanel />
          <VisualPanel />
          <StylistPanel />
          <ModaTestLabPanel />
          <ModaTrainingPanel />
          <LookOfDayPanel />
          <Panel title="السيرفر">
            <dl className="space-y-3 text-sm">
              {[['البيئة', data.env], ['Node', data.node], ['شغال من', uptime(data.uptimeSec)], ['تخزين الصور', data.mediaR2Enabled ? 'Cloudflare R2' : 'قرص السيرفر (R2 غير مفعّل)'], ['واتساب API', data.whatsappConfigured ? 'متوصل' : 'غير متوصل'], ['قالب واتساب', data.template], ['التسجيل العام', data.registrationOpen ? 'مفتوح' : 'مقفول']].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="font-medium" dir="ltr">{v}</dd></div>
              ))}
            </dl>
          </Panel>
        </div>
      )}
    </div>
  );
}
