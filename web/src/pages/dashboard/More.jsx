import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ExternalLink, LogOut, Languages } from 'lucide-react';
import { useAuth } from '../../lib/auth.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { useNav } from './DashboardLayout.jsx';
import { StoreLogo } from '../../components/store/StoreChrome.jsx';
import AppAlertsCard from '../../components/dash/AppAlertsCard.jsx';
import PageTransition from '../../components/PageTransition.jsx';

export default function More() {
  const { store, user, logout } = useAuth();
  const { t, tr, isRtl, toggle } = useI18n();
  const nav = useNav();
  const Chevron = isRtl ? ChevronLeft : ChevronRight;
  return (
    <PageTransition>
      <div className="mb-6 flex items-center gap-4 rounded-2xl border border-line bg-elevated p-4">
        <StoreLogo store={store} size={56} className="h-14 w-14" />
        <div className="min-w-0 flex-1"><p className="truncate text-lg font-semibold">{tr(store.name)}</p><p className="truncate text-sm text-muted">{user.email}</p></div>
        <a href={`/s/${store.slug}`} target="_blank" rel="noreferrer" aria-label={t('dash.viewStore')} className="grid h-11 w-11 place-items-center rounded-full bg-secondary text-brand"><ExternalLink className="h-5 w-5" /></a>
      </div>
      <AppAlertsCard className="mb-5" />
      {nav.map((g, i) => (
        <div key={i} className="mb-5">
          {g.group && <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted">{g.group}</p>}
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-elevated">
            {g.items.map((it) => (
              <li key={it.to}><Link to={it.to} className="flex h-14 items-center gap-3.5 px-4 transition active:bg-fg/[0.04]">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-fg/[0.05]"><it.icon className="h-[18px] w-[18px]" /></span>
                <span className="flex-1 font-medium">{it.label}</span><Chevron className="h-4 w-4 text-muted" />
              </Link></li>
            ))}
          </ul>
        </div>
      ))}
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-elevated">
        <li><button type="button" onClick={toggle} className="flex h-14 w-full items-center gap-3.5 px-4 text-start"><span className="grid h-9 w-9 place-items-center rounded-xl bg-fg/[0.05]"><Languages className="h-[18px] w-[18px]" /></span><span className="flex-1 font-medium">{t('common.language')}</span></button></li>
        <li><button type="button" onClick={logout} className="flex h-14 w-full items-center gap-3.5 px-4 text-start text-sale"><span className="grid h-9 w-9 place-items-center rounded-xl bg-sale/10"><LogOut className="h-[18px] w-[18px] rtl:-scale-x-100" /></span><span className="flex-1 font-medium">{t('auth.logout')}</span></button></li>
      </ul>
    </PageTransition>
  );
}
