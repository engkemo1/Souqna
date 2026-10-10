import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Trash2, Truck } from 'lucide-react';
import SmartImage from '../ui/SmartImage.jsx';
import Button from '../ui/Button.jsx';
import { QtyStepper } from '../ui/Commerce.jsx';
import { EmptyState } from '../ui/States.jsx';
import { useToast } from '../ui/Toast.jsx';
import { useCart } from '../../lib/cart.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';
import { useStore, sp } from '../../lib/store.jsx';
import { cx } from '../ui/cx.js';

export function FreeShippingMeter({ subtotal, threshold }) {
  const { t, lang } = useI18n();
  if (!threshold) return null;
  const pct = Math.min(100, (subtotal / threshold) * 100);
  const done = subtotal >= threshold;
  return (
    <div className="rounded-2xl bg-secondary px-4 py-3 text-on-secondary">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Truck className="h-4 w-4 shrink-0" />
        <span>{done ? t('cart.freeShippingUnlocked') : t('cart.freeShippingProgress', { v: formatMoney(threshold - subtotal, lang) })}</span>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-fg/10">
        <motion.div className={cx('h-full rounded-full', done ? 'bg-success' : 'bg-primary')} initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
      </div>
    </div>
  );
}

export function CartLines({ slug, onNavigate, problems = {} }) {
  const cart = useCart(slug);
  const { t, tr, lang } = useI18n();
  const toast = useToast();
  const remove = (key) => {
    const line = cart.remove(key);
    if (line) toast({ title: t('cart.removed'), tone: 'info', action: { label: t('cart.undo'), onClick: () => cart.restore(line) } });
  };
  return (
    <ul className="divide-y divide-line">
      <AnimatePresence initial={false}>
        {cart.items.map((l) => {
          const problem = problems[l.key];
          return (
            <motion.li key={l.key} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0, transition: { duration: 0.25 } }} className="overflow-hidden">
              <div className="flex gap-3.5 py-4">
                <Link to={sp(slug, `p/${l.slug}`)} onClick={onNavigate} className="w-[84px] shrink-0 sm:w-24">
                  <SmartImage media={l.image} ratio="4 / 5" sizes="96px" className="rounded-xl" />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <Link to={sp(slug, `p/${l.slug}`)} onClick={onNavigate} className="line-clamp-2 text-base font-medium leading-snug hover:text-brand">{tr(l.name)}</Link>
                    <button type="button" onClick={() => remove(l.key)} aria-label={t('cart.remove')} className="-me-2 -mt-1.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-fg/[0.06] hover:text-sale">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                    {l.colorName && <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full ring-1 ring-inset ring-black/10" style={{ background: l.color }} />{tr(l.colorName)}</span>}
                    {l.size && <span>{t('product.size')}: <span className="font-medium text-fg">{l.size}</span></span>}
                  </div>
                  {problem && <p className="mt-1 text-xs font-semibold text-sale">{problem}</p>}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                    <QtyStepper size="sm" value={l.qty} onChange={(q) => cart.updateQty(l.key, q)} label={t('product.quantity')} />
                    <span className="font-semibold tabular">{formatMoney(l.price * l.qty, lang)}</span>
                  </div>
                </div>
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

export function CartEmpty({ slug, onNavigate }) {
  const { t } = useI18n();
  return (
    <EmptyState icon={ShoppingBag} title={t('cart.empty')} body={t('cart.emptyBody')}
      action={<Button to={sp(slug, 'shop')} onClick={onNavigate}>{t('cart.startShopping')}</Button>} />
  );
}

export function CartSummary({ slug, onNavigate, compact }) {
  const cart = useCart(slug);
  const { store } = useStore();
  const { t, lang } = useI18n();
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-base"><span className="text-muted">{t('cart.subtotal')}</span><span className="font-semibold tabular">{formatMoney(cart.subtotal, lang)}</span></div>
      {!compact && (
        <div className="flex justify-between text-base"><span className="text-muted">{t('cart.shipping')}</span>
          <span className="tabular">{cart.subtotal >= store.freeShippingOver ? <span className="font-semibold text-success">{t('common.free')}</span> : formatMoney(store.shippingFee, lang)}</span>
        </div>
      )}
      <Button full size="lg" to={sp(slug, 'checkout')} onClick={onNavigate}>{t('cart.checkout')}</Button>
    </div>
  );
}
