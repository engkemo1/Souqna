import fs from 'node:fs';
import { coordinateLookCandidates, fitBudgetCandidates, normalizeStylistText, rankCandidateRows } from '../lib/stylist-ranking.js';

const input = JSON.parse(fs.readFileSync(new URL('./fixtures/external-fashion-products.json', import.meta.url), 'utf8'));
const products = input.products.map((product) => ({ ...product, colors_json: JSON.stringify(product.colors), sold_count: 0, rating: 0 }));
const results = input.looks.map((testCase) => {
  const looks = testCase.slots.map((slot) => ({
    ...slot,
    palette: testCase.palette,
    items: rankCandidateRows(slot, products.filter((product) => product.department === 'men'), 4),
    pick: 0,
  })).filter((look) => look.items.length);
  coordinateLookCandidates(looks, testCase.budget);
  const total = fitBudgetCandidates(looks, testCase.budget);
  const selected = looks.map((look) => {
    const item = look.items[look.pick];
    const colors = (item.colors || []).flatMap((color) => [color.name_ar, color.name_en]);
    const match = colors.some((color) => testCase.palette.some((entry) => normalizeStylistText(color).includes(normalizeStylistText(entry)) || normalizeStylistText(entry).includes(normalizeStylistText(color))));
    return { slot: look.label, id: item.id, product: item.name_en, color: colors[0], price: item.price, paletteMatch: match, sources: item.sourceUrls };
  });
  return {
    id: testCase.id,
    brief: testCase.brief,
    selected,
    total,
    withinBudget: total <= testCase.budget,
    expectedProductsSelected: selected.every((item, index) => item.id === testCase.expectedProducts[index]),
    allPiecesFromRealCatalogueSnapshot: selected.every((item) => products.some((product) => product.id === item.id)),
    outfitCoherentByDeclaredPalette: selected.every((item) => item.paletteMatch),
  };
});
process.stdout.write(`${JSON.stringify({ source: input.source, productCount: products.length, results }, null, 2)}\n`);
