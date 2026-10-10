import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import Brand from '../../components/market/Brand.jsx';
import LangToggle from '../../components/LangToggle.jsx';
import { useI18n } from '../../lib/i18n.jsx';

export default function AuthShell({ children }) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,560px)] xl:grid-cols-[1fr_640px]">
      <div className="flex flex-col px-5 pb-10 pt-5 sm:px-10">
        <div className="flex items-center justify-between"><Brand /><LangToggle /></div>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div>
        </div>
      </div>
      <aside className="relative hidden overflow-hidden bg-[#111111] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -end-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-[#FF5A1F]/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -start-20 h-[24rem] w-[24rem] rounded-full bg-[#FF8A5C]/15 blur-3xl" />
        <div className="relative">
          <h2 className="max-w-md font-display text-4xl font-bold leading-tight text-white">{t('auth.sideTitle')}</h2>
          <ul className="mt-8 space-y-4">
            {[t('auth.side1'), t('auth.side2'), t('auth.side3')].map((s) => (
              <li key={s} className="flex items-center gap-3 text-base text-white/85"><span className="grid h-7 w-7 place-items-center rounded-full bg-white/10"><Check className="h-4 w-4 text-[#FF8A5C]" /></span>{s}</li>
            ))}
          </ul>
        </div>
        {/* mini dashboard preview */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="relative rounded-3xl bg-white p-5 text-neutral-900 shadow-2xl">
          <p className="text-xs font-medium text-neutral-500">{t('dash.todaySales')}</p>
          <p className="mt-1 font-display text-3xl font-bold">EGP 24,850</p>
          <svg viewBox="0 0 300 80" className="mt-4 h-20 w-full" aria-hidden="true">
            <defs><linearGradient id="ag" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#FF5A1F" stopOpacity=".25" /><stop offset="1" stopColor="#FF5A1F" stopOpacity="0" /></linearGradient></defs>
            <path d="M0 62 C30 58 45 40 75 44 S120 22 150 30 S200 12 230 20 S275 6 300 10 V80 H0Z" fill="url(#ag)" />
            <path d="M0 62 C30 58 45 40 75 44 S120 22 150 30 S200 12 230 20 S275 6 300 10" fill="none" stroke="#FF5A1F" strokeWidth="2.5" />
          </svg>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            {[['48', t('dash.ordersKpi')], ['328', t('dash.products')], ['1,240', t('dash.customers')]].map(([v, l]) => (
              <div key={l} className="rounded-2xl bg-neutral-100 py-3"><p className="text-lg font-semibold">{v}</p><p className="text-xs text-neutral-500">{l}</p></div>
            ))}
          </div>
        </motion.div>
      </aside>
    </div>
  );
}
