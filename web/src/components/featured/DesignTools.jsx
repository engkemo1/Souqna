import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Input } from '../ui/Field.jsx';
import { FeaturedCard, NARROW } from './FeaturedSlot.jsx';

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const firstHex = (v) => String(v || '').match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/i)?.[0] || '';
const lum = ([r, g, b]) => { const f = (c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const rgb = (hex) => { let h = hex.replace('#', ''); if (h.length === 3) h = [...h].map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
export const ratio = (a, b) => { const [hi, lo] = a > b ? [a, b] : [b, a]; return (hi + 0.05) / (lo + 0.05); };

/** Colour input with a native picker next to the text box (hex typed by hand still works; gradients only where allowed). */
export function ColorField({ value, onChange, placeholder, allowGradient }) {
  const hex = HEX.test(value) ? (value.length === 4 ? `#${[...value.slice(1)].map((c) => c + c).join('')}` : value) : (firstHex(value) || '#000000');
  return (
    <div className="flex items-center gap-2">
      <input type="color" aria-label="اختار لون" value={hex.length === 7 ? hex : '#000000'} onChange={(e) => onChange(e.target.value)} className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-transparent p-1" />
      <Input dir="ltr" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} {...(allowGradient ? {} : { maxLength: 7 })} />
    </div>
  );
}

/** Average brightness (0–1) of the lower half of an image, where the text sits. Null when the image cannot be read. */
function sampleImage(src) {
  return new Promise((resolve) => {
    try {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas'); c.width = 32; c.height = 16;
          const x = c.getContext('2d'); x.drawImage(img, 0, img.naturalHeight / 2, img.naturalWidth, img.naturalHeight / 2, 0, 0, 32, 16);
          const d = x.getImageData(0, 0, 32, 16).data; let t = 0;
          for (let i = 0; i < d.length; i += 4) t += lum([d[i], d[i + 1], d[i + 2]]);
          resolve(t / (d.length / 4));
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    } catch { resolve(null); }
  });
}

/** Contrast between the text colour and what is behind it (image darkened by the overlay, else the background colour). Null = unknown. */
export function useContrast({ image, bg, text, overlay }) {
  const [imgLum, setImgLum] = useState(null);
  useEffect(() => { setImgLum(null); if (image) sampleImage(image).then(setImgLum); }, [image]);
  const t = HEX.test(text || '') ? text : '#ffffff';
  const textL = lum(rgb(t));
  let behind = null;
  if (image) { if (imgLum != null) behind = imgLum * (1 - (overlay / 100) * 0.9); }
  else { const h = firstHex(bg) || '#0f172a'; behind = lum(rgb(h)); }
  if (behind == null) return null;
  return Math.round(ratio(textL, behind) * 10) / 10;
}

export function ContrastNote({ value }) {
  if (value == null) return null;
  if (value >= 4.5) return <p className="text-xs text-emerald-700">وضوح النص كويس ({value}:1).</p>;
  return (
    <p role="alert" className={`flex items-start gap-1.5 text-xs ${value < 3 ? 'text-red-700' : 'text-amber-700'}`}>
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />النص ممكن ما يبانش كويس ({value}:1). غيّر لون النص أو زوّد التعتيم أو غيّر الخلفية.
    </p>
  );
}

const Bar = ({ className = '', children }) => <div className={`rounded-lg bg-fg/[0.07] ${className}`}>{children}</div>;
const Label = ({ children }) => <p className="px-1 text-[10px] font-semibold text-muted">{children}</p>;

/** The card placed inside a simplified copy of the page it will appear on, on a desktop or phone-width frame. */
export function HomepageMock({ item, placement, lang = 'ar', device = 'desktop' }) {
  const phone = device === 'mobile';
  const store = placement.startsWith('store_');
  const search = placement === 'search_slot';
  const variant = { market_hero: 'hero', store_hero: 'hero', market_grid: 'grid', store_offers: 'strip', market_strip: 'strip', search_slot: 'slot' }[placement] || 'grid';
  const lw = item.layout?.width || 'wide';
  const card = <FeaturedCard preview item={{ ...item, id: 0, placement }} variant={variant} lang={lang} device={device} />;
  const framed = (node) => (lw === 'full' ? <div className="-mx-3">{node}</div> : lw === 'narrow' ? <div className={`max-w-[75%] ${NARROW[item.layout?.align] || NARROW.center}`}>{node}</div> : node);
  const slot = placement === 'store_ticker'
    ? <div className="rounded-lg border border-line bg-elevated px-3 py-2 text-xs"><span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand">{item.badge?.[lang] || item.badge?.ar || 'مُميّز'}</span> {item.title?.[lang] || item.title?.ar}</div>
    : variant === 'strip' ? <div className="flex gap-2 overflow-hidden">{card}<Bar className="h-44 w-40 shrink-0" /><Bar className="h-44 w-40 shrink-0" /></div>
    : variant === 'grid' ? framed(<div className={`grid gap-2 ${phone || lw !== 'wide' ? 'grid-cols-1' : 'grid-cols-2'}`}>{card}{lw === 'wide' && <Bar className="min-h-48" />}</div>) : variant === 'hero' ? framed(card) : card;
  return (
    <div className={`mx-auto overflow-hidden rounded-2xl border border-line-strong bg-canvas ${phone ? 'w-[375px] max-w-full' : 'w-full'}`} dir={lang === 'ar' ? 'rtl' : 'ltr'} aria-label="معاينة داخل الصفحة">
      <div className="space-y-3 p-3">
        <Bar className="flex h-9 items-center justify-between px-3 text-[10px] text-muted"><span>{store ? 'هيدر المحل' : 'هيدر السوق'}</span><span>🔍 ☰</span></Bar>
        {search ? (
          <>
            <Bar className="h-8 w-2/3" />
            <Label>↓ مكان الإعلان</Label>{slot}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Array.from({ length: phone ? 4 : 8 }, (_, i) => <Bar key={i} className="h-28" />)}</div>
          </>
        ) : store ? (
          <>
            <Bar className="h-28" />
            {placement === 'store_hero' && <><Label>↓ مكان الإعلان</Label>{slot}</>}
            {placement === 'store_ticker' && <><Label>↓ مكان الإعلان</Label>{slot}</>}
            <Bar className="h-8 w-1/2" />
            {placement === 'store_offers' && <><Label>↓ مكان الإعلان</Label>{slot}</>}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Array.from({ length: phone ? 4 : 8 }, (_, i) => <Bar key={i} className="h-28" />)}</div>
          </>
        ) : (
          <>
            {placement === 'market_top' && <><Label>↓ مكان الإعلان</Label>{slot}</>}
            <Bar className="h-32" />
            <div className="grid grid-cols-2 gap-2"><Bar className="h-14" /><Bar className="h-14" /></div>
            {placement === 'market_hero' && <><Label>↓ مكان الإعلان</Label>{slot}</>}
            {!['market_hero', 'market_top', 'market_bottom'].includes(placement) && <Bar className="h-10" />}
            {!['market_hero', 'market_top', 'market_bottom'].includes(placement) && <><Label>↓ مكان الإعلان</Label>{slot}</>}
            <Bar className="h-8 w-1/2" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Array.from({ length: phone ? 4 : 8 }, (_, i) => <Bar key={i} className="h-28" />)}</div>
            {placement === 'market_bottom' && <><Label>↓ مكان الإعلان</Label>{slot}</>}
          </>
        )}
      </div>
    </div>
  );
}
