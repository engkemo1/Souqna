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
  const tops = useMemo(() => list.filter((d) => !d.parent), [list]);
  const childrenOf = useCallback((slug) => list.filter((d) => d.parent === slug), [list]);
  // "حريمي › فساتين › فساتين أفراح"
  const pathLabel = useCallback((slug) => {
    const parts = [];
    for (let s = slug, i = 0; s && i < 4; s = bySlug.get(s)?.parent, i++) parts.unshift(label(s));
    return parts.join(' › ');
  }, [bySlug, label]);
  return { list, label, bySlug, tops, childrenOf, pathLabel, ready: !!data };
}
