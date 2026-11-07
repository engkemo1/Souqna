/**
 * Public, readable URLs for sections whose stored slug is an opaque id (c18_mvtnfs0s, bejamh, blwfr ...).
 * The database slug is NOT changed (products, stores, attributes and images keep pointing at it); only the public URL is.
 * /c/<old> answers a 301 to /c/<readable>, and /c/<readable> serves the same page. Add a line here to give another section a readable URL.
 */
export const READABLE_SLUGS = {
  c24_mvy0dp3z: 'kids_boys_jackets',
  c26_mvwxl8wh: 'velvet_pajamas',
  c18_mvtnfs0s: 'women_coats',
  custom_mvtog9ka: 'women_footwear',
  c26_mvy99aj7: 'velvet_tracksuits',
  c21_mvy96mnn: 'kids_boys_vests',
  c17_mvz909pi: 'classic_shoes',
  c19_mvtp273s: 'half_boots',
  c26_mvwwm6n0: 'three_piece_pajamas',
  lbs_nwm: 'nightwear',
  c26_mvwvokj6: 'velvet_robes',
  bdla_rqs: 'dance_outfits',
  bejamh: 'pajamas',
  c26_mvxvstqp: 'satin_robes',
  c26_mvxs8s81: 'robes',
  blwfr: 'pullovers',
  c30_mvyba6hv: 'makeup_products',
  c26_mvzea4er: 'blankets',
  treng: 'women_tracksuits',
  c24_mvzewr02: 'kids_overalls',
  c31_mvzmxikh: 'men_hoodies',
  c31_mvzsvc0s: 'men_tracksuits',
  c21_mw22hqil: 'kids_clothes',
  c25_mw27b7e7: 'kids_suits',
  c25_mw27bf0x: 'women_suits',
  c31_mw2dm0ym: 'men_sherwal',
  sherwal: 'kids_sherwal',
  chirldren: 'kids_boys_girls',
};
const BY_READABLE = Object.fromEntries(Object.entries(READABLE_SLUGS).map(([k, v]) => [v, k]));
/** the public (readable) slug for a stored section slug */
export const publicSlug = (slug) => READABLE_SLUGS[slug] || slug;
/** the stored slug for whatever slug a URL carries (readable or stored) */
export const storedSlug = (slug) => BY_READABLE[slug] || slug;
