import { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { AuthContext } from '../../lib/auth.jsx';
import { DashBaseContext } from '../../lib/dashBase.js';
import { setAdminScope } from '../../lib/api.js';
import { invalidate } from '../../lib/hooks.js';
import { ErrorState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { adminApi, adminKey, adminSession } from './adminApi.js';

/**
 * Manage one store from inside the platform admin: the normal product screens, same powers as the owner,
 * but authenticated with the admin key — no owner login is created and the admin never leaves /admin.
 */
export default function StoreManage() {
  const { slug } = useParams();
  const [state, setState] = useState({ store: null, error: null });

  // Route every /owner/* call to this store (set before children render, cleared on leave).
  setAdminScope({ slug, key: () => adminKey.get(), session: () => adminSession.get() });
  useEffect(() => {
    invalidate('/owner');
    return () => { setAdminScope(null); invalidate('/owner'); };
  }, [slug]);

  useEffect(() => {
    let alive = true;
    setState({ store: null, error: null });
    adminApi(`/stores/${slug}/me`).then((r) => alive && setState({ store: r.store, error: null })).catch((e) => alive && setState({ store: null, error: e }));
    return () => { alive = false; };
  }, [slug]);

  const auth = useMemo(() => ({ user: { role: 'owner', admin: true }, store: state.store, ready: true, logout() {}, setStore() {} }), [state.store]);

  if (state.error) return <ErrorState error={state.error} />;
  if (!state.store) return <Skeleton className="h-64 w-full rounded-2xl" />;
  const name = state.store.name?.ar || state.store.name?.en || slug;
  return (
    <AuthContext.Provider value={auth}>
      <DashBaseContext.Provider value={`/admin/manage/${slug}`}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#111111] px-4 py-3 text-[#FFF6EC]">
          <p className="text-sm font-semibold">بتدير محل «{name}» من الأدمن — أي تعديل بيتحفظ على المحل فعلاً.</p>
          <span className="flex gap-2 text-[13px]">
            <a href={`/s/${slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 hover:bg-white/20"><ExternalLink className="h-3.5 w-3.5" />صفحة المحل</a>
            <Link to="/admin/stores" className="inline-flex items-center gap-1 rounded-full bg-[#FF5A1F] px-3 py-1 font-semibold"><ArrowRight className="h-3.5 w-3.5" />رجوع للمحلات</Link>
          </span>
        </div>
        <Outlet />
      </DashBaseContext.Provider>
    </AuthContext.Provider>
  );
}
