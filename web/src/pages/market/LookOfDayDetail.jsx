import { Link, useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useApi } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';
import MarketHeader from '../../components/market/MarketHeader.jsx';
import LookStage from '../../components/market/LookStage.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { ErrorState } from '../../components/ui/States.jsx';

export default function LookOfDayDetail() {
  const { index = '0' } = useParams();
  const { lang } = useI18n();
  const { data, error, loading } = useApi('/look-of-day');
  const entry = data?.entries?.[Number(index)];
  const { data: feat } = useApi('/marketplace?q=&category=all&sort=featured');
  const avatar = feat?.features?.stylistAvatar || null;
  const others = (data?.entries || []).map((x, i) => ({ x, i })).filter(({ i }) => i !== Number(index));
  return (
    <div className="min-h-dvh bg-canvas">
      <MarketHeader />
      <main className="container max-w-[1336px] pb-32 pt-5 sm:pt-8">
        <Link to="/" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg"><ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />{lang === 'ar' ? 'الرئيسية' : 'Home'}</Link>
        {loading && <Skeleton className="h-80 w-full rounded-[28px]" />}
        {error && <ErrorState error={error} />}
        {data && !entry && <p className="rounded-2xl border border-line p-6 text-center text-muted">اللوك ده مش متاح حاليًا.</p>}
        {entry && <>
          <LookStage entry={entry} avatar={avatar} headingAs="h1" />
          {data?.showOthers && others.length > 0 && <section className="mt-8">
            <h2 className="mb-3 font-display text-xl font-bold">{lang === 'ar' ? 'إطلالات أخرى قد تعجبك' : 'More looks you may like'}</h2>
            <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
              {others.map(({ x, i }) => {
                const img = x.looks?.map((l) => l.items?.[l.pick || 0]).find((p) => p?.image)?.image;
                return (
                  <Link key={i} to={`/look-of-day/${i}`} className="flex w-[260px] shrink-0 items-center gap-3 rounded-2xl border border-line bg-elevated p-2 shadow-sm transition hover:border-brand/40">
                    <div className="h-20 w-16 shrink-0 overflow-hidden rounded-xl bg-secondary">{x.coverImage ? <img src={x.coverImage} alt="" className="h-full w-full object-cover" loading="lazy" /> : img ? <SmartImage media={img} alt="" className="h-full w-full" sizes="64px" /> : null}</div>
                    <div className="min-w-0"><p className="line-clamp-2 text-[13px] font-bold leading-snug">{x.title || x.occasion}</p><p className="mt-1 text-sm font-extrabold text-sale">{formatMoney(x.total || 0, lang)}</p></div>
                  </Link>
                );
              })}
            </div>
          </section>}
        </>}
      </main>
    </div>
  );
}
