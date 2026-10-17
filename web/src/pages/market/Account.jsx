import { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { User, LogOut, Bell, Shirt, ShoppingBag, Sparkles, BellRing, BellOff, MessageCircle } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi, invalidate } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useBuyer } from '../../lib/buyer.jsx';
import { useBuyerPush } from '../../lib/pwa.js';
import { formatMoney } from '../../lib/format.js';
import MarketHeader from '../../components/market/MarketHeader.jsx';
import Button from '../../components/ui/Button.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import { Field, Input } from '../../components/ui/Field.jsx';
import { EmptyState, errorMessage, fieldErrors } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { SALES_WHATSAPP } from '../../config/contact.js';
import { cx } from '../../components/ui/cx.js';

function Shell({ children }) {
  return <div className="min-h-dvh bg-canvas"><MarketHeader /><main className="container max-w-2xl pb-20 pt-6 sm:pt-10">{children}</main></div>;
}

function AuthForm() {
  const { t } = useI18n();
  const { login, register } = useBuyer();
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', phone: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({}); const [msg, setMsg] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErrors({}); setMsg('');
    try { await (mode === 'login' ? login({ phone: f.phone, password: f.password }) : register(f)); }
    catch (x) { setErrors(fieldErrors(t, x)); setMsg(x.code === 'invalid_credentials' ? t('acc.badLogin') : errorMessage(t, x)); }
    setBusy(false);
  };
  return (
    <Shell>
      <div className="text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-brand"><User className="h-7 w-7" /></span>
        <h1 className="mt-4 font-display text-2xl font-bold sm:text-3xl">{t('acc.title')}</h1>
        <p className="mt-2 text-muted">{t('acc.sub')}</p>
      </div>
      <p className="mt-5 rounded-2xl bg-secondary p-4 text-sm text-on-secondary">{t('acc.why')}</p>
      <div role="tablist" className="mt-5 grid grid-cols-2 gap-1 rounded-2xl bg-secondary p-1">
        {['login', 'register'].map((m) => <button key={m} role="tab" aria-selected={mode === m} type="button" onClick={() => { setMode(m); setMsg(''); }} className={cx('h-11 rounded-xl text-sm font-semibold transition', mode === m ? 'bg-elevated shadow-sm' : 'text-muted')}>{t(`acc.tab.${m}`)}</button>)}
      </div>
      <form onSubmit={submit} className="mt-4 space-y-4 rounded-3xl border border-line bg-elevated p-5 sm:p-6">
        {mode === 'register' && <Field label={t('acc.name')} error={errors.name}><Input value={f.name} onChange={set('name')} required minLength={2} autoComplete="name" /></Field>}
        <Field label={t('acc.phone')} error={errors.phone}><Input dir="ltr" inputMode="tel" value={f.phone} onChange={set('phone')} placeholder="01XXXXXXXXX" className="text-start" required autoComplete="tel" /></Field>
        <Field label={mode === 'login' ? t('acc.password') : t('acc.password6')} error={errors.password}><Input dir="ltr" type="password" value={f.password} onChange={set('password')} required minLength={mode === 'login' ? 1 : 6} className="text-start" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></Field>
        {msg && !Object.keys(errors).length && <p role="alert" className="text-[13px] font-medium text-sale">{msg}</p>}
        <Button type="submit" size="lg" full loading={busy}>{mode === 'login' ? t('acc.login') : t('acc.register')}</Button>
        {mode === 'login' && <a className="block text-center text-[13px] text-brand" href={`https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent(t('acc.forgot'))}`} target="_blank" rel="noreferrer">{t('acc.forgot')}</a>}
      </form>
    </Shell>
  );
}

const STATUS_TONE = { pending: 'bg-amber-100 text-amber-800', confirmed: 'bg-sky-100 text-sky-800', processing: 'bg-violet-100 text-violet-800', shipped: 'bg-sky-100 text-sky-800', delivered: 'bg-emerald-100 text-emerald-800', cancelled: 'bg-red-100 text-red-700' };

function Orders() {
  const { t, tr, lang } = useI18n();
  const toast = useToast();
  const { data, reload } = useApi('/buyer/orders');
  const [open, setOpen] = useState(false); const [f, setF] = useState({ number: '', phone: '' }); const [busy, setBusy] = useState(false);
  const claim = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api('/buyer/orders/claim', { method: 'POST', body: f }); invalidate('/buyer/'); reload(); toast({ title: t('acc.claimed') }); setOpen(false); setF({ number: '', phone: '' }); }
    catch (x) { toast({ tone: 'error', title: x.status === 404 ? t('track.notFoundPair') : errorMessage(t, x) }); }
    setBusy(false);
  };
  if (!data) return <Skeleton className="h-40 w-full rounded-2xl" />;
  return (
    <div className="space-y-3">
      {!data.items.length && <EmptyState icon={ShoppingBag} title={t('acc.orders')} body={t('acc.noOrders')} />}
      {data.items.map((o) => (
        <Link key={o.token} to={`/track/${o.token}`} className="block rounded-2xl border border-line bg-elevated p-4 transition hover:border-fg/30">
          <div className="flex items-center justify-between gap-3"><div><p className="font-mono font-semibold" dir="ltr">{o.number}</p><p className="text-[13px] text-muted">{tr(o.store.name)} · {formatMoney(o.total, lang)}</p></div><span className={cx('rounded-full px-3 py-1 text-[13px] font-semibold', STATUS_TONE[o.status])}>{t(`track.s.${o.status}`)}</span></div>
          <div className="mt-3 flex gap-2">{o.items.slice(0, 5).map((i, k) => <SmartImage key={k} media={i.image} ratio="4 / 5" sizes="48px" className="w-12 rounded-lg" />)}</div>
        </Link>
      ))}
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-sm font-semibold text-brand">{t('acc.claim')}</button>
      {open && (
        <form onSubmit={claim} className="grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label={t('acc.claimNumber')}><Input dir="ltr" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} className="text-start" required /></Field>
          <Field label={t('acc.claimPhone')}><Input dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className="text-start" required /></Field>
          <Button type="submit" loading={busy}>{t('acc.claimGo')}</Button>
        </form>
      )}
    </div>
  );
}

function Wardrobe() {
  const { t, tr } = useI18n();
  const nav = useNavigate();
  const { data } = useApi('/buyer/wardrobe');
  if (!data) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (!data.items.length) return <EmptyState icon={Shirt} title={t('acc.wardrobe')} body={t('acc.wardEmpty')} />;
  const ask = (it) => { nav('/'); setTimeout(() => window.dispatchEvent(new CustomEvent('moda:open', { detail: { ask: t('acc.wardAskMsg', { x: [tr(it.name), it.color].filter(Boolean).join(' ') }) } })), 500); };
  return (
    <div>
      <p className="mb-4 text-sm text-muted">{t('acc.wardNote')}</p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {data.items.map((it, i) => (
          <li key={i} className="overflow-hidden rounded-2xl border border-line bg-elevated">
            {it.slug ? <Link to={`/s/${it.store.slug}/p/${it.slug}`}><SmartImage media={it.image} ratio="4 / 5" sizes="200px" /></Link> : <SmartImage media={it.image} ratio="4 / 5" sizes="200px" />}
            <div className="p-3"><p className="line-clamp-1 text-sm font-semibold">{tr(it.name)}</p><p className="text-xs text-muted">{[it.color, it.size].filter(Boolean).join(' · ')}</p>
              <button type="button" onClick={() => ask(it)} className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand"><Sparkles className="h-3.5 w-3.5" />{t('acc.wardAsk')}</button></div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const day = (iso, lang) => { try { return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso.replace(' ', 'T') + 'Z')); } catch { return ''; } };

function Alerts() {
  const { t, tr, lang } = useI18n();
  const { setUnread, refresh } = useBuyer();
  const toast = useToast();
  const push = useBuyerPush();
  const { data, reload } = useApi('/buyer/notifications');
  const { data: fol, reload: reloadFol } = useApi('/buyer/follows');
  useEffect(() => { if (data?.unread > 0) api('/buyer/notifications/read', { method: 'POST' }).then(() => { setUnread(0); }).catch(() => {}); }, [data, setUnread]);
  const toggle = async () => { try { if (push.enabled) await push.disable(); else if (!(await push.enable())) toast({ tone: 'error', title: t('acc.pushDenied') }); } catch { toast({ tone: 'error', title: t('error.body') }); } };
  const unfollow = async (slug) => { await api(`/buyer/follows/${slug}`, { method: 'DELETE' }).catch(() => {}); invalidate('/buyer/follows'); reloadFol(); };
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-line bg-elevated p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-brand">{push.enabled ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}</span>
          <div className="min-w-0 flex-1"><p className="font-semibold">{t('acc.push')}</p><p className="mt-0.5 text-sm text-muted">{!push.supported ? t('acc.pushNo') : push.permission === 'denied' ? t('acc.pushDenied') : t('acc.pushBody')}</p></div>
          {push.supported && push.permission !== 'denied' && <Button size="sm" variant={push.enabled ? 'outline' : 'primary'} icon={push.enabled ? BellOff : BellRing} onClick={toggle}>{push.enabled ? t('acc.pushOff') : t('acc.pushOn')}</Button>}
        </div>
      </section>
      {fol?.stores?.length > 0 && (
        <section><h2 className="mb-2 text-sm font-semibold text-muted">{t('acc.following')}</h2>
          <ul className="flex flex-wrap gap-2">{fol.stores.map((s) => <li key={s.slug} className="inline-flex items-center gap-2 rounded-full border border-line bg-elevated py-1.5 ps-3.5 pe-1.5 text-sm"><Link to={`/s/${s.slug}`} className="font-semibold">{tr(s.name)}</Link><button type="button" onClick={() => unfollow(s.slug)} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">{t('acc.unfollow')}</button></li>)}</ul></section>
      )}
      {!data ? <Skeleton className="h-40 w-full rounded-2xl" /> : !data.items.length ? <EmptyState icon={Bell} title={t('acc.alerts')} body={t('acc.noAlerts')} /> : (
        <ul className="space-y-2">
          {data.items.map((n) => (
            <li key={n.id}><Link to={n.url || '/account'} className={cx('block rounded-2xl border p-4 transition hover:border-fg/30', n.read ? 'border-line bg-elevated' : 'border-line bg-[#F1F4F9]')}>
              <p className="font-semibold">{n.title}</p>{n.body && <p className="mt-0.5 text-sm text-muted">{n.body}</p>}<p className="mt-1 text-xs text-muted">{day(n.createdAt, lang)}</p></Link></li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Account() {
  const { t } = useI18n();
  const me = useBuyer();
  const [sp, setSp] = useSearchParams();
  const tab = ['orders', 'wardrobe', 'alerts'].includes(sp.get('tab')) ? sp.get('tab') : 'orders';
  if (!me.ready) return <Shell><Skeleton className="h-64 w-full rounded-3xl" /></Shell>;
  if (!me.buyer) return <AuthForm />;
  const tabs = [['orders', ShoppingBag], ['wardrobe', Shirt], ['alerts', Bell]];
  return (
    <Shell>
      <div className="flex items-center justify-between gap-3">
        <div><h1 className="font-display text-2xl font-bold sm:text-3xl">{t('acc.hello', { name: me.buyer.name.split(' ')[0] })}</h1><p className="text-sm text-muted" dir="ltr">{me.buyer.phone}</p></div>
        <Button variant="outline" size="sm" icon={LogOut} onClick={me.logout}>{t('acc.logout')}</Button>
      </div>
      <div role="tablist" className="mt-5 grid grid-cols-3 gap-1 rounded-2xl bg-secondary p-1">
        {tabs.map(([k, Icon]) => <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setSp({ tab: k }, { replace: true })} className={cx('relative inline-flex h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition', tab === k ? 'bg-elevated shadow-sm' : 'text-muted')}><Icon className="h-4 w-4" />{t(`acc.${k}`)}{k === 'alerts' && me.unread > 0 && <span className="h-2 w-2 rounded-full bg-sale" />}</button>)}
      </div>
      <div className="mt-5">{tab === 'orders' ? <Orders /> : tab === 'wardrobe' ? <Wardrobe /> : <Alerts />}</div>
    </Shell>
  );
}
