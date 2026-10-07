import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { messages } from './messages.js';

const I18nContext = createContext(null);
const KEY = 'souqna.lang';

function initialLang() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'ar' || saved === 'en') return saved;
  } catch { /* storage blocked */ }
  return 'ar';
}

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    try { localStorage.setItem(KEY, lang); } catch { /* ignore */ }
  }, [lang]);

  const t = useCallback((key, vars) => {
    let s = messages[lang][key] ?? messages.en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
    return s;
  }, [lang]);

  /** Pick the right side of a bilingual { ar, en } value. */
  const tr = useCallback((obj) => {
    if (obj == null) return '';
    if (typeof obj === 'string') return obj;
    return obj[lang] || obj.en || obj.ar || '';
  }, [lang]);

  const value = useMemo(() => ({
    lang, dir: lang === 'ar' ? 'rtl' : 'ltr', isRtl: lang === 'ar', t, tr,
    setLang, toggle: () => setLang((l) => (l === 'ar' ? 'en' : 'ar')),
  }), [lang, t, tr]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
