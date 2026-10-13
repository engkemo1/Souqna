import { loadKnowledge } from './moda/knowledge.js';
import { inferKey } from './moda/products.js';
import { FRIENDLY_AR } from './visual-core.js';

export function visualTypeOptions(K = loadKnowledge()) {
  return Object.entries(K.taxonomy.families).map(([key, family]) => ({
    key,
    ar: FRIENDLY_AR[key] || family.ar,
    itemKeys: family.items.filter((item) => !item.virtual).map((item) => item.key),
  })).filter((family) => family.itemKeys.length);
}

export function visualProductFamily(row, K = loadKnowledge()) {
  const categoryKey = inferKey(row.cat_text || '', K);
  const nameKey = inferKey(`${row.name_ar || ''} ${row.name_en || ''}`, K);
  const categoryFamily = K.items.get(categoryKey)?.family || null;
  const nameFamily = K.items.get(nameKey)?.family || null;
  if (categoryFamily && nameFamily && categoryFamily !== nameFamily) return null;
  if (nameFamily || categoryFamily) return nameFamily || categoryFamily;
  return ({
    shoes: 'shoes', bags: 'bags', abaya: 'modest', jalabiya: 'modest',
    wedding_dress: 'dresses', wedding_suit: 'suiting', underwear: 'underwear_sleep',
  })[row.department] || null;
}

export function matchesVisualType(row, type, K = loadKnowledge()) {
  const option = visualTypeOptions(K).find((candidate) => candidate.key === type);
  return Boolean(option && visualProductFamily(row, K) === option.key);
}
