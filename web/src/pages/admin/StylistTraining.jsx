import { useRef, useState } from 'react';
import { BookOpen, Upload, Download, RotateCcw, AlertTriangle } from 'lucide-react';
import { PageHeader, Panel } from '../../components/dash/Kit.jsx';
import Button from '../../components/ui/Button.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { adminApi, useAdminApi, adminKey, adminSession } from './adminApi.js';
import { ModaTrainingPanel } from './System.jsx';

const KINDS = [
  { kind: 'kb', label: 'قاعدة المعرفة', file: 'fashion_kb.json', hint: 'القطع وأسمائها بالمصري، تنسيق كل قطعة، الفصول، البدائل، قواعد الألوان والتنسيق.' },
  { kind: 'bridge', label: 'الجسر وقواعد Twist', file: 'kb_bridge.json', hint: 'كل قطعة في القاعدة بتقابل أنهي نوع في محلاتنا، وقواعد Twist اللي بتغلب القاعدة (زي الشبشب والجلابية).' },
];

/** Twyla's styling knowledge lives in a JSON knowledge base: the team uploads a new version here and it applies at once, no code or prompt edits. */
function KnowledgeBasePanel() {
  const toast = useToast();
  const { data, reload } = useAdminApi('/stylist/kb');
  const [busy, setBusy] = useState('');
  const inputs = useRef({});
  const upload = async (kind, file) => {
    if (!file) return;
    setBusy(kind);
    try {
      const text = await file.text();
      try { JSON.parse(text); } catch { throw new Error('الملف مش JSON سليم'); }
      await adminApi(`/stylist/kb/${kind}`, { method: 'PUT', body: { json: text } });
      toast({ title: 'اتحدّثت وبقت شغالة دلوقتي' }); reload();
    } catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy('');
  };
  const download = async (kind, file) => {
    try {
      const res = await fetch(`/api/admin/stylist/kb/${kind}/download`, { headers: { 'x-admin-key': adminKey.get(), 'x-admin-session': adminSession.get() } });
      if (!res.ok) throw new Error('مفيش ملف');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a'); a.href = url; a.download = file; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (x) { toast({ tone: 'error', title: x.message }); }
  };
  const reset = async (kind) => {
    if (!window.confirm('نرجع للنسخة الأصلية اللي في الكود؟')) return;
    try { await adminApi(`/stylist/kb/${kind}`, { method: 'DELETE' }); toast({ title: 'رجعنا للنسخة الأصلية' }); reload(); } catch (x) { toast({ tone: 'error', title: x.message }); }
  };
  return (
    <Panel title="قاعدة معرفة الموضة (مصدر معرفة تويلا)" subtitle="تويلا بتتعلم من الملف ده: لما تحدّثه وترفعه هنا، الأسماء والتنسيق والفصول والإرشادات بتتغير فورًا لكل العملاء من غير كود.">
      {!data ? <p className="text-sm text-muted">بنحمّل…</p> : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-[13px]">
            <span className="rounded-full bg-fg/[0.06] px-3 py-1"><BookOpen className="me-1 inline h-3.5 w-3.5" />{data.name || 'قاعدة المعرفة'}{data.version ? ` · v${data.version}` : ''}</span>
            <span className="rounded-full bg-fg/[0.06] px-3 py-1">{data.mappedItems} من {data.items} قطعة متربطة بأنواع محلاتنا</span>
            <span className="rounded-full bg-fg/[0.06] px-3 py-1">{data.aliasesAdded} اسم قطعة جديد · {data.colorAliasesAdded} اسم لون</span>
          </div>
          {data.unmapped?.length > 0 && <p className="text-[13px] text-muted">قطع مالهاش نوع عندنا (بتتجاهل في التنسيق): <span dir="ltr">{data.unmapped.join(', ')}</span></p>}
          {data.warnings?.length > 0 && (
            <div className="rounded-xl bg-amber-50 p-3 text-[13px] text-amber-900">
              <p className="mb-1 font-semibold"><AlertTriangle className="me-1 inline h-4 w-4" />ملاحظات على القاعدة</p>
              <ul className="list-disc space-y-0.5 ps-5">{data.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {KINDS.map((k) => {
              const custom = k.kind === 'kb' ? data.custom : data.bridgeCustom;
              return (
                <div key={k.kind} className="rounded-2xl border border-line p-4">
                  <p className="font-semibold">{k.label} <span className="text-[12px] font-normal text-muted">({custom ? 'نسخة مرفوعة' : 'النسخة الأصلية'})</span></p>
                  <p className="mt-1 text-[12.5px] text-muted">{k.hint}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="xs" variant="outline" icon={Download} onClick={() => download(k.kind, k.file)}>نزّل الحالية</Button>
                    <Button size="xs" variant="outline" icon={Upload} loading={busy === k.kind} onClick={() => inputs.current[k.kind]?.click()}>ارفع نسخة جديدة</Button>
                    {custom && <Button size="xs" variant="outline" icon={RotateCcw} onClick={() => reset(k.kind)}>رجّع الأصلية</Button>}
                    <input ref={(el) => { inputs.current[k.kind] = el; }} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { upload(k.kind, e.target.files?.[0]); e.target.value = ''; }} />
                  </div>
                </div>
              );
            })}
          </div>
          {data.aliasesSkipped?.length > 0 && (
            <details className="text-[12.5px] text-muted">
              <summary className="cursor-pointer">أسماء في القاعدة ما اتضافتش عشان معناها متاخد ({data.aliasesSkipped.length})</summary>
              <p className="mt-2 leading-relaxed">{data.aliasesSkipped.join(' · ')}</p>
            </details>
          )}
        </div>
      )}
    </Panel>
  );
}

export default function StylistTraining() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="تدريب تويلا وقواعدها بدون كود"
        subtitle="علّم تويلا مصطلحات بنها الدارجة، وقواعد ترشيح المحلات، وعروض اليوم، لتتعلمها فوراً وتطبقها مع كل العملاء."
      />
      <KnowledgeBasePanel />
      <ModaTrainingPanel />
    </div>
  );
}
