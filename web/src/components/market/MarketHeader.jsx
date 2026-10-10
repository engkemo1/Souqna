import { Link } from 'react-router-dom';
import { Search, PackageSearch } from 'lucide-react';
import { useScrolled } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import Brand from './Brand.jsx';
import Button from '../ui/Button.jsx';
import LangToggle from '../LangToggle.jsx';
import { cx } from '../ui/cx.js';

export default function MarketHeader() {
  const { t } = useI18n();
  const scrolled = useScrolled(10);
  return (
    <header className={cx('sticky top-0 z-40 transition-all duration-300', scrolled ? 'bg-canvas/85 shadow-[0_1px_0_rgb(var(--c-border))] backdrop-blur-md' : 'bg-canvas')}>
      <div className="container flex h-16 items-center justify-between gap-3 lg:h-[72px]">
        <Brand />
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link to="/search" aria-label={t('search.open')} className="grid h-10 w-10 place-items-center rounded-full text-fg transition hover:bg-fg/[0.06]"><Search className="h-5 w-5" /></Link>
          <Link to="/track" aria-label={t('track.title')} title={t('track.title')} className="grid h-10 w-10 place-items-center rounded-full text-fg transition hover:bg-fg/[0.06]"><PackageSearch className="h-5 w-5" /></Link>
          <LangToggle />
          <Button size="sm" variant="ghost" to="/login" className="hidden sm:inline-flex">{t('market.ownerCta')}</Button>
        </nav>
      </div>
    </header>
  );
}
