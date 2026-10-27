import { Link, useParams, Navigate } from 'react-router-dom';
import { Phone, MessageCircle } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { LEGAL, LEGAL_UPDATED } from '../../lib/legal.js';
import { SALES_PHONE, SALES_WHATSAPP, CONTACT_EMAIL, CONTACT_ADDRESS } from '../../config/contact.js';
import SocialLinks from '../../components/market/SocialLinks.jsx';
import MarketHeader from '../../components/market/MarketHeader.jsx';

const TABS = [['privacy', 'legal.privacy'], ['terms', 'legal.terms']];

/** Privacy and terms — one page, two documents (/legal/privacy, /legal/terms). */
export default function Legal() {
  const { doc } = useParams();
  const { t, lang } = useI18n();
  if (!LEGAL[doc]) return <Navigate to="/legal/privacy" replace />;
  const d = LEGAL[doc][lang === 'en' ? 'en' : 'ar'];
  const date = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'ar-EG', { dateStyle: 'long' }).format(new Date(LEGAL_UPDATED));
  return (
    <div className="min-h-screen bg-bg">
      <MarketHeader />
      <main className="mx-auto max-w-2xl px-4 pb-20 pt-6">
        <nav className="flex flex-wrap gap-2" aria-label="legal">
          {TABS.map(([k, label]) => <Link key={k} to={`/legal/${k}`} className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${k === doc ? 'border-fg bg-fg text-canvas' : 'border-line-strong text-muted hover:text-fg'}`}>{t(label)}</Link>)}
        </nav>
        <h1 className="mt-6 font-display text-2xl font-bold sm:text-3xl">{d.title}</h1>
        <p className="mt-1 text-xs text-muted">{t('legal.updated', { d: date })}</p>
        <p className="mt-4 leading-relaxed">{d.intro}</p>
        {d.sections.map(([h, paras], i) => (
          <section key={h} className="mt-7">
            <h2 className="text-lg font-bold">{i + 1}. {h}</h2>
            <ul className="mt-2 space-y-2 ps-5 leading-relaxed [&>li]:list-disc">{paras.map((p) => <li key={p}>{p}</li>)}</ul>
          </section>
        ))}
        <section className="mt-10 rounded-2xl border border-line bg-elevated p-5">
          <h2 className="font-bold">{t('legal.contact')}</h2>
          <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold">
            <a className="inline-flex items-center gap-2 rounded-full border border-line-strong px-4 py-2" href={`https://wa.me/${SALES_WHATSAPP}`} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" />WhatsApp</a>
            <a className="inline-flex items-center gap-2 rounded-full border border-line-strong px-4 py-2" href={`tel:${SALES_PHONE}`} dir="ltr"><Phone className="h-4 w-4" />{SALES_PHONE}</a>
            <a className="inline-flex items-center gap-2 rounded-full border border-line-strong px-4 py-2" href={`mailto:${CONTACT_EMAIL}`} dir="ltr">{CONTACT_EMAIL}</a>
          </div>
          <p className="mt-3 text-sm text-muted">{lang === 'ar' ? CONTACT_ADDRESS.ar : CONTACT_ADDRESS.en}</p>
          <SocialLinks className="mt-3" />
        </section>
      </main>
    </div>
  );
}
