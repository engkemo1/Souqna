import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, ChevronLeft, Tag, Sparkles, LayoutGrid } from 'lucide-react';
import { useStore, sp } from '../../lib/store.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import { EmptyState } from '../../components/ui/States.jsx';
import PageTransition from '../../components/PageTransition.jsx';

export default function Categories() {
  const { store, categories } = useStore();
  const { t, tr, isRtl } = useI18n();
  const Chevron = isRtl ? ChevronLeft : ChevronRight;
  if (!categories.length) return <EmptyState icon={LayoutGrid} title={t('categories.empty')} />;
  return (
    <PageTransition className="container pt-6 sm:pt-10">
      <h1 className="mb-6 font-display text-display-sm font-bold">{t('store.categories')}</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c, i) => (
          <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Link to={sp(store.slug, `shop?category=${c.slug}`)} className="group flex items-center gap-4 overflow-hidden rounded-2xl border border-line bg-elevated p-2.5 pe-4 transition hover:border-line-strong hover:shadow-soft active:scale-[.99]">
              <SmartImage media={c.image} ratio="1 / 1" sizes="96px" className="w-20 shrink-0 rounded-xl sm:w-24" imgClassName="group-hover:scale-105" />
              <div className="min-w-0 flex-1">
                <p className="text-[17px] font-semibold">{tr(c.name)}</p>
                <p className="mt-0.5 text-sm text-muted">{t('categories.count', { n: c.count })}</p>
              </div>
              <Chevron className="h-5 w-5 text-muted transition group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
            </Link>
          </motion.div>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Link to={sp(store.slug, 'shop?sort=newest')} className="flex h-16 items-center gap-3 rounded-2xl bg-secondary px-5 font-semibold text-on-secondary"><Sparkles className="h-5 w-5" />{t('store.newArrivals')}</Link>
        <Link to={sp(store.slug, 'shop?sale=1')} className="flex h-16 items-center gap-3 rounded-2xl bg-sale/10 px-5 font-semibold text-sale"><Tag className="h-5 w-5" />{t('store.onSale')}</Link>
      </div>
    </PageTransition>
  );
}
