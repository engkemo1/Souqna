export function slugify(s) {
  const base = String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9؀-ۿ]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return base || Math.random().toString(36).slice(2, 8);
}

export const nowIso = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

export const clampInt = (v, min, max, d) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};

export const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

/** Arabic -> Latin letters, used only to build readable store URLs (e.g. "سارة شكري" -> "sara-shkry"). */
const AR_LATIN = { ا: 'a', أ: 'a', إ: 'e', آ: 'a', ى: 'a', ة: 'a', ب: 'b', ت: 't', ث: 'th', ج: 'g', ح: 'h', خ: 'kh', د: 'd', ذ: 'z', ر: 'r', ز: 'z', س: 's', ش: 'sh', ص: 's', ض: 'd', ط: 't', ظ: 'z', ع: 'a', غ: 'gh', ف: 'f', ق: 'q', ك: 'k', ل: 'l', م: 'm', ن: 'n', ه: 'h', و: 'w', ي: 'y', ئ: 'e', ؤ: 'o', ء: '', '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };

/** Common store words, so URLs read naturally ("فساتين نور" -> "fasateen-nour") instead of consonant soup. Keys are normalised (أ/إ/آ -> ا, ة -> ه, ى -> ي). */
const AR_WORDS = {
  فساتين: 'fasateen', فستان: 'fostan', ملكه: 'malaka', نور: 'nour', ستايل: 'style', موضه: 'moda', ازياء: 'azyaa', بوتيك: 'boutique', ماركت: 'market',
  سوق: 'souq', سوقنا: 'souqna', بنها: 'banha', تويست: 'twist', شنط: 'shonat', احذيه: 'ahziya', كوتشي: 'kotshi', حريمي: 'harimi', رجالي: 'regali',
  اطفال: 'atfal', عبايات: 'abayat', حجاب: 'hijab', ملابس: 'malabes', جينز: 'jeans', هدوم: 'hodoum', محل: 'mahal', متجر: 'matgar', ماركه: 'marka',
  سارا: 'sara', سارا_: 'sara', محمد: 'mohamed', احمد: 'ahmed', علي: 'ali', مصطفي: 'mostafa', شكري: 'shokry', هدايا: 'hadaya', عطور: 'otour',
  اناقه: 'anaqa', جمال: 'gamal', جميله: 'gamila', ورد: 'ward', قمر: 'amar', شمس: 'shams', نجمه: 'negma', لؤلؤ: 'lolo', ذهب: 'dahab', الماس: 'almaz',
};
const normAr = (w) => w.replace(/[ً-ٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
const arWord = (w) => {
  const n = normAr(w);
  if (AR_WORDS[n]) return AR_WORDS[n];
  if (n.startsWith('ال') && AR_WORDS[n.slice(2)]) return `el-${AR_WORDS[n.slice(2)]}`;
  return w.replace(/[ً-ٟـ]/g, '').split('').map((c) => (c in AR_LATIN ? AR_LATIN[c] : c)).join('');
};

/** URL-safe slug (a-z, 0-9, "-") from a store name. Uses the Latin part of the name when it has one, otherwise transliterates Arabic. Returns '' when nothing usable is left. */
export function latinSlug(name) {
  const raw = String(name || '');
  const latin = raw.replace(/[^A-Za-z0-9]+/g, ' ').trim();
  const src = /[A-Za-z]{3}/.test(latin) ? latin : raw.split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(arWord).join(' ');
  return src.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}
