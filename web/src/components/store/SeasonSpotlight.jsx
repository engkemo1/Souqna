import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SEASONS } from '@souqna/shared/layout';
import { useI18n } from '../../lib/i18n.jsx';
import { useStore, sp } from '../../lib/store.jsx';

const COPY = {
  ramadan: { ar: 'رمضان كريم', en: 'Ramadan Kareem', subAr: 'اختار إطلالتك لشهر الخير', subEn: 'Find your look for the season' },
  eid: { ar: 'عيد سعيد', en: 'Eid Mubarak', subAr: 'إطلالة العيد تبدأ من هنا', subEn: 'Your Eid look starts here' },
  white_friday: { ar: 'الجمعة البيضاء', en: 'White Friday', subAr: 'اختيارات مميزة وأسعار تستاهل', subEn: 'Standout picks at special prices' },
  back_to_school: { ar: 'رجعنا للمدرسة', en: 'Back to school', subAr: 'جهّز يومك بإطلالة جديدة', subEn: 'Start the new term in style' },
  winter: { ar: 'دفا الشتاء', en: 'Winter edit', subAr: 'قطع دافية لموسم أنيق', subEn: 'Warm layers for a polished season' },
  summer: { ar: 'صيفك أحلى', en: 'Summer edit', subAr: 'ألوان خفيفة لطلعاتك', subEn: 'Light colours for sunny days' },
};

function Star({ x, y, size = 7 }) {
  const points = `${x},${y - size} ${x + size * 0.28},${y - size * 0.28} ${x + size},${y} ${x + size * 0.28},${y + size * 0.28} ${x},${y + size} ${x - size * 0.28},${y + size * 0.28} ${x - size},${y} ${x - size * 0.28},${y - size * 0.28}`;
  return <polygon points={points} fill="currentColor" />;
}

function RamadanArt() {
  return (
    <svg viewBox="0 0 360 280" className="absolute inset-y-0 end-0 h-full w-[58%] max-w-[390px] text-[var(--season-accent)] opacity-95" aria-hidden="true">
      <circle cx="244" cy="112" r="66" fill="currentColor" opacity=".22" />
      <circle cx="270" cy="92" r="66" fill="var(--season-primary)" />
      <g className="season-spotlight-twinkle" fill="currentColor">
        <Star x={156} y={52} size={6} /><Star x={326} y={68} size={4} /><Star x={190} y={154} size={3.5} />
      </g>
      <g fill="none" stroke="currentColor" strokeWidth="3" opacity=".75">
        <path d="M72 0v43" /><path d="M116 0v62" />
        <path d="M58 43h28l-4 48-10 13-10-13z" fill="currentColor" opacity=".72" />
        <path d="M103 62h26l-4 61-9 14-9-14z" fill="currentColor" opacity=".72" />
        <path d="M64 53h16M109 74h14M64 69h16M108 91h14" stroke="var(--season-primary)" opacity=".9" />
      </g>
      <path d="M0 252c70-21 142-26 220-9 51 11 94 12 140-3v40H0z" fill="currentColor" opacity=".16" />
    </svg>
  );
}

function EidArt() {
  return (
    <svg viewBox="0 0 360 280" className="absolute inset-0 h-full w-full text-[var(--season-accent)] opacity-35" aria-hidden="true">
      <defs>
        <pattern id="season-eid-stars" width="92" height="92" patternUnits="userSpaceOnUse">
          <path d="M46 12 54 37 80 46 54 54 46 80 38 54 12 46 38 37z" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M46 25 52 40 67 46 52 52 46 67 40 52 25 46 40 40z" fill="currentColor" opacity=".55" />
        </pattern>
      </defs>
      <rect width="360" height="280" fill="url(#season-eid-stars)" opacity=".55" />
      <circle cx="287" cy="38" r="115" fill="currentColor" opacity=".25" />
    </svg>
  );
}

function WhiteFridayArt() {
  return (
    <svg viewBox="0 0 360 280" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <text x="358" y="122" textAnchor="end" fill="none" stroke="var(--season-secondary)" strokeWidth="1.5" opacity=".1" fontSize="48" fontWeight="900">WHITE</text>
      <text x="358" y="178" textAnchor="end" fill="none" stroke="var(--season-secondary)" strokeWidth="1.5" opacity=".1" fontSize="48" fontWeight="900">FRIDAY</text>
      <path d="M274-10 360 20 145 290 66 260z" fill="var(--season-accent)" opacity=".9" />
      <path d="M291-10 360 14 161 290 128 278z" fill="var(--season-secondary)" opacity=".8" />
    </svg>
  );
}

function SchoolArt() {
  return (
    <svg viewBox="0 0 360 280" className="absolute inset-y-0 end-0 h-full w-[62%] text-[var(--season-accent)] opacity-80" aria-hidden="true">
      <circle cx="294" cy="62" r="72" fill="currentColor" opacity=".25" />
      <circle cx="330" cy="225" r="42" fill="var(--season-secondary)" opacity=".32" />
      <path d="m115 238 156-154 18 18-156 154z" fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round" />
      <path d="m112 241 8-35 27 27z" fill="currentColor" />
      <path d="m274 80 15-15 18 18-15 15z" fill="currentColor" />
      <path d="M220 38c12 12 28 18 47 18" fill="none" stroke="var(--season-secondary)" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

function WinterArt() {
  return (
    <svg viewBox="0 0 360 280" className="absolute inset-y-0 end-0 h-full w-[60%] text-[var(--season-secondary)] opacity-45" aria-hidden="true">
      <defs><pattern id="season-winter-dots" width="34" height="34" patternUnits="userSpaceOnUse"><circle cx="6" cy="8" r="1.5" fill="currentColor" /><circle cx="22" cy="24" r="2" fill="currentColor" /></pattern></defs>
      <rect width="360" height="280" fill="url(#season-winter-dots)" />
      <path d="M274 52c-24 0-44 20-44 44 0 19 12 35 29 41-23 14-39 39-39 68 0 9 2 18 5 26h116V52z" fill="var(--season-accent)" opacity=".55" />
      <path d="M264 80c-17 13-24 28-25 48M303 91c-17 13-24 28-25 48M280 171c-13 13-19 26-20 42" fill="none" stroke="var(--season-secondary)" strokeWidth="2" opacity=".65" />
    </svg>
  );
}

function SummerArt() {
  return (
    <svg viewBox="0 0 360 280" className="absolute inset-y-0 end-0 h-full w-[60%] text-[var(--season-accent)] opacity-80" aria-hidden="true">
      <circle cx="264" cy="132" r="72" fill="currentColor" opacity=".9" />
      <g stroke="currentColor" strokeWidth="4" strokeLinecap="round">
        <path d="M264 32v-18M264 232v18M164 132h-18M364 132h18M193 61l-13-13M335 203l13 13M335 61l13-13M193 203l-13 13" />
      </g>
      <path d="M0 252c84-32 147-9 209 10 53 17 104 14 151-3v21H0z" fill="var(--season-secondary)" opacity=".5" />
    </svg>
  );
}

function SeasonArt({ seasonKey }) {
  if (seasonKey === 'ramadan') return <RamadanArt />;
  if (seasonKey === 'eid') return <EidArt />;
  if (seasonKey === 'white_friday') return <WhiteFridayArt />;
  if (seasonKey === 'back_to_school') return <SchoolArt />;
  if (seasonKey === 'winter') return <WinterArt />;
  return <SummerArt />;
}

export default function SeasonSpotlight() {
  const { store } = useStore();
  const { lang } = useI18n();
  const reduceMotion = useReducedMotion();
  const seasonKey = store?.customization?.design?.season;
  const season = SEASONS[seasonKey];
  if (!season) return null;

  const palette = season.palette;
  const copy = COPY[seasonKey] || { ar: season.ar, en: season.en, subAr: season.announce_ar, subEn: season.announce_en };
  const rtl = lang === 'ar';
  const shopLabel = rtl ? 'تسوّق التشكيلة' : 'Shop the collection';
  const storeName = rtl ? store.name?.ar : store.name?.en;

  return (
    <motion.section
      aria-label={rtl ? `${season.ar} في ${storeName || 'المتجر'}` : `${season.en} at ${storeName || 'the store'}`}
      initial={reduceMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={reduceMotion ? { duration: 0 } : { duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="container mt-6 sm:mt-8"
      style={{
        '--season-primary': palette.primary,
        '--season-secondary': palette.secondary,
        '--season-accent': palette.accent,
        '--season-background': palette.background,
        '--season-text': palette.text,
        '--season-button': palette.button,
        '--season-footer': palette.footer,
      }}
    >
      <div className="relative isolate min-h-[260px] overflow-hidden rounded-[28px] p-6 text-[var(--season-secondary)] shadow-[0_24px_70px_-32px_var(--season-primary)] ring-1 ring-[var(--season-accent)]/30 sm:min-h-[340px] sm:p-12"
        style={{ background: `linear-gradient(118deg, ${palette.footer} 0%, ${palette.primary} 58%, ${palette.button} 100%)` }}>
        <div className="pointer-events-none absolute inset-[7px] rounded-[22px] border border-[var(--season-accent)]/45" aria-hidden="true" />
        <SeasonArt seasonKey={seasonKey} />
        <div className="relative z-10 flex min-h-[208px] max-w-[70%] flex-col justify-center sm:min-h-[244px] sm:max-w-[58%]">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--season-accent)] sm:text-xs">{storeName || (rtl ? 'متجر Twist' : 'Twist store')}</p>
          <h2 className="max-w-[12ch] font-display text-4xl font-black leading-[1.08] tracking-tight text-[var(--season-secondary)] sm:text-6xl">{rtl ? copy.ar : copy.en}</h2>
          <p className="mt-4 max-w-[28rem] text-sm font-medium leading-relaxed text-[var(--season-secondary)]/80 sm:text-base">{rtl ? copy.subAr : copy.subEn}</p>
          <Link to={sp(store.slug, 'shop')} className="mt-6 inline-flex min-h-11 w-fit items-center gap-2 rounded-full bg-[var(--season-secondary)] px-5 py-3 text-sm font-bold text-[var(--season-button)] shadow-lg shadow-black/15 outline-none transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:ring-4 focus-visible:ring-[var(--season-accent)]/70 active:scale-[.98]">
            {shopLabel}
            {rtl ? <ArrowLeft className="h-4 w-4" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
          </Link>
        </div>
      </div>
      <style>{`@keyframes season-spotlight-twinkle{0%,100%{opacity:.45}50%{opacity:1}}.season-spotlight-twinkle{animation:season-spotlight-twinkle 4.8s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.season-spotlight-twinkle{animation:none}}`}</style>
    </motion.section>
  );
}
