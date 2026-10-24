import { useEffect, useRef, useState } from 'react';
import { LocateFixed, Search } from 'lucide-react';

/** Free OpenStreetMap maps via Leaflet (loaded on demand, so it never weighs down the main bundle). */
export const BANHA = [30.466, 31.185];
let leafletPromise;
const loadLeaflet = () => leafletPromise || (leafletPromise = Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(([m]) => m.default || m));
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';
export const ZONE_COLORS = ['#E8590C', '#1C7ED6', '#2F9E44', '#9C36B5', '#D6336C', '#0C8599'];

const pinHtml = (color, text) => `<div style="position:relative;width:34px;height:42px"><div style="width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div><span style="position:absolute;inset:0 0 8px 0;display:flex;align-items:center;justify-content:center;color:#fff;font:700 13px system-ui">${text}</span></div>`;
const makePin = (L, color, text) => L.divIcon({ className: '', html: pinHtml(color, text), iconSize: [34, 42], iconAnchor: [17, 40], popupAnchor: [0, -36] });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function useMap(containerRef, init, deps) {
  const state = useRef({});
  useEffect(() => {
    let dead = false;
    loadLeaflet().then((L) => {
      if (dead || !containerRef.current) return;
      if (!state.current.map) {
        const map = L.map(containerRef.current, { scrollWheelZoom: false, attributionControl: true }).setView(BANHA, 13);
        L.tileLayer(TILES, { maxZoom: 19, attribution: ATTR, referrerPolicy: 'origin' }).addTo(map);
        state.current = { map, L, layer: L.layerGroup().addTo(map) };
        setTimeout(() => map.invalidateSize(), 200); // inside sheets/tabs the container may still be animating open
      }
      init(state.current);
    });
    return () => { dead = true; };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { state.current.map?.remove(); state.current = {}; }, []);
  return state;
}

/** Pick a shop's location without leaving the page: search a place name, tap the map, drag the pin, or use "my location". onChange(lat, lng). */
export function LocationPicker({ lat, lng, onChange, height = 260, label = 'موقعي الحالي' }) {
  const ref = useRef(null);
  const cb = useRef(onChange); cb.current = onChange;
  const [busy, setBusy] = useState(false);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const has = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && lat !== '' && lat !== null;
  useMap(ref, ({ map, L, layer }) => {
    layer.clearLayers();
    if (!map._pickerBound) {
      map._pickerBound = true;
      map.on('click', (e) => cb.current(+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)));
    }
    if (has) {
      const m = L.marker([Number(lat), Number(lng)], { icon: makePin(L, '#E8590C', '★'), draggable: true }).addTo(layer);
      m.on('dragend', () => { const p = m.getLatLng(); cb.current(+p.lat.toFixed(6), +p.lng.toFixed(6)); });
      map.setView([Number(lat), Number(lng)], Math.max(map.getZoom(), 16));
    }
  }, [lat, lng]);
  const locate = () => {
    if (!navigator.geolocation) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition((p) => { setBusy(false); cb.current(+p.coords.latitude.toFixed(6), +p.coords.longitude.toFixed(6)); }, () => setBusy(false), { enableHighAccuracy: true, timeout: 10000 });
  };
  const search = async (e) => {
    e?.preventDefault?.();
    const text = term.trim();
    if (text.length < 3) return;
    setSearching(true); setResults(null);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=eg&accept-language=ar&viewbox=30.9,30.7,31.5,30.3&q=${encodeURIComponent(text)}`;
      const rows = await (await fetch(url)).json();
      setResults(rows.map((r) => ({ name: r.display_name, lat: +r.lat, lng: +r.lon })));
    } catch { setResults([]); }
    setSearching(false);
  };
  const pick = (r) => { cb.current(+r.lat.toFixed(6), +r.lng.toFixed(6)); setResults(null); };
  return (
    <div>
      <form onSubmit={search} className="mb-2 flex gap-2">
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="ابحث باسم الشارع أو المنطقة (اختياري)" className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-elevated px-3 text-sm outline-none focus:border-fg" />
        <button type="submit" disabled={searching} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-fg px-3.5 text-sm font-semibold text-bg"><Search className="h-4 w-4" />{searching ? '…' : 'بحث'}</button>
      </form>
      {results && (
        <ul className="mb-2 max-h-40 divide-y divide-line overflow-auto rounded-xl border border-line bg-elevated text-sm">
          {results.length === 0 ? <li className="px-3 py-2 text-muted">مفيش نتايج. جرّب كلمة تانية أو اضغط على الخريطة.</li>
            : results.map((r, i) => <li key={i}><button type="button" onClick={() => pick(r)} className="block w-full px-3 py-2 text-start hover:bg-fg/[0.04]">{r.name}</button></li>)}
        </ul>
      )}
      <div className="relative overflow-hidden rounded-2xl border border-line">
        <div ref={ref} style={{ height }} className="w-full bg-fg/[0.04]" />
        {!has && <div className="pointer-events-none absolute inset-x-0 top-3 z-[500] flex justify-center"><span className="rounded-full bg-black/75 px-3.5 py-1.5 text-xs font-semibold text-white">اضغط على الخريطة عند مكان المحل</span></div>}
        <button type="button" onClick={locate} disabled={busy} className="absolute bottom-3 start-3 z-[500] inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-semibold text-black shadow-md">
          <LocateFixed className="h-4 w-4" />{busy ? '…' : label}
        </button>
      </div>
      <p className={`mt-1.5 text-xs ${has ? 'font-semibold text-emerald-700' : 'text-muted'}`}>{has ? '✓ تم تحديد موقع المحل — تقدر تسحب الدبوس لو عاوز تظبطه' : 'لسه ما حددتش الموقع. زوّد التكبير للشارع واضغط على مكان المحل.'}</p>
    </div>
  );
}

const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

/** Checkout map: one coloured pin per pickup zone (every shop in it), dashed route through the zones to the customer. */
export function DeliveryMap({ zones, dest, height = 280, destLabel = 'عنوانك' }) {
  const ref = useRef(null);
  const key = JSON.stringify([zones.map((z) => [z.key, z.stores.map((s) => [s.slug, s.lat, s.lng])]), dest]);
  useMap(ref, ({ map, L, layer }) => {
    layer.clearLayers();
    const pts = [];
    const centers = [];
    zones.forEach((z, i) => {
      const color = ZONE_COLORS[i % ZONE_COLORS.length];
      const placed = z.stores.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
      placed.forEach((s) => {
        L.marker([s.lat, s.lng], { icon: makePin(L, color, String(i + 1)) }).addTo(layer).bindPopup(`<b>${esc(s.name_ar)}</b><br>${esc(z.name)}`);
        pts.push([s.lat, s.lng]);
      });
      if (placed.length) centers.push([placed.reduce((a, s) => a + s.lat, 0) / placed.length, placed.reduce((a, s) => a + s.lng, 0) / placed.length]);
    });
    // visit the nearest zone first, finishing at the customer
    const route = [];
    const left = centers.slice();
    let cur = dest ? [dest.lat, dest.lng] : left[0];
    if (!dest && left.length) left.shift();
    if (!dest && cur) route.push(cur);
    while (left.length) {
      let bi = 0; for (let k = 1; k < left.length; k++) if (dist2(left[k], cur) < dist2(left[bi], cur)) bi = k;
      cur = left.splice(bi, 1)[0]; route.push(cur);
    }
    const ordered = dest ? [...route.reverse(), [dest.lat, dest.lng]] : route;
    if (ordered.length > 1) L.polyline(ordered, { color: '#111', weight: 3, opacity: 0.7, dashArray: '8 8' }).addTo(layer);
    if (dest) {
      L.marker([dest.lat, dest.lng], { icon: makePin(L, '#111111', '⌂') }).addTo(layer).bindPopup(esc(destLabel));
      pts.push([dest.lat, dest.lng]);
    }
    if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
    else if (pts.length === 1) map.setView(pts[0], 15);
    setTimeout(() => map.invalidateSize(), 50);
  }, [key]);
  return <div className="overflow-hidden rounded-2xl border border-line"><div ref={ref} style={{ height }} className="w-full bg-fg/[0.04]" /></div>;
}
