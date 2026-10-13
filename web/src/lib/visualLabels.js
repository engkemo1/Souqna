/** Customer-facing names of the visual-search item types (Arabic comes from the server; English lives here). */
export const EN_LABELS = {
  tops: 'Tops & shirts', bottoms: 'Pants & jeans', dresses: 'Dresses', suiting: 'Suits & tailoring',
  outerwear: 'Jackets & coats', modest: 'Abayas, scarves & jalabiyas', shoes: 'Shoes', bags: 'Bags',
  accessories: 'Accessories', sport: 'Sportswear', underwear_sleep: 'Sleepwear & underwear',
};
export const familyLabel = (family, arLabel, lang) => (lang === 'ar' ? arLabel : (EN_LABELS[family] || arLabel));
