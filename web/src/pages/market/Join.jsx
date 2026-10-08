import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MessageCircle, Phone, Store, Smartphone, BellRing, BarChart3, Palette, Truck, ArrowLeft, Sparkles, Check } from 'lucide-react';
import { BrandMark } from '../../components/market/Brand.jsx';
import { useApi } from '../../lib/hooks.js';
import { SALES_PHONE, SALES_WHATSAPP, SALES_WA_TEXT } from '../../config/contact.js';

const ease = [0.22, 1, 0.36, 1];
const up = (d = 0) => ({ initial: { opacity: 0, y: 28 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-60px' }, transition: { duration: 0.8, delay: d, ease } });
const wa = `https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent(SALES_WA_TEXT)}`;
const tel = `tel:${SALES_PHONE}`;

const PERKS = [
  { icon: Store, title: 'متجر باسمك وبألوانك', body: 'صفحة خاصة بمحلك، باللوجو والألوان بتاعتك، تشاركها على فيسبوك وإنستجرام.' },
  { icon: BellRing, title: 'تعرف بكل طلب في ساعتها', body: 'أول ما زبون يطلب، يوصلك تنبيه على موبايلك فيه كل التفاصيل: اسمه وتليفونه وعنوانه والمقاس اللي اختاره.' },
  { icon: Smartphone, title: 'كل حاجة من موبايلك', body: 'ضيف منتج، غيّر سعر، تابع الطلبات والمخزون… من غير كمبيوتر.' },
  { icon: BarChart3, title: 'تقارير مبيعات', body: 'اعرف إيه اللي بيتباع أكتر، ومين أحسن عملائك، ومبيعاتك ماشية إزاي.' },
  { icon: Palette, title: 'صور احترافية', body: 'صور منتجاتك بتظهر بجودة عالية وسريعة على أي موبايل.' },
  { icon: Truck, title: 'دفع عند الاستلام', body: 'الزبون يطلب ويدفع لما يستلم، وإنت تركّز على البيع.' },
];
const STEPS = [
  ['كلّمنا', 'ابعتلنا على الواتساب أو اتصل، وقولنا اسم المحل ونوع اللبس.'],
  ['بنجهزلك متجرك', 'إحنا اللي بنعمل الحساب ونرفع منتجاتك ونظبط الألوان.'],
  ['ابدأ تبيع', 'هيوصلك لينك تدخل بيه لوحة محلك، والطلبات تبدأ توصلك.'],
];

function GoldButton({ href, icon: Icon, children, primary }) {
  return (
    <motion.a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer"
      whileHover={{ y: -2, scale: 1.02 }} whileTap={{ scale: 0.97 }}
      className={primary
        ? 'relative inline-flex items-center gap-2.5 overflow-hidden rounded-full bg-gradient-to-l from-[#F3DFA2] via-[#C9A24D] to-[#8E6A24] px-7 py-4 text-[17px] font-bold text-[#111] shadow-[0_10px_40px_-10px_rgba(201,162,77,.7)]'
        : 'inline-flex items-center gap-2.5 rounded-full border border-[#C9A24D]/50 px-7 py-4 text-[17px] font-semibold text-[#F3DFA2] backdrop-blur hover:bg-white/5'}>
      {primary && <motion.span aria-hidden className="absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-20deg] bg-white/40" animate={{ x: ['0%', '450%'] }} transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.6, ease: 'easeInOut' }} />}
      <Icon className="relative h-5 w-5" /><span className="relative">{children}</span>
    </motion.a>
  );
}

export default function Join() {
  const { data } = useApi('/marketplace');
  useEffect(() => { document.title = 'افتح متجرك · بنها لوك'; window.scrollTo(0, 0); }, []);

  return (
    <div dir="rtl" className="min-h-dvh overflow-hidden bg-[#0B0B0C] text-[#F6F1E7]">
      {/* glow */}
      <motion.div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[#C9A24D]/20 blur-[120px]"
        animate={{ opacity: [0.5, 0.9, 0.5], scale: [1, 1.08, 1] }} transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }} />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link to="/" className="flex items-center gap-2.5"><BrandMark /><span className="font-display text-xl font-semibold text-[#F6F1E7]">بنها لوك</span></Link>
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-[#F6F1E7]/70 hover:text-white">السوق <ArrowLeft className="h-4 w-4" /></Link>
      </header>

      {/* hero */}
      <section className="relative mx-auto max-w-6xl px-5 pb-20 pt-10 text-center sm:pt-16">
        <motion.div {...up(0)} className="mx-auto inline-flex items-center gap-2 rounded-full border border-[#C9A24D]/40 bg-white/5 px-4 py-1.5 text-sm text-[#F3DFA2]">
          <Sparkles className="h-4 w-4" /> لأصحاب محلات الملابس في بنها
        </motion.div>
        <motion.h1 {...up(0.1)} className="mx-auto mt-6 max-w-4xl font-display text-[40px] font-semibold leading-[1.25] text-[#F6F1E7] sm:text-[64px]">
          محلك يستاهل يبقى
          <span className="block bg-gradient-to-l from-[#F3DFA2] via-[#C9A24D] to-[#F3DFA2] bg-[length:200%_auto] bg-clip-text pb-3 text-transparent [animation:shine_4s_linear_infinite]">على موبايل كل زبون في بنها</span>
        </motion.h1>
        <motion.p {...up(0.2)} className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#F6F1E7]/75">
          إحنا بنجهزلك متجرك الأونلاين من الألف للياء، وإنت تركّز في اللي بتعرفه: البيع. كل طلب جديد بيوصلك لحظة بلحظة، ومبيعاتك قدامك على موبايلك.
        </motion.p>
        <motion.div {...up(0.3)} className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <GoldButton href={wa} icon={MessageCircle} primary>كلّمنا على الواتساب</GoldButton>
          <GoldButton href={tel} icon={Phone}>اتصل بينا · <span dir="ltr">{SALES_PHONE}</span></GoldButton>
        </motion.div>

        {/* live numbers from the marketplace */}
        <motion.dl {...up(0.4)} className="mx-auto mt-14 grid max-w-xl grid-cols-3 gap-4 border-t border-white/10 pt-8">
          {[[data?.stats.stores ?? '—', 'محل على المنصة'], [data?.stats.products ?? '—', 'منتج معروض'], ['24 ساعة', 'توصيل في القليوبية']].map(([v, l]) => (
            <div key={l}><dd className="font-display text-3xl font-semibold text-[#F3DFA2]">{v}</dd><dt className="mt-1 text-sm text-[#F6F1E7]/60">{l}</dt></div>
          ))}
        </motion.dl>

        {/* floating mark */}
        <motion.div aria-hidden className="absolute -left-6 top-24 hidden opacity-30 lg:block" animate={{ y: [0, -16, 0], rotate: [-6, 4, -6] }} transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}><BrandMark className="h-28 w-28" /></motion.div>
        <motion.div aria-hidden className="absolute -right-4 bottom-10 hidden opacity-20 lg:block" animate={{ y: [0, 14, 0], rotate: [8, -4, 8] }} transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}><BrandMark className="h-20 w-20" /></motion.div>
      </section>

      {/* perks */}
      <section className="relative mx-auto max-w-6xl px-5 pb-20">
        <motion.h2 {...up()} className="text-center font-display text-3xl font-semibold text-[#F6F1E7] sm:text-4xl">كل اللي محلك محتاجه عشان يبيع أونلاين</motion.h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PERKS.map((p, i) => (
            <motion.div key={p.title} {...up(i * 0.07)} whileHover={{ y: -6 }}
              className="group rounded-2xl border border-white/10 bg-white/[0.04] p-6 transition-colors hover:border-[#C9A24D]/50">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-[#F3DFA2] to-[#8E6A24] text-[#111] transition-transform group-hover:rotate-6"><p.icon className="h-6 w-6" /></div>
              <h3 className="mt-4 text-lg font-semibold text-[#F6F1E7]">{p.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-[#F6F1E7]/65">{p.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* steps */}
      <section className="relative mx-auto max-w-4xl px-5 pb-20">
        <motion.h2 {...up()} className="text-center font-display text-3xl font-semibold text-[#F6F1E7] sm:text-4xl">3 خطوات وتبدأ</motion.h2>
        <ol className="mt-10 grid gap-4 sm:grid-cols-3">
          {STEPS.map(([title, body], i) => (
            <motion.li key={title} {...up(i * 0.12)} className="relative rounded-2xl border border-[#C9A24D]/30 bg-gradient-to-b from-white/[0.06] to-transparent p-6">
              <span className="font-display text-5xl font-bold text-[#C9A24D]/80">{i + 1}</span>
              <h3 className="mt-2 text-lg font-semibold text-[#F6F1E7]">{title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-[#F6F1E7]/65">{body}</p>
            </motion.li>
          ))}
        </ol>
      </section>

      {/* final CTA */}
      <section className="relative mx-auto max-w-5xl px-5 pb-24">
        <motion.div {...up()} className="relative overflow-hidden rounded-3xl border border-[#C9A24D]/40 bg-gradient-to-br from-[#1A1A1C] to-[#0B0B0C] p-8 text-center sm:p-12">
          <motion.div aria-hidden className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#C9A24D]/25 blur-3xl" animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 6, repeat: Infinity }} />
          <h2 className="relative font-display text-3xl font-semibold text-[#F6F1E7] sm:text-4xl">جاهز تفتح متجرك؟</h2>
          <ul className="relative mx-auto mt-6 grid max-w-md gap-2 text-start text-[15px] text-[#F6F1E7]/80">
            {['إحنا بنعمل الحساب ونرفع المنتجات معاك', 'تنبيه فوري بكل طلب جديد', 'اشتراك شهري بسيط، من غير عمولة على البيع'].map((x) => (
              <li key={x} className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0 text-[#C9A24D]" />{x}</li>
            ))}
          </ul>
          <div className="relative mt-8 flex flex-wrap justify-center gap-4">
            <GoldButton href={wa} icon={MessageCircle} primary>ابعتلنا على الواتساب</GoldButton>
            <GoldButton href={tel} icon={Phone}>اتصل دلوقتي</GoldButton>
          </div>
        </motion.div>
      </section>

      {/* sticky mobile bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-white/10 bg-[#0B0B0C]/90 p-3 backdrop-blur sm:hidden">
        <a href={wa} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-l from-[#F3DFA2] to-[#C9A24D] py-3 font-bold text-[#111]"><MessageCircle className="h-5 w-5" />واتساب</a>
        <a href={tel} className="flex flex-1 items-center justify-center gap-2 rounded-full border border-[#C9A24D]/50 py-3 font-semibold text-[#F3DFA2]"><Phone className="h-5 w-5" />اتصال</a>
      </div>
      <div className="h-20 sm:hidden" />
    </div>
  );
}
