import { useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, Download, DatabaseBackup } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { PageHeader, Panel } from '../../components/dash/Kit.jsx';
import { ErrorState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { useAdminApi, adminApi, adminKey, adminSession, fmtDateTime } from './adminApi.js';

const uptime = (s) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return [d && `${d} يوم`, h && `${h} ساعة`, `${m} دقيقة`].filter(Boolean).join(' ') ; };

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
