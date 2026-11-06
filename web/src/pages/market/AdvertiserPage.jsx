import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ShoppingBag, MessageCircle, Phone, MapPin, Clock, Check, Instagram, Facebook, ChevronLeft, ChevronRight, BadgeCheck, ShieldCheck, Plus, Send, Music2 } from 'lucide-react';
import { useApi } from '../../lib/hooks.js';
import { useMarketCart } from '../../lib/cart.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import MarketHeader from '../../components/market/MarketHeader.jsx';

const pick = (o, lang) => (o && (o[lang] || o.ar || o.en)) || '';
const track = (slug, event) => {
  try { fetch(`/api/advertiser/${encodeURIComponent(slug)}/event`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event }), keepalive: true }).catch(() => {}); } catch { /* tracking must never break the page */ }
};

/** Light profile page of an outside advertiser (reached from a featured ad). No products and no cart: name, photos, how to reach the business. */
export default function AdvertiserPage() {
  const { slug } = useParams();
  const { lang } = useI18n();
  const ar = lang !== 'en';
  const { data, error, loading } = useApi(`/advertiser/${slug}`);
  const a = data?.advertiser;
  const rail = useRef(null);
  const [idx, setIdx] = useState(0);
  const onRail = () => { const el = rail.current; if (!el || !el.firstElementChild) return; const w = el.firstElementChild.getBoundingClientRect().width + 10; setIdx(Math.min(Math.round(Math.abs(el.scrollLeft) / w), el.children.length - 1)); };
  const [picked, setPicked] = useState([]); // photo urls the visitor chose to ask about in ONE WhatsApp message
  const [wide, setWide] = useState(false); // a very wide banner or a portrait photo is shown whole (never cropped) with the identity underneath
  const cart = useMarketCart();
  const navigate = useNavigate();
  const toast = useToast();
  const addToCart = (it) => {
    const c = it.cart;
    cart.add({ productId: c.productId, variantId: null, slug: c.slug, name: { ar: it.name, en: it.name }, price: it.price, compareAt: null, image: c.image, color: null, colorName: null, size: null, qty: 1 }, { slug: c.storeSlug, name: c.storeName });
    track(a.slug, 'cart');
    toast({ title: ar ? 'اتضافت للسلة' : 'Added to basket', description: it.name, action: { label: ar ? 'افتح السلة' : 'View basket', onClick: () => navigate('/market-cart') } });
  };

  useEffect(() => {
    if (!a?.cover) { setWide(false); return undefined; }
    const im = new Image();
    im.onload = () => { const r = im.naturalWidth / im.naturalHeight; setWide(r > 1.7 || r < 1.1); };
    im.src = a.cover;
    return () => { im.onload = null; };
  }, [a?.cover]);
  useEffect(() => { if (a) track(a.slug, 'view'); }, [a?.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !a) return <div className="min-h-screen bg-bg"><MarketHeader /><div className="mx-auto max-w-2xl animate-pulse space-y-4 px-4 pt-6"><div className="h-48 rounded-3xl bg-fg/[0.06]" /><div className="h-8 w-1/2 rounded-xl bg-fg/[0.06]" /></div></div>;
  if (error || !a) {
    return (
      <div className="min-h-screen bg-bg"><MarketHeader />
        <main className="mx-auto max-w-md px-4 py-20 text-center">
          <h1 className="font-display text-2xl font-bold">{ar ? 'الصفحة دي مش متاحة' : 'This page is not available'}</h1>
          <p className="mt-2 text-muted">{ar ? 'ممكن تكون اتشالت أو الرابط غلط.' : 'It may have been removed, or the link is wrong.'}</p>
          <Link to="/" className="mt-6 inline-flex h-11 items-center rounded-full bg-btn px-6 font-bold text-on-btn">{ar ? 'ارجع للرئيسية' : 'Back to home'}</Link>
        </main>
      </div>
    );
  }

  const name = pick(a.name, lang);
  const waHref = a.whatsapp ? `https://wa.me/${a.whatsapp}?text=${encodeURIComponent(a.whatsappText)}` : null;

  const chosen = (a.gallery || []).filter((it) => picked.includes(it.src));
  const chosenTotal = chosen.reduce((n, it) => n + (it.price || 0), 0);
  const chosenMsg = `السلام عليكم، شفت صفحة ${name} على Twist وعايز أطلب:\n${chosen.map((it, n) => `${n + 1}. ${it.name || 'قطعة'}${it.price ? ` — ${it.price} جنيه` : ''}`).join('\n')}${chosenTotal ? `\nالإجمالي: ${chosenTotal} جنيه` : ''}`;
  const Arrow = ar ? ChevronLeft : ChevronRight;
  const Row = ({ href, event, icon: Icon, tint, title, sub, external }) => (
    <a href={href} {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})} onClick={() => track(a.slug, event)}
      className="group flex items-center gap-3.5 rounded-2xl border border-line bg-elevated p-3.5 shadow-sm transition hover:-translate-y-px hover:shadow-md active:scale-[.99]">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white shadow-sm" style={{ background: tint }}><Icon className="h-6 w-6" /></span>
      <span className="min-w-0 flex-1"><span className="block text-[15px] font-bold leading-tight">{title}</span>{sub && <span className="mt-0.5 block truncate text-[13px] text-muted">{sub}</span>}</span>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fg/[0.06] text-muted transition group-hover:bg-fg/10"><Arrow className="h-4 w-4" /></span>
    </a>
  );
  const Chip = ({ children, tone = 'glass' }) => (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold backdrop-blur-md ${tone === 'on' ? 'bg-emerald-400/90 text-emerald-950' : tone === 'off' ? 'bg-white/25 text-white' : 'bg-black/40 text-white'}`}>{children}</span>
  );
  const SectionTitle = ({ children, sub }) => (
    <div className="mb-3 mt-9 flex items-end justify-between gap-3"><h2 className="font-display text-xl font-bold">{children}</h2>{sub && <span className="text-xs text-muted">{sub}</span>}</div>
  );
  const hasInfo = pick(a.address, lang) || pick(a.hours, lang) || a.openNow != null;
  const items = a.gallery || [];
  const sellable = items.some((it) => it.cart || it.name || it.price);

  return (
    <div className="min-h-screen bg-bg">
      <MarketHeader />
      <main className="mx-auto max-w-2xl px-4 pb-28 pt-4">
        {/* ── hero: the cover, a readable gradient, identity on top of it ── */}
        {wide ? (
          <section className="overflow-hidden rounded-[28px] border border-line bg-elevated shadow-lift">
            <div className="relative">
              <img src={a.cover} alt="" className="block h-auto max-h-[75vh] w-full object-cover object-top" decoding="async" fetchpriority="high" />
              <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
                <Chip>{ar ? 'إعلان' : 'Ad'}</Chip>
                {a.openNow != null && <Chip tone={a.openNow ? 'on' : 'off'}><span className={`h-2 w-2 rounded-full ${a.openNow ? 'bg-emerald-900' : 'bg-white/70'}`} />{a.openNow ? (ar ? 'مفتوح دلوقتي' : 'Open now') : (ar ? 'مقفول دلوقتي' : 'Closed now')}</Chip>}
              </div>
            </div>
            <div className="relative px-5 pb-5">
              <span className="-mt-10 grid h-20 w-20 place-items-center overflow-hidden rounded-[22px] bg-white shadow-xl ring-4 ring-elevated">
                {a.logo ? <img src={a.logo} alt="" className="h-full w-full object-cover" /> : <span className="text-3xl font-bold text-neutral-800">{name.slice(0, 1)}</span>}
              </span>
              <h1 className="mt-3 font-display text-[28px] font-bold leading-[1.15] sm:text-4xl">{name}</h1>
              {pick(a.tagline, lang) && <p className="mt-1.5 text-[17px] leading-snug text-fg/80">{pick(a.tagline, lang)}</p>}
              {pick(a.address, lang) && <p className="mt-2 flex items-center gap-1.5 text-[13px] text-muted"><MapPin className="h-4 w-4 shrink-0" /><span className="truncate">{pick(a.address, lang)}</span></p>}
            </div>
          </section>
        ) : (
        <section className="relative isolate overflow-hidden rounded-[28px] bg-neutral-900 shadow-lift">
          {a.cover
            ? <img src={a.cover} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" decoding="async" fetchpriority="high" />
            : <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary to-secondary" />}
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />
          <div className="flex min-h-[340px] flex-col justify-between p-4 sm:min-h-[380px] sm:p-6">
            <div className="flex items-start justify-between gap-2">
              <Chip>{ar ? 'إعلان' : 'Ad'}</Chip>
              {a.openNow != null && <Chip tone={a.openNow ? 'on' : 'off'}><span className={`h-2 w-2 rounded-full ${a.openNow ? 'bg-emerald-900' : 'bg-white/70'}`} />{a.openNow ? (ar ? 'مفتوح دلوقتي' : 'Open now') : (ar ? 'مقفول دلوقتي' : 'Closed now')}</Chip>}
            </div>
            <div>
              <div className="flex items-end gap-3.5">
                <span className="grid h-[76px] w-[76px] shrink-0 place-items-center overflow-hidden rounded-[22px] bg-white shadow-xl ring-[3px] ring-white/90">
                  {a.logo ? <img src={a.logo} alt="" className="h-full w-full object-cover" /> : <span className="text-3xl font-bold text-neutral-800">{name.slice(0, 1)}</span>}
                </span>
                <div className="min-w-0 pb-1">
                  <h1 className="font-display text-[28px] font-bold leading-[1.15] text-white drop-shadow sm:text-4xl">{name}</h1>
                </div>
              </div>
              {pick(a.tagline, lang) && <p className="mt-3 text-[17px] leading-snug text-white/90">{pick(a.tagline, lang)}</p>}
              {pick(a.address, lang) && <p className="mt-2 flex items-center gap-1.5 text-[13px] text-white/75"><MapPin className="h-4 w-4 shrink-0" /><span className="truncate">{pick(a.address, lang)}</span></p>}
            </div>
          </div>
        </section>
        )}

        {/* ── one big primary action + two secondary ── */}
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {waHref && (
            <motion.a href={waHref} target="_blank" rel="noreferrer noopener" onClick={() => track(a.slug, 'whatsapp')}
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, type: 'spring', stiffness: 260, damping: 22 }} whileTap={{ scale: 0.97 }} whileHover={{ y: -2 }}
              className="relative col-span-2 inline-flex h-14 items-center justify-center gap-2.5 overflow-hidden rounded-2xl bg-gradient-to-l from-[#1ebe5b] to-[#25D366] text-base font-bold text-white shadow-lg shadow-[#25D366]/30">
              <motion.span aria-hidden className="pointer-events-none absolute inset-y-0 w-1/3 -skew-x-12 bg-white/25 blur-md" initial={{ x: '-150%' }} animate={{ x: '450%' }} transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 3.2, ease: 'easeInOut' }} />
              <motion.span animate={{ rotate: [0, -12, 10, -6, 0] }} transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 3.5 }} className="relative"><MessageCircle className="h-6 w-6" /></motion.span>
              <span className="relative">{ar ? 'كلّمهم على واتساب' : 'Chat on WhatsApp'}</span>
            </motion.a>
          )}
          {a.phone && <a href={`tel:+${a.phone}`} onClick={() => track(a.slug, 'call')} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-line-strong bg-elevated text-[15px] font-bold transition hover:bg-fg/[0.04] active:scale-[.985]"><Phone className="h-5 w-5" />{ar ? 'اتصال' : 'Call'}</a>}
          {a.mapsUrl && <a href={a.mapsUrl} target="_blank" rel="noreferrer noopener" onClick={() => track(a.slug, 'map')} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-line-strong bg-elevated text-[15px] font-bold transition hover:bg-fg/[0.04] active:scale-[.985]"><MapPin className="h-5 w-5" />{ar ? 'الاتجاهات' : 'Directions'}</a>}
        </div>

        {pick(a.about, lang) && (
          <>
            <SectionTitle>{ar ? 'عن المحل' : 'About'}</SectionTitle>
            <p className="text-[15.5px] leading-[1.9] text-fg/85">{pick(a.about, lang)}</p>
          </>
        )}

        {/* ── gallery ── */}
        {items.length > 0 && (
          <>
            <SectionTitle sub={items.length > 1 ? (ar ? `${items.length} صور` : `${items.length} photos`) : undefined}>{sellable ? (ar ? 'قطع من عندهم' : 'From the shop') : (ar ? 'صور من المحل' : 'Photos')}</SectionTitle>
            <div className="relative">
              <div ref={rail} onScroll={onRail} className="-mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto scroll-smooth px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {items.map((it, i) => {
                  const orderable = !!(it.name || it.price) && !!a.whatsapp;
                  const on = picked.includes(it.src);
                  const toggle = () => setPicked((p) => (p.includes(it.src) ? p.filter((x) => x !== it.src) : [...p, it.src]));
                  return (
                    <motion.figure key={it.src} initial={{ opacity: 0, x: 40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: Math.min(i, 3) * 0.08 }}
                      className="group relative aspect-[4/5] w-[80%] shrink-0 snap-center overflow-hidden rounded-[22px] bg-neutral-900 sm:w-[46%]">
                      <img src={it.src} alt={it.name || ''} loading="lazy" decoding="async" onClick={orderable ? toggle : undefined} className="absolute inset-0 h-full w-full cursor-pointer object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-105" />
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/25" />
                      <span className="pointer-events-none absolute start-4 top-4 text-[13px] font-light tracking-[.25em] text-white/90"><bdi dir="ltr">{String(i + 1).padStart(2, '0')}</bdi></span>
                      {orderable && (
                        <motion.button type="button" onClick={toggle} whileTap={{ scale: 0.88 }} aria-pressed={on} aria-label={ar ? 'اختار القطعة' : 'Select item'}
                          className={`absolute end-3.5 top-3.5 grid h-10 w-10 place-items-center rounded-full backdrop-blur-xl transition-colors duration-300 ${on ? 'bg-white text-black' : 'bg-white/20 text-white ring-1 ring-white/50'}`}>
                          <AnimatePresence mode="wait" initial={false}>
                            {on ? <motion.span key="c" initial={{ scale: 0, rotate: -60 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }}><Check className="h-5 w-5" strokeWidth={2.5} /></motion.span>
                              : <motion.span key="p" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><Plus className="h-5 w-5" strokeWidth={1.75} /></motion.span>}
                          </AnimatePresence>
                        </motion.button>
                      )}
                      <figcaption className="absolute inset-x-0 bottom-0 p-4 text-white">
                        {it.name && <p className="line-clamp-2 font-display text-[22px] font-semibold leading-tight">{it.name}</p>}
                        {it.price && <p className="mt-1 text-[15px] font-light tracking-wide text-white/85" dir="ltr">{it.price.toLocaleString(ar ? 'ar-EG' : 'en-US')} {ar ? 'جنيه' : 'EGP'}</p>}
                        {(orderable || it.cart) && (
                          <div className="mt-3.5 flex gap-2">
                            {orderable && (
                              <motion.button whileTap={{ scale: 0.96 }} type="button" onClick={toggle}
                                className={`h-11 flex-1 rounded-full text-[13px] font-semibold tracking-wide transition-colors duration-300 ${on ? 'bg-white text-black' : 'bg-white/20 text-white ring-1 ring-white/50 backdrop-blur-xl hover:bg-white hover:text-black'}`}>
                                {on ? (ar ? '✓ تم الاختيار' : '✓ Selected') : (ar ? 'اختار القطعة' : 'Select')}
                              </motion.button>
                            )}
                            {it.cart && (
                              <motion.button whileTap={{ scale: 0.92 }} type="button" onClick={() => addToCart(it)} aria-label={ar ? 'أضف للسلة' : 'Add to basket'}
                                className="grid h-11 w-11 place-items-center rounded-full bg-white text-black"><ShoppingBag className="h-[18px] w-[18px]" strokeWidth={1.75} /></motion.button>
                            )}
                          </div>
                        )}
                      </figcaption>
                    </motion.figure>
                  );
                })}
              </div>
              {items.length > 1 && (
                <div className="mt-3 flex items-center justify-center gap-1.5" dir="ltr">
                  {items.map((it, i) => <span key={it.src} className={`h-1 rounded-full transition-all duration-300 ${i === idx ? 'w-6 bg-fg' : 'w-1.5 bg-fg/25'}`} />)}
                </div>
              )}
            </div>
            {items.some((it) => it.name || it.price) && a.whatsapp && <p className="mt-3 text-center text-xs text-muted">{ar ? 'اختار القطع اللي عاجباك، وابعتهم للمحل في رسالة واتساب واحدة.' : 'Pick what you like and send it all in one WhatsApp message.'}</p>}
            {items.some((it) => it.cart) && <p className="mt-3 flex items-center gap-1.5 text-xs text-muted"><ShieldCheck className="h-4 w-4 shrink-0" />{ar ? 'الطلب بالسلة بيوصلك من Twist — توصيل لحد بيتك.' : 'Basket orders are delivered by Twist, to your door.'}</p>}
          </>
        )}

        {/* ── info + contact list ── */}
        {hasInfo && (
          <>
            <SectionTitle>{ar ? 'معلومات' : 'Info'}</SectionTitle>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {pick(a.hours, lang) && <div className="flex items-center gap-3 rounded-2xl border border-line bg-elevated p-3.5"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-fg/[0.06]"><Clock className="h-5 w-5" /></span><div><p className="text-xs text-muted">{ar ? 'مواعيد الشغل' : 'Hours'}</p><p className="text-[15px] font-bold">{pick(a.hours, lang)}</p></div></div>}
              {pick(a.address, lang) && <div className="flex items-center gap-3 rounded-2xl border border-line bg-elevated p-3.5"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-fg/[0.06]"><MapPin className="h-5 w-5" /></span><div className="min-w-0"><p className="text-xs text-muted">{ar ? 'العنوان' : 'Address'}</p><p className="text-[15px] font-bold leading-snug">{pick(a.address, lang)}</p></div></div>}
            </div>
          </>
        )}

        {(a.instagram || a.facebook || a.tiktok) && (
          <>
            <SectionTitle sub={ar ? 'تابعهم' : 'Follow'}>{ar ? 'تواصل معاهم' : 'Connect'}</SectionTitle>
            <div className="space-y-2.5">
              {a.instagram && <Row href={a.instagram} event="social" external icon={Instagram} tint="linear-gradient(135deg,#f58529,#dd2a7b 55%,#8134af)" title="Instagram" sub={ar ? 'صور وريلز' : 'Photos & Reels'} />}
              {a.tiktok && <Row href={a.tiktok} event="social" external icon={Music2} tint="#010101" title="TikTok" sub={ar ? 'فيديوهات' : 'Videos'} />}
              {a.facebook && <Row href={a.facebook} event="social" external icon={Facebook} tint="#1877F2" title="Facebook" sub={ar ? 'الصفحة والأخبار' : 'Page & updates'} />}
            </div>
          </>
        )}

        <div className="mt-10 flex items-start gap-2 rounded-2xl bg-fg/[0.04] p-3.5 text-xs leading-relaxed text-muted">
          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{ar ? 'ده إعلان على Twist. الصفحة دي بتعرّف بالمحل وبس، وكل التعامل والسعر مع المحل مباشرةً.' : 'This is an ad on Twist. Dealing and prices are directly with the business.'}</p>
        </div>
      </main>

      <AnimatePresence>
        {picked.length > 0 && a.whatsapp && (
          <motion.div key="bar" initial={{ y: 120, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 120, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="fixed inset-x-3 bottom-[88px] z-40 mx-auto max-w-xl sm:bottom-6">
            <div className="flex items-center gap-3 bg-black p-2.5 ps-4 text-white shadow-2xl">
              <div className="flex -space-x-3 rtl:space-x-reverse">
                {chosen.slice(0, 3).map((it) => <motion.img layout key={it.src} src={it.src} alt="" className="h-10 w-8 object-cover ring-2 ring-black" />)}
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="text-[13px] font-bold">{ar ? `${picked.length} قطعة مختارة` : `${picked.length} selected`}</p>
                {chosenTotal > 0 && <p className="text-xs text-white/70" dir="ltr">{chosenTotal.toLocaleString(ar ? 'ar-EG' : 'en-US')} {ar ? 'جنيه' : 'EGP'}</p>}
              </div>
              <motion.a whileTap={{ scale: 0.95 }} href={`https://wa.me/${a.whatsapp}?text=${encodeURIComponent(chosenMsg)}`} target="_blank" rel="noreferrer noopener" onClick={() => track(a.slug, 'order')}
                className="inline-flex h-11 items-center gap-2 bg-[#25D366] px-5 text-[12px] font-bold uppercase tracking-[.1em] text-white">
                <Send className="h-4 w-4 rtl:-scale-x-100" />{ar ? 'ابعت الطلب' : 'Send'}
              </motion.a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
