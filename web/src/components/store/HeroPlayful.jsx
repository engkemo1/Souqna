import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, MessageCircle, Phone, Sparkles, Star, Heart } from 'lucide-react';
import { waNumber } from '@souqna/shared/layout';
import { useStore, sp } from '../../lib/store.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import SmartImage from '../ui/SmartImage.jsx';
import { StoreLogo } from './StoreChrome.jsx';
import { openNow } from './VisitCard.jsx';
import { KID_TINTS } from '../../lib/design.js';

const ease = [0.22, 1, 0.36, 1];
const fmtTime = (hm, ar) => {
  let [h, m] = String(hm).split(':').map(Number);
  const pm = h >= 12; h = h % 12 || 12;
  const mm = m ? `:${String(m).padStart(2, '0')}` : '';
  return ar ? `${h}${mm} ${pm ? 'م' : 'ص'}` : `${h}${mm} ${pm ? 'PM' : 'AM'}`;
};

/** A soft, hand-drawn looking blob (pure SVG, no image files). */
const Blob = ({ className, color, d }) => (
  <svg viewBox="0 0 200 200" className={className} aria-hidden="true"><path fill={color} d={d} /></svg>
);
const B1 = 'M45.3,-61.6C58.6,-52.6,69,-39.1,74.1,-23.6C79.2,-8.1,79,9.4,72.4,23.9C65.8,38.4,52.8,49.9,38.4,58.8C24,67.7,8.2,74,-8.5,75.4C-25.2,76.8,-42.8,73.3,-55.5,63.1C-68.2,52.9,-76,36,-78.2,18.8C-80.4,1.6,-77,-15.9,-68.6,-29.6C-60.2,-43.3,-46.8,-53.2,-32.9,-62C-19,-70.8,-4.6,-78.5,9.4,-77.9C23.4,-77.3,32,-70.6,45.3,-61.6Z';
const B2 = 'M38.6,-52.8C50.6,-44.5,60.8,-33.6,66.2,-20.2C71.6,-6.8,72.2,9.1,66.4,22.4C60.6,35.7,48.4,46.4,34.9,54.6C21.4,62.8,6.6,68.5,-8.8,69.5C-24.2,70.5,-40.2,66.8,-52.3,57.4C-64.4,48,-72.6,32.9,-74.7,17.2C-76.8,1.5,-72.8,-14.8,-64.7,-27.9C-56.6,-41,-44.4,-50.9,-31.3,-58.7C-18.2,-66.5,-4.1,-72.2,8.6,-71.3C21.3,-70.4,26.6,-61.1,38.6,-52.8Z';

/** Little floating shapes: stars, dots and squiggles in the kids palette. */
function Confetti() {
  const bits = [
    { c: KID_TINTS[3].ink, x: '6%', y: '18%', s: 14, k: 'star', d: 0 },
    { c: KID_TINTS[1].ink, x: '44%', y: '10%', s: 10, k: 'dot', d: 0.6 },
    { c: KID_TINTS[4].ink, x: '92%', y: '22%', s: 16, k: 'star', d: 1.2 },
    { c: KID_TINTS[2].ink, x: '12%', y: '78%', s: 12, k: 'dot', d: 0.3 },
    { c: KID_TINTS[0].ink, x: '52%', y: '86%', s: 18, k: 'squiggle', d: 0.9 },
    { c: KID_TINTS[5].ink, x: '86%', y: '84%', s: 11, k: 'dot', d: 1.5 },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {bits.map((b, i) => (
        <span key={i} className="kid-float absolute" style={{ insetInlineStart: b.x, top: b.y, animationDelay: `${b.d}s` }}>
          {b.k === 'star' && <Star style={{ width: b.s, height: b.s, color: b.c, fill: b.c }} />}
          {b.k === 'dot' && <span className="block rounded-full" style={{ width: b.s, height: b.s, background: b.c }} />}
          {b.k === 'squiggle' && <svg width={b.s * 2.2} height={b.s} viewBox="0 0 44 20"><path d="M2 12c5-9 9-9 13 0s8 9 13 0 9-9 14 0" fill="none" stroke={b.c} strokeWidth="4" strokeLinecap="round" /></svg>}
        </span>
      ))}
    </div>
  );
}

/**
 * Kids' storefront hero: cheerful blobs, a photo in a bubbly frame with stickers, a rounded playful title and big pill
 * buttons. Everything comes from the store's own data (name, tagline, cover, hours, WhatsApp, phone).
 */
export function HeroPlayful({ banners = [] }) {
  const { store } = useStore();
  const { tr, lang } = useI18n();
  const ar = lang === 'ar';
  const Arrow = ar ? ArrowLeft : ArrowRight;
  const image = store.cover || banners[0]?.image || null;
  const wa = waNumber(store.whatsapp);
  const open = openNow(store.hours);
  const h = store.hours;
  const sign = open === null ? null : open
    ? (ar ? `مفتوحين دلوقتي${h?.close ? ` · لحد ${fmtTime(h.close, ar)}` : ''}` : `Open now${h?.close ? ` · until ${fmtTime(h.close, ar)}` : ''}`)
    : (ar ? `مقفولين${h?.open ? ` · بنفتح ${fmtTime(h.open, ar)}` : ''}` : `Closed${h?.open ? ` · opens ${fmtTime(h.open, ar)}` : ''}`);
  const pill = 'inline-flex h-12 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-bold transition active:scale-[.96]';
  return (
    <section className="kid-hero relative isolate overflow-hidden bg-secondary text-fg">
      <Blob className="absolute -start-24 -top-28 -z-10 h-[360px] w-[360px] opacity-70 sm:h-[520px] sm:w-[520px]" color={KID_TINTS[1].bg} d={B1} />
      <Blob className="absolute -bottom-32 -end-24 -z-10 h-[340px] w-[340px] opacity-80 sm:h-[480px] sm:w-[480px]" color={KID_TINTS[3].bg} d={B2} />
      <Blob className="absolute end-[38%] top-6 -z-10 hidden h-40 w-40 opacity-70 md:block" color={KID_TINTS[4].bg} d={B2} />
      <Confetti />
      <div className="container relative grid items-center gap-6 pb-16 pt-7 sm:gap-8 sm:pb-24 sm:pt-12 md:grid-cols-[1.05fr_1fr] md:gap-12">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease }} className="order-2 text-center md:order-1 md:text-start">
          <div className="inline-flex items-center gap-3 rounded-full bg-white/80 py-1.5 pe-4 ps-1.5 shadow-sm ring-1 ring-black/5 backdrop-blur">
            <StoreLogo store={store} size={44} className="h-11 w-11" />
            <span className="text-[13px] font-bold text-fg">{ar ? 'أهلاً بالأبطال الصغيرين' : 'Hello, little heroes'}</span>
            <Sparkles className="h-4 w-4 text-accent" />
          </div>
          <h1 className="kid-title mt-4 text-[40px] leading-[1.05] sm:mt-5 sm:text-6xl lg:text-7xl">
            <span className="relative inline-block">
              {tr(store.name)}
              <svg className="absolute -bottom-3 start-0 h-4 w-full" viewBox="0 0 300 16" preserveAspectRatio="none" aria-hidden="true"><path d="M4 11 C 60 2, 120 2, 160 9 S 250 15, 296 5" fill="none" stroke="rgb(var(--c-accent))" strokeWidth="6" strokeLinecap="round" /></svg>
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-md text-base font-medium opacity-80 sm:text-lg md:mx-0">{tr(store.tagline) || (ar ? 'لبس مريح وألوان تفرّح، لكل الأعمار' : 'Comfy clothes and happy colours for every age')}</p>
          {sign && (
            <span className={`mt-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13.5px] font-bold text-white shadow-md ${open ? 'bg-emerald-500' : 'bg-rose-500'}`}>
              <span className="relative flex h-2 w-2">{open && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/80" />}<span className="relative inline-flex h-2 w-2 rounded-full bg-white" /></span>
              {sign}
            </span>
          )}
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3 md:justify-start">
            <Link to={sp(store.slug, 'shop')} className={`${pill} kid-pop bg-primary px-7 text-on-primary shadow-[0_6px_0_rgba(0,0,0,0.18)] hover:-translate-y-0.5`}>
              {ar ? 'يلا نتسوّق' : "Let's shop"}<Arrow className="h-4 w-4" />
            </Link>
            {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className={`${pill} bg-white text-fg shadow-sm ring-1 ring-black/5 hover:-translate-y-0.5`}><MessageCircle className="h-4 w-4 text-emerald-600" />{ar ? 'واتساب' : 'WhatsApp'}</a>}
            {store.phone && <a href={`tel:${String(store.phone).replace(/\s/g, '')}`} className={`${pill} bg-white text-fg shadow-sm ring-1 ring-black/5 hover:-translate-y-0.5`}><Phone className="h-4 w-4 text-sky-600" />{ar ? 'اتصال' : 'Call'}</a>}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.92, rotate: -4 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ duration: 0.8, ease }} className="relative order-1 mx-auto w-full max-w-[250px] xs:max-w-[290px] sm:max-w-[380px] md:order-2 md:max-w-[480px]">
          <div className="kid-frame relative overflow-hidden border-[7px] border-white bg-white shadow-[0_24px_60px_-20px_rgba(31,35,64,0.35)]">
            {image
              ? <SmartImage media={image} priority ratio="1 / 1" sizes="(min-width:768px) 480px, 90vw" className="h-full w-full" />
              : <div className="grid aspect-square place-items-center" style={{ background: KID_TINTS[0].bg }}><StoreLogo store={store} size={120} className="h-28 w-28" /></div>}
          </div>
          <span className="kid-spin absolute -start-3 -top-3 grid h-20 w-20 place-items-center rounded-full text-center text-[12px] font-extrabold leading-tight text-white shadow-lg sm:h-24 sm:w-24 sm:text-[13px]" style={{ background: KID_TINTS[0].ink }}>
            {ar ? <>جديد<br />كل أسبوع</> : <>New<br />every week</>}
          </span>
          <span className="kid-float absolute -bottom-4 end-2 inline-flex items-center gap-1.5 rounded-2xl bg-white px-3.5 py-2 text-[13px] font-bold shadow-lg" style={{ animationDelay: '0.8s' }}>
            <Heart className="h-4 w-4" style={{ color: KID_TINTS[5].ink, fill: KID_TINTS[5].ink }} />{ar ? 'مقاسات لكل الأعمار' : 'Sizes for every age'}
          </span>
          <span className="kid-float absolute -end-3 top-10 grid h-12 w-12 place-items-center rounded-2xl bg-white shadow-lg" style={{ animationDelay: '1.6s' }}>
            <Star className="h-6 w-6" style={{ color: KID_TINTS[3].ink, fill: KID_TINTS[3].ink }} />
          </span>
        </motion.div>
      </div>
      {/* wavy edge into the page */}
      <svg className="absolute inset-x-0 bottom-0 h-10 w-full text-canvas sm:h-14" viewBox="0 0 1440 80" preserveAspectRatio="none" aria-hidden="true">
        <path fill="currentColor" d="M0,48 C120,80 240,80 360,56 C480,32 600,8 720,24 C840,40 960,80 1080,72 C1200,64 1320,24 1440,32 L1440,80 L0,80 Z" />
      </svg>
    </section>
  );
}
