import { Link } from 'react-router-dom';
import { ArrowRight, Minus, Plus, ShoppingBag, Store, Trash2 } from 'lucide-react';
import { useApi } from '../../lib/hooks.js';
import { useMarketCart } from '../../lib/cart.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';
import MarketHeader from '../../components/market/MarketHeader.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import Button from '../../components/ui/Button.jsx';
import RecentlyViewed from '../../components/market/RecentlyViewed.jsx';

/** Progress toward a store's free-shipping threshold; nudges the shopper to add a little more. */
function FreeShipBar({ over, subtotal, name }) {
  const { t, lang } = useI18n();
  if (!over || over <= 0) return null;
  const left = Math.max(0, over - subtotal);
  const label = left > 0 ? t('cart.freeLeft', { n: formatMoney(left, lang), s: name }) : t('cart.freeDone', { s: name });
  return <div className="border-t border-line px-4 py-3 sm:px-5"><p className={`text-sm font-medium ${left > 0 ? '' : 'text-success'}`}>{label}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fg/10" role="progressbar" aria-valuemin={0} aria-valuemax={over} aria-valuenow={Math.min(subtotal, over)}><div className={`h-full rounded-full transition-all ${left > 0 ? 'bg-brand' : 'bg-success'}`} style={{ width: `${Math.min(100, (subtotal / over) * 100)}%` }} /></div></div>;
}

export default function MarketCart() {
  const cart = useMarketCart();
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const { data: market } = useApi('/marketplace?q=&category=all&sort=featured');
  const storeBySlug = new Map((market?.stores || []).map((s) => [s.slug, s]));
  const groups = Object.values(cart.items.reduce((acc, line) => {
    (acc[line.storeSlug] ||= { slug: line.storeSlug, name: line.storeName, items: [] }).items.push(line);
    return acc;
  }, {}));

  return <div className="min-h-dvh"><MarketHeader /><main className="container max-w-4xl py-8 sm:py-12">
    <div className="mb-7 flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-brand"><ShoppingBag className="h-6 w-6" /></span><div><h1 className="font-display text-2xl font-bold sm:text-3xl">{ar ? 'سلة Twist' : 'Twist basket'}</h1><p className="mt-1 text-sm text-muted">{ar ? 'منتجاتك من كل المحلات في مكان واحد' : 'Your picks from all stores, together'}</p></div></div>
    {!groups.length ? <div className="rounded-3xl border border-line bg-elevated px-5 py-16 text-center"><ShoppingBag className="mx-auto h-10 w-10 text-muted" /><h2 className="mt-4 text-lg font-semibold">{ar ? 'السلة لسه فاضية' : 'Your basket is empty'}</h2><p className="mt-2 text-sm text-muted">{ar ? 'ضيف منتجات من صفحات المحلات لسلة Twist.' : 'Add products from store pages to this basket.'}</p><Button to="/search" className="mt-6">{ar ? 'اكتشف المنتجات' : 'Explore products'}</Button></div> : <>
      <div className="space-y-5">{groups.map((group) => <section key={group.slug} className="overflow-hidden rounded-3xl border border-line bg-elevated">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-canvas px-4 py-3.5 sm:px-5"><Link to={`/s/${group.slug}`} className="inline-flex items-center gap-2 font-semibold hover:text-brand"><Store className="h-4 w-4" />{group.name?.[lang] || group.name?.ar || group.slug}</Link><span className="text-xs text-muted">{group.items.length} {ar ? 'منتج' : 'items'}</span></header>
        <ul className="divide-y divide-line px-4 sm:px-5">{group.items.map((line) => <li key={line.key} className="flex gap-3 py-4 sm:gap-4">
          {line.slug ? <Link to={`/s/${line.storeSlug}/p/${line.slug}`} className="shrink-0" aria-label={line.name?.[lang] || line.name?.ar || ''}><SmartImage media={line.image} ratio="4 / 5" sizes="72px" className="w-[68px] shrink-0 rounded-xl ring-1 ring-line" /></Link> : <SmartImage media={line.image} ratio="4 / 5" sizes="72px" className="w-[68px] shrink-0 rounded-xl ring-1 ring-line" />}
          <div className="min-w-0 flex-1">{line.slug ? <Link to={`/s/${line.storeSlug}/p/${line.slug}`} className="block truncate font-medium hover:text-brand">{line.name?.[lang] || line.name?.ar || line.name}</Link> : <p className="truncate font-medium">{line.name?.[lang] || line.name?.ar || line.name}</p>}<p className="mt-1 text-xs text-muted">{[line.colorName?.[lang] || line.colorName?.ar, line.size].filter(Boolean).join(' · ')}</p><p className="mt-2 text-sm font-semibold">{formatMoney(line.price, lang)}</p></div>
          <div className="flex shrink-0 flex-col items-end justify-between"><button type="button" onClick={() => cart.remove(line.key)} aria-label={ar ? 'حذف المنتج' : 'Remove product'} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-sale/10 hover:text-sale"><Trash2 className="h-4 w-4" /></button><div className="flex items-center gap-2 rounded-full border border-line px-2"><button type="button" aria-label={ar ? 'تقليل الكمية' : 'Decrease quantity'} onClick={() => cart.updateQty(line.key, line.qty - 1)} className="grid h-8 w-6 place-items-center"><Minus className="h-3 w-3" /></button><span className="min-w-4 text-center text-sm tabular">{line.qty}</span><button type="button" aria-label={ar ? 'زيادة الكمية' : 'Increase quantity'} onClick={() => cart.updateQty(line.key, line.qty + 1)} className="grid h-8 w-6 place-items-center"><Plus className="h-3 w-3" /></button></div></div>
        </li>)}</ul>
        <div className="flex justify-between bg-canvas px-4 py-3 text-sm sm:px-5"><span className="text-muted">{ar ? 'مجموع منتجات المحل' : 'Store items subtotal'}</span><strong>{formatMoney(group.items.reduce((s, l) => s + l.qty * l.price, 0), lang)}</strong></div>
        <FreeShipBar over={storeBySlug.get(group.slug)?.freeShippingOver} subtotal={group.items.reduce((s, l) => s + l.qty * l.price, 0)} name={group.name?.[lang] || group.name?.ar || group.slug} />
      </section>)}</div>
      <section className="mt-6 rounded-3xl border border-line bg-elevated p-5 sm:p-6"><div className="flex justify-between text-lg font-bold"><span>{ar ? 'إجمالي المنتجات' : 'Items subtotal'}</span><span>{formatMoney(cart.subtotal, lang)}</span></div><p className="mt-2 text-sm leading-6 text-muted">{ar ? 'الشحن بيتحسب لكل محل لوحده، وهتشوفي تفاصيله قبل تأكيد الطلب.' : 'Shipping is calculated separately for each store and shown before you confirm.'}</p><div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><button type="button" onClick={cart.clear} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm text-muted hover:bg-fg/[0.05]"><Trash2 className="h-4 w-4" />{ar ? 'فضّي السلة' : 'Empty basket'}</button><Button to="/market-checkout" iconEnd={ArrowRight}>{ar ? 'كمّل الطلب' : 'Continue to checkout'}</Button></div></section>
    </>}
  </main><RecentlyViewed /></div>;
}
