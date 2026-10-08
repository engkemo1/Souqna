import { motion } from 'framer-motion';
import { MapPin, Phone, MessageCircle, Navigation, Clock } from 'lucide-react';
import { useStore } from '../../lib/store.jsx';
import { useI18n } from '../../lib/i18n.jsx';

/** Where to find the store: address, call, WhatsApp, and one tap to open the location in Google Maps. */
export function mapsLinks(store, address) {
  const a = String(address || '');
  const q = encodeURIComponent(/بنها|banha/i.test(a) ? a : `${a} بنها`.trim());
  return {
    open: store.mapUrl || `https://www.google.com/maps/search/?api=1&query=${q}`,
    embed: `https://www.google.com/maps?q=${q}&output=embed`,
  };
}
const DAYS_AR = ['الأحد', 'الإتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];
const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const toMin = (hm) => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + m; };
function fmtTime(hm, ar) {
  let [h, m] = String(hm).split(':').map(Number);
  const pm = h >= 12; h = h % 12 || 12;
  const mm = m ? `:${String(m).padStart(2, '0')}` : '';
  return ar ? `${h}${mm} ${pm ? 'م' : 'ص'}` : `${h}${mm} ${pm ? 'PM' : 'AM'}`;
}
/** Open right now? Uses Cairo time; handles closing after midnight. */
export function openNow(hours, at = new Date()) {
  if (!hours) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(at).map((p) => [p.type, p.value]));
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  const now = Number(parts.hour) * 60 + Number(parts.minute);
  const o = toMin(hours.open), c = toMin(hours.close);
  const overnight = c <= o;
  // after midnight, the shift belongs to the previous day
  const shiftDay = overnight && now < c ? (day + 6) % 7 : day;
  if (hours.dayOff !== null && hours.dayOff !== undefined && shiftDay === hours.dayOff) return false;
  return overnight ? now >= o || now < c : now >= o && now < c;
}
const waNumber = (n) => { const d = String(n || '').replace(/\D/g, ''); return d.startsWith('20') ? d : `20${d.replace(/^0/, '')}`; };

/** Decorative map: streets, the Nile and a pulsing pin. No third-party iframe, so it always renders. */
function MapArt() {
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <rect width="400" height="300" fill="currentColor" opacity=".06" />
      <g stroke="currentColor" strokeOpacity=".16" strokeWidth="1.2" fill="none">
        {[30, 80, 135, 190, 245].map((y) => <path key={y} d={`M-10 ${y} C 120 ${y - 18}, 260 ${y + 22}, 410 ${y - 6}`} />)}
        {[40, 110, 175, 250, 320, 370].map((x) => <path key={x} d={`M${x} -10 C ${x - 14} 90, ${x + 18} 200, ${x - 6} 310`} />)}
      </g>
      <path d="M-20 250 C 80 205, 150 285, 250 230 S 390 170, 430 190" fill="none" stroke="#5B9BD5" strokeOpacity=".35" strokeWidth="16" strokeLinecap="round" />
      <g transform="translate(200 140)">
        <circle r="34" className="fill-accent" opacity=".18"><animate attributeName="r" values="14;40;14" dur="2.6s" repeatCount="indefinite" /><animate attributeName="opacity" values=".35;0;.35" dur="2.6s" repeatCount="indefinite" /></circle>
        <path d="M0 -30c-11 0-20 8.6-20 19.3C-20 4 0 22 0 22S20 4 20-10.7C20-21.4 11-30 0-30Z" className="fill-accent" />
        <circle cy="-11" r="7" fill="#fff" />
      </g>
    </svg>
  );
}

export default function VisitCard() {
  const { store } = useStore();
  const { tr, lang } = useI18n();
  const ar = lang === 'ar';
  const address = tr(store.address);
  if (!address && !store.phone) return null;
  const maps = mapsLinks(store, address);
  const open = openNow(store.hours);
  const row = 'flex items-start gap-3.5 border-t border-on-footer/10 py-4 first:border-t-0 first:pt-0';

  return (
    <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="container mt-10 sm:mt-14">
      <div className="grid overflow-hidden rounded-[28px] bg-footer text-on-footer shadow-[0_30px_80px_-40px_rgba(0,0,0,.6)] md:grid-cols-[1.15fr_1fr]">
        <div className="p-6 sm:p-9">
          <p className="text-[12px] font-semibold uppercase tracking-[0.25em] text-accent">{ar ? 'زورنا' : 'Visit us'}</p>
          <h2 className="mt-2 font-display text-3xl font-medium sm:text-4xl">{ar ? `محل ${tr(store.name)}` : tr(store.name)}</h2>
          <div className="mt-7">
            {address && (
              <a href={maps.open} target="_blank" rel="noreferrer" className={`${row} group`}>
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <span><span className="block text-[13px] opacity-60">{ar ? 'العنوان' : 'Address'}</span><span className="text-[16px] group-hover:underline">{address}</span></span>
              </a>
            )}
            {store.hours && (
              <div className={row}>
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <span>
                  <span className="block text-[13px] opacity-60">{ar ? 'المواعيد' : 'Hours'}</span>
                  <span className="text-[16px]">{ar ? 'من' : ''} {fmtTime(store.hours.open, ar)} {ar ? 'لـ' : '–'} {fmtTime(store.hours.close, ar)}</span>
                  <span className={`ms-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${open ? 'bg-emerald-400/15 text-emerald-300' : 'bg-red-400/15 text-red-300'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${open ? 'bg-emerald-400' : 'bg-red-400'}`} />{open ? (ar ? 'مفتوح دلوقتي' : 'Open now') : (ar ? 'مقفول دلوقتي' : 'Closed now')}
                  </span>
                  {store.hours.dayOff !== null && <span className="mt-1 block text-[13px] opacity-60">{ar ? `إجازة يوم ${DAYS_AR[store.hours.dayOff]}` : `Closed on ${DAYS_EN[store.hours.dayOff]}`}</span>}
                </span>
              </div>
            )}
            {store.phone && (
              <a href={`tel:${store.phone}`} className={row}>
                <Phone className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <span><span className="block text-[13px] opacity-60">{ar ? 'التليفون' : 'Phone'}</span><span className="text-[18px] font-semibold tracking-wide" dir="ltr">{store.phone}</span></span>
              </a>
            )}
          </div>
          <div className="mt-6 flex flex-wrap gap-2.5">
            {address && (
              <a href={maps.open} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-[15px] font-bold text-on-accent transition hover:brightness-110">
                <Navigation className="h-4 w-4" />{ar ? 'افتح اللوكيشن' : 'Open location'}
              </a>
            )}
            {store.phone && (
              <a href={`tel:${store.phone}`} className="inline-flex items-center gap-2 rounded-full border border-on-footer/25 px-5 py-3 text-[15px] font-semibold transition hover:bg-on-footer/10">
                <Phone className="h-4 w-4" />{ar ? 'اتصل' : 'Call'}
              </a>
            )}
            {store.whatsapp && (
              <a href={`https://wa.me/${waNumber(store.whatsapp)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-on-footer/25 px-5 py-3 text-[15px] font-semibold transition hover:bg-on-footer/10">
                <MessageCircle className="h-4 w-4" />{ar ? 'واتساب' : 'WhatsApp'}
              </a>
            )}
          </div>
        </div>
        {address && (
          <a href={maps.open} target="_blank" rel="noreferrer" className="group relative block min-h-[240px] text-on-footer" aria-label={ar ? 'افتح اللوكيشن' : 'Open location'}>
            <MapArt />
            <span className="absolute inset-x-5 bottom-5 flex items-center justify-between gap-3 rounded-2xl bg-black/55 px-4 py-3 text-white backdrop-blur transition group-hover:bg-black/70">
              <span className="truncate text-[14px]">{address}</span>
              <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-bold text-accent"><Navigation className="h-4 w-4" />{ar ? 'الاتجاهات' : 'Directions'}</span>
            </span>
          </a>
        )}
      </div>
    </motion.section>
  );
}
