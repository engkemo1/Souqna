import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/dash/Kit.jsx';
import { NAV_GROUPS } from './adminNav.js';

/** «دليل اللوحة»: every admin section and what it is for, generated from the sidebar config so it never goes stale. */
export default function AdminGuide() {
  return (
    <div>
      <PageHeader title="دليل اللوحة" subtitle="كل قسم في لوحة الإدارة بيعمل إيه. اضغط على أي قسم تفتحه." />
      <div className="space-y-7">
        {NAV_GROUPS.map((g) => (
          <section key={g.label}>
            <h2 className="mb-2.5 text-sm font-bold text-muted">{g.label}</h2>
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {g.items.map((n) => (
                <li key={n.to}>
                  <Link to={n.to} className="flex h-full items-start gap-3 rounded-2xl border border-line bg-elevated p-3.5 transition hover:border-fg">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary text-brand"><n.icon className="h-[18px] w-[18px]" /></span>
                    <span className="min-w-0"><b className="block text-[15px]">{n.label}</b><span className="mt-0.5 block text-sm leading-relaxed text-muted">{n.desc}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
