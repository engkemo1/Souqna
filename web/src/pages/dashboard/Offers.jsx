import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, TicketPercent, Truck, Percent, Banknote, Copy, Pencil, Trash2, Sparkles } from 'lucide-react';
import { useApi, invalidate } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney, formatDate, formatNumber } from '../../lib/format.js';
import { PageHeader, ListSkeleton } from '../../components/dash/Kit.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button, { IconButton } from '../../components/ui/Button.jsx';
import Sheet, { ConfirmDialog } from '../../components/ui/Sheet.jsx';
import { Field, Input, Switch } from '../../components/ui/Field.jsx';
import { EmptyState, ErrorState, errorMessage, fieldErrors } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import PageTransition from '../../components/PageTransition.jsx';
import { cx } from '../../components/ui/cx.js';

const ICONS = { percentage: Percent, fixed: Banknote, free_shipping: Truck };
const today = () => new Date().toISOString().slice(0, 10);

function offerState(o) {
  if (!o.active) return 'inactive';
  if (o.endsAt && o.endsAt < today()) return 'expired';
  if (o.startsAt && o.startsAt > today()) return 'scheduled';
  return 'active';
}

function OfferForm({ open, offer, onClose, onSaved }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const blank = { type: 'percentage', code: '', title_ar: '', title_en: '', value: '10', min_subtotal: '0', starts_at: '', ends_at: '', usage_limit: '', active: true };
  const [f, setF] = useState(blank);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(offer ? { type: offer.type, code: offer.code, title_ar: offer.title.ar, title_en: offer.title.en, value: String(offer.value), min_subtotal: String(offer.minSubtotal), starts_at: offer.startsAt || '', ends_at: offer.endsAt || '', usage_limit: offer.usageLimit ? String(offer.usageLimit) : '', active: offer.active } : blank);
  }, [open, offer]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  const gen = () => setF({ ...f, code: `BANHA${Math.random().toString(36).slice(2, 6).toUpperCase()}` });

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      const body = { ...f, value: Number(f.value || 0), min_subtotal: Number(f.min_subtotal || 0), starts_at: f.starts_at || null, ends_at: f.ends_at || null, usage_limit: f.usage_limit ? Number(f.usage_limit) : null };
      const r = await api(offer ? `/owner/offers/${offer.id}` : '/owner/offers', { method: offer ? 'PUT' : 'POST', body });
      onSaved(r.offer, !offer);
      toast({ title: t('offers.saved') });
      onClose();
    } catch (e) {
      setErrors(fieldErrors(t, e));
      if (!e.fields) toast({ tone: 'error', title: errorMessage(t, e) });
    }
    setBusy(false);
  };

  return (
    <Sheet open={open} onClose={onClose} title={offer ? t('common.edit') : t('offers.new')} side="auto" desktop="end" size="md"
      footer={<Button full size="lg" onClick={save} loading={busy}>{t('common.save')}</Button>}>
      <div className="space-y-5 py-4">
        <div className="grid grid-cols-3 gap-2">
          {['percentage', 'fixed', 'free_shipping'].map((ty) => {
            const Icon = ICONS[ty];
            return (
              <button key={ty} type="button" onClick={() => setF({ ...f, type: ty })} aria-pressed={f.type === ty}
                className={cx('flex flex-col items-center gap-2 rounded-2xl border-2 p-3 text-center text-[13px] font-semibold transition', f.type === ty ? 'border-primary bg-primary/[0.05] text-brand' : 'border-line hover:border-line-strong')}>
                <Icon className="h-5 w-5" />{t(`offers.type.${ty}`)}
              </button>
            );
          })}
        </div>
        <Field label={t('offers.code')} error={errors.code} labelEnd={<button type="button" onClick={gen} className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><Sparkles className="h-3.5 w-3.5" />{t('offers.generate')}</button>}>
          <Input dir="ltr" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} className="font-mono uppercase tracking-wider" placeholder="WELCOME10" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('offers.titleAr')} error={errors.title_ar}><Input dir="rtl" value={f.title_ar} onChange={set('title_ar')} /></Field>
          <Field label={t('offers.titleEn')} error={errors.title_en}><Input dir="ltr" value={f.title_en} onChange={set('title_en')} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {f.type !== 'free_shipping' && <Field label={t('offers.value')} error={errors.value}><Input inputMode="numeric" suffix={f.type === 'percentage' ? '%' : t('common.currency')} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value.replace(/\D/g, '') })} /></Field>}
          <Field label={t('offers.minSubtotal')}><Input inputMode="numeric" suffix={t('common.currency')} value={f.min_subtotal} onChange={(e) => setF({ ...f, min_subtotal: e.target.value.replace(/\D/g, '') })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('offers.startsAt')} optional={t('common.optional')}><Input type="date" value={f.starts_at} onChange={set('starts_at')} /></Field>
          <Field label={t('offers.endsAt')} optional={t('common.optional')} error={errors.ends_at}><Input type="date" value={f.ends_at} onChange={set('ends_at')} /></Field>
        </div>
        <Field label={t('offers.usageLimit')} hint={!f.usage_limit ? t('offers.unlimited') : undefined}><Input inputMode="numeric" value={f.usage_limit} onChange={(e) => setF({ ...f, usage_limit: e.target.value.replace(/\D/g, '') })} placeholder="∞" /></Field>
        <Switch label={t('offers.active')} checked={f.active} onChange={(v) => setF({ ...f, active: v })} />
        <p className="sr-only">{lang}</p>
      </div>
    </Sheet>
  );
}

export default function Offers() {
  const { t, tr, lang } = useI18n();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { data, error, reload, mutate } = useApi('/owner/offers');
  const [edit, setEdit] = useState(null);
  const [formOpen, setFormOpen] = useState(params.get('new') === '1');
  const [del, setDel] = useState(null);

  const toggle = async (o, active) => {
    mutate((d) => ({ items: d.items.map((x) => (x.id === o.id ? { ...x, active } : x)) }));
    try { await api(`/owner/offers/${o.id}`, { method: 'PATCH', body: { active } }); invalidate('/stores/'); } catch (e) { toast({ tone: 'error', title: errorMessage(t, e) }); reload(); }
  };
  const remove = async () => {
    try { await api(`/owner/offers/${del.id}`, { method: 'DELETE' }); mutate((d) => ({ items: d.items.filter((x) => x.id !== del.id) })); toast({ title: t('offers.deleted') }); } catch (e) { toast({ tone: 'error', title: errorMessage(t, e) }); }
    setDel(null);
  };
  const valueLabel = (o) => (o.type === 'percentage' ? `${o.value}%` : o.type === 'fixed' ? formatMoney(o.value, lang) : t('offers.type.free_shipping'));
  const stateTone = { active: 'success', inactive: 'neutral', expired: 'danger', scheduled: 'info' };

  return (
    <PageTransition>
      <PageHeader title={t('offers.title')} actions={<Button icon={Plus} onClick={() => { setEdit(null); setFormOpen(true); }}>{t('offers.new')}</Button>} />
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <ListSkeleton rows={4} /> : !data.items.length ? (
        <EmptyState icon={TicketPercent} title={t('offers.empty')} body={t('offers.emptyBody')} action={<Button icon={Plus} onClick={() => setFormOpen(true)}>{t('offers.new')}</Button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.items.map((o, i) => {
            const st = offerState(o);
            const Icon = ICONS[o.type];
            return (
              <motion.div key={o.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                className={cx('relative overflow-hidden rounded-2xl border border-line bg-elevated', st !== 'active' && 'opacity-80')}>
                <div className="flex items-start justify-between gap-3 p-5 pb-4">
                  <div className="flex items-center gap-3">
                    <span className={cx('grid h-11 w-11 place-items-center rounded-xl', st === 'active' ? 'bg-primary text-on-primary' : 'bg-fg/[0.06] text-muted')}><Icon className="h-5 w-5" /></span>
                    <div><p className="text-xl font-semibold tabular">{o.type === 'free_shipping' ? valueLabel(o) : t('offers.off', { v: valueLabel(o) })}</p><p className="text-sm text-muted">{tr(o.title)}</p></div>
                  </div>
                  <Switch checked={o.active} onChange={(v) => toggle(o, v)} />
                </div>
                <div className="relative mx-5 border-t border-dashed border-line-strong">
                  <span className="absolute -start-7 -top-2.5 h-5 w-5 rounded-full border border-line bg-canvas" />
                  <span className="absolute -end-7 -top-2.5 h-5 w-5 rounded-full border border-line bg-canvas" />
                </div>
                <div className="flex items-center justify-between gap-2 p-5 pt-4">
                  <button type="button" onClick={() => { navigator.clipboard?.writeText(o.code); toast({ title: t('common.copied'), description: o.code }); }}
                    className="inline-flex items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5 font-mono text-sm font-bold tracking-wider" dir="ltr"><Copy className="h-3.5 w-3.5 text-muted" />{o.code}</button>
                  <div className="flex items-center gap-1">
                    <IconButton size="sm" label={t('common.edit')} icon={Pencil} iconClass="h-4 w-4" onClick={() => { setEdit(o); setFormOpen(true); }} />
                    <IconButton size="sm" label={t('common.delete')} icon={Trash2} iconClass="h-4 w-4 text-sale" onClick={() => setDel(o)} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line bg-surface/60 px-5 py-3 text-[13px] text-muted">
                  <Badge tone={stateTone[st]} dot size="sm">{t(`offers.${st}`)}</Badge>
                  <span>{t('offers.used', { n: formatNumber(o.usageCount, lang) })}{o.usageLimit ? ` / ${o.usageLimit}` : ''}</span>
                  {o.minSubtotal > 0 && <span>{t('offers.minOrder', { v: formatMoney(o.minSubtotal, lang) })}</span>}
                  {o.endsAt && <span>{t('offers.endsAt')}: {formatDate(`${o.endsAt} 12:00:00`, lang)}</span>}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
      <OfferForm open={formOpen} offer={edit} onClose={() => { setFormOpen(false); if (params.get('new')) setParams({}, { replace: true }); }}
        onSaved={(o, created) => mutate((d) => ({ items: created ? [o, ...(d?.items || [])] : d.items.map((x) => (x.id === o.id ? o : x)) }))} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={remove} danger title={t('common.delete')} body={del ? t('offers.confirmDelete', { code: del.code }) : ''} confirmLabel={t('common.delete')} />
    </PageTransition>
  );
}
