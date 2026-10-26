import { useEffect, useRef, useState, useCallback } from 'react';
import { MapPin, Loader2, X, Search, Check, Plus } from 'lucide-react';
import { searchEgyptianPlaces, BANHA_COORDS } from '../../lib/egyptPlaces.js';

let abortCtrl = null;

export default function PlaceAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'ابحث عن منطقة، شارع، أو كلية…',
  className = '',
  disabled = false,
}) {
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [focused, setFocused] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [error, setError] = useState(null);

  const debTerm = useDebounce(value, 300);

  useEffect(() => {
    const text = (debTerm || '').trim();
    if (text.length < 2) { setResults(null); setError(null); return; }
    abortCtrl?.abort();
    abortCtrl = new AbortController();
    let cancelled = false;
    setSearching(true); setError(null);

    searchEgyptianPlaces(text, abortCtrl.signal)
      .then((rows) => {
        if (!cancelled) {
          setResults(rows);
          setActiveIdx(-1);
        }
      })
      .catch((e) => {
        if (!cancelled && e.name !== 'AbortError') {
          setResults([]);
          setError('تعذر البحث — تأكد من الاتصال بالإنترنت');
        }
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });

    return () => { cancelled = true; };
  }, [debTerm]);

  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setFocused(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const pick = useCallback((r) => {
    const nameToSet = r.shortName || r.name.split(',')[0].trim();
    onChange(nameToSet);
    onSelect?.(r);
    setResults(null);
    setFocused(false);
  }, [onChange, onSelect]);

  const pickCustom = useCallback(() => {
    const customText = (value || '').trim();
    if (!customText) return;
    onChange(customText);
    onSelect?.({
      name: customText,
      shortName: customText,
      city: customText,
      lat: BANHA_COORDS[0],
      lng: BANHA_COORDS[1],
      isCustom: true,
    });
    setResults(null);
    setFocused(false);
  }, [value, onChange, onSelect]);

  const clear = () => { onChange(''); setResults(null); setError(null); inputRef.current?.focus(); };

  const onKey = (e) => {
    const totalItems = (results?.length || 0) + 1; // +1 for custom option
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, totalItems - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && activeIdx < (results?.length || 0)) {
        pick(results[activeIdx]);
      } else if (activeIdx === (results?.length || 0) || !results?.length) {
        pickCustom();
      }
    }
    else if (e.key === 'Escape') { setFocused(false); }
  };

  const showDropdown = focused && !disabled && (results !== null || searching || (value && value.trim().length >= 2));

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <div className={`flex items-center gap-0 rounded-xl border border-line bg-elevated transition-colors focus-within:border-fg focus-within:ring-1 focus-within:ring-fg/20 ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
        <span className="pointer-events-none ps-3 text-muted"><Search className="h-4 w-4" /></span>
        <input
          ref={inputRef}
          value={value}
          disabled={disabled}
          onChange={(e) => { onChange(e.target.value); setFocused(true); }}
          onFocus={() => setFocused(true)}
          onKeyDown={onKey}
          placeholder={placeholder}
          className="h-10 min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none placeholder:text-muted/60"
          autoComplete="off"
          role="combobox"
          aria-expanded={!!showDropdown}
        />
        {searching && <Loader2 className="me-2 h-4 w-4 animate-spin text-muted" />}
        {value && !searching && !disabled && <button type="button" onClick={clear} className="me-1.5 rounded-full p-1 text-muted hover:bg-fg/[0.06] hover:text-fg"><X className="h-3.5 w-3.5" /></button>}
      </div>

      {showDropdown && (
        <ul className="absolute inset-x-0 top-full z-[700] mt-1 max-h-60 overflow-auto rounded-xl border border-line bg-elevated shadow-xl" role="listbox">
          {error && <li className="px-3.5 py-2.5 text-xs text-red-500">{error}</li>}
          {searching && (
            <li className="flex items-center gap-2 px-3.5 py-2.5 text-xs text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />جاري البحث…
            </li>
          )}

          {results?.map((r, i) => {
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
                  <span className="shrink-0 flex items-center gap-1.5 text-xs">
                    {r.type && <span className="rounded-md bg-fg/[0.06] px-1.5 py-0.5 text-[11px] text-muted">{r.type}</span>}
                    {r.distanceKm != null && <span className="text-[11px] text-muted font-mono" dir="ltr">{r.distanceKm} km</span>}
                  </span>
                </button>
              </li>
            );
          })}

          {value && value.trim().length >= 2 && (
            <li role="option" aria-selected={activeIdx === (results?.length || 0)}>
              <button
                type="button"
                onClick={pickCustom}
                onMouseEnter={() => setActiveIdx(results?.length || 0)}
                className={`flex w-full items-center gap-2 px-3.5 py-2.5 text-start text-xs font-medium text-brand transition-colors bg-brand/5 hover:bg-brand/10 ${activeIdx === (results?.length || 0) ? 'ring-1 ring-brand/30' : ''}`}
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span className="truncate">استخدام <strong>&quot;{value.trim()}&quot;</strong> وتحديدها على الخريطة</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function useDebounce(value, ms) {
  const [deb, setDeb] = useState(value);
  useEffect(() => { const t = setTimeout(() => setDeb(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return deb;
}
