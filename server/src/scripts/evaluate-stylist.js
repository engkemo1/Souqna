import fs from 'node:fs';
import { rankCandidateRows, coordinateLookCandidates, fitBudgetCandidates, normalizeStylistText } from '../lib/stylist-ranking.js';

const catalogPath = new URL('../../seed-assets/catalog.json', import.meta.url);
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const categoryNames = {
  mh: 'hoodies هوديز', mj: 'jackets جواكت', mp: 'pants بناطيل',
  wh: 'hoodies هوديز', wj: 'jackets جواكت', wp: 'pants بناطيل',
  ms: 'men tees تيشيرتات رجالي', msh: 'shorts شورتات', ws: 'women حريمي',
  shorts: 'shorts شورتات', jeans: 'jeans جينز', tee: 'tees تيشيرتات', cap: 'beanies طواقي',
};
const rows = Object.entries(catalog.products).flatMap(([store_slug, products]) => products.map((product) => ({
  ...product,
  store_slug,
  type: product.type,
  cat_text: categoryNames[product.type] || product.type,
  status: 'active',
  sold_count: 0,
  rating: 4.5,
  colors_json: JSON.stringify(product.colors || []),
} )));

const cases = [
  { id: 'mens-grey-hoodie', request: 'هودي رمادي لخروجة رجالي', stores: ['ahmed-fashion'], label: 'هودي', keywords: ['hoodie', 'هودي', 'رمادي', 'grey'], type: 'mh', colors: ['رمادي', 'grey'], maxPrice: 1200 },
  { id: 'mens-navy-hoodie-gap', request: 'هودي كحلي لخروجة رجالي', stores: ['ahmed-fashion'], label: 'هودي', keywords: ['hoodie', 'هودي', 'كحلي', 'navy'], type: 'mh', colors: ['كحلي', 'navy'], maxPrice: 1200 },
  { id: 'womens-casual-layer', request: 'جاكيت أسود لخروجة حريمي', stores: ['lamar-boutique'], label: 'جاكيت', keywords: ['jacket', 'جاكيت', 'أسود', 'black'], type: 'wj', colors: ['أسود', 'black'], maxPrice: 2000 },
  { id: 'training-shorts', request: 'شورت جري أسود للتمرين', stores: ['sport-zone'], label: 'شورت', keywords: ['shorts', 'شورت', 'أسود', 'black'], type: 'msh', colors: ['أسود', 'black'], maxPrice: 900 },
  { id: 'denim-jeans', request: 'جينز غسيل متوسط للخروجة', stores: ['denim-house'], label: 'جينز', keywords: ['jeans', 'جينز', 'جينز متوسط', 'mid wash'], type: 'jeans', colors: ['جينز متوسط', 'mid wash'], maxPrice: 1500 },
  { id: 'formal-dress-gap', request: 'فستان سهرة راقي لخطوبة', stores: Object.keys(catalog.products), label: 'فستان سهرة', keywords: ['evening dress', 'فستان', 'سهرة'], type: 'dress', colors: [] },
  { id: 'mens-formal-shirt-gap', request: 'قميص رسمي أبيض مع بدلة', stores: Object.keys(catalog.products), label: 'قميص رسمي', keywords: ['formal shirt', 'قميص', 'أبيض', 'white'], type: 'formal-shirt', colors: [] },
];

const colorCoverage = rows.filter((product) => (product.colors || []).length > 0).length;
const imageCoverage = rows.filter((product) => (product.images || []).length > 0).length;
const descriptionCoverage = rows.filter((product) => product.description_ar?.trim() && product.description_en?.trim()).length;
const results = cases.map((item) => {
  const candidateRows = rows.filter((product) => item.stores.includes(product.store_slug) && (!item.maxPrice || product.price <= item.maxPrice));
  const ranked = rankCandidateRows(item, candidateRows, 4);
  const relevant = ranked.filter((product) => product.type === item.type);
  const matchesColor = (product) => {
    const productColors = normalizeStylistText((product.colors || []).flatMap((color) => [color.name_ar, color.name_en]).join(' '));
    return item.colors.some((color) => productColors.includes(normalizeStylistText(color)));
  };
  const colorHit = relevant.length > 0 && (!item.colors.length || relevant.some(matchesColor));
  const picked = ranked[0];
  return {
    id: item.id,
    request: item.request,
    outcome: !relevant.length ? 'catalogue_gap' : colorHit ? 'covered' : 'palette_gap',
    ...(item.maxPrice ? { maxPrice: item.maxPrice } : {}),
    top4: ranked.slice(0, 4).map((product) => `${product.name_ar} [${product.type}]`),
    pickedPrice: picked?.price ?? null,
    typeHitAt1: Boolean(picked && picked.type === item.type),
    typeHitAt4: relevant.length > 0,
    colorHitAt1: Boolean(picked && (item.colors.length ? picked.type === item.type && matchesColor(picked) : picked.type === item.type)),
    colorHitAt4: Boolean(colorHit),
  };
});

const covered = results.filter((item) => item.outcome === 'covered');
const typeCovered = results.filter((item) => item.outcome !== 'catalogue_gap');
const runnable = covered.filter((item) => item.colorHitAt4);
const wardrobeLook = {
  id: 'mens-weekend-look',
  budget: 2200,
  slots: ['mens-grey-hoodie', 'denim-jeans'].map((id) => cases.find((item) => item.id === id)),
};
const outfitLooks = wardrobeLook.slots.map((slot) => {
  const eligible = rows.filter((product) => slot.stores.includes(product.store_slug) && product.price <= slot.maxPrice);
  return { label: slot.label, items: rankCandidateRows(slot, eligible, 4), pick: 0, targetColors: slot.colors, palette: ['رمادي', 'أزرق'] };
}).filter((look) => look.items.length);
const beforeFit = outfitLooks.reduce((sum, look) => sum + (look.items[look.pick]?.price || 0), 0);
coordinateLookCandidates(outfitLooks, wardrobeLook.budget);
const afterFit = fitBudgetCandidates(outfitLooks, wardrobeLook.budget);
const outfitReport = {
  id: wardrobeLook.id,
  budget: wardrobeLook.budget,
  totalBeforeBudgetFit: beforeFit,
  totalAfterBudgetFit: afterFit,
  withinBudget: afterFit <= wardrobeLook.budget,
  selectedPieces: outfitLooks.map((look) => {
    const product = look.items[look.pick];
    const colors = normalizeStylistText((product.colors || []).flatMap((color) => [color.name_ar, color.name_en]).join(' '));
    return { slot: look.label, product: product.name_ar, price: product.price, matchesPalette: look.targetColors.some((color) => colors.includes(normalizeStylistText(color))) };
  }),
};
const report = {
  source: 'server/seed-assets/catalog.json (demo catalogue; not the live production database)',
  catalogue: {
    products: rows.length,
    stores: Object.keys(catalog.products).length,
    missingArabicNames: rows.filter((p) => !p.name_ar?.trim()).length,
    missingEnglishNames: rows.filter((p) => !p.name_en?.trim()).length,
    descriptionsInBothLanguages: descriptionCoverage,
    colorsPresent: colorCoverage,
    imagesPresent: imageCoverage,
    productTypes: Object.fromEntries([...new Set(rows.map((p) => p.type))].sort().map((type) => [type, rows.filter((p) => p.type === type).length])),
  },
  benchmark: {
    cases: cases.length,
    catalogueGaps: results.filter((item) => item.outcome === 'catalogue_gap').map((item) => item.id),
    paletteGaps: results.filter((item) => item.outcome === 'palette_gap').map((item) => item.id),
    typeHitAt1: `${typeCovered.filter((item) => item.typeHitAt1).length}/${typeCovered.length}`,
    typeHitAt4: `${typeCovered.filter((item) => item.typeHitAt4).length}/${typeCovered.length}`,
    requestedColorHitAt1: `${typeCovered.filter((item) => item.colorHitAt1).length}/${typeCovered.length}`,
    requestedColorHitAt4: `${runnable.length}/${typeCovered.length}`,
    outfitBudgetCase: outfitReport,
    results,
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!colorCoverage || !imageCoverage || results.some((item) => item.outcome === 'covered' && !item.typeHitAt4)) process.exitCode = 1;
