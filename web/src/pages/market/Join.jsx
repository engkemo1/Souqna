import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Camera, MessageCircle, Phone, Store, Smartphone, BellRing, BarChart3, Palette, Truck, ArrowLeft, Sparkles, Check } from 'lucide-react';
import ModaAvatar from '../../components/market/ModaAvatar.jsx';
import { BrandMark } from '../../components/market/Brand.jsx';
import { useApi } from '../../lib/hooks.js';
import { SALES_PHONE, SALES_WHATSAPP, SALES_WA_TEXT } from '../../config/contact.js';

const ease = [0.22, 1, 0.36, 1];
const up = (d = 0) => ({ initial: { opacity: 0, y: 28 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-60px' }, transition: { duration: 0.8, delay: d, ease } });
const wa = `https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent(SALES_WA_TEXT)}`;
const waPhoto = `https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent('أهلاً، محتاج عرض سعر لتصوير منتجات محلي. عدد المنتجات تقريباً:')}`;
const waReadyPhotos = `https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent('أهلاً، عندي صور منتجاتي جاهزة أو بتعامل مع مصور، وعايز أعرف خطوات فتح متجري على Twist.')}`;
const tel = `tel:${SALES_PHONE}`;

const PERKS = [
  { icon: Store, title: 'متجر باسمك وبألوانك', body: 'صفحة خاصة بمحلك، باللوجو والألوان بتاعتك، تشاركها على فيسبوك وإنستجرام.' },
  { icon: BellRing, title: 'تعرف بكل طلب في ساعتها', body: 'أول ما زبون يطلب، يوصلك تنبيه على موبايلك فيه كل التفاصيل: اسمه وتليفونه وعنوانه والمقاس اللي اختاره.' },
  { icon: Smartphone, title: 'كل حاجة من موبايلك', body: 'ضيف منتج، غيّر سعر، تابع الطلبات والمخزون… من غير كمبيوتر.' },
  { icon: BarChart3, title: 'تقارير مبيعات', body: 'اعرف إيه اللي بيتباع أكتر، ومين أحسن عملائك، ومبيعاتك ماشية إزاي.' },
  { icon: Palette, title: 'التصوير وقت ما تحتاجه', body: 'عندك صور جاهزة؟ ارفعها بنفسك. ولو محتاج مساعدة، اطلب خدمة التصوير الاحترافي بشكل اختياري.' },
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
        ? 'relative inline-flex items-center gap-2.5 overflow-hidden rounded-full bg-btn px-7 py-4 text-[17px] font-bold text-white shadow-[0_10px_30px_-10px_rgba(3,36,77,.38)]'
        : 'inline-flex items-center gap-2.5 rounded-full border border-line-strong bg-white px-7 py-4 text-[17px] font-semibold text-brand transition hover:bg-[#EAF0F8]'}>
      {primary && <motion.span aria-hidden className="absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-20deg] bg-white/40" animate={{ x: ['0%', '450%'] }} transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.6, ease: 'easeInOut' }} />}
      <Icon className="relative h-5 w-5" /><span className="relative">{children}</span>
    </motion.a>
  );
}

const MODA_POINTS = [
  'الزبونة تكتب أو تقول: «عايزة فستان لخطوبة بـ 2000 جنيه» ومودة تعرضلها قطع حقيقية من محلات بنها، منها منتجاتك.',
  'تبعتلها صورة لبس عجبتها وتلاقيلها الأقرب ليها عندك وعند غيرك.',
  'بتقترح طقم كامل (فستان + طرحة + جزمة)، فالزبونة تشتري أكتر من قطعة من محلك.',
  'من غير ما تدفع إعلان: منتجاتك بتظهر لوحدها لما تناسب طلب زبونة.',
];

function ModaPitch() {
  const [talk, setTalk] = useState(false);
  useEffect(() => { const id = setInterval(() => setTalk((v) => !v), 2600); return () => clearInterval(id); }, []);
  return (
    <section className="relative mx-auto max-w-6xl px-5 pb-20">
      <motion.div {...up(0)} className="grid items-center gap-8 overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-[#EAF0F8] via-white to-white p-6 shadow-[0_18px_50px_rgba(3,36,77,.07)] sm:p-10 md:grid-cols-[280px_1fr]">
        <div className="grid place-items-center"><ModaAvatar size={260} talking={talk} living tilt /></div>
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-[#03244D]/5 px-3.5 py-1 text-sm text-brand"><Sparkles className="h-4 w-4" /> جديد</p>
          <h2 className="mt-3 font-display text-3xl font-bold text-[#03244D] sm:text-4xl">قابل «مودة»… الفاشونيستا اللي بتجيبلك زباين</h2>
          <p className="mt-3 text-lg leading-relaxed text-[#43516a]">مساعدة ذكية بتتكلم بالمصري وبتفهم الصوت والصور. الزبونة تقولها اللي محتاجاه، وهي تختار من منتجات متاجر بنها بأسعارها الحقيقية.</p>
          <ul className="mt-5 space-y-3">
            {MODA_POINTS.map((x) => <li key={x} className="flex items-start gap-3 text-base leading-relaxed text-[#26344e]"><Check className="mt-1 h-5 w-5 shrink-0 text-brand" />{x}</li>)}
          </ul>
          <p className="mt-5 text-sm text-muted">كل ما منتجاتك أوصافها وألوانها أوضح، كل ما مودة تعرضها أكتر. وإحنا بنساعدك في ده.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/" className="inline-flex items-center gap-2 rounded-full bg-btn px-6 py-3 text-base font-bold text-white hover:brightness-110"><Sparkles className="h-5 w-5" />جرّب مودة بنفسك</Link>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

export default function Join() {
  const { data } = useApi('/marketplace');
  useEffect(() => { document.title = 'افتح متجرك · Twist'; window.scrollTo(0, 0); }, []);

  return (
    <div dir="rtl" className="min-h-dvh overflow-hidden bg-[#F6F8FB] text-[#03244D]">
      {/* glow */}
      <motion.div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[#03244D]/5 blur-[120px]"
        animate={{ opacity: [0.5, 0.9, 0.5], scale: [1, 1.08, 1] }} transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }} />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link to="/" className="inline-flex items-center" aria-label="Twist — كل المحلات في مكان واحد"><img src="/brand/twist-logo.png" className="h-[64px] w-auto object-contain" alt="" aria-hidden="true" /></Link>
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand">السوق <ArrowLeft className="h-4 w-4" /></Link>
      </header>

      {/* hero */}
      <section className="relative mx-auto max-w-6xl px-5 pb-20 pt-10 text-center sm:pt-16">
        <motion.div {...up(0)} className="mx-auto inline-flex items-center gap-2 rounded-full border border-line bg-[#EAF0F8] px-4 py-1.5 text-sm text-brand">
          <Sparkles className="h-4 w-4" /> لأصحاب محلات الملابس في بنها
        </motion.div>
        <motion.h1 {...up(0.1)} className="mx-auto mt-6 max-w-4xl font-display text-[40px] font-bold leading-[1.25] text-[#03244D] sm:text-[64px]">
          محلك يستاهل يبقى
          <span className="block bg-gradient-to-l from-[#F8620A] via-[#ff7433] to-[#F8620A] bg-[length:200%_auto] bg-clip-text pb-3 text-transparent [animation:shine_4s_linear_infinite]">على موبايل كل زبون في بنها</span>
        </motion.h1>
        <motion.p {...up(0.2)} className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#43516a]">
          إحنا بنجهزلك متجرك الأونلاين من الألف للياء، وإنت تركّز في اللي بتعرفه: البيع. كل طلب جديد بيوصلك لحظة بلحظة، ومبيعاتك قدامك على موبايلك.
        </motion.p>
        <motion.div {...up(0.3)} className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <GoldButton href={wa} icon={MessageCircle} primary>كلّمنا على الواتساب</GoldButton>
          <GoldButton href={tel} icon={Phone}>اتصل بينا · <span dir="ltr">{SALES_PHONE}</span></GoldButton>
        </motion.div>

        {/* live numbers from the marketplace */}
        <motion.dl {...up(0.4)} className="mx-auto mt-14 grid max-w-xl grid-cols-3 gap-4 border-t border-line pt-8">
          {[[data?.stats.stores ?? '—', 'محل على المنصة'], [data?.stats.products ?? '—', 'منتج معروض'], ['24 ساعة', 'توصيل في القليوبية']].map(([v, l]) => (
            <div key={l}><dd className="font-display text-3xl font-bold text-brand">{v}</dd><dt className="mt-1 text-sm text-muted">{l}</dt></div>
          ))}
        </motion.dl>

        {/* floating mark */}
        <motion.div aria-hidden className="absolute -left-6 top-24 hidden opacity-30 lg:block" animate={{ y: [0, -16, 0], rotate: [-6, 4, -6] }} transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}><BrandMark className="h-28 w-28" /></motion.div>
        <motion.div aria-hidden className="absolute -right-4 bottom-10 hidden opacity-20 lg:block" animate={{ y: [0, 14, 0], rotate: [8, -4, 8] }} transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}><BrandMark className="h-20 w-20" /></motion.div>
      </section>

      {/* perks */}
      <section className="relative mx-auto max-w-6xl px-5 pb-20">
        <motion.h2 {...up()} className="text-center font-display text-3xl font-bold text-[#03244D] sm:text-4xl">كل اللي محلك محتاجه عشان يبيع أونلاين</motion.h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PERKS.map((p, i) => (
            <motion.div key={p.title} {...up(i * 0.07)} whileHover={{ y: -6 }}
              className="group rounded-2xl border border-line bg-white p-6 shadow-[0_10px_28px_rgba(3,36,77,.05)] transition hover:-translate-y-1 hover:border-line-strong hover:shadow-[0_14px_32px_rgba(3,36,77,.09)]">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#EAF0F8] text-brand transition-transform group-hover:rotate-6"><p.icon className="h-6 w-6" /></div>
              <h3 className="mt-4 text-lg font-semibold text-[#03244D]">{p.title}</h3>
              <p className="mt-2 text-base leading-relaxed text-[#526078]">{p.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <ModaPitch />

      {/* professional photography ad */}
      <section className="relative mx-auto max-w-6xl px-5 pb-20">
        <motion.div {...up()} className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-[#EAF0F8] via-white to-[#F1F4F9] p-7 shadow-[0_18px_50px_rgba(3,36,77,.06)] sm:p-12">
          <motion.div aria-hidden className="absolute -left-16 -top-16 h-72 w-72 rounded-full bg-[#03244D]/5 blur-3xl" animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 7, repeat: Infinity }} />
          <div className="relative grid items-center gap-10 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-[#03244D]/5 px-3.5 py-1.5 text-sm text-brand"><Camera className="h-4 w-4" />خدمة جديدة من Twist</span>
              <h2 className="mt-5 font-display text-3xl font-bold leading-snug text-[#03244D] sm:text-5xl">محتاج مساعدة في تصوير منتجاتك؟
                <span className="block text-brand">خدمة اختيارية على قد احتياجك</span></h2>
              <p className="mt-4 max-w-xl text-lg leading-relaxed text-[#43516a]">لو بتصور بنفسك أو عندك مصور، كمّل بصورك عادي. ولو محتاج تصوير احترافي، فريقنا يقدر ييجي لمحلك ويجهز الصور لمتجرك.</p>
              <ul className="mt-6 grid gap-2.5 text-base text-[#26344e] sm:grid-cols-2">
                {['بنوصلك لحد المحل في بنها', 'صور عالية الدقة بأسلوب احترافي', 'بنرفع الصور على متجرك', 'اطلب جلسة واحدة من غير اشتراك', 'للطلبات المتكررة: باقة شهرية اختيارية بكمية متفق عليها', 'نعرفك بالسعر والميعاد قبل ما نبدأ'].map((x) => (
                  <li key={x} className="flex items-start gap-2"><Check className="mt-1 h-4 w-4 shrink-0 text-brand" />{x}</li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-4">
                <GoldButton href={waPhoto} icon={MessageCircle} primary>اطلب سعر جلسة تصوير</GoldButton>
                <GoldButton href={waReadyPhotos} icon={Camera}>عندي الصور — عايز أفتح متجري</GoldButton>
              </div>
            </div>
            <div className="grid gap-4 lg:col-span-2">
              {[['طلب منفرد', 'حدد عدد المنتجات، وهنبعتلك السعر والميعاد قبل ما تأكد الطلب.'], ['باقة شهرية اختيارية', 'للتصوير المتكرر، بكمية وسعر نتفق عليهم مقدمًا.']].map(([t, b], i) => (
                <motion.div key={t} {...up(0.1 + i * 0.1)} whileHover={{ y: -4 }} className="rounded-2xl border border-line bg-white p-5 shadow-sm">
                  <p className="font-display text-xl font-bold text-[#03244D]">{t}</p>
                  <p className="mt-1.5 text-base text-[#526078]">{b}</p>
                </motion.div>
              ))}
              <p className="text-sm text-muted">التصوير مش شرط لفتح متجرك. مفيش أي تنفيذ أو التزام قبل موافقتك على السعر.</p>
            </div>
          </div>
        </motion.div>
      </section>

      {/* steps */}
      <section className="relative mx-auto max-w-4xl px-5 pb-20">
        <motion.h2 {...up()} className="text-center font-display text-3xl font-bold text-[#03244D] sm:text-4xl">3 خطوات وتبدأ</motion.h2>
        <ol className="mt-10 grid gap-4 sm:grid-cols-3">
          {STEPS.map(([title, body], i) => (
            <motion.li key={title} {...up(i * 0.12)} className="relative rounded-2xl border border-line bg-white p-6 shadow-[0_10px_28px_rgba(3,36,77,.05)]">
              <span className="font-display text-5xl font-bold text-brand">{i + 1}</span>
              <h3 className="mt-2 text-lg font-semibold text-[#03244D]">{title}</h3>
              <p className="mt-2 text-base leading-relaxed text-[#526078]">{body}</p>
            </motion.li>
          ))}
        </ol>
      </section>

      {/* final CTA */}
      <section className="relative mx-auto max-w-5xl px-5 pb-24">
        <motion.div {...up()} className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-[#EAF0F8] via-white to-white p-8 text-center shadow-[0_18px_50px_rgba(3,36,77,.06)] sm:p-12">
          <motion.div aria-hidden className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#03244D]/5 blur-3xl" animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 6, repeat: Infinity }} />
          <h2 className="relative font-display text-3xl font-bold text-[#03244D] sm:text-4xl">جاهز تفتح متجرك؟</h2>
          <ul className="relative mx-auto mt-6 grid max-w-md gap-2 text-start text-base text-[#43516a]">
            {['إحنا بنعمل الحساب ونرفع المنتجات معاك', 'تنبيه فوري بكل طلب جديد', 'اشتراك شهري بسيط، من غير عمولة على البيع'].map((x) => (
              <li key={x} className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0 text-brand" />{x}</li>
            ))}
          </ul>
          <div className="relative mt-8 flex flex-wrap justify-center gap-4">
            <GoldButton href={wa} icon={MessageCircle} primary>ابعتلنا على الواتساب</GoldButton>
            <GoldButton href={tel} icon={Phone}>اتصل دلوقتي</GoldButton>
          </div>
        </motion.div>
      </section>

      {/* sticky mobile bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-line bg-white/95 p-3 shadow-[0_-8px_24px_rgba(3,36,77,.08)] backdrop-blur sm:hidden">
        <a href={wa} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-2 rounded-full bg-btn py-3 font-bold text-white"><MessageCircle className="h-5 w-5" />واتساب</a>
        <a href={tel} className="flex flex-1 items-center justify-center gap-2 rounded-full border-[1.5px] border-[#F8620A] bg-white py-3 font-semibold text-brand"><Phone className="h-5 w-5" />اتصال</a>
      </div>
      <div className="h-20 sm:hidden" />
    </div>
  );
}
