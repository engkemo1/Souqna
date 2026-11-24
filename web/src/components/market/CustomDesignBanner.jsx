import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { GraduationCap, Briefcase, UtensilsCrossed, Trophy, Baby, PartyPopper, Sparkles, ArrowLeft } from 'lucide-react';

const KINDS = [
  { k: 'graduation', label: 'تخرّج / مناقشة مشروع', Icon: GraduationCap },
  { k: 'company', label: 'شركة', Icon: Briefcase },
  { k: 'restaurant', label: 'مطعم / كافيه', Icon: UtensilsCrossed },
  { k: 'team', label: 'مدرسة / فريق / نادي', Icon: Trophy },
  { k: 'baby', label: 'طقم سبوع للأطفال', Icon: Baby },
  { k: 'event', label: 'مناسبة · فساتين وبدل', Icon: PartyPopper },
  { k: 'other', label: 'أي حاجة تانية', Icon: Sparkles },
];

function Chip({ k, label, Icon }) {
  return (
    <Link to={`/custom-design?kind=${k}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-[13px] font-bold text-white transition hover:border-white/50 active:scale-95">
      <Icon className="h-4 w-4 text-[#ffb98a]" />{label}
    </Link>
  );
}

/** Home banner for «design your own clothes». Compact, light, gently animated (stops for reduced-motion users). */
export default function CustomDesignBanner({ className = '' }) {
  const calm = useReducedMotion();
  const loop = [...KINDS, ...KINDS];
  return (
    <motion.section
      initial={calm ? false : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.5, ease: 'easeOut' }}
      aria-labelledby="custom-design-title"
      style={{ background: 'radial-gradient(120% 140% at 12% 100%, #274a85 0%, #14305c 45%, #0b1f42 100%)' }}
      className={`relative isolate overflow-hidden rounded-3xl p-4 shadow-[0_14px_30px_-16px_rgba(11,31,66,.7)] sm:p-6 ${className}`}>
      <motion.span aria-hidden="true" className="pointer-events-none absolute -start-10 -top-12 h-40 w-40 rounded-full bg-[#ff8a3d]/20 blur-2xl" animate={calm ? undefined : { scale: [1, 1.25, 1], opacity: [0.6, 1, 0.6] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }} />

      <img src="/brand/card-design.webp" alt="" aria-hidden="true" width="560" height="427" loading="lazy" decoding="async" className="pointer-events-none absolute end-0 top-1 w-[46%] max-w-[270px] [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)] sm:end-4 sm:top-3 sm:w-[28%] sm:max-w-[240px]" />
      <div className="relative max-w-[54%] sm:max-w-[58%]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold text-[#ffd0ad]">
          <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ff8a3d] opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#ff8a3d]" /></span>
          جديد على تويست
        </span>
        <h2 id="custom-design-title" className="mt-1.5 font-display text-[17px] font-extrabold leading-snug text-white sm:text-2xl">أي تصميم ملابس في دماغك.. بيتنفّذ لك</h2>
        <p className="mt-1 line-clamp-2 text-[13px] leading-6 text-white/70 sm:line-clamp-none sm:text-[15px]">تيشيرتات، هوديز، يونيفورم، فساتين وبدل لأي مناسبة. قولنا اللي عايزه وبنكلمك ونجهّزه. من غير دفع ولا التزام.</p>
      </div>

      {/* tappable ideas: scroll by itself on phones, tap one to open the form set to it */}
      <div dir="ltr" className="relative -mx-4 mt-3 overflow-hidden sm:mx-0 [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
        {calm ? (
          <div className="flex gap-2 overflow-x-auto px-4 pb-1" dir="rtl">{KINDS.map((x) => <Chip key={x.k} {...x} />)}</div>
        ) : (
          <motion.div className="flex w-max gap-2 px-2" animate={{ x: ['0%', '-50%'] }} transition={{ duration: 28, repeat: Infinity, ease: 'linear' }} whileTap={{ animationPlayState: 'paused' }}>
            {loop.map((x, i) => <div key={i} dir="rtl"><Chip {...x} /></div>)}
          </motion.div>
        )}
      </div>

      <Link to="/custom-design" className="group relative mt-3 flex h-10 items-center sm:h-11 justify-center gap-2 overflow-hidden rounded-full bg-[#ff8a3d] text-[15px] font-bold text-white shadow-[0_10px_20px_-10px_rgba(255,138,61,.9)] transition active:scale-[0.98] sm:inline-flex sm:px-8">
        <span className="relative z-10">ابعت طلب تصميمك</span>
        <ArrowLeft className="relative z-10 h-4 w-4 transition group-hover:-translate-x-1" />
        {!calm && <motion.span aria-hidden="true" className="absolute inset-y-0 -start-1/2 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent" animate={{ x: ['0%', '480%'] }} transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.2, ease: 'easeInOut' }} />}
      </Link>
    </motion.section>
  );
}
