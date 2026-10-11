import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PackagePlus, ShieldCheck, Truck, Eye, ImagePlus, X, Check, Copy, MessageCircle } from 'lucide-react';
import { GOVERNORATES } from '@souqna/shared';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';
import MarketHeader from '../../components/market/MarketHeader.jsx';
import Button from '../../components/ui/Button.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { Field, Input, Textarea, Select } from '../../components/ui/Field.jsx';
import { ErrorState, errorMessage, fieldErrors } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { SALES_WHATSAPP } from '../../config/contact.js';
import { cx } from '../../components/ui/cx.js';

const CK = 'bo.request.contact';
const loadContact = () => { try { return JSON.parse(localStorage.getItem(CK) || '{}'); } catch { return {}; } };

async function shrink(file, max = 1400) {
  try {
    const bmp = await createImageBitmap(file); const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.82));
    return blob ? new File([blob], 'item.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}

function Shell({ children }) {
  return <div className="min-h-dvh bg-canvas"><MarketHeader /><main className="container max-w-xl pb-16 pt-6 sm:pt-10">{children}</main></div>;
}

function Promise3() {
  const { t } = useI18n();
  return (
    <ul className="mt-5 grid gap-2.5 rounded-2xl bg-secondary p-4 text-sm text-on-secondary">
      {[[Truck, t('req.p1')], [Eye, t('req.p2')], [ShieldCheck, t('req.p3')]].map(([Icon, text]) => <li key={text} className="flex items-start gap-3"><Icon className="mt-0.5 h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />{text}</li>)}
    </ul>
  );
}

function RequestForm() {
  const { t } = useI18n();
  const [sp] = useSearchParams();
  const toast = useToast();
  const saved = useRef(loadContact()).current;
  const [f, setF] = useState({ title: sp.get('title') || '', details: '', link: '', size: '', color: '', budget: '', name: saved.name || '', phone: saved.phone || '', governorate: saved.governorate || 'Qalyubia', city: saved.city || '', address: saved.address || '' });
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [sent, setSent] = useState(null);
  useEffect(() => { if (!photo) { setPreview(''); return undefined; } const u = URL.createObjectURL(photo); setPreview(u); return () => URL.revokeObjectURL(u); }, [photo]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErrors({});
    const fd = new FormData();
    Object.entries({ ...f, source: sp.get('from') || '' }).forEach(([k, v]) => { if (String(v).trim()) fd.set(k, String(v).trim()); });
    if (photo) fd.set('photo', photo);
    try {
      const r = await api('/sourcing', { method: 'POST', body: fd });
      try { localStorage.setItem(CK, JSON.stringify({ name: f.name, phone: f.phone, governorate: f.governorate, city: f.city, address: f.address })); } catch { /* ignore */ }
      setSent(r);
    } catch (x) { setErrors(fieldErrors(t, x)); toast({ tone: 'error', title: errorMessage(t, x) }); }
    setBusy(false);
  };

  if (sent) {
    const link = `${window.location.origin}/request/${sent.token}`;
    return (
      <Shell>
        <div className="rounded-3xl border border-line bg-elevated p-6 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-7 w-7" /></span>
          <h1 className="mt-4 font-display text-2xl font-bold">{t('req.sentTitle')}</h1>
          <p className="mt-2 text-muted">{t('req.sentBody', { n: sent.number })}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button to={`/request/${sent.token}`}>{t('req.trackLink')}</Button>
            <Button variant="outline" icon={Copy} onClick={() => navigator.clipboard?.writeText(link).then(() => toast({ title: t('common.copied') })).catch(() => {})}>{t('req.copy')}</Button>
          </div>
        </div>
      </Shell>
    );
  }
  return (
    <Shell>
      <div className="text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-brand"><PackagePlus className="h-7 w-7" /></span>
        <h1 className="mt-4 font-display text-2xl font-bold sm:text-3xl">{t('req.title')}</h1>
        <p className="mt-2 text-muted">{t('req.sub')}</p>
      </div>
      <Promise3 />
      <form onSubmit={submit} className="mt-6 space-y-4 rounded-3xl border border-line bg-elevated p-5 sm:p-6">
        <Field label={t('req.what')} error={errors.title}><Input value={f.title} onChange={set('title')} placeholder={t('req.whatPh')} required minLength={3} maxLength={120} /></Field>
        <Field label={t('req.details')} optional={t('req.optional')}><Textarea rows={3} value={f.details} onChange={set('details')} placeholder={t('req.detailsPh')} maxLength={800} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('req.size')} optional={t('req.optional')}><Input value={f.size} onChange={set('size')} maxLength={30} /></Field>
          <Field label={t('req.color')} optional={t('req.optional')}><Input value={f.color} onChange={set('color')} maxLength={40} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('req.budget')} optional={t('req.optional')}><Input dir="ltr" inputMode="numeric" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value.replace(/\D/g, '') })} className="text-start" /></Field>
          <Field label={t('req.link')} optional={t('req.optional')} error={errors.link}><Input dir="ltr" type="url" value={f.link} onChange={set('link')} placeholder="https://" className="text-start" /></Field>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium">{t('req.photo')} <span className="font-normal text-muted">({t('req.optional')})</span></p>
          {preview ? (
            <span className="relative inline-block h-28 w-28 overflow-hidden rounded-xl"><img src={preview} alt="" className="h-full w-full object-cover" /><button type="button" aria-label="remove" onClick={() => setPhoto(null)} className="absolute end-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white"><X className="h-3.5 w-3.5" /></button></span>
          ) : (
            <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line-strong px-4 text-sm font-semibold hover:bg-fg/[0.04]"><ImagePlus className="h-5 w-5" />{t('req.pickPhoto')}<input type="file" accept="image/*" className="sr-only" onChange={async (e) => { const file = e.target.files?.[0]; if (file) setPhoto(await shrink(file)); e.target.value = ''; }} /></label>
          )}
        </div>
        <hr className="border-line" />
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('req.name')} error={errors.name}><Input value={f.name} onChange={set('name')} required minLength={2} autoComplete="name" /></Field>
          <Field label={t('req.phone')} error={errors.phone}><Input dir="ltr" inputMode="tel" value={f.phone} onChange={set('phone')} placeholder="01XXXXXXXXX" className="text-start" required autoComplete="tel" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('req.gov')}><Select value={f.governorate} onChange={set('governorate')}>{GOVERNORATES.map((g) => <option key={g} value={g}>{t(`gov.${g}`)}</option>)}</Select></Field>
          <Field label={t('req.city')}><Input value={f.city} onChange={set('city')} autoComplete="address-level2" /></Field>
        </div>
        <Field label={t('req.address')} error={errors.address}><Textarea rows={2} value={f.address} onChange={set('address')} required minLength={6} autoComplete="street-address" /></Field>
        <Button type="submit" size="lg" full loading={busy}>{t('req.submit')}</Button>
        <p className="text-center text-[13px] text-muted">{t('req.footer')}</p>
      </form>
    </Shell>
  );
}

const STEPS = ['new', 'quoted', 'approved', 'ordered', 'arrived', 'delivered'];

function RequestTrack({ token }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const { data, error, reload } = useApi(`/sourcing/${token}`);
  const [busy, setBusy] = useState('');
  const respond = async (accept) => {
    setBusy(accept ? 'y' : 'n');
    try { await api(`/sourcing/${token}/respond`, { method: 'POST', body: { accept } }); toast({ title: t('req.answered') }); reload(); } catch (x) { toast({ tone: 'error', title: errorMessage(t, x) }); }
    setBusy('');
  };
  if (error) return <Shell>{error.status === 404 ? <div className="rounded-3xl border border-line bg-elevated p-6 text-center"><p className="font-semibold">{t('track.notFound')}</p><Button className="mt-4" to="/request">{t('req.title')}</Button></div> : <ErrorState error={error} onRetry={reload} compact />}</Shell>;
  if (!data) return <Shell><Skeleton className="h-72 w-full rounded-3xl" /></Shell>;
  const x = data.request; const cancelled = x.status === 'cancelled'; const idx = Math.max(0, STEPS.indexOf(x.status));
  return (
    <Shell>
      <div className="rounded-3xl border border-line bg-elevated p-5 sm:p-6">
        <p className="text-sm text-muted">{x.number}</p>
        <h1 className="mt-1 font-display text-xl font-bold">{x.title}</h1>
        {x.photo && <img src={x.photo} alt="" className="mt-3 h-32 w-32 rounded-xl object-cover" />}
        <p className={cx('mt-4 inline-flex rounded-full px-3.5 py-1.5 text-sm font-semibold', cancelled ? 'bg-red-100 text-red-700' : x.status === 'delivered' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')}>{t(`req.s.${x.status}`)}</p>
        {!cancelled && (
          <ol className="mt-5 space-y-2">{STEPS.map((s, i) => <li key={s} className={cx('flex items-center gap-3 text-sm', i <= idx ? 'font-semibold' : 'text-muted')}><span className={cx('grid h-6 w-6 place-items-center rounded-full text-xs', i <= idx ? 'bg-primary text-on-primary' : 'bg-secondary')}>{i <= idx ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>{t(`req.s.${s}`)}</li>)}</ol>
        )}
        {x.note && <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900"><span className="block text-xs font-semibold">{t('req.noteFrom')}</span>{x.note}</p>}
        {x.status === 'quoted' && x.quotePrice != null && (
          <div className="mt-5 rounded-2xl border border-line p-4">
            <p className="text-sm text-muted">{t('req.quote')}</p><p className="text-2xl font-bold tabular">{formatMoney(x.quotePrice, lang)}</p>
            <div className="mt-3 flex gap-2"><Button loading={busy === 'y'} onClick={() => respond(true)}>{t('req.accept')}</Button><Button variant="outline" loading={busy === 'n'} onClick={() => respond(false)}>{t('req.decline')}</Button></div>
          </div>
        )}
        <p className="mt-5 flex items-start gap-2 rounded-xl bg-surface px-4 py-3 text-sm text-muted"><Eye className="mt-0.5 h-4 w-4 shrink-0" />{t('req.inspect')}</p>
      </div>
      <div className="mt-4"><Button variant="ghost" icon={MessageCircle} href={`https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent(`${x.number}`)}`} target="_blank" rel="noreferrer">{t('track.waUs')}</Button></div>
    </Shell>
  );
}

export default function Request() {
  const { token } = useParams();
  return token ? <RequestTrack token={token} /> : <RequestForm />;
}
