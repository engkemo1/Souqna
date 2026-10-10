import { useCallback, useMemo } from 'react';
import { useApi } from './hooks.js';
import { useI18n } from './i18n.jsx';

/** Departments are managed by the platform team (admin → الأقسام). Labels come from the API, never hard-coded. */
export function useDepartments() {
  const { lang, t } = useI18n();
  const { data } = useApi('/departments');
  const list = data?.departments || [];
  const bySlug = useMemo(() => new Map(list.map((d) => [d.slug, d])), [list]);
  const label = useCallback((slug) => {
    const d = bySlug.get(slug);
    if (d) return d.name[lang] || d.name.ar;
    const k = `cat.${slug}`; const v = t(k);
    return v === k ? slug : v;
  }, [bySlug, lang, t]);
  return { list, label, bySlug, ready: !!data };
}
