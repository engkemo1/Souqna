import { useState } from 'react';
import { Camera, Check, Sparkles, MapPin, ImageUp, Zap } from 'lucide-react';
import { useApi, invalidate } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { formatDate } from '../../lib/format.js';
import { useAuth } from '../../lib/auth.jsx';
import { PageHeader, Panel } from '../../components/dash/Kit.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { Field, Input, Textarea, Segmented } from '../../components/ui/Field.jsx';
import { errorMessage, fieldErrors } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import PageTransition from '../../components/PageTransition.jsx';
import { SALES_WHATSAPP } from '../../config/contact.js';

const TONE = { new: 'warning', contacted: 'info', scheduled: 'violet', done: 'success', cancelled: 'danger' };

export default function Services() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const { store } = useAuth();
  const { data, reload } = useApi('/owner/services');
  const [f, setF] = useState({ plan: 'once', items_count: '', preferred_date: '', phone: store?.phone || '', notes: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const perks = [t('services.p1'), t('services.p2'), t('services.p3'), t('services.p4')];

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErrors({});
    try {
      await api('/owner/services', { method: 'POST', body: { plan: f.plan, items_count: f.items_count ? Number(f.items_count) : undefined, preferred_date: f.preferred_date, phone: f.phone, notes: f.notes } });
      invalidate('/owner/services'); reload();
      setF({ ...f, items_count: '', preferred_date: '', notes: '' });
      toast({ title: t('services.sent'), description: t('services.sentBody') });
    } catch (x) { setErrors(fieldErrors(t, x)); toast({ tone: 'error', title: errorMessage(t, x) }); }
    setBusy(false);
  };

  return (
    <PageTransition>
      <PageHeader title={t('services.title')} subtitle={t('services.subtitle')} />
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <div className="relative overflow-hidden rounded-2xl bg-[#111111] p-6 text-[#FFF6EC] sm:p-8">
            <span aria-hidden className="absolute -end-10 -top-10 h-44 w-44 rounded-full bg-[#FF5A1F]/30 blur-3xl" />
            <p className="relative inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[13px] font-semibold text-[#FF8A5C]"><Sparkles className="h-3.5 w-3.5" />{t('services.badge')}</p>
            <h2 className="relative mt-3 font-display text-2xl font-bold sm:text-3xl">{t('services.photoTitle')}</h2>
            <p className="relative mt-2 max-w-xl text-[#FFF6EC]/75">{t('services.photoBody')}</p>
            <ul className="relative mt-5 grid gap-2 sm:grid-cols-2">{perks.map((p) => <li key={p} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#FF5A1F]" />{p}</li>)}</ul>
          </div>

          <Panel title={t('services.requestTitle')}>
            <form onSubmit={submit} className="space-y-4">
              <Field label={t('services.plan')}>
                <Segmented value={f.plan} onChange={(v) => setF({ ...f, plan: v })} className="w-full [&>button]:flex-1" options={[{ value: 'once', label: t('services.once') }, { value: 'monthly', label: t('services.monthly') }]} />
              </Field>
              <p className="-mt-2 text-[13px] text-muted">{f.plan === 'once' ? t('services.onceHint') : t('services.monthlyHint')}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('services.items')} optional={t('common.optional')}><Input inputMode="numeric" dir="ltr" value={f.items_count} onChange={(e) => setF({ ...f, items_count: e.target.value.replace(/\D/g, '') })} placeholder="20" className="text-start" /></Field>
                <Field label={t('services.date')} optional={t('common.optional')} error={errors.preferred_date}><Input type="date" dir="ltr" value={f.preferred_date} onChange={set('preferred_date')} /></Field>
                <Field label={t('services.phone')} error={errors.phone} className="sm:col-span-2"><Input inputMode="tel" dir="ltr" value={f.phone} onChange={set('phone')} className="text-start" /></Field>
                <Field label={t('services.notes')} optional={t('common.optional')} className="sm:col-span-2"><Textarea rows={3} value={f.notes} onChange={set('notes')} placeholder={t('services.notesPh')} /></Field>
              </div>
              <Button type="submit" size="lg" icon={Camera} loading={busy} full>{t('services.submit')}</Button>
              <p className="text-center text-[13px] text-muted">{t('services.noPrice')}</p>
            </form>
          </Panel>
        </div>

        <div className="space-y-5 lg:col-span-2">
          <Panel title={t('services.myRequests')}>
            {data?.items?.length ? (
              <ul className="divide-y divide-line">
                {data.items.map((r) => (
                  <li key={r.id} className="py-3">
                    <div className="flex items-center justify-between gap-2"><p className="font-semibold">{r.type === 'design_banner' ? t('design.typeBanner') : r.type === 'design_cover' ? t('design.typeCover') : r.plan === 'monthly' ? t('services.monthly') : t('services.once')}</p><Badge tone={TONE[r.status] || 'neutral'} dot size="sm">{t(`services.status.${r.status}`)}</Badge></div>
                    <p className="mt-0.5 text-[13px] text-muted">{formatDate(r.created_at, lang, { day: 'numeric', month: 'short' })}{r.items_count ? ` · ${r.items_count} ${t('services.itemsUnit')}` : ''}{r.preferred_date ? ` · ${r.preferred_date}` : ''}</p>
                    {r.admin_note && <p className="mt-1.5 rounded-lg bg-secondary p-2.5 text-sm">{r.admin_note}</p>}
                  </li>
                ))}
              </ul>
            ) : <p className="py-6 text-center text-sm text-muted">{t('services.none')}</p>}
          </Panel>
          <div className="rounded-2xl border border-line bg-elevated p-5 text-sm">
            <p className="flex items-center gap-2 font-semibold"><Zap className="h-4 w-4 text-brand" />{t('services.faster')}</p>
            <Button className="mt-3" variant="outline" size="sm" href={`https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent(t('services.waText', { name: store?.name?.ar || '' }))}`} target="_blank" rel="noreferrer">{t('services.wa')}</Button>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
