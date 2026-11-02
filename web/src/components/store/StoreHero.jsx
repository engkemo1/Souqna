import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Star, ArrowLeft, ArrowRight, MapPin } from 'lucide-react';
import { useStore, sp } from '../../lib/store.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { srcSet, pickSrc } from '../../lib/image.js';
import SmartImage from '../ui/SmartImage.jsx';
import { StoreLogo } from './StoreChrome.jsx';
import { mapsLinks } from './VisitCard.jsx';

const ease = [0.22, 1, 0.36, 1];

/* ── helpers ─────────────────────────────────────────────────────────────── */
const hexToRgb = (c) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** brand colour from the logo/cover (media.color) + whether text on it must be dark. */
function brandOf(media) {
  const hex = hexToRgb(media?.color) ? media.color : '#03244D';
  const [r, g, b] = hexToRgb(hex);
  return { hex, light: 0.299 * r + 0.587 * g + 0.114 * b > 165 };
}
const isWide = (media, fit) => (fit === 'cover' ? true : fit === 'contain' ? false : (media?.w && media?.h ? media.w / media.h : 1) >= 1.6);

/** Category "stories" — one tap from the storefront to a section. */
function CategoryStories() {
  const { store, categories } = useStore();
  const { tr, lang } = useI18n();
  const ar = lang === 'ar';
  const list = (categories || []).filter((c) => (c.count ?? 0) > 0);
  if (!list.length) return null;
  const Item = ({ to, label, children }) => (
    <Link to={to} className="group flex w-[74px] shrink-0 snap-start flex-col items-center gap-1.5 text-center sm:w-[92px]">
      <span className="rounded-full bg-gradient-to-tr from-accent via-accent to-primary p-[2.5px] transition group-active:scale-95 group-hover:scale-[1.04]">
        <span className="block rounded-full bg-canvas p-[2.5px]">{children}</span>
      </span>
      <span className="line-clamp-1 w-full text-[12px] font-semibold text-fg sm:text-[13px]">{label}</span>
    </Link>
  );
  return (
    <div className="border-b border-line bg-canvas">
      <div className="container">
        <div className={`scroll-x gap-3 py-4 sm:gap-5 ${list.length <= 6 ? 'sm:justify-center' : ''}`}>
          <Item to={sp(store.slug, 'shop')} label={ar ? 'الكل' : 'All'}>
            <span className="grid h-[58px] w-[58px] place-items-center rounded-full bg-btn text-[13px] font-bold text-on-btn sm:h-[74px] sm:w-[74px]">{ar ? 'الكل' : 'All'}</span>
          </Item>
          {list.map((c) => (
            <Item key={c.id} to={sp(store.slug, `shop?category=${c.slug}`)} label={tr(c.name)}>
              {c.image
                ? <SmartImage media={c.image} ratio="1 / 1" sizes="96px" className="h-[58px] w-[58px] rounded-full sm:h-[74px] sm:w-[74px]" />
                : <span className="grid h-[58px] w-[58px] place-items-center rounded-full bg-surface text-lg font-bold text-fg sm:h-[74px] sm:w-[74px]">{String(tr(c.name)).slice(0, 1)}</span>}
            </Item>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Rating + address chips and the action buttons, shared by both hero styles. */
function Actions({ store, ar, tone }) {
  const Arrow = ar ? ArrowLeft : ArrowRight;
  const primary = tone === 'card' ? 'bg-btn text-on-btn hover:brightness-110' : tone === 'light' ? 'bg-neutral-900 text-white hover:bg-neutral-800' : 'bg-white text-neutral-900 hover:bg-white/90';
  return (
    <div className="mt-6 flex justify-center lg:justify-start">
      <Link to={sp(store.slug, 'shop')} className={`group inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-8 text-[15px] font-bold shadow-lg transition active:scale-[.98] sm:w-auto ${primary}`}>
        {ar ? 'تسوّق الكولكشن' : 'Shop the collection'}<Arrow className="h-4 w-4 transition group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
      </Link>
    </div>
  );
}

function Meta({ store, ar, tone }) {
  const { tr } = useI18n();
  const maps = mapsLinks(store, tr(store.address));
  const sub = tone === 'card' ? 'text-muted' : tone === 'light' ? 'text-neutral-700' : 'text-white/80';
  return (
    <div className={`mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[13px] lg:justify-start ${sub}`}>
      {store.rating && store.ratingCount > 0 ? (
        <span className="inline-flex items-center gap-1 font-semibold">
          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{store.rating}<span className="font-normal">({store.ratingCount})</span>
        </span>
      ) : null}
      {tr(store.address) && (
        <a href={maps.open} target="_blank" rel="noreferrer" className="inline-flex min-w-0 max-w-full items-center gap-1 hover:underline">
          <MapPin className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{tr(store.address)}</span>
        </a>
      )}
    </div>
  );
}

/* ── style A: storefront ("واجهة المحل") ─────────────────────────────────── */
function FacadeHero() {
  const { store } = useStore();
  const { tr, lang } = useI18n();
  const ar = lang === 'ar';
  const cover = store.cover;
  const { hex, light } = brandOf(cover || store.logo);
  const tone = light ? 'light' : 'dark';
  const wideCover = cover && isWide(cover, store.customization?.coverFit);
  const ratio = cover ? Math.min(Math.max(cover.w / cover.h, 1), 1.78) : 1;
  return (
    <section className="relative isolate overflow-hidden" style={{ backgroundColor: hex }}>
      {/* spotlight in the store's own accent colour + soft vignette */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_70%_at_50%_0%,rgb(var(--c-accent)/.30),transparent_70%)] lg:bg-[radial-gradient(45%_90%_at_28%_40%,rgb(var(--c-accent)/.28),transparent_70%)]" />
      <div className={`absolute inset-x-0 bottom-0 -z-10 h-32 bg-gradient-to-t ${light ? 'from-black/10' : 'from-black/35'} to-transparent`} />

      <div className="container grid items-center gap-7 py-8 sm:py-12 lg:grid-cols-[minmax(0,400px)_1fr] lg:gap-16 lg:py-16">
        {/* the "sign" */}
        <motion.div initial={{ y: 20, scale: 0.97 }} animate={{ y: 0, scale: 1 }} transition={{ duration: 0.8, ease }} className="relative mx-auto w-[min(76vw,300px)] sm:w-[320px] lg:w-full lg:max-w-[400px]">
          <div className="absolute -inset-5 -z-10 rounded-[48px] bg-accent/25 blur-3xl" />
          <div className="relative overflow-hidden rounded-[28px] shadow-[0_30px_80px_-24px_rgba(0,0,0,.65)] ring-1 ring-white/20" style={{ aspectRatio: ratio, backgroundColor: cover?.color || hex }}>
            {cover ? (
              <picture>
                <source type="image/webp" srcSet={srcSet(cover, 'webp')} sizes="(min-width:1024px) 400px, 80vw" />
                <img src={`${cover.base}/original.jpg`} srcSet={srcSet(cover, 'jpg')} sizes="(min-width:1024px) 400px, 80vw"
                  width={cover.w} height={cover.h} alt={cover.alt || tr(store.name)} fetchpriority="high" decoding="async"
                  className={`absolute inset-0 h-full w-full ${wideCover ? 'object-cover' : 'object-contain'}`} />
              </picture>
            ) : (
              <div className="grid h-full w-full place-items-center bg-gradient-to-br from-primary to-secondary p-8">
                <StoreLogo store={store} size={150} className="h-[150px] w-[150px]" />
              </div>
            )}
          </div>
        </motion.div>

        {/* identity */}
        <motion.div initial={{ y: 18 }} animate={{ y: 0 }} transition={{ duration: 0.8, delay: 0.1, ease }} className="text-center lg:text-start">
          <div className="flex items-center justify-center gap-3 lg:justify-start">
            {cover && store.logo && <span className="rounded-full bg-white p-[3px] shadow-md"><StoreLogo store={store} size={44} className="h-11 w-11" /></span>}
            <h1 className={`font-display text-[32px] font-bold leading-tight sm:text-5xl lg:text-6xl ${light ? '!text-neutral-900' : '!text-white'}`}>{tr(store.name)}</h1>
          </div>
          {tr(store.tagline) && <p className={`mx-auto mt-2 max-w-xl text-base sm:text-lg lg:mx-0 ${light ? 'text-neutral-700' : 'text-white/80'}`}>{tr(store.tagline)}</p>}
          <Meta store={store} ar={ar} tone={tone} />
          <Actions store={store} ar={ar} tone={tone} />
        </motion.div>
      </div>
    </section>
  );
}

/* ── style B: wide banner + identity card (used for real banner covers) ──── */
function CoverArt({ media, fit }) {
  const crop = fit === 'cover'; // only when the owner explicitly asked to fill the frame; otherwise the WHOLE picture is shown
  return (
    <>
      <img src={pickSrc(media, 640)} alt="" aria-hidden="true" decoding="async"
        className="absolute inset-0 h-full w-full scale-125 object-cover blur-2xl brightness-[.55] saturate-125" />
      <picture>
        <source type="image/webp" srcSet={srcSet(media, 'webp')} sizes="100vw" />
        <img
          src={`${media.base}/original.jpg`} srcSet={srcSet(media, 'jpg')} sizes="100vw"
          width={media.w} height={media.h} alt={media.alt || ''} fetchpriority="high" decoding="async"
          className={`absolute inset-0 h-full w-full object-center ${crop ? 'object-cover' : 'object-contain'}`}
        />
      </picture>
    </>
  );
}

/** Phones: slim identity strip laid over the bottom of the cover. */
function PhoneStrip({ store, ar }) {
  const { tr } = useI18n();
  const Arrow = ar ? ArrowLeft : ArrowRight;
  return (
    <div className="absolute inset-x-0 bottom-0 px-4 pb-4 pt-20 lg:hidden" style={{ background: 'linear-gradient(to top, rgba(0,0,0,.78) 0%, rgba(0,0,0,.4) 55%, rgba(0,0,0,0) 100%)' }}>
      <div className="flex items-center gap-2.5">
        {store.logo && <span className="shrink-0 rounded-full bg-white p-[2px] shadow-md"><StoreLogo store={store} size={40} className="h-10 w-10" /></span>}
        <h1 className="min-w-0 flex-1 truncate font-display text-[24px] font-bold leading-tight !text-white drop-shadow">{tr(store.name)}</h1>
      </div>
      <Link to={sp(store.slug, 'shop')} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white px-4 text-[15px] font-bold text-neutral-900 shadow-lg transition active:scale-[.98]">{ar ? 'تسوّق الكولكشن' : 'Shop the collection'}<Arrow className="h-4 w-4" /></Link>
    </div>
  );
}

/* ── style C: portrait / square cover — the WHOLE picture, no blur and no crop; identity sits beside it (below on phones) ── */
function PortraitHero() {
  const { store } = useStore();
  const { tr, lang } = useI18n();
  const ar = lang === 'ar';
  const cover = store.cover;
  const { hex, light } = brandOf(cover);
  const tone = light ? 'light' : 'dark';
  return (
    <section className="relative isolate overflow-hidden lg:flex lg:items-stretch" style={{ backgroundColor: hex }}>
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(70%_80%_at_70%_0%,rgb(var(--c-accent)/.28),transparent_70%)]" />
      <div className="relative shrink-0">
        <picture className="block">
          <source type="image/webp" srcSet={srcSet(cover, 'webp')} sizes="(min-width:1024px) 50vw, 100vw" />
          <img src={`${cover.base}/original.jpg`} srcSet={srcSet(cover, 'jpg')} sizes="(min-width:1024px) 50vw, 100vw"
            width={cover.w} height={cover.h} alt={cover.alt || tr(store.name)} fetchpriority="high" decoding="async"
            className="mx-auto block h-auto max-h-[88svh] w-full object-contain lg:mx-0 lg:h-[min(80vh,680px)] lg:max-h-none lg:w-auto" />
        </picture>
        {/* phones: a compact strip ON the picture (name, open/closed, one big button + three round ones) — the picture stays visible */}
        <PhoneStrip store={store} ar={ar} />
      </div>
      {/* desktop: identity beside the picture */}
      <motion.div initial={{ y: 18 }} animate={{ y: 0 }} transition={{ duration: 0.7, ease }} className="hidden min-w-0 flex-1 flex-col justify-center px-14 py-10 text-start lg:flex">
        <div className="flex items-center gap-3">
          {store.logo && <span className="rounded-full bg-white p-[3px] shadow-md"><StoreLogo store={store} size={52} className="h-[52px] w-[52px]" /></span>}
          <h1 className={`font-display text-5xl font-bold leading-tight ${light ? '!text-neutral-900' : '!text-white'}`}>{tr(store.name)}</h1>
        </div>
        {tr(store.tagline) && <p className={`mt-2 max-w-xl text-lg ${light ? 'text-neutral-700' : 'text-white/80'}`}>{tr(store.tagline)}</p>}
        <Meta store={store} ar={ar} tone={tone} />
        <Actions store={store} ar={ar} tone={tone} />
      </motion.div>
    </section>
  );
}

function BannerHero() {
  const { store } = useStore();
  const { tr, lang } = useI18n();
  const ar = lang === 'ar';
  return (
    <section className="bg-canvas">
      <div className="relative isolate max-h-[78vh] min-h-[200px] w-full overflow-hidden bg-[#03244D]" style={{ aspectRatio: store.cover ? Math.min(Math.max(store.cover.w / store.cover.h, 1.2), 3.2) : 2.4 }}>
        {store.cover ? (
          <motion.div className="absolute inset-0" initial={{ opacity: 0.6 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, ease: 'easeOut' }}>
            <CoverArt media={store.cover} fit={store.customization?.coverFit} />
          </motion.div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/80 to-secondary" />
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/35 to-transparent" />
      </div>
      <div className="container relative z-10 -mt-12 pb-5 sm:-mt-16">
        <motion.div initial={{ y: 18 }} animate={{ y: 0 }} transition={{ duration: 0.7, delay: 0.1, ease }}
          className="rounded-[28px] bg-elevated p-4 shadow-lift ring-1 ring-line sm:p-6 lg:p-7">
          <div className="flex items-center gap-4 sm:gap-5">
            <span className="shrink-0 rounded-full bg-elevated p-[3px] ring-2 ring-accent/80 sm:p-1">
              <StoreLogo store={store} size={88} className="h-[68px] w-[68px] sm:h-[88px] sm:w-[88px]" />
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-[26px] font-bold leading-tight text-fg sm:text-4xl">{tr(store.name)}</h1>
              {tr(store.tagline) && <p className="mt-1 line-clamp-2 text-[14px] text-muted sm:text-base">{tr(store.tagline)}</p>}
            </div>
          </div>
          <div className="text-center lg:text-start">
            <Meta store={store} ar={ar} tone="card" />
            <Actions store={store} ar={ar} tone="card" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/**
 * Store front.  Auto: a real wide banner → banner style; a logo / square / no cover → storefront style.
 * Owner override: store.customization.heroStyle = 'facade' | 'banner'  (and coverFit = 'cover' | 'contain').
 */
export default function StoreHero({ variant } = {}) {
  const { store } = useStore();
  const style = store.customization?.heroStyle;
  const full = variant === 'full'; // chosen in the store designer: always the whole picture, never the framed facade
  const portrait = store.cover && store.cover.w / store.cover.h < 1.2 && (full || (style !== 'facade' && style !== 'banner' && store.customization?.coverFit !== 'cover'));
  const banner = style === 'banner' || ((full || style !== 'facade') && !!store.cover); // any cover fills the page width, uncropped
  return (
    <>
      {portrait ? <PortraitHero /> : banner ? <BannerHero /> : <FacadeHero />}
      <CategoryStories />
    </>
  );
}

/** Store identity strip shown under the banner slider, so the logo and name stay visible in slider mode. */
export function StoreIdentityBar() {
  const { store } = useStore();
  const { tr, lang } = useI18n();
  const ar = lang === 'ar';
  const Arrow = ar ? ArrowLeft : ArrowRight;
  return (
    <motion.section initial={{ y: 12 }} animate={{ y: 0 }} transition={{ duration: 0.7, delay: 0.2, ease }}
      className="border-b border-line bg-surface">
      <div className="container flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="shrink-0 rounded-full p-[3px] ring-2 ring-accent/70"><StoreLogo store={store} size={56} className="h-14 w-14" /></span>
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-bold sm:text-3xl">{tr(store.name)}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
              {tr(store.tagline) && <span className="truncate">{tr(store.tagline)}</span>}
              {store.rating && store.ratingCount > 0 ? <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{store.rating} ({store.ratingCount})</span> : null}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link to={sp(store.slug, 'shop')} className="inline-flex items-center gap-2 rounded-full bg-btn px-5 py-2.5 text-[14px] font-semibold text-on-btn">
            {ar ? 'تسوّق الكولكشن' : 'Shop the collection'}<Arrow className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </motion.section>
  );
}
