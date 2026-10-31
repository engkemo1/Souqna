import { useEffect, useRef, useState, useCallback } from 'react';
import { LocateFixed, Search, MapPin, Loader2, X, Sparkles, Navigation } from 'lucide-react';
import {
  searchEgyptianPlaces,
  smartReverseGeocode,
  findNearestPlace,
  QUICK_MAP_LANDMARKS,
  calcDistanceKm,
} from '../../lib/egyptPlaces.js';

/** Free OpenStreetMap maps via Leaflet (loaded on demand, so it never weighs down the main bundle). */
export const BANHA = [30.466, 31.185];
let leafletPromise;
const loadLeaflet = () => leafletPromise || (leafletPromise = Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(([m]) => m.default || m));
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';
export const ZONE_COLORS = ['#C2410C', '#1864AB', '#237A35', '#862E9C', '#B02A5B', '#0B7285'];

const pinHtml = (color, text) => `<div style="position:relative;width:34px;height:42px"><div style="width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div><span style="position:absolute;inset:0 0 8px 0;display:flex;align-items:center;justify-content:center;color:#fff;font:700 13px system-ui">${text}</span></div>`;
const makePin = (L, color, text) => L.divIcon({ className: '', html: pinHtml(color, text), iconSize: [34, 42], iconAnchor: [17, 40], popupAnchor: [0, -36] });

const landmarkDotHtml = (name) => `<div style="display:inline-flex;align-items:center;gap:3px;background:rgba(255,255,255,0.92);border:1px solid #e2e8f0;padding:2px 6px;border-radius:999px;box-shadow:0 1px 4px rgba(0,0,0,0.15);font:600 11px system-ui;white-space:nowrap;cursor:pointer;color:#0f172a"><span style="width:6px;height:6px;border-radius:50%;background:#e8590c"></span>${name}</div>`;
const makeLandmarkDot = (L, name) => L.divIcon({ className: '', html: landmarkDotHtml(name), iconSize: [0, 0], iconAnchor: [0, 10] });

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let abortCtrl = null;

/* ── Debounce hook ── */
function useDebounce(value, ms) {
  const [deb, setDeb] = useState(value);
  useEffect(() => { const t = setTimeout(() => setDeb(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return deb;
}

function useMap(containerRef, init, deps) {
  const state = useRef({});
  useEffect(() => {
    let dead = false;
    loadLeaflet().then((L) => {
      if (dead || !containerRef.current) return;
      if (!state.current.map) {
        const map = L.map(containerRef.current, { scrollWheelZoom: false, attributionControl: true }).setView(BANHA, 13);
        L.tileLayer(TILES, { maxZoom: 19, attribution: ATTR, referrerPolicy: 'origin' }).addTo(map);
        state.current = { map, L, layer: L.layerGroup().addTo(map), landmarksLayer: L.layerGroup().addTo(map) };
        setTimeout(() => map.invalidateSize(), 200);
      }
      init(state.current);
    });
    return () => { dead = true; };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { state.current.map?.remove(); state.current = {}; }, []);
  return state;
}

/** Pick a shop's location without leaving the page: search a place name, tap the map, drag the pin, or use "my location". onChange(lat, lng, details). */
export function LocationPicker({ lat, lng, onChange, height = 260, label = 'موقعي الحالي' }) {
  const ref = useRef(null);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const cb = useRef(onChange); cb.current = onChange;
  const [busy, setBusy] = useState(false);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [focused, setFocused] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [error, setError] = useState(null);
  const [detectedInfo, setDetectedInfo] = useState(null);
  const mapInstanceRef = useRef(null);
  const has = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && lat !== '' && lat !== null;

  /* ── Autocomplete search ── */
  const debTerm = useDebounce(term, 300);
  useEffect(() => {
    const text = debTerm.trim();
    if (text.length < 2) { setResults(null); setError(null); return; }
    abortCtrl?.abort();
    abortCtrl = new AbortController();
    let cancelled = false;
    setSearching(true); setError(null);
    searchEgyptianPlaces(text, abortCtrl.signal)
      .then((rows) => { if (!cancelled) { setResults(rows); setActiveIdx(-1); } })
      .catch((e) => { if (!cancelled && e.name !== 'AbortError') { setResults([]); setError('تعذر البحث — تأكد من الاتصال بالإنترنت'); } })
      .finally(() => { if (!cancelled) setSearching(false); });
    return () => { cancelled = true; };
  }, [debTerm]);

  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setFocused(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handlePickCoord = useCallback(async (la, ln, overridePlace) => {
    if (overridePlace) {
      cb.current(la, ln, overridePlace);
      setDetectedInfo(overridePlace);
      return;
    }
    try {
      const rev = await smartReverseGeocode(la, ln);
      cb.current(la, ln, rev);
      setDetectedInfo(rev);
      if (rev?.primaryName) setTerm(rev.primaryName);
    } catch {
      cb.current(la, ln, null);
    }
  }, []);

  /* ── Map ── */
  useMap(ref, ({ map, L, layer, landmarksLayer }) => {
    mapInstanceRef.current = map;
    layer.clearLayers();
    if (landmarksLayer) {
      landmarksLayer.clearLayers();
      // Plot small clickable landmark dots on the map
      QUICK_MAP_LANDMARKS.forEach((lm) => {
        const marker = L.marker([lm.lat, lm.lng], { icon: makeLandmarkDot(L, lm.name) }).addTo(landmarksLayer);
        marker.on('click', () => {
          map.flyTo([lm.lat, lm.lng], 16, { duration: 0.8 });
          handlePickCoord(lm.lat, lm.lng, lm);
        });
      });
    }

    if (!map._pickerBound) {
      map._pickerBound = true;
      map.on('click', (e) => {
        handlePickCoord(+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6));
      });
    }

    if (has) {
      const m = L.marker([Number(lat), Number(lng)], { icon: makePin(L, '#E8590C', '★'), draggable: true }).addTo(layer);
      m.on('dragend', () => {
        const p = m.getLatLng();
        handlePickCoord(+p.lat.toFixed(6), +p.lng.toFixed(6));
      });
      map.setView([Number(lat), Number(lng)], Math.max(map.getZoom(), 16));
    }
  }, [lat, lng, has, handlePickCoord]);

  const locate = () => {
    if (!navigator.geolocation) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setBusy(false);
        const la = +p.coords.latitude.toFixed(6);
        const ln = +p.coords.longitude.toFixed(6);
        handlePickCoord(la, ln);
        mapInstanceRef.current?.flyTo([la, ln], 16);
      },
      () => setBusy(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const pick = useCallback((r) => {
    handlePickCoord(+r.lat.toFixed(6), +r.lng.toFixed(6), r);
    setTerm(r.shortName || r.name.split(',')[0]);
    setResults(null);
    setFocused(false);
    mapInstanceRef.current?.flyTo([r.lat, r.lng], 16, { duration: 0.8 });
  }, [handlePickCoord]);

  const clear = () => { setTerm(''); setResults(null); setError(null); inputRef.current?.focus(); };

  const onKey = (e) => {
    if (!results?.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); pick(results[activeIdx]); }
    else if (e.key === 'Escape') { setFocused(false); }
  };

  const showDropdown = focused && (results !== null || searching || error);

  return (
    <div>
      {/* ── Search bar ── */}
      <div ref={wrapRef} className="relative mb-2">
        <div className="flex items-center gap-0 rounded-xl border border-line bg-elevated transition-colors focus-within:border-fg focus-within:ring-1 focus-within:ring-fg/20">
          <span className="pointer-events-none ps-3 text-muted"><Search className="h-4 w-4" /></span>
          <input
            ref={inputRef}
            value={term}
            onChange={(e) => { setTerm(e.target.value); setFocused(true); }}
            onFocus={() => setFocused(true)}
            onKeyDown={onKey}
            placeholder="ابحث عن شارع، كلية، قرية أو معلم (مثلاً: شارع كلية التجارة، مسجد الخضر، بطا)…"
            className="h-10 min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none placeholder:text-muted/60"
            autoComplete="off"
            role="combobox"
            aria-expanded={!!showDropdown}
          />
          {searching && <Loader2 className="me-1.5 h-4 w-4 animate-spin text-muted" />}
          {term && !searching && <button type="button" onClick={clear} className="me-1.5 rounded-full p-1 text-muted hover:bg-fg/[0.06] hover:text-fg"><X className="h-3.5 w-3.5" /></button>}
        </div>

        {/* ── Dropdown results ── */}
        {showDropdown && (
          <ul className="absolute inset-x-0 top-full z-[600] mt-1 max-h-56 overflow-auto rounded-xl border border-line bg-elevated shadow-xl" role="listbox">
            {error && <li className="px-3.5 py-2.5 text-xs text-red-500">{error}</li>}
            {!error && searching && <li className="flex items-center gap-2 px-3.5 py-3 text-xs text-muted"><Loader2 className="h-4 w-4 animate-spin" />جاري البحث…</li>}
            {!error && !searching && results?.length === 0 && (
              <li className="px-3.5 py-3 text-xs text-muted">مفيش نتائج مباشرة — اضغط على الخريطة لتثبيت مكان المحل بدقة</li>
            )}
            {!error && results?.map((r, i) => {
              const short = r.shortName || r.name.split(',')[0].trim();
              const details = r.name.split(',').slice(1, 3).join('، ').trim();
              return (
                <li key={i} role="option" aria-selected={i === activeIdx}>
                  <button
                    type="button"
                    onClick={() => pick(r)}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={`flex w-full items-start gap-2.5 px-3.5 py-2.5 text-start text-sm transition-colors border-b border-line/40 last:border-0 ${i === activeIdx ? 'bg-fg/[0.06]' : 'hover:bg-fg/[0.04]'}`}
                  >
                    <MapPin className={`mt-0.5 h-4 w-4 shrink-0 ${r.isLocal ? 'text-brand' : 'text-orange-500'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{short}</span>
                      {details && <span className="block text-xs text-muted truncate">{details}</span>}
                    </span>
                    <span className="shrink-0 flex items-center gap-1 text-xs">
                      {r.type && <span className="rounded-md bg-fg/[0.06] px-1.5 py-0.5 text-[11px] text-muted">{r.type}</span>}
                      {r.distanceKm != null && <span className="text-[11px] text-muted font-mono" dir="ltr">{r.distanceKm} km</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Quick landmark pills ── */}
      <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
        <span className="flex items-center gap-1 text-muted text-[11px] font-semibold shrink-0">
          <Sparkles className="h-3 w-3 text-brand" /> أماكن سريعة:
        </span>
        {QUICK_MAP_LANDMARKS.slice(0, 8).map((lm) => (
          <button
            key={lm.name}
            type="button"
            onClick={() => pick(lm)}
            className="shrink-0 rounded-lg border border-line bg-elevated px-2 py-0.5 text-[11px] font-medium text-foreground hover:border-brand hover:text-brand transition-colors"
          >
            {lm.name}
          </button>
        ))}
      </div>

      {/* ── Map ── */}
      <div className="relative overflow-hidden rounded-2xl border border-line">
        <div ref={ref} style={{ height }} className="w-full bg-fg/[0.04]" />
        {!has && <div className="pointer-events-none absolute inset-x-0 top-3 z-[500] flex justify-center"><span className="rounded-full bg-black/75 px-3.5 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">اضغط على الخريطة أو على أي معلم</span></div>}
        <button type="button" onClick={locate} disabled={busy} className="absolute bottom-3 start-3 z-[500] inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black shadow-md transition-transform hover:scale-105 active:scale-95">
          <LocateFixed className="h-4 w-4 text-brand" />{busy ? '…' : label}
        </button>
      </div>
      <p className={`mt-1.5 text-xs ${has ? 'font-semibold text-emerald-700' : 'text-muted'}`}>
        {has
          ? `✓ تم تحديد الموقع ${detectedInfo?.primaryName ? `(${detectedInfo.primaryName})` : ''} — تقدر تسحب الدبوس لتعديله بدقة`
          : 'لسه ما حددتش الموقع. ابحث أو اضغط على أي نقطة على الخريطة.'}
      </p>
    </div>
  );
}

/** Reverse geocoding helper - high-accuracy local snapping + Nominatim */
export async function reverseGeocode(lat, lng) {
  return smartReverseGeocode(lat, lng);
}

/**
 * Clean interactive map for customer checkout and admin delivery rates:
 * - In-map search bar directly on the map.
 * - Quick clickable landmark chips.
 * - Interactive landmark dots on the map canvas.
 * - Smart reverse geocoding on tap / drag.
 * - Live distance & area display.
 */
export function CheckoutLocationPicker({
  lat,
  lng,
  onChange,
  height = 240,
  label = 'موقعي الحالي',
  helpText = 'اضغط على مكانك على الخريطة أو اسحب الدبوس لتحديد العنوان بدقة',
  showSearch = true,
  showQuickPills = true,
}) {
  const ref = useRef(null);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const cb = useRef(onChange);
  cb.current = onChange;

  const [busy, setBusy] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [focused, setFocused] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [detected, setDetected] = useState(null);
  const mapInstanceRef = useRef(null);

  const has = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && lat !== '' && lat !== null;

  /* ── In-map search ── */
  const debTerm = useDebounce(searchTerm, 300);
  useEffect(() => {
    const text = debTerm.trim();
    if (text.length < 2) { setSearchResults(null); return; }
    abortCtrl?.abort();
    abortCtrl = new AbortController();
    let cancelled = false;
    setSearching(true);
    searchEgyptianPlaces(text, abortCtrl.signal)
      .then((rows) => { if (!cancelled) { setSearchResults(rows); setActiveIdx(-1); } })
      .catch((e) => { if (!cancelled && e.name !== 'AbortError') setSearchResults([]); })
      .finally(() => { if (!cancelled) setSearching(false); });
    return () => { cancelled = true; };
  }, [debTerm]);

  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setFocused(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelectCoord = useCallback(async (la, ln, overridePlace) => {
    if (overridePlace) {
      setDetected(overridePlace);
      cb.current(la, ln, overridePlace);
      return;
    }
    try {
      const rev = await smartReverseGeocode(la, ln);
      setDetected(rev);
      cb.current(la, ln, rev);
    } catch {
      cb.current(la, ln, null);
    }
  }, []);

  useMap(ref, ({ map, L, layer, landmarksLayer }) => {
    mapInstanceRef.current = map;
    layer.clearLayers();

    if (landmarksLayer) {
      landmarksLayer.clearLayers();
      // Plot interactive landmark tags directly on the map
      QUICK_MAP_LANDMARKS.forEach((lm) => {
        const marker = L.marker([lm.lat, lm.lng], { icon: makeLandmarkDot(L, lm.name) }).addTo(landmarksLayer);
        marker.on('click', () => {
          map.flyTo([lm.lat, lm.lng], 16, { duration: 0.8 });
          handleSelectCoord(lm.lat, lm.lng, lm);
        });
      });
    }

    if (!map._checkoutBound) {
      map._checkoutBound = true;
      map.on('click', (e) => {
        handleSelectCoord(+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6));
      });
    }

    const center = has ? [Number(lat), Number(lng)] : BANHA;
    const marker = L.marker(center, {
      icon: makePin(L, '#16A34A', '📍'),
      draggable: true,
      opacity: has ? 1 : 0.6,
    }).addTo(layer);

    marker.bindPopup(has ? '<b>موقعك المحدد</b><br>اسحب الدبوس لتغيير المكان بدقة' : 'اضغط على الخريطة لتثبيت الدبوس');
    marker.on('dragend', () => {
      const p = marker.getLatLng();
      handleSelectCoord(+p.lat.toFixed(6), +p.lng.toFixed(6));
    });

    if (has) {
      map.setView(center, Math.max(map.getZoom(), 15), { animate: true });
    }
  }, [lat, lng, has, handleSelectCoord]);

  const locate = () => {
    if (!navigator.geolocation) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setBusy(false);
        const la = +p.coords.latitude.toFixed(6);
        const ln = +p.coords.longitude.toFixed(6);
        handleSelectCoord(la, ln);
        mapInstanceRef.current?.flyTo([la, ln], 16);
      },
      () => setBusy(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const pickResult = (r) => {
    handleSelectCoord(+r.lat.toFixed(6), +r.lng.toFixed(6), r);
    setSearchTerm(r.shortName || r.name.split(',')[0]);
    setSearchResults(null);
    setFocused(false);
    mapInstanceRef.current?.flyTo([r.lat, r.lng], 16, { duration: 0.8 });
  };

  const showDropdown = focused && (searchResults !== null || searching);

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-elevated">
      {/* ── Optional In-Map Search Bar ── */}
      {showSearch && (
        <div ref={wrapRef} className="relative p-2.5 pb-1 border-b border-line bg-elevated">
          <div className="flex items-center gap-0 rounded-xl border border-line bg-canvas focus-within:border-brand focus-within:ring-1 focus-within:ring-brand/20">
            <span className="pointer-events-none ps-3 text-muted"><Search className="h-3.5 w-3.5" /></span>
            <input
              ref={inputRef}
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setFocused(true); }}
              onFocus={() => setFocused(true)}
              placeholder="ابحث على الخريطة (مثلاً: شارع كلية التجارة، بطا، مسجد الخضر، شبرا الخيمة)…"
              className="h-8 min-w-0 flex-1 bg-transparent px-2.5 text-xs outline-none placeholder:text-muted/60"
              autoComplete="off"
            />
            {searching && <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin text-muted" />}
            {searchTerm && !searching && (
              <button
                type="button"
                onClick={() => { setSearchTerm(''); setSearchResults(null); }}
                className="me-1.5 rounded-full p-0.5 text-muted hover:bg-fg/[0.06] hover:text-fg"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {showDropdown && (
            <ul className="absolute inset-x-2.5 top-full z-[600] mt-1 max-h-52 overflow-auto rounded-xl border border-line bg-elevated shadow-xl" role="listbox">
              {searching && <li className="flex items-center gap-2 px-3 py-2 text-xs text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" />جاري البحث…</li>}
              {!searching && searchResults?.length === 0 && (
                <li className="px-3 py-2.5 text-xs text-muted">مفيش نتائج — تقدر تضغط مباشرة على أي نقطة على الخريطة</li>
              )}
              {searchResults?.map((r, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => pickResult(r)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-xs border-b border-line/40 last:border-0 hover:bg-fg/[0.04] transition-colors"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <MapPin className={`h-3.5 w-3.5 shrink-0 ${r.isLocal ? 'text-brand' : 'text-orange-500'}`} />
                      <span className="font-medium text-foreground">{r.shortName || r.name}</span>
                    </span>
                    {r.distanceKm != null && <span className="text-[10px] text-muted font-mono shrink-0" dir="ltr">{r.distanceKm} km</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* ── Quick preset pills under search ── */}
          {showQuickPills && (
            <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
              <span className="flex items-center gap-1 text-muted text-[10px] font-semibold shrink-0">
                <Sparkles className="h-3 w-3 text-brand" /> أماكن شائعة:
              </span>
              {QUICK_MAP_LANDMARKS.map((lm) => (
                <button
                  key={lm.name}
                  type="button"
                  onClick={() => pickResult(lm)}
                  className="shrink-0 rounded-md border border-line bg-fg/[0.02] px-2 py-0.5 text-[10px] font-medium text-foreground hover:border-brand hover:text-brand transition-colors"
                >
                  {lm.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Map Canvas ── */}
      <div className="relative">
        <div ref={ref} style={{ height }} className="w-full bg-fg/[0.04]" />
        <button
          type="button"
          onClick={locate}
          disabled={busy}
          className="absolute bottom-3 start-3 z-[500] inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-neutral-900 shadow-md transition-transform hover:scale-105 active:scale-95"
        >
          <LocateFixed className="h-4 w-4 text-brand" />
          {busy ? 'جاري التحديد…' : label}
        </button>
      </div>

      {/* ── Status Bar Below Map ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 text-xs border-t border-line">
        <span className={has ? 'font-medium text-emerald-700' : 'text-muted'}>
          {has
            ? `✓ موقع محدد: ${detected?.primaryName || detected?.name || 'تم التثبيت على الخريطة'}`
            : helpText}
        </span>
        {has && (
          <span className="flex items-center gap-2 text-[11px] text-muted font-mono" dir="ltr">
            {detected?.distanceFromBanhaKm != null && (
              <span className="font-sans text-[11px] text-brand font-semibold">
                ({detected.distanceFromBanhaKm} كم من بنها)
              </span>
            )}
            <span>{Number(lat).toFixed(4)}, {Number(lng).toFixed(4)}</span>
          </span>
        )}
      </div>
    </div>
  );
}

/** Checkout map: one coloured pin per pickup zone (every shop in it), dashed route through the zones to the customer. */
export function DeliveryMap({ zones, dest, height = 280, destLabel = 'عنوانك' }) {
  const ref = useRef(null);
  const key = JSON.stringify([zones?.map((z) => [z.key, z.stores?.map((s) => [s.slug, s.lat, s.lng])]), dest]);
  useMap(ref, ({ map, L, layer }) => {
    layer.clearLayers();
    if (!zones?.length && !dest) return;
    const pts = [];
    const centers = [];
    (zones || []).forEach((z, i) => {
      const color = ZONE_COLORS[i % ZONE_COLORS.length];
      const placed = (z.stores || []).filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
      if (placed.length) {
        placed.forEach((s) => {
          L.marker([s.lat, s.lng], { icon: makePin(L, color, String(i + 1)) }).addTo(layer).bindPopup(`<b>${esc(s.name_ar)}</b><br>${esc(z.name)}`);
          pts.push([s.lat, s.lng]);
        });
        centers.push([placed.reduce((a, s) => a + s.lat, 0) / placed.length, placed.reduce((a, s) => a + s.lng, 0) / placed.length]);
      } else {
        // Fallback store point in Banha so map always renders even without store lat/lng
        const fallbackLat = BANHA[0] + (i * 0.007);
        const fallbackLng = BANHA[1] + (i * 0.007);
        L.marker([fallbackLat, fallbackLng], { icon: makePin(L, color, String(i + 1)) })
          .addTo(layer)
          .bindPopup(`<b>${esc(z.stores?.map((s) => s.name_ar).join(' · ') || z.name)}</b><br>${esc(z.name)}`);
        pts.push([fallbackLat, fallbackLng]);
        centers.push([fallbackLat, fallbackLng]);
      }
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
