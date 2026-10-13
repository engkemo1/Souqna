import { Link, useParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, MapPin, PackageCheck, Sparkles } from 'lucide-react';
import { useApi } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';
import MarketHeader from '../../components/market/MarketHeader.jsx';
import LookSet from '../../components/market/LookSet.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { ErrorState } from '../../components/ui/States.jsx';

export default function LookOfDayDetail() {
  const { index = '0' } = useParams();
  const { lang, t, assistantName } = useI18n();
  const { data, error, loading } = useApi('/look-of-day');
  const entry = data?.entries?.[Number(index)];
  const firstImage = entry?.looks?.map((look) => look.items?.[look.pick || 0]).find((product) => product?.image)?.image;
  const title = entry?.title || entry?.occasion || t('lod.title');
  const total = entry?.total || 0;
  return (
    <div className="min-h-dvh bg-canvas">
      <MarketHeader />
      <main className="container max-w-[1336px] pb-32 pt-5 sm:pt-8">
        <Link to="/" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg"><ArrowRight className="h-4 w-4" />{lang === 'ar' ? 'الرئيسية' : 'Home'}</Link>
        {loading && <Skeleton className="h-80 w-full rounded-[28px]" />}
        {error && <ErrorState error={error} />}
        {data && !entry && <p className="rounded-2xl border border-line p-6 text-center text-muted">اللوك ده مش متاح حاليًا.</p>}
        {entry && <>
          <section className="grid overflow-hidden rounded-[28px] border border-brand/15 bg-gradient-to-l from-brand/10 via-secondary/40 to-elevated shadow-sm md:grid-cols-2">
            <div className="relative order-1 min-h-64 bg-secondary md:order-2 md:min-h-[320px]">
              {entry.coverImage ? <img src={entry.coverImage} alt="" className="absolute inset-0 h-full w-full object-cover" /> : firstImage ? <SmartImage media={firstImage} alt="" className="absolute inset-0 h-full w-full" priority sizes="(min-width:768px) 50vw, 100vw" /> : <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-brand/20 via-secondary to-elevated text-7xl font-black text-brand/60">{title.slice(0, 2)}</div>}
              <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
              {entry.badge && <span className="absolute start-4 top-4 rounded-full bg-elevated/95 px-4 py-2 text-sm font-bold text-brand shadow-sm"><Sparkles className="me-1 inline h-4 w-4" />{entry.badge}</span>}
            </div>
            <div className="order-2 flex flex-col justify-center p-6 sm:p-9 lg:p-12 md:order-1">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1.5 text-sm font-bold text-brand"><Sparkles className="h-4 w-4" />{t('lod.todayTag')}</span>
              <p className="mt-4 text-sm font-semibold text-muted">{entry.occasion}{entry.age ? ` · ${entry.age}` : ''}</p>
              <h1 className="mt-2 font-display text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">{title}</h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">{entry.description || entry.say || (lang === 'ar' ? 'اختيارات متناسقة من منتجات محلات بنها، جاهزة تكمّل إطلالتك.' : 'A coordinated outfit selected from Banha stores.')}</p>
              <p className="mt-5 text-sm text-muted">{lang === 'ar' ? `اختيارات ${assistantName}` : `Selected by ${assistantName}`}</p>
              <div className="mt-6 flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-line bg-elevated/80 p-4">
                <div><p className="text-xs font-semibold text-muted">{lang === 'ar' ? 'إجمالي القطع' : 'Look total'}</p><p className="mt-1 text-2xl font-extrabold text-brand">{formatMoney(total, lang)}</p></div>
                <a href="#look-pieces" className="rounded-full bg-btn px-5 py-3 text-sm font-bold text-on-btn">{lang === 'ar' ? 'شوف القطع' : 'View pieces'}</a>
              </div>
            </div>
          </section>
          <section aria-label={lang === 'ar' ? 'مميزات اللوك' : 'Look highlights'} className="mt-3 grid grid-cols-2 gap-2 rounded-[22px] border border-brand/15 bg-elevated p-3 sm:grid-cols-4 sm:gap-4 sm:p-4">
            {[[CheckCircle2, lang === 'ar' ? 'اختيارات متناسقة' : 'Coordinated picks'], [PackageCheck, lang === 'ar' ? 'منتجات من محلات بنها' : 'Banha store products'], [MapPin, lang === 'ar' ? 'تسوق محلي' : 'Shop local'], [Sparkles, lang === 'ar' ? 'لوك جاهز للتسوق' : 'Ready-to-shop look']].map(([Icon, label]) => <div key={label} className="flex items-center gap-2 text-xs font-semibold sm:justify-center sm:text-sm"><Icon className="h-5 w-5 shrink-0 text-brand" /><span>{label}</span></div>)}
          </section>
          {entry.tips && <p className="mt-4 rounded-2xl border border-brand/15 bg-brand/5 px-4 py-3 text-sm leading-relaxed">✨ {entry.tips}</p>}
          <section id="look-pieces" className="mt-8 rounded-[28px] border border-line bg-elevated p-4 sm:p-7">
            <div className="mb-4"><h2 className="font-display text-2xl font-bold">{lang === 'ar' ? 'قطع اللوك المختارة' : 'Pieces in this look'}</h2><p className="mt-1 text-sm text-muted">{lang === 'ar' ? 'اختار المقاس واللون لكل قطعة، أو ضيف اللوك كله للسلة.' : 'Choose a size and colour for each piece, or add the full look to your basket.'}</p></div>
            <LookSet data={entry} name={title} marketplace editorial stickyCTA />
          </section>
        </>}
      </main>
    </div>
  );
}
