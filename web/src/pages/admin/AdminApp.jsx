import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { BarChart3, Ticket, Camera, Tags, LayoutDashboard, Store, ShoppingBag, Truck, ShieldCheck, Bell, LogOut, KeyRound, BellRing, Volume2, VolumeX } from 'lucide-react';
import { useTheme, DASHBOARD_THEME } from '../../lib/theme.js';
import { ToastProvider, useToast } from '../../components/ui/Toast.jsx';
import Button from '../../components/ui/Button.jsx';
import { Field, Input } from '../../components/ui/Field.jsx';
import Brand from '../../components/market/Brand.jsx';
import { cx } from '../../components/ui/cx.js';
import { adminApi, adminKey, adminSession, setAdminAuthFail, fmtMoney } from './adminApi.js';

const NAV = [
  { to: '/admin', end: true, icon: LayoutDashboard, label: 'الرئيسية' },
  { to: '/admin/stores', icon: Store, label: 'المحلات' },
  { to: '/admin/departments', icon: Tags, label: 'الأقسام' },
  { to: '/admin/orders', icon: ShoppingBag, label: 'الطلبات' },
  { to: '/admin/deliveries', icon: Truck, label: 'التوصيل', badge: 'open' },
  { to: '/admin/reports', icon: BarChart3, label: 'التقارير' },
  { to: '/admin/coupons', icon: Ticket, label: 'الكوبونات' },
  { to: '/admin/services', icon: Camera, label: 'الخدمات', badge: 'services' },
  { to: '/admin/system', icon: ShieldCheck, label: 'النظام' },
];

function Gate({ onAuthed }) {
  const [key, setKey] = useState('');
  const [code, setCode] = useState('');
  const [step2, setStep2] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await adminApi('/login', { method: 'POST', key, session: '', body: step2 ? { code } : {} });
      adminKey.set(key); adminSession.set(r.session || ''); onAuthed();
    } catch (x) {
      if (x.code === 'totp_required') { setStep2(true); setErr(step2 ? 'اكتب الكود' : ''); }
      else if (x.code === 'bad_code') { setErr(x.message.includes('already') ? 'الكود ده اتستخدم، استنى الكود الجديد' : 'الكود غلط'); setCode(''); }
      else setErr(x.status === 401 ? 'المفتاح غلط' : x.status === 429 ? 'محاولات كتير، استنى شوية' : x.status === 503 ? 'ADMIN_KEY مش مضبوط على السيرفر' : x.message);
    }
    setBusy(false);
  };
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-4" dir="rtl">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl border border-line bg-elevated p-7 shadow-soft">
        <div className="mb-6 flex justify-center"><Brand to="/admin" /></div>
        <h1 className="mb-1 text-center text-xl font-bold">لوحة إدارة المنصة</h1>
        <p className="mb-6 text-center text-sm text-muted">{step2 ? 'افتح تطبيق المصادقة واكتب الكود المكوّن من ٦ أرقام' : 'للفريق فقط — ادخل مفتاح الإدارة'}</p>
        {!step2 ? (
          <Field label="مفتاح الإدارة" error={err}>
            <Input type="password" dir="ltr" autoFocus autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} invalid={!!err} prefix={<KeyRound className="h-4 w-4" />} />
          </Field>
        ) : (
          <Field label="كود التأكيد" error={err}>
            <Input dir="ltr" autoFocus autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} invalid={!!err} prefix={<ShieldCheck className="h-4 w-4" />} className="text-center tracking-[0.4em]" />
          </Field>
        )}
        <Button type="submit" full className="mt-5" loading={busy} disabled={step2 ? code.length !== 6 : !key}>{step2 ? 'تأكيد' : 'دخول'}</Button>
        {step2 && <button type="button" onClick={() => { setStep2(false); setCode(''); setErr(''); }} className="mt-3 w-full text-center text-sm text-muted hover:text-fg">رجوع</button>}
      </form>
    </div>
  );
}

/** Polls for new delivery requests: bell counter, toast, optional sound + browser notification. */
function useDeliveryAlerts() {
  const toast = useToast();
  const [counts, setCounts] = useState({ open: 0, ready: 0, services: 0 });
  const [recent, setRecent] = useState([]);
  const [sound, setSound] = useState(() => { try { return localStorage.getItem('bo.adminSound') !== '0'; } catch { return true; } });
  const since = useRef(null);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const beep = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.18].forEach((d) => { const o = ctx.createOscillator(); const g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.setValueAtTime(0.0001, ctx.currentTime + d); g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + d + 0.15); o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.16); });
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const d = await adminApi(`/notifications${since.current ? `?since=${encodeURIComponent(since.current)}` : ''}`);
        if (stop) return;
        setCounts({ open: d.open, ready: d.ready, services: d.servicesNew });
        if (since.current && d.services?.length) {
          for (const sv of d.services.slice().reverse()) toast({ title: `${sv.type === 'design_banner' ? 'طلب تصميم بنر' : sv.type === 'design_cover' ? 'طلب تصميم غلاف' : 'طلب تصوير جديد'} من ${sv.store_name}`, description: sv.type?.startsWith('design') ? 'عايز يشوف أشكال ويختار' : sv.plan === 'monthly' ? 'اشتراك شهري' : 'مرة واحدة', tone: 'info', duration: 10000 });
          if (soundRef.current) beep();
        }
        if (since.current && d.items.length) {
          setRecent((r) => [...d.items, ...r].slice(0, 15));
          for (const it of d.items.slice().reverse()) {
            const text = it.kind === 'handoff' ? `${it.store_name} حوّل طلب #${it.number} لينا` : `طلب جديد #${it.number} من ${it.store_name} (توصيلنا)`;
            toast({ title: text, description: `نحصّل ${fmtMoney(it.total)}`, tone: "info", duration: 10000 });
            try { if (document.hidden && Notification?.permission === 'granted') new Notification('طلب توصيل جديد 🚚', { body: text }); } catch { /* ignore */ }
          }
          if (soundRef.current) beep();
        }
        since.current = d.now;
      } catch { /* ignore transient */ }
    };
    tick();
    const id = setInterval(tick, 20000);
    return () => { stop = true; clearInterval(id); };
  }, [toast, beep]);
  useEffect(() => { document.title = counts.ready ? `(${counts.ready}) إدارة بنها أوتفيت` : 'إدارة بنها أوتفيت'; }, [counts.ready]);
  const toggleSound = () => { const v = !sound; setSound(v); try { localStorage.setItem('bo.adminSound', v ? '1' : '0'); } catch { /* ignore */ } if (v) beep(); };
  const askPermission = () => { try { Notification.requestPermission(); } catch { /* ignore */ } };
  return { counts, recent, sound, toggleSound, askPermission };
}

function Bell_({ alerts }) {
  const [open, setOpen] = useState(false);
  const { counts, recent, sound, toggleSound, askPermission } = alerts;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="التنبيهات" className="relative grid h-10 w-10 place-items-center rounded-full border border-line bg-elevated hover:bg-fg/[0.05]">
        <Bell className="h-[18px] w-[18px]" />
        {counts.ready > 0 && <span className="absolute -end-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-sale px-1 text-[11px] font-bold text-white">{counts.ready}</span>}
      </button>
      {open && (
        <>
          <button type="button" aria-label="إغلاق" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute end-0 top-12 z-50 w-80 max-w-[85vw] rounded-2xl border border-line bg-elevated p-3 shadow-lift">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-sm font-semibold">طلبات التوصيل علينا</p>
              <span className="flex gap-1">
                <button type="button" onClick={toggleSound} aria-label="الصوت" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-fg/[0.06]">{sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}</button>
                <button type="button" onClick={askPermission} aria-label="إشعارات المتصفح" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-fg/[0.06]"><BellRing className="h-4 w-4" /></button>
              </span>
            </div>
            <p className="px-1 pb-2 text-[13px] text-muted">{counts.ready} جاهز للاستلام · {counts.open} مفتوح</p>
            {recent.length ? recent.map((r, i) => (
              <NavLink key={i} to="/admin/deliveries" onClick={() => setOpen(false)} className="block rounded-xl px-2 py-2 text-sm hover:bg-fg/[0.05]">
                <span className="font-semibold">#{r.number}</span> — {r.store_name} <span className="text-muted">({r.kind === 'handoff' ? 'تحويل' : 'جديد'})</span>
              </NavLink>
            )) : <p className="px-2 py-3 text-sm text-muted">مفيش تنبيهات جديدة من وقت ما فتحت الصفحة.</p>}
          </div>
        </>
      )}
    </div>
  );
}

function Shell({ onLogout }) {
  const alerts = useDeliveryAlerts();
  return (
    <div className="min-h-dvh bg-canvas" dir="rtl">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-[240px] flex-col border-e border-line bg-elevated p-4 lg:flex">
        <div className="mb-6 px-2 pt-1"><Brand to="/admin" /><p className="mt-1 text-xs font-medium text-muted">لوحة إدارة المنصة</p></div>
        <nav className="space-y-1">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition', isActive ? 'bg-fg text-canvas' : 'text-fg hover:bg-fg/[0.06]')}>
              <n.icon className="h-[18px] w-[18px]" />{n.label}
              {n.badge && alerts.counts[n.badge] > 0 && <span className="ms-auto rounded-full bg-sale px-2 text-xs font-bold text-white">{alerts.counts[n.badge]}</span>}
            </NavLink>
          ))}
        </nav>
        <button type="button" onClick={onLogout} className="mt-auto flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium text-muted hover:bg-fg/[0.06]"><LogOut className="h-[18px] w-[18px]" />خروج</button>
      </aside>

      <div className="lg:ps-[240px]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="lg:hidden"><Brand to="/admin" /></div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-2"><Bell_ alerts={alerts} /><button type="button" onClick={onLogout} aria-label="خروج" className="grid h-10 w-10 place-items-center rounded-full border border-line bg-elevated hover:bg-fg/[0.05] lg:hidden"><LogOut className="h-[18px] w-[18px]" /></button></div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8"><Outlet context={alerts} /></main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-line bg-elevated/95 pb-[var(--safe-b)] backdrop-blur-md lg:hidden" aria-label="التنقل">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('relative flex h-16 min-w-[72px] flex-1 shrink-0 flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive ? 'text-brand' : 'text-muted')}>
            <n.icon className="h-5 w-5" />{n.label}
            {n.badge && alerts.counts[n.badge] > 0 && <span className="absolute end-2 top-2 grid h-4 min-w-4 place-items-center rounded-full bg-sale px-1 text-[10px] font-bold text-white">{alerts.counts[n.badge]}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default function AdminApp() {
  useTheme(DASHBOARD_THEME);
  const [authed, setAuthed] = useState(() => !!adminKey.get());
  useEffect(() => { setAdminAuthFail(() => { adminKey.set(''); setAuthed(false); }); }, []);
  const logout = () => { adminKey.set(''); setAuthed(false); };
  return (
    <ToastProvider>
      {authed ? <Shell onLogout={logout} /> : <Gate onAuthed={() => setAuthed(true)} />}
    </ToastProvider>
  );
}
