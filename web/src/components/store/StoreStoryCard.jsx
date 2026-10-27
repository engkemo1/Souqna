import { motion } from 'framer-motion';
import { Sparkles, MapPin, MessageCircle, ExternalLink, HeartHandshake } from 'lucide-react';
import { useStore } from '../../lib/store.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { mapsLinks } from './VisitCard.jsx';
import SmartImage from '../ui/SmartImage.jsx';

export default function StoreStoryCard() {
  const { store } = useStore();
  const { t, tr, lang } = useI18n();
  const story = store?.customization?.story;

  // 100% Optional: If disabled or no text/image provided, do not render anything
  if (!story?.enabled || (!story?.text_ar && !story?.text_en && !story?.image)) {
    return null;
  }

  const title = (lang === 'ar' ? story.title_ar : story.title_en) || (lang === 'ar' ? `عن ${tr(store.name)}` : `About ${tr(store.name)}`);
  const text = (lang === 'ar' ? story.text_ar : story.text_en) || story.text_ar || story.text_en || '';
  const map = mapsLinks(store, tr(store.address));

  const ig = story.instagram || store.instagram;
  const tt = story.tiktok || store.tiktok;
  const fb = story.facebook || store.facebook;

  const socials = [
    ig && {
      name: 'Instagram',
      url: ig.startsWith('http') ? ig : `https://instagram.com/${ig.replace(/^@/, '')}`,
      color: 'hover:text-[#E4405F]',
    },
    tt && {
      name: 'TikTok',
      url: tt.startsWith('http') ? tt : `https://tiktok.com/@${tt.replace(/^@/, '')}`,
      color: 'hover:text-[#000000] dark:hover:text-[#ffffff]',
    },
    fb && {
      name: 'Facebook',
      url: fb.startsWith('http') ? fb : `https://facebook.com/${fb}`,
      color: 'hover:text-[#1877F2]',
    },
  ].filter(Boolean);

  return (
    <section className="container mt-16 sm:mt-24">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="relative isolate overflow-hidden rounded-[32px] border border-line bg-gradient-to-br from-surface via-elevated to-surface/80 p-6 shadow-sm sm:p-10 lg:p-12"
      >
        <div className="pointer-events-none absolute -end-24 -top-24 -z-10 h-72 w-72 rounded-full bg-accent/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -start-24 -z-10 h-72 w-72 rounded-full bg-primary/5 blur-3xl" />

        <div className="grid items-center gap-8 lg:grid-cols-12 lg:gap-12">
          {story.image && (
            <div className="lg:col-span-5">
              <div className="relative mx-auto aspect-[4/3] max-w-md overflow-hidden rounded-2xl border border-line shadow-sm sm:aspect-[4/5] sm:max-w-none">
                <img
                  src={story.image}
                  alt={title}
                  className="h-full w-full object-cover object-center transition-transform duration-700 hover:scale-[1.02]"
                  loading="lazy"
                />
              </div>
            </div>
          )}

          <div className={story.image ? 'lg:col-span-7' : 'lg:col-span-12 max-w-3xl mx-auto text-center'}>
            <div className={story.image ? '' : 'flex flex-col items-center'}>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3.5 py-1.5 text-xs font-bold text-accent">
                <HeartHandshake className="h-4 w-4" />
                {lang === 'ar' ? 'قصتنا وهوية المتجر' : 'Our Story'}
              </span>

              <h2 className="mt-3 font-display text-2xl font-bold sm:text-3xl lg:text-4xl text-fg">
                {title}
              </h2>
            </div>

            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-muted sm:text-base sm:leading-loose">
              {text}
            </p>

            <div className={`mt-6 flex flex-wrap items-center gap-3 pt-4 border-t border-line/60 ${story.image ? '' : 'justify-center'}`}>
              {socials.map((s) => (
                <a
                  key={s.name}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface/60 px-3.5 py-2 text-xs font-semibold text-fg transition hover:border-fg/40 hover:bg-surface ${s.color}`}
                >
                  <span>{s.name}</span>
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </a>
              ))}

              {store.whatsapp && (
                <a
                  href={`https://wa.me/${String(store.whatsapp).replace(/\D/g, '').replace(/^0/, '20')}?text=${encodeURIComponent(
                    lang === 'ar' ? `مساء الخير، بتواصل معاكم من خلال موقع ${tr(store.name)}` : `Hello, contacting you from ${tr(store.name)}`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 transition hover:bg-emerald-500/20"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  <span>{lang === 'ar' ? 'تواصل عبر واتساب' : 'Chat on WhatsApp'}</span>
                </a>
              )}

              {store.address && (
                <a
                  href={map.open}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface/60 px-3.5 py-2 text-xs font-semibold text-muted transition hover:border-fg/40 hover:text-fg"
                >
                  <MapPin className="h-3.5 w-3.5 text-accent" />
                  <span>{lang === 'ar' ? 'موقع الفرع في بنها' : 'Branch Location'}</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
