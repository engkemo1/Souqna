const norm = (value) => String(value || '').toLowerCase()
  .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ـ/g, '')
  .replace(/[ًٌٍَُِّْ]/g, '').trim();

const GARMENT_ALIASES = [
  [['hoodie', 'hoodies', 'hooded top', 'هودي', 'هوديز'], 'هودي'],
  [['jacket', 'jackets', 'جاكيت', 'جواكت'], 'جاكيت'],
  [['coat', 'coats', 'overcoat', 'معطف', 'بالطو'], 'معطف'],
  [['blazer', 'blazers', 'بليزر'], 'بليزر'],
  [['suit', 'suits', 'بدلة', 'بدل'], 'بدلة'],
  [['vest', 'waistcoat', 'صديري', 'فيست'], 'فيست'],
  [['jeans', 'denim', 'جينز'], 'جينز'],
  [['short', 'shorts', 'شورت', 'شورتات'], 'شورت'],
  [['trousers', 'pants', 'بنطلون', 'بناطيل'], 'بنطلون'],
  [['leggings', 'legging', 'ليجنز'], 'ليجنز'],
  [['joggers', 'jogger', 'sweatpants', 'تريننج', 'بنطلون رياضي'], 'تريننج'],
  [['cargo pants', 'cargo trousers', 'كارغو', 'كارجو'], 'كارغو'],
  [['shirt', 'shirts', 'قميص', 'قمصان'], 'قميص'],
  [['tee', 'tees', 't-shirt', 'tshirts', 'تيشيرت', 'تيشيرتات'], 'تيشيرت'],
  [['polo', 'polo shirt', 'بولو'], 'بولو'],
  [['blouse', 'blouses', 'بلوزة', 'بلوزات'], 'بلوزة'],
  [['top', 'tops', 'كاميزول', 'توب'], 'توب'],
  [['sweater', 'sweaters', 'jumper', 'knitwear', 'كنزة', 'بلوفر'], 'بلوفر'],
  [['cardigan', 'cardigans', 'كارديجان'], 'كارديجان'],
  [['dress', 'dresses', 'gown', 'gowns', 'فستان', 'فساتين'], 'فستان'],
  [['skirt', 'skirts', 'تنورة', 'جيبة', 'جيبات'], 'جيبة'],
  [['jumpsuit', 'jumpsuits', 'romper', 'جمبسوت', 'أوفرول'], 'جمبسوت'],
  [['abaya', 'abayas', 'عباية', 'عبايات'], 'عباية'],
  [['kaftan', 'caftan', 'قفطان', 'جلابية', 'جلابيات'], 'جلابية'],
  [['tunic', 'tunics', 'تونيك'], 'تونيك'],
  [['sneaker', 'sneakers', 'trainers', 'كوتشي', 'سنيكرز'], 'كوتشي'],
  [['heel', 'heels', 'high heels', 'كعب', 'كعب عالي'], 'كعب'],
  [['boot', 'boots', 'ankle boots', 'بوت'], 'بوت'],
  [['sandal', 'sandals', 'صندل', 'صنادل'], 'صندل'],
  [['loafer', 'loafers', 'moccasin', 'moccasins', 'لوفر', 'موكاسان'], 'لوفر'],
  [['oxford shoes', 'derby shoes', 'dress shoes', 'حذاء رسمي'], 'حذاء رسمي'],
  [['shoe', 'shoes', 'footwear', 'حذاء', 'أحذية', 'جزمة'], 'حذاء'],
  [['handbag', 'handbags', 'purse', 'purses', 'شنطة', 'حقيبة', 'شنط'], 'شنطة'],
  [['backpack', 'backpacks', 'rucksack', 'شنطة ظهر'], 'شنطة ظهر'],
  [['belt', 'belts', 'حزام', 'حزام جلد'], 'حزام'],
  [['scarf', 'scarves', 'طرحة', 'طرحة حجاب', 'وشاح', 'شال'], 'طرحة'],
  [['hijab', 'headscarf', 'حجاب', 'حجابات'], 'حجاب'],
  [['tie', 'ties', 'necktie', 'كرافتة', 'ربطة عنق'], 'كرافتة'],
  [['hat', 'hats', 'cap', 'caps', 'كاب', 'قبعة'], 'كاب'],
  [['jewelry', 'jewellery', 'necklace', 'bracelet', 'earrings', 'ring', 'rings', 'مجوهرات', 'اكسسوار', 'إكسسوار', 'سلسلة', 'اسورة', 'إسوارة', 'حلق', 'خاتم'], 'إكسسوار'],
  [['socks', 'sock', 'جوارب', 'شراب'], 'شراب'],
];

function aliasesFor(token) {
  const group = GARMENT_ALIASES.find(([aliases, canonical]) => aliases.some((alias) => norm(alias) === token) || norm(canonical) === token);
  return group ? group[0].map(norm) : [token];
}

/** Rank already-eligible catalogue rows for one requested piece. Kept pure so quality cases can run without a live database or AI key. */
export function rankCandidateRows(slot, rows, limit = 4) {
  const label = String(slot.label || '').split('·').pop();
  const typeTokens = [...new Set(norm(label).split(/\s+/).filter((token) => token.length > 1))].slice(0, 4);
  const keywordTokens = [...new Set((slot.keywords || []).map(norm).filter((token) => token.length > 1))].slice(0, 8);
  const requestedColor = norm(slot.color || '');
  const palette = (Array.isArray(slot.palette) ? slot.palette : []).map(norm).filter(Boolean);
  const tokens = [...new Set([...typeTokens, ...keywordTokens])].slice(0, 10);
  const scored = rows.map((product) => {
    const colors = Array.isArray(product.colors_json) ? product.colors_json : (() => {
      try { return JSON.parse(product.colors_json || '[]'); } catch { return []; }
    })();
    const colorText = colors.flatMap((color) => [color.name_ar, color.name_en]).filter(Boolean).join(' ');
    const normalizedColorText = norm(colorText);
    const nameText = norm(`${product.name_ar || ''} ${product.name_en || ''} ${colorText}`);
    const categoryText = norm(product.cat_text || '');
    const descriptionText = norm(`${product.description_ar || ''} ${product.description_en || ''}`);
    let nameHits = 0; let categoryHits = 0; let descriptionHits = 0; let score = 0;
    for (const token of tokens) {
      if (nameText.includes(token)) { nameHits++; score += typeTokens.includes(token) ? 4 : 3; }
      else if (categoryText.includes(token)) { categoryHits++; score += typeTokens.includes(token) ? 4 : 2; }
      else if (descriptionText.includes(token)) { descriptionHits++; score += 1; }
    }
    // The first label token is the garment itself (label prefixes such as "له ·" are removed above).
    // Requiring it prevents an adjective like "evening" from making a jacket look like a missing dress.
    const primaryType = typeTokens[0];
    const typeAliases = primaryType ? aliasesFor(primaryType) : [];
    const nameTypeMatch = typeAliases.some((alias) => nameText.includes(alias));
    const categoryTypeMatch = typeAliases.some((alias) => categoryText.includes(alias));
    const broadDepartment = /\b(?:men|women|kids|sports)\b|رجالي|حريمي|اطفال|رياضي/u.test(categoryText);
    // When the store supplies a specific category, trust it over incidental words in a product name.
    // Broad departments such as "Women" still need the product name to identify its garment.
    const typeMatch = primaryType ? categoryTypeMatch || (nameTypeMatch && (broadDepartment || !categoryText)) : false;
    const relevant = typeTokens.length ? typeMatch : nameHits >= 1 || categoryHits >= 1 || descriptionHits >= 2;
    const popularity = Math.min(2, Number(product.sold_count || 0) / 20) + (Number(product.rating || 0) >= 4 ? 0.5 : 0);
    const colorScore = requestedColor && normalizedColorText.includes(requestedColor) ? 12
      : requestedColor && (nameText.includes(requestedColor) || descriptionText.includes(requestedColor)) ? 8
        : palette.some((color) => normalizedColorText.includes(color) || nameText.includes(color)) ? 2 : 0;
    return { product, relevant, score: score + popularity + colorScore };
  });
  return scored.filter((entry) => entry.relevant)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit).map((entry) => entry.product);
}

export function fitBudgetCandidates(looks, budget) {
  const total = () => looks.reduce((sum, look) => sum + (look.items[look.pick]?.price || 0), 0);
  let guard = 20;
  while (budget && total() > budget && guard-- > 0) {
    const requiredSaving = total() - budget;
    const options = [];
    looks.forEach((look, index) => look.items.forEach((item, itemIndex) => {
      const saving = (look.items[look.pick]?.price || 0) - item.price;
      const rankLoss = itemIndex - look.pick;
      if (saving > 0) options.push({ index, itemIndex, saving, rankLoss, qualityCostPerPound: rankLoss / saving });
    }));
    const sufficient = options.filter((option) => option.saving >= requiredSaving)
      .sort((a, b) => a.rankLoss - b.rankLoss || (a.saving - requiredSaving) - (b.saving - requiredSaving));
    const best = sufficient[0] || options.sort((a, b) => a.qualityCostPerPound - b.qualityCostPerPound)[0];
    if (!best) break;
    looks[best.index].pick = best.itemIndex;
  }
  return total();
}

function productColors(product) {
  let colors = product.colors_json ?? product.colors;
  if (!Array.isArray(colors)) {
    try { colors = JSON.parse(colors || '[]'); } catch { colors = []; }
  }
  return new Set(colors.flatMap((color) => [color.name_ar, color.name_en]).filter(Boolean).map(norm));
}

/** Choose a coherent combination from each slot's already-ranked candidates. */
export function coordinateLookCandidates(looks, budget = null) {
  const palette = [...new Set(looks.flatMap((look) => (look.palette || []).map(norm)).filter(Boolean))];
  let beam = [{ picks: [], colors: [], score: 0, total: 0 }];
  for (const look of looks) {
    const next = [];
    look.items.forEach((item, itemIndex) => {
      const colors = productColors(item);
      for (const state of beam) {
        const sharedColors = state.colors.reduce((count, prior) => count + [...colors].filter((color) => prior.has(color)).length, 0);
        const paletteMatches = [...colors].filter((color) => palette.some((entry) => color.includes(entry) || entry.includes(color))).length;
        const score = state.score - itemIndex + Math.min(sharedColors, 2) * 2.5 + Math.min(paletteMatches, 2) * 0.25;
        next.push({ picks: [...state.picks, itemIndex], colors: [...state.colors, colors], score, total: state.total + (Number(item.price) || 0) });
      }
    });
    beam = next.sort((a, b) => {
      const aOver = budget && a.total > budget ? 1 : 0;
      const bOver = budget && b.total > budget ? 1 : 0;
      return aOver - bOver || b.score - a.score || a.total - b.total;
    }).slice(0, 128);
  }
  if (!beam.length) return;
  const selected = beam.find((state) => !budget || state.total <= budget) || beam[0];
  looks.forEach((look, index) => { look.pick = selected.picks[index] ?? 0; });
}

export { norm as normalizeStylistText };
