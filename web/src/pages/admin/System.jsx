import { useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, Download, DatabaseBackup, Sparkles } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { PageHeader, Panel } from '../../components/dash/Kit.jsx';
import { Switch, Input } from '../../components/ui/Field.jsx';
import { ErrorState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { useAdminApi, adminApi, adminUpload, adminKey, adminSession, fmtDateTime } from './adminApi.js';

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
  const OPTS = [
    ['color', 'عادي (مجاني وخفيف)', 'بيقارن الألوان والشكل العام. من غير أي مصاريف أو مفاتيح.', ''],
    ['clip', 'CLIP على السيرفر (أدق)', 'بيفهم نوع القطعة والموديل. محتاج حوالي 600 ميجا RAM على Railway، يعني تكلفة زيادة.', ''],
    ['jina', 'CLIP كخدمة (Jina)', 'نفس دقة CLIP من غير ذاكرة على السيرفر. بيتحاسب بالاستخدام (فيه باقة مجانية).', 'JINA_API_KEY'],
    ['cloudflare', 'وصف بالذكاء على Cloudflare', 'Cloudflare بيوصف الصورة وبيقارن الوصف. من غير ذاكرة، ودقته أقل من CLIP.', 'CF_AI_TOKEN'],
  ];
  const Opt = ({ id, title, body, need }) => {
    const miss = need && !P[id]?.configured;
    return (
      <button type="button" onClick={() => setF({ ...f, model: id })} aria-pressed={f.model === id}
        className={`rounded-xl border p-3 text-start transition ${f.model === id ? 'border-fg bg-secondary' : 'border-line-strong hover:border-fg'}`}>
        <p className="font-semibold">{title}</p><p className="mt-0.5 text-[12.5px] text-muted">{body}</p>
        {miss && <p className="mt-1.5 text-[12px] font-medium text-sale">محتاج متغير <span dir="ltr">{need}</span> في Railway{id === 'cloudflare' ? ' (و CF_ACCOUNT_ID)' : ''}</p>}
        {!miss && P[id]?.failed && <p className="mt-1.5 text-[12px] font-medium text-sale" dir="auto">فشل آخر مرة: {P[id].lastError || 'خطأ'} — شغّال بالعادي مؤقتًا</p>}
      </button>
    );
  };
  return (
    <Panel title="البحث بالصورة" subtitle="«صوّرها ولاقيها في بنها»" className="lg:col-span-2">
      <div className="space-y-4">
        <Switch checked={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} label="تفعيل البحث بالصورة للزباين" description="لو اتقفل، الزرار بيختفي من الموقع والبحث بيتوقف." />
        <div>
          <p className="mb-2 text-sm font-medium">نوع التحليل</p>
          <div className="grid gap-2 sm:grid-cols-2">{OPTS.map(([id, title, body, need]) => <Opt key={id} id={id} title={title} body={body} need={need} />)}</div>
          <p className="mt-2 text-[12.5px] text-muted">لو الخيار المختار مش متظبط أو وقع، الموقع بيشتغل بالعادي لوحده وبيحاول تاني بعد 10 دقايق. بعد تغيير النوع، المنتجات بتتفهرس من جديد في الخلفية.</p>
        </div>
        <label className="block max-w-xs"><span className="mb-1.5 block text-sm font-medium">عمليات بحث مجانية لكل زائر في اليوم</span>
          <Input type="number" dir="ltr" min={0} max={1000} value={f.dailyFree} onChange={(e) => setF({ ...f, dailyFree: e.target.value })} className="text-start" />
          <span className="mt-1 block text-[12px] text-muted">0 = من غير حد. ده الأساس لو حبينا نعمل باقة مدفوعة بعدين.</span></label>
        <div className="flex flex-wrap items-center gap-3"><Button onClick={save} loading={busy} disabled={!dirty}>حفظ</Button>{dirty && <span className="text-[13px] text-muted">في تغييرات لسه ما اتحفظتش</span>}</div>
        <dl className="grid gap-2 border-t border-line pt-4 text-sm sm:grid-cols-2">
          {[['متفهرس (عادي)', idx['color-v1'] || 0], ['متفهرس (CLIP سيرفر)', idx['clip-b32'] || 0], ['متفهرس (Jina)', idx['jina-clip-v2'] || 0], ['متفهرس (Cloudflare)', idx['cf-llava-bge'] || 0],
            ['منتجات في انتظار الفهرسة', data.pending], ['الذاكرة المستخدمة حاليًا', `${data.rssMb} MB`], ['CLIP على السيرفر', P.clip?.failed ? 'فشل التحميل' : P.clip?.loaded ? 'محمّل وشغال' : 'غير محمّل']].map(([k, v]) => (
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
    try { await adminApi('/stylist', { method: 'PUT', body: { enabled: f.enabled, provider: f.provider, dailyFree: Number(f.dailyFree) || 0, nameAr: f.nameAr, nameEn: f.nameEn } }); toast({ title: 'اتحفظ' }); setF(null); reload(); }
    catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy(false);
  };
  const PROV = [['anthropic', 'Claude (Anthropic)', 'أحسن فهم للعامية المصرية وأدق في الاختيار. بيتحاسب بالاستخدام (قروش للمحادثة).', 'ANTHROPIC_API_KEY'], ['cloudflare', 'Llama على Cloudflare', 'أرخص وفيه باقة مجانية يومية، لكن أقل دقة في العربي.', 'CF_AI_TOKEN']];
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
                <button key={id} type="button" onClick={() => setF({ ...f, provider: id })} aria-pressed={f.provider === id}
                  className={`rounded-xl border p-3 text-start transition ${f.provider === id ? 'border-fg bg-secondary' : 'border-line-strong hover:border-fg'}`}>
                  <p className="font-semibold">{title}</p><p className="mt-0.5 text-[12.5px] text-muted">{body}</p>
                  {miss && <p className="mt-1.5 text-[12px] font-medium text-sale">محتاج متغير <span dir="ltr">{need}</span> في Railway{id === 'cloudflare' ? ' (و CF_ACCOUNT_ID)' : ''}</p>}
                </button>
              );
            })}
          </div>
        </div>
        <label className="block max-w-xs"><span className="mb-1.5 block text-sm font-medium">رسايل مجانية لكل زائر في اليوم</span>
          <Input type="number" dir="ltr" min={0} max={1000} value={f.dailyFree} onChange={(e) => setF({ ...f, dailyFree: e.target.value })} className="text-start" />
          <span className="mt-1 block text-[12px] text-muted">0 = من غير حد. بيحمي الميزانية من الاستخدام الزايد.</span></label>
        <div className="flex flex-wrap items-center gap-3"><Button onClick={save} loading={busy} disabled={!dirty} icon={Sparkles}>حفظ</Button>{dirty && <span className="text-[13px] text-muted">في تغييرات لسه ما اتحفظتش</span>}</div>
        {data.lastError && <p className="rounded-xl bg-sale/10 px-3 py-2 text-[13px] text-sale" dir="auto">آخر خطأ من الموديل: {data.lastError}</p>}
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
      const a = document.createElement('a'); a.href = URL.createObjectURL(await res.blob()); a.download = `banha-outfit-${new Date().toISOString().slice(0, 10)}.db`; a.click(); URL.revokeObjectURL(a.href);
    } catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy('');
  };
  const run = async () => {
    setBusy('run');
    try { await adminApi('/backup/run', { method: 'POST', body: {} }); toast({ title: 'تم أخذ نسخة احتياطية' }); reload(); } catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy('');
  };
  const b = data.backup;
  return (
    <Panel title="النسخ الاحتياطي" subtitle="قاعدة البيانات (الطلبات والمنتجات والحسابات) والصور">
      <p className="text-sm text-muted">{data.backupDir ? (b ? `آخر نسخة: ${fmtDateTime(b.at.slice(0, 19).replace('T', ' '))} — ${(b.bytes / 1048576).toFixed(1)} ميجا، صور جديدة: ${b.media.copied}` : 'مفيش نسخة لسه — هتتاخد تلقائياً بعد تشغيل السيرفر بدقيقة.') : 'النسخ اليومي التلقائي مش مفعّل: اضبط BACKUP_DIR على مجلد على قرص دائم.'}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {data.backupDir && <Button size="sm" variant="outline" icon={DatabaseBackup} loading={busy === 'run'} onClick={run}>خد نسخة دلوقتي</Button>}
        <Button size="sm" variant="outline" icon={Download} loading={busy === 'dl'} onClick={download}>تحميل نسخة من قاعدة البيانات</Button>
      </div>
      <p className="mt-3 text-[12px] text-muted">احتفظ بنسخة على جهازك أو على Google Drive كل فترة، لأن نسخة على نفس السيرفر مش بتحميك لو السيرفر نفسه اتمسح.</p>
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
          <VisualPanel />
          <StylistPanel />
          <Panel title="السيرفر">
            <dl className="space-y-3 text-sm">
              {[['البيئة', data.env], ['Node', data.node], ['شغال من', uptime(data.uptimeSec)], ['واتساب API', data.whatsappConfigured ? 'متوصل' : 'غير متوصل'], ['قالب واتساب', data.template], ['التسجيل العام', data.registrationOpen ? 'مفتوح' : 'مقفول']].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="font-medium" dir="ltr">{v}</dd></div>
              ))}
            </dl>
          </Panel>
        </div>
      )}
    </div>
  );
}
