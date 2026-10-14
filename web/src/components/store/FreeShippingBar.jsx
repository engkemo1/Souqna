import { motion } from 'framer-motion';
import { Truck, CheckCircle2, Sparkles } from 'lucide-react';
import { useStore } from '../../lib/store.jsx';
import { useCart } from '../../lib/cart.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';

export default function FreeShippingBar({ className = '' }) {
  const { store } = useStore();
  const { t, lang } = useI18n();
  const cart = useCart(store.slug);
  const isEnabled = store?.customization?.freeShippingBar?.enabled !== false;
  const threshold = store?.freeShippingOver || 0;

  if (!isEnabled || threshold <= 0) return null;

  const currentTotal = cart?.subtotal || 0;
  const progress = Math.min(100, Math.round((currentTotal / threshold) * 100));
  const diff = Math.max(0, threshold - currentTotal);
  const achieved = currentTotal >= threshold;

  return (
    <div className={`rounded-2xl border border-line bg-surface/80 p-3 sm:p-4 shadow-sm ${className}`}>
      <div className="flex items-center justify-between gap-3 text-xs sm:text-sm font-semibold">
        <div className="flex items-center gap-2">
          {achieved ? (
            <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          ) : (
            <span className="grid h-6 w-6 place-items-center rounded-full bg-accent/15 text-accent">
              <Truck className="h-3.5 w-3.5" />
            </span>
          )}
          <span>
            {achieved
              ? (lang === 'ar' ? 'تهانينا! طلبك مؤهل للشحن المجاني داخل بنها 🎉' : 'Congratulations! Your order qualifies for free delivery!')
              : currentTotal > 0
              ? (lang === 'ar' ? `باقي لك ${formatMoney(diff, lang)} للشحن المجاني` : `Add ${formatMoney(diff, lang)} more for free delivery`)
              : (lang === 'ar' ? `شحن مجاني لجميع مناطق بنها على الطلبات فوق ${formatMoney(threshold, lang)} 🚚` : `Free shipping across Banha on orders over ${formatMoney(threshold, lang)}`)}
          </span>
        </div>
        <span className="font-mono text-xs text-muted tabular">
          {progress}%
        </span>
      </div>

      <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-line/60">
        <motion.div
          className={`h-full rounded-full transition-all duration-500 ${achieved ? 'bg-emerald-500' : 'bg-accent'}`}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}
