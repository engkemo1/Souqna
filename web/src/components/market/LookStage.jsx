import { useState } from 'react';
import { Shirt, Sparkles, Store, Wallet } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';
import ModaAvatar from './ModaAvatar.jsx';
import LookSet from './LookSet.jsx';
import SmartImage from '../ui/SmartImage.jsx';

/** One complete look: photos of a person wearing it, the pieces, the total and add-everything — used on the home page and the look page. */
export default function LookStage({ entry, avatar = null, headingAs: Heading = 'h2' }) {
  const { lang, t, assistantName } = useI18n();
  const [shot, setShot] = useState(0);
  const title = entry?.title || entry?.occasion || t('lod.title');
  const total = entry?.total || 0;
  const gallery = entry?.images?.length ? entry.images : entry?.coverImage ? [entry.coverImage] : [];
  const cur = gallery[Math.min(shot, Math.max(0, gallery.length - 1))];
  const picked = (entry?.looks || []).map((l) => l.items?.[l.pick || 0]).filter(Boolean);
  const pieces = picked.length;
  const stores = new Set(picked.map((p) => p.store?.slug)).size;
  const tags = (Array.isArray(entry?.hashtags) && entry.hashtags.length ? entry.hashtags : [entry?.occasion, entry?.audience && t(`lod.audience.${entry.audience}`)]).filter(Boolean).slice(0, 3).map((x) => String(x).replace(/^#/, '').trim().replace(/\s+/g, '_'));
  return (
  <section className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
    <div className="relative order-1 min-h-[420px] overflow-hidden rounded-[28px] border border-line bg-secondary shadow-sm sm:min-h-[520px] lg:order-2 lg:min-h-[680px]">
      {cur ? <img key={cur} src={cur} alt={title} className="absolute inset-0 h-full w-full object-cover" /> : <Collage entry={entry} title={title} />}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/5" />
      {entry.badge && <span className="absolute start-4 top-4 rounded-full bg-elevated/95 px-3.5 py-1.5 text-[13px] font-bold text-brand shadow-sm"><Sparkles className="me-1 inline h-4 w-4" />{entry.badge}</span>}
      <div className="absolute inset-x-4 bottom-4 flex flex-wrap items-end justify-between gap-2">
        {gallery.length > 1 && <div className="absolute inset-x-0 bottom-16 flex justify-center gap-2 px-4">
          {gallery.map((g, i) => <button key={g} type="button" onClick={() => setShot(i)} aria-label={`${lang === 'ar' ? 'صورة' : 'Photo'} ${i + 1}`} aria-current={g === cur} className={`h-14 w-11 overflow-hidden rounded-lg border-2 bg-white/80 shadow transition sm:h-16 sm:w-12 ${g === cur ? 'border-white scale-105' : 'border-white/40 opacity-80 hover:opacity-100'}`}><img src={g} alt="" className="h-full w-full object-cover" loading="lazy" /></button>)}
        </div>}
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-[15px] font-extrabold leading-tight text-white drop-shadow sm:text-lg">{tags.map((x) => <span key={x}>#{x}</span>)}</p>
        {cur && <span className="rounded-full bg-black/40 px-2.5 py-1 text-[10.5px] font-semibold text-white/90 backdrop-blur">{lang === 'ar' ? 'صورة توضيحية للإطلالة' : 'Illustrative image'}</span>}
      </div>
    </div>
    <div className="order-2 min-w-0 rounded-[28px] border border-brand/15 bg-elevated p-4 shadow-sm sm:p-6 lg:order-1">
      <div className="flex items-start gap-3">
        <ModaAvatar src={avatar} size={52} />
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-[12px] font-bold text-brand"><Sparkles className="h-3.5 w-3.5" />{lang === 'ar' ? `${assistantName} نسّقت لك` : `Styled by ${assistantName}`}</span>
          <p className="mt-2 text-[13px] font-semibold text-muted">{entry.occasion}{entry.age ? ` · ${entry.age}` : ''}</p>
        </div>
      </div>
      <Heading className="mt-2 font-display text-3xl font-black leading-tight sm:text-4xl">{title}</Heading>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">{entry.description || entry.say || (lang === 'ar' ? 'اختيارات متناسقة من محلات بنها، جاهزة تكمّل إطلالتك.' : 'A coordinated outfit selected from Banha stores.')}</p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[[Shirt, pieces, lang === 'ar' ? 'قطع في اللوك' : 'pieces'], [Store, stores, lang === 'ar' ? 'محلات من بنها' : 'Banha stores'], [Wallet, formatMoney(total, lang), lang === 'ar' ? 'إجمالي اللوك' : 'total']].map(([Icon, v, l]) => (
          <div key={l} className="rounded-2xl border border-line bg-canvas/70 p-2.5 text-center"><Icon className="mx-auto h-5 w-5 text-brand" /><p className="mt-1 text-[13px] font-extrabold sm:text-sm">{v}</p><p className="text-[10.5px] font-semibold text-muted">{l}</p></div>
        ))}
      </div>
      <LookSet data={entry} name={title} showcase="cards" />
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
