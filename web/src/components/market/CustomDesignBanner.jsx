import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { GraduationCap, Briefcase, UtensilsCrossed, Trophy, Baby, Shirt, PartyPopper, Sparkles, ArrowRight, MessageCircle, Hammer, PhoneCall } from 'lucide-react';

const KINDS = [
  { k: 'graduation', label: 'تخرّج / مناقشة مشروع', Icon: GraduationCap },
  { k: 'company', label: 'شركة', Icon: Briefcase },
  { k: 'restaurant', label: 'مطعم / كافيه', Icon: UtensilsCrossed },
  { k: 'team', label: 'مدرسة / فريق / نادي', Icon: Trophy },
  { k: 'baby', label: 'طقم سبوع للأطفال', Icon: Baby },
  { k: 'event', label: 'مناسبة · فساتين وبدل', Icon: PartyPopper },
  { k: 'other', label: 'أي حاجة تانية', Icon: Sparkles },
];
const STEPS = [[MessageCircle, 'ابعت طلبك'], [PhoneCall, 'بنكلمك ونتفق'], [Hammer, 'ننفّذه ونوصّله']];

/** Home banner for «design your own clothes» (graduation, company, restaurant, team, baby 7th-day set). Animated, respects reduced motion. */
export default function CustomDesignBanner({ className = '' }) {
  const calm = useReducedMotion();
  return (
    <motion.section
      initial={calm ? false : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, ease: 'easeOut' }}
      aria-labelledby="custom-design-title"
      className={`relative isolate overflow-hidden rounded-[28px] bg-gradient-to-br from-[#03244D] via-[#0A3A78] to-[#1457A8] p-6 text-white shadow-[0_18px_50px_rgba(3,36,77,.28)] sm:p-9 ${className}`}>
      {/* slow floating light blobs */}
      <motion.span aria-hidden="true" className="pointer-events-none absolute -end-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" animate={calm ? undefined : { scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }} transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.span aria-hidden="true" className="pointer-events-none absolute -bottom-24 -start-10 h-64 w-64 rounded-full bg-sky-300/15 blur-3xl" animate={calm ? undefined : { scale: [1.1, 1, 1.1] }} transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }} />

      <div className="relative grid items-center gap-7 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold backdrop-blur">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-amber-300" /></span>
            جديد على تويست
          </span>
          <h2 id="custom-design-title" className="mt-4 flex items-center gap-3 font-display text-3xl font-black leading-tight sm:text-4xl">
            <motion.span animate={calm ? undefined : { rotate: [-8, 8, -8] }} transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-[#03244D]"><Shirt className="h-7 w-7" /></motion.span>
            أي تصميم ملابس في دماغك.. بيتنفّذ لك
          </h2>
          <p className="mt-3 max-w-xl text-[15px] leading-7 text-white/85 sm:text-base">لطفلك، لشركتك، لمطعمك، لمدرستك، للتخرّج أو أي مناسبة: تيشيرتات، هوديز، يونيفورم، فساتين، بدل، وأكتر. قولنا اللي عايزه وهنكلمك ونجهّزه معاك مع ورش ومحلات بنها.</p>

          <ol className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm font-semibold">
            {STEPS.map(([Icon, text], i) => (
              <motion.li key={text} initial={calm ? false : { opacity: 0, x: 12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.25 + i * 0.15 }} className="flex items-center gap-2">
                {i > 0 && <ArrowRight className="h-4 w-4 text-white/50 rtl:rotate-180" aria-hidden="true" />}
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><Icon className="h-4 w-4" />{text}</span>
              </motion.li>
            ))}
          </ol>

          <Link to="/custom-design" className="group relative mt-6 inline-flex h-12 items-center gap-2 overflow-hidden rounded-full bg-white px-7 text-[15px] font-extrabold text-[#03244D] shadow-lg transition hover:scale-[1.03] active:scale-[0.98]">
            <span className="relative z-10">ابعت طلب تصميمك</span>
            <ArrowRight className="relative z-10 h-4 w-4 transition group-hover:-translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
            {!calm && <motion.span aria-hidden="true" className="absolute inset-y-0 -start-1/2 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-[#03244D]/15 to-transparent" animate={{ x: ['0%', '450%'] }} transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 1.4, ease: 'easeInOut' }} />}
          </Link>
          <p className="mt-2.5 text-xs text-white/70">من غير دفع ولا التزام، السعر بنتفق عليه في المكالمة.</p>
        </div>

        {/* what can I make? tap one to open the form already set to it */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
          {KINDS.map(({ k, label, Icon }, i) => (
            <motion.div key={k} initial={calm ? false : { opacity: 0, scale: 0.85 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.1 + i * 0.08, type: 'spring', stiffness: 220, damping: 18 }} className={i === KINDS.length - 1 ? 'col-span-2 sm:col-span-1 lg:col-span-2' : ''}>
              <motion.div animate={calm ? undefined : { y: [0, -5, 0] }} transition={{ duration: 3 + (i % 3) * 0.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.25 }}>
                <Link to={`/custom-design?kind=${k}`} className="flex items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-4 py-3.5 font-bold backdrop-blur transition hover:bg-white hover:text-[#03244D]">
                  <Icon className="h-6 w-6 shrink-0" />
                  <span className="text-sm sm:text-[15px]">{label}</span>
                </Link>
              </motion.div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}
