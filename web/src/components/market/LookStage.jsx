import { useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import ModaAvatar from './ModaAvatar.jsx';
import LookSet from './LookSet.jsx';
import SmartImage from '../ui/SmartImage.jsx';

/** One complete look: photos of a person wearing it, the pieces, the total and add-everything — used on the home page and the look page. */
export default function LookStage({ entry, avatar = null, headingAs: Heading = 'h2' }) {
  const { lang, t, assistantName } = useI18n();
  const [shot, setShot] = useState(0);
  const title = entry?.title || entry?.occasion || t('lod.title');
  const gallery = entry?.images?.length ? entry.images : entry?.coverImage ? [entry.coverImage] : [];
  const cur = gallery[Math.min(shot, Math.max(0, gallery.length - 1))];
  const tags = (Array.isArray(entry?.hashtags) && entry.hashtags.length ? entry.hashtags : [entry?.occasion, entry?.audience && t(`lod.audience.${entry.audience}`)]).filter(Boolean).slice(0, 3).map((x) => String(x).replace(/^#/, '').trim().replace(/\s+/g, '_'));
  const changeShot = (direction) => setShot((current) => (current + direction + gallery.length) % gallery.length);
  return (
    <section className="grid gap-3 sm:gap-5 lg:grid-cols-[minmax(0,1.12fr)_minmax(370px,.88fr)] lg:items-stretch">
      <div className="relative order-1 min-h-[440px] overflow-hidden rounded-[30px] border border-line bg-[#eef0ee] shadow-[0_18px_55px_-32px_rgba(9,25,20,.55)] sm:min-h-[560px] lg:order-2 lg:min-h-[660px]">
        {cur ? <img key={cur} src={cur} alt={title} className="absolute inset-0 h-full w-full object-cover object-top" /> : <Collage entry={entry} title={title} />}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-black/10" />
        <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-3 sm:inset-x-5 sm:top-5">
          <div className="max-w-[75%] rounded-full bg-elevated/95 px-3.5 py-2 text-[12px] font-extrabold text-fg shadow-sm backdrop-blur sm:text-[13px]">
            <Sparkles className="me-1.5 inline h-3.5 w-3.5 text-brand" />{entry.badge || 'Try the Look'}
          </div>
        </div>
        {gallery.length > 1 && <>
          <button type="button" onClick={() => changeShot(-1)} aria-label={lang === 'ar' ? 'الصورة السابقة' : 'Previous photo'} className="absolute start-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/30 text-white backdrop-blur transition hover:bg-black/50 sm:start-5"><ChevronRight className="h-5 w-5 rtl:rotate-0 ltr:rotate-180" /></button>
          <button type="button" onClick={() => changeShot(1)} aria-label={lang === 'ar' ? 'الصورة التالية' : 'Next photo'} className="absolute end-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/30 text-white backdrop-blur transition hover:bg-black/50 sm:end-5"><ChevronLeft className="h-5 w-5 rtl:rotate-0 ltr:rotate-180" /></button>
        </>}
        <div className="absolute inset-x-4 bottom-4 sm:inset-x-5 sm:bottom-5">
          {gallery.length > 1 && <div className="mb-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {gallery.map((image, index) => <button key={image} type="button" onClick={() => setShot(index)} aria-label={`${lang === 'ar' ? 'صورة' : 'Photo'} ${index + 1}`} aria-current={image === cur} className={`h-12 w-9 shrink-0 overflow-hidden rounded-lg border-2 bg-white/80 shadow-sm transition sm:h-14 sm:w-11 ${image === cur ? 'scale-105 border-white' : 'border-white/40 opacity-75 hover:opacity-100'}`}><img src={image} alt="" className="h-full w-full object-cover object-top" loading="lazy" /></button>)}
          </div>}
          <div className="flex items-end justify-between gap-3">
            <p className="flex flex-wrap gap-x-2.5 gap-y-1 text-[13px] font-extrabold leading-tight text-white drop-shadow sm:text-base">{tags.map((tag) => <span key={tag}>#{tag}</span>)}</p>
            {gallery.length > 1 && <span className="shrink-0 rounded-full bg-black/30 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur">{shot + 1}/{gallery.length}</span>}
          </div>
        </div>
      </div>
      <div className="order-2 min-w-0 rounded-[30px] border border-line bg-elevated p-4 shadow-[0_18px_55px_-36px_rgba(9,25,20,.45)] sm:p-6 lg:order-1 lg:p-7">
        <div className="flex items-center gap-3">
          <ModaAvatar src={avatar} size={48} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-extrabold uppercase tracking-[.12em] text-brand">{lang === 'ar' ? 'تنسيق اليوم' : 'Styled for today'}</p>
            <p className="mt-0.5 truncate text-[13px] font-semibold text-muted">{lang === 'ar' ? `${assistantName} اختارت اللوك ده` : `Curated by ${assistantName}`}</p>
          </div>
        </div>
        <p className="mt-5 text-[13px] font-bold text-brand">{entry.occasion}{entry.age ? ` · ${entry.age}` : ''}</p>
        <Heading className="mt-1 font-display text-[30px] font-black leading-[1.12] tracking-tight sm:text-[38px]">{title}</Heading>
        <p className="mt-3 text-[14px] leading-6 text-muted sm:text-[15px]">{entry.description || entry.say || (lang === 'ar' ? 'اختيارات متناسقة من محلات بنها، جاهزة تكمّل إطلالتك.' : 'A coordinated outfit selected from Banha stores.')}</p>
        <LookSet data={entry} name={title} showcase="studio" />
      </div>
    </section>
  );
}

function Collage({ entry, title }) {
  const imgs = (entry.looks || []).map((l) => l.items?.[l.pick || 0]).filter((p) => p?.image).slice(0, 4);
  if (!imgs.length) return <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-brand/20 via-secondary to-elevated text-7xl font-black text-brand/60">{title.slice(0, 2)}</div>;
  const cols = imgs.length === 1 ? 'grid-cols-1' : 'grid-cols-2';
  return (
    <div className={`absolute inset-0 grid gap-1.5 bg-gradient-to-br from-secondary to-brand/10 p-1.5 ${cols}`} style={imgs.length > 2 ? { gridTemplateRows: 'repeat(2, minmax(0, 1fr))' } : undefined}>
      {imgs.map((p, i) => <SmartImage key={p.id} media={p.image} alt="" className={`h-full w-full overflow-hidden rounded-2xl bg-white ${imgs.length === 3 && i === 0 ? 'row-span-2' : ''}`} priority={i === 0} sizes="(min-width:1024px) 22vw, 50vw" />)}
    </div>
  );
}
