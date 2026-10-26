/**
 * Comprehensive Egyptian places, streets & landmarks database.
 * Specially loaded with Banha, Qalyubia villages, centers and Greater Cairo areas.
 * Features smart phonetic/typo normalization (handles "شارغ", "كلبه", "الوزكري", etc.).
 */

export const BANHA_COORDS = [30.466, 31.185];

export function normalizeArabic(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '') // remove tashkeel
    .replace(/شارغ/g, 'شارع') // typo fix
    .replace(/كلبه/g, 'كلية') // typo fix
    .replace(/الوزكري/g, 'ابوزكري') // typo fix
    .replace(/ابو\s*ذكري/g, 'ابوزكري')
    .replace(/ابو\s*زكري/g, 'ابوزكري')
    .replace(/كفر\s*الجزار/g, 'كفر الجزار')
    .replace(/كفرالجزار/g, 'كفر الجزار')
    .replace(/كفر\s*سعد/g, 'كفر سعد')
    .replace(/كفرسعد/g, 'كفر سعد')
    .replace(/كفر\s*شكر/g, 'كفر شكر')
    .replace(/كفرشكر/g, 'كفر شكر')
    .replace(/كفر\s*مناقر/g, 'كفر مناقر')
    .replace(/كفرمناقر/g, 'كفر مناقر')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[,\-،_.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Calculate straight-line distance in km from Banha center (Haversine formula) */
export function calcDistanceKm(lat, lng, center = BANHA_COORDS) {
  const [bLat, bLng] = center;
  const R = 6371;
  const dLat = ((lat - bLat) * Math.PI) / 180;
  const dLon = ((lng - bLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((bLat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export const CURATED_PLACES = [
  // ── بنها — كليات ومجمعات جامعية ──
  {
    name: 'شارع كلية التجارة، بنها',
    shortName: 'شارع كلية التجارة',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.4688,
    lng: 31.1824,
    type: 'شارع / جامعة',
    distanceKm: 0.5,
    aliases: ['شارع كلية التجارة', 'كلية التجارة', 'كلية تجارة', 'شارغ كلبه تجاره', 'تجارة بنها'],
  },
  {
    name: 'كلية التجارة جامعة بنها',
    shortName: 'كلية التجارة',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.4688,
    lng: 31.1824,
    type: 'جامعة',
    distanceKm: 0.5,
    aliases: ['كلية التجارة بنها', 'كليه تجاره', 'مبنى كلية تجارة'],
  },
  {
    name: 'شارع كلية الحقوق، بنها',
    shortName: 'شارع كلية الحقوق',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.4695,
    lng: 31.183,
    type: 'شارع / جامعة',
    distanceKm: 0.6,
    aliases: ['كلية الحقوق', 'حقوق بنها'],
  },
  {
    name: 'شارع كلية الآداب، بنها',
    shortName: 'شارع كلية الآداب',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.4678,
    lng: 31.1818,
    type: 'شارع / جامعة',
    distanceKm: 0.4,
    aliases: ['كلية الآداب', 'آداب بنها'],
  },
  {
    name: 'كلية العلوم جامعة بنها',
    shortName: 'كلية العلوم',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.4645,
    lng: 31.1802,
    type: 'جامعة',
    distanceKm: 0.6,
    aliases: ['علوم بنها'],
  },
  {
    name: 'كلية التربية، بنها',
    shortName: 'كلية التربية',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.4665,
    lng: 31.1835,
    type: 'جامعة',
    distanceKm: 0.2,
    aliases: ['تربية بنها'],
  },
  {
    name: 'كلية الطب البشري، بنها',
    shortName: 'كلية الطب',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.461,
    lng: 31.178,
    type: 'جامعة',
    distanceKm: 0.9,
    aliases: ['طب بنها'],
  },
  {
    name: 'كلية التمريض، بنها',
    shortName: 'كلية التمريض',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.4615,
    lng: 31.1775,
    type: 'جامعة',
    distanceKm: 0.9,
  },
  {
    name: 'كلية العلاج الطبيعي جامعة بنها',
    shortName: 'علاج طبيعي بنها',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.467,
    lng: 31.1825,
    type: 'جامعة',
    distanceKm: 0.5,
  },
  {
    name: 'كلية التربية الرياضية، بنها (كفر سعد)',
    shortName: 'تربية رياضية',
    city: 'كفر سعد',
    gov: 'Qalyubia',
    lat: 30.4795,
    lng: 31.1685,
    type: 'جامعة',
    distanceKm: 3.6,
  },
  {
    name: 'كلية الفنون التطبيقية، بنها',
    shortName: 'فنون تطبيقية بنها',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.462,
    lng: 31.181,
    type: 'جامعة',
    distanceKm: 0.7,
  },
  {
    name: 'كلية الحاسبات والذكاء الاصطناعي، بنها',
    shortName: 'حاسبات ومعلومات بنها',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.47,
    lng: 31.184,
    type: 'جامعة',
    distanceKm: 0.6,
  },
  {
    name: 'كلية الهندسة بشبرا (جامعة بنها)',
    shortName: 'هندسة شبرا',
    city: 'شبرا الخيمة',
    gov: 'Qalyubia',
    lat: 30.122,
    lng: 31.251,
    type: 'جامعة',
    distanceKm: 39,
  },
  {
    name: 'كلية الهندسة ببنها',
    shortName: 'هندسة بنها',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.465,
    lng: 31.179,
    type: 'جامعة',
    distanceKm: 0.7,
  },
  {
    name: 'كلية الزراعة والطب البيطري بمشتهر',
    shortName: 'كليات مشتهر',
    city: 'طوخ',
    gov: 'Qalyubia',
    lat: 30.37,
    lng: 31.21,
    type: 'جامعة',
    distanceKm: 9.5,
  },

  // ── بنها — مساجد ومعالم شهيرة ──
  {
    name: 'مسجد الخضر، أتريب بنها',
    shortName: 'مسجد الخضر',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.4735,
    lng: 31.182,
    type: 'مسجد شهير',
    distanceKm: 0.9,
    aliases: ['مسجد الخضر', 'جامع الخضر', 'الخضر بنها', 'سيدي الخضر'],
  },
  {
    name: 'مسجد ناصر، بنها',
    shortName: 'مسجد ناصر',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.465,
    lng: 31.183,
    type: 'مسجد',
    distanceKm: 0.3,
    aliases: ['جامع ناصر'],
  },
  {
    name: 'مسجد الشبان المسلمين، بنها',
    shortName: 'مسجد الشبان',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.467,
    lng: 31.18,
    type: 'مسجد',
    distanceKm: 0.5,
  },
  {
    name: 'مسجد إبراهيم مرسي، الفلل بنها',
    shortName: 'مسجد إبراهيم مرسي',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.4725,
    lng: 31.1765,
    type: 'مسجد',
    distanceKm: 1.1,
  },
  {
    name: 'محطة قطار بنها / ميدان المحطة',
    shortName: 'محطة قطار بنها',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.4578,
    lng: 31.1885,
    type: 'محطة قطار',
    distanceKm: 1.0,
    aliases: ['محطة بنها', 'ميدان المحطة', 'السكة الحديد'],
  },
  {
    name: 'موقف بنها العمومي / كوبري الفحص',
    shortName: 'موقف بنها العمومي',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.478,
    lng: 31.192,
    type: 'موقف سيارات',
    distanceKm: 1.5,
    aliases: ['كوبري الفحص', 'موقف بنها الجديد', 'موقف مصر'],
  },
  {
    name: 'استاد بنها الرياضي',
    shortName: 'استاد بنها',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.4705,
    lng: 31.189,
    type: 'رياضي',
    distanceKm: 0.7,
  },
  {
    name: 'مجمع المحاكم، بنها',
    shortName: 'مجمع المحاكم',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.463,
    lng: 31.183,
    type: 'حكومي',
    distanceKm: 0.4,
  },
  {
    name: 'ديوان عام محافظة القليوبية، بنها',
    shortName: 'محافظة القليوبية',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.47,
    lng: 31.177,
    type: 'حكومي',
    distanceKm: 0.9,
  },

  // ── بنها — مستشفيات ──
  {
    name: 'مستشفى بنها الجامعي',
    shortName: 'مستشفى بنها الجامعي',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.461,
    lng: 31.178,
    type: 'مستشفى',
    distanceKm: 0.9,
  },
  {
    name: 'مستشفى الأطفال التخصصي، بنها',
    shortName: 'مستشفى الأطفال',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.462,
    lng: 31.179,
    type: 'مستشفى',
    distanceKm: 0.8,
  },
  {
    name: 'مستشفى بنها التعليمي',
    shortName: 'مستشفى بنها التعليمي',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.456,
    lng: 31.184,
    type: 'مستشفى',
    distanceKm: 1.1,
  },
  {
    name: 'مستشفى التأمين الصحي، بنها',
    shortName: 'التأمين الصحي بنها',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.463,
    lng: 31.187,
    type: 'مستشفى',
    distanceKm: 0.4,
  },
  {
    name: 'مستشفى الحميات، بنها',
    shortName: 'حميات بنها',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.455,
    lng: 31.182,
    type: 'مستشفى',
    distanceKm: 1.2,
  },

  // ── بنها — شوارع وأحياء ──
  {
    name: 'شارع فريد ندا، بنها',
    shortName: 'شارع فريد ندا',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.466,
    lng: 31.185,
    type: 'شارع رئيسي',
    distanceKm: 0.2,
    aliases: ['فريد ندا'],
  },
  {
    name: 'شارع الأهرام، بنها',
    shortName: 'شارع الأهرام',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.467,
    lng: 31.184,
    type: 'شارع',
    distanceKm: 0.2,
    aliases: ['الاهرام بنها', 'شارع الاهرام'],
  },
  {
    name: 'الفلل، بنها',
    shortName: 'الفلل',
    city: 'الفلل',
    gov: 'Qalyubia',
    lat: 30.472,
    lng: 31.176,
    type: 'منطقة',
    distanceKm: 1.1,
    aliases: ['الفلل', 'كورنيش الفلل', 'حي الفلل'],
  },
  {
    name: 'شارع كورنيش النيل، بنها',
    shortName: 'كورنيش النيل',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.469,
    lng: 31.175,
    type: 'كورنيش',
    distanceKm: 1.0,
  },
  {
    name: 'شارع سعد زغلول، بنها',
    shortName: 'شارع سعد زغلول',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.46,
    lng: 31.185,
    type: 'شارع تجاري',
    distanceKm: 0.7,
  },
  {
    name: 'ميدان الإشارة، بنها',
    shortName: 'ميدان الإشارة',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.464,
    lng: 31.186,
    type: 'ميدان',
    distanceKm: 0.3,
    aliases: ['الإشارة بنها', 'الاشاره'],
  },
  {
    name: 'شارع عجيبة، بنها',
    shortName: 'شارع عجيبة',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.461,
    lng: 31.183,
    type: 'شارع',
    distanceKm: 0.6,
  },
  {
    name: 'شارع الدهشان، بنها',
    shortName: 'شارع الدهشان',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.463,
    lng: 31.182,
    type: 'شارع',
    distanceKm: 0.5,
  },
  {
    name: 'شارع الشهيد فتحي، بنها',
    shortName: 'شارع الشهيد فتحي',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.4625,
    lng: 31.1845,
    type: 'شارع',
    distanceKm: 0.4,
  },
  {
    name: 'شارع 8، بنها الجديدة',
    shortName: 'شارع 8 بنها',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.468,
    lng: 31.188,
    type: 'شارع',
    distanceKm: 0.4,
  },
  {
    name: 'شارع الجيش / البحر، بنها',
    shortName: 'شارع الجيش',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.459,
    lng: 31.181,
    type: 'شارع',
    distanceKm: 0.9,
    aliases: ['شارع البحر بنها'],
  },
  {
    name: 'شارع صيدناوي، بنها',
    shortName: 'شارع صيدناوي',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.4615,
    lng: 31.184,
    type: 'شارع تجاري',
    distanceKm: 0.5,
  },
  {
    name: 'شارع الكوبري، بنها',
    shortName: 'شارع الكوبري',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.4635,
    lng: 31.181,
    type: 'شارع رئيسي',
    distanceKm: 0.6,
    aliases: ['شارع الكوبرى', 'الكوبري', 'شارع كوبري بنها', 'شارع الكوبري القديم'],
  },
  {
    name: 'كوبري كفر الجزار / كوبري بنها القديم',
    shortName: 'كوبري كفر الجزار',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.467,
    lng: 31.173,
    type: 'كوبري',
    distanceKm: 1.2,
    aliases: ['الكوبري القديم', 'كوبري بنها', 'كوبري الجزار'],
  },
  {
    name: 'شارع شعراوي / نفق شعراوي، بنها',
    shortName: 'شارع شعراوي',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.463,
    lng: 31.184,
    type: 'شارع تجاري',
    distanceKm: 0.4,
    aliases: ['نفق شعراوي', 'ميدان شعراوي', 'شعراوي'],
  },
  {
    name: 'ميدان عزبة الزراعة، مدخل بنها',
    shortName: 'عزبة الزراعة',
    city: 'عزبة الزراعة',
    gov: 'Qalyubia',
    lat: 30.448,
    lng: 31.198,
    type: 'ميدان رئيسي',
    distanceKm: 2.3,
    aliases: ['ميدان الزراعة', 'عزبة الزراعة', 'مدخل بنها الزراعي', 'الزراعة بنها'],
  },
  {
    name: 'نفق المنشية وميدان المنشية، بنها',
    shortName: 'نفق المنشية',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.457,
    lng: 31.188,
    type: 'ميدان / نفق',
    distanceKm: 1.0,
    aliases: ['المنشية بنها', 'نفق المنشيه'],
  },
  {
    name: 'شارع الخدمة الاجتماعية، بنها',
    shortName: 'شارع الخدمة الاجتماعية',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.464,
    lng: 31.187,
    type: 'شارع',
    distanceKm: 0.3,
    aliases: ['الخدمة الاجتماعية', 'معهد الخدمة الاجتماعية'],
  },
  {
    name: 'شارع مجلس المدينة والمرور، بنها',
    shortName: 'شارع مجلس المدينة',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.473,
    lng: 31.178,
    type: 'شارع حكومي',
    distanceKm: 1.0,
    aliases: ['مرور بنها', 'شارع المرور', 'مجلس مدينة بنها'],
  },
  {
    name: 'شارع الرياح التوفيقي (خط 12)، بنها',
    shortName: 'الرياح التوفيقي',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.455,
    lng: 31.193,
    type: 'طريق رئيسي',
    distanceKm: 1.4,
    aliases: ['خط 12', 'كورنيش الرياح التوفيقي', 'طريق خط 12'],
  },
  {
    name: 'شارع الشبان المسلمين، بنها',
    shortName: 'شارع الشبان',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.467,
    lng: 31.18,
    type: 'شارع',
    distanceKm: 0.5,
    aliases: ['ميدان الشبان', 'الشبان بنها'],
  },
  {
    name: 'شارع المحطة والسكة الحديد، بنها',
    shortName: 'شارع المحطة',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.458,
    lng: 31.188,
    type: 'شارع رئيسي',
    distanceKm: 0.9,
    aliases: ['شارع المحطه', 'السكة الحديد'],
  },
  {
    name: 'شارع البوسطة / البريد العمومي، بنها',
    shortName: 'شارع البوسطة',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.461,
    lng: 31.186,
    type: 'شارع',
    distanceKm: 0.6,
    aliases: ['البوسطة بنها', 'شارع البريد'],
  },
  {
    name: 'شارع الإسعاف، بنها',
    shortName: 'شارع الإسعاف',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.462,
    lng: 31.186,
    type: 'شارع',
    distanceKm: 0.5,
    aliases: ['ميدان الإسعاف'],
  },
  {
    name: 'شارع النجدة، بنها',
    shortName: 'شارع النجدة',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.474,
    lng: 31.179,
    type: 'شارع',
    distanceKm: 1.1,
    aliases: ['نجدة بنها'],
  },
  {
    name: 'عزبة السوق، بنها',
    shortName: 'عزبة السوق',
    city: 'عزبة السوق',
    gov: 'Qalyubia',
    lat: 30.458,
    lng: 31.192,
    type: 'منطقة',
    distanceKm: 1.2,
  },
  {
    name: 'عزبة المربع، بنها',
    shortName: 'عزبة المربع',
    city: 'عزبة المربع',
    gov: 'Qalyubia',
    lat: 30.454,
    lng: 31.187,
    type: 'منطقة',
    distanceKm: 1.3,
  },
  {
    name: 'نادي بنها الرياضي، كورنيش النيل بنها',
    shortName: 'نادي بنها',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.465,
    lng: 31.177,
    type: 'نادي رياضي',
    distanceKm: 0.9,
    aliases: ['نادي بنها الرياضي', 'استاد بنها القديم'],
  },
  {
    name: 'نادي المعلمين ونقابة المهندسين، الفلل بنها',
    shortName: 'نادي المعلمين',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.473,
    lng: 31.174,
    type: 'نادي / نقابة',
    distanceKm: 1.3,
    aliases: ['نقابة المهندسين بنها', 'نادي المهندسين'],
  },
  {
    name: 'نادي التجديف وضباط الشرطة، كورنيش النيل بنها',
    shortName: 'نادي التجديف',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.471,
    lng: 31.173,
    type: 'نادي',
    distanceKm: 1.3,
    aliases: ['نادي الشرطة بنها', 'نادي التجديف بنها'],
  },
  {
    name: 'حديقة صنعاء وحديقة الأمل، بنها',
    shortName: 'حديقة الأمل',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.468,
    lng: 31.174,
    type: 'حديقة عامة',
    distanceKm: 1.1,
    aliases: ['حديقة صنعاء', 'حديقة الامل'],
  },
  {
    name: 'شارع السلام وترعة السلام، بنها',
    shortName: 'شارع السلام',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.467,
    lng: 31.191,
    type: 'شارع',
    distanceKm: 0.6,
    aliases: ['ترعة السلام بنها'],
  },
  {
    name: 'موقف كفر الجزار وبطا، بنها',
    shortName: 'موقف كفر الجزار وبطا',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.468,
    lng: 31.172,
    type: 'موقف سيارات',
    distanceKm: 1.3,
    aliases: ['موقف بطا', 'موقف كفر الجزار'],
  },
  {
    name: 'موقف شبلنجة والشموت، بنها',
    shortName: 'موقف شبلنجة',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.452,
    lng: 31.193,
    type: 'موقف سيارات',
    distanceKm: 1.7,
    aliases: ['موقف الشموت'],
  },
  {
    name: 'كوبري 15 مايو، بنها',
    shortName: 'كوبري 15 مايو',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.462,
    lng: 31.189,
    type: 'كوبري',
    distanceKm: 0.8,
  },
  {
    name: 'ميت عاصم، بنها',
    shortName: 'ميت عاصم',
    city: 'ميت عاصم',
    gov: 'Qalyubia',
    lat: 30.448,
    lng: 31.22,
    type: 'قرية',
    distanceKm: 3.8,
  },
  {
    name: 'نقباس، بنها',
    shortName: 'نقباس',
    city: 'نقباس',
    gov: 'Qalyubia',
    lat: 30.435,
    lng: 31.215,
    type: 'قرية',
    distanceKm: 4.5,
  },
  {
    name: 'ميت الحوفيين، بنها',
    shortName: 'ميت الحوفيين',
    city: 'ميت الحوفيين',
    gov: 'Qalyubia',
    lat: 30.495,
    lng: 31.17,
    type: 'قرية',
    distanceKm: 4.0,
  },
  {
    name: 'بتمدة، بنها',
    shortName: 'بتمدة',
    city: 'بتمدة',
    gov: 'Qalyubia',
    lat: 30.42,
    lng: 31.24,
    type: 'قرية',
    distanceKm: 6.0,
  },
  {
    name: 'كفر عطا الله، بنها',
    shortName: 'كفر عطا الله',
    city: 'كفر عطا الله',
    gov: 'Qalyubia',
    lat: 30.47,
    lng: 31.225,
    type: 'قرية',
    distanceKm: 4.0,
  },
  {
    name: 'باسوس، القناطر الخيرية',
    shortName: 'باسوس',
    city: 'القناطر الخيرية',
    gov: 'Qalyubia',
    lat: 30.14,
    lng: 31.19,
    type: 'قرية / منطقة',
    distanceKm: 33.0,
  },
  {
    name: 'الخرقانية، القناطر الخيرية',
    shortName: 'الخرقانية',
    city: 'القناطر الخيرية',
    gov: 'Qalyubia',
    lat: 30.17,
    lng: 31.16,
    type: 'قرية',
    distanceKm: 31.0,
  },
  {
    name: 'طنان، قليوب',
    shortName: 'طنان',
    city: 'قليوب',
    gov: 'Qalyubia',
    lat: 30.22,
    lng: 31.23,
    type: 'قرية',
    distanceKm: 24.0,
  },
  {
    name: 'كوم أشفين، قليوب',
    shortName: 'كوم أشفين',
    city: 'قليوب',
    gov: 'Qalyubia',
    lat: 30.17,
    lng: 31.24,
    type: 'قرية',
    distanceKm: 28.0,
  },
  {
    name: 'القلج، الخانكة',
    shortName: 'القلج',
    city: 'الخانكة',
    gov: 'Qalyubia',
    lat: 30.16,
    lng: 31.33,
    type: 'منطقة',
    distanceKm: 34.0,
  },
  {
    name: 'كفر حمزة، الخانكة',
    shortName: 'كفر حمزة',
    city: 'الخانكة',
    gov: 'Qalyubia',
    lat: 30.23,
    lng: 31.32,
    type: 'قرية',
    distanceKm: 30.0,
  },
  {
    name: 'شارع ترعة الإشارة، بنها',
    shortName: 'ترعة الإشارة',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.465,
    lng: 31.189,
    type: 'شارع',
    distanceKm: 0.4,
  },
  {
    name: 'منطقة الأبراج، بنها',
    shortName: 'الأبراج بنها',
    city: 'بنها',
    gov: 'Qalyubia',
    lat: 30.469,
    lng: 31.187,
    type: 'منطقة سكنية',
    distanceKm: 0.5,
  },
  {
    name: 'منطقة الزهور، بنها',
    shortName: 'الزهور',
    city: 'الزهور',
    gov: 'Qalyubia',
    lat: 30.471,
    lng: 31.186,
    type: 'منطقة سكنية',
    distanceKm: 0.6,
    aliases: ['الزهور', 'حي الزهور'],
  },
  {
    name: 'منشية النور، بنها',
    shortName: 'منشية النور',
    city: 'منشية النور',
    gov: 'Qalyubia',
    lat: 30.453,
    lng: 31.192,
    type: 'حي',
    distanceKm: 1.6,
  },
  {
    name: 'الحرس الوطني، بنها',
    shortName: 'الحرس الوطني',
    city: 'الحرس الوطني',
    gov: 'Qalyubia',
    lat: 30.45,
    lng: 31.196,
    type: 'حي',
    distanceKm: 2.0,
    aliases: ['الحرس بنها'],
  },
  {
    name: 'منشية الحرية، بنها',
    shortName: 'منشية الحرية',
    city: 'منشية الحرية',
    gov: 'Qalyubia',
    lat: 30.456,
    lng: 31.195,
    type: 'حي',
    distanceKm: 1.5,
  },
  {
    name: 'أتريب، بنها',
    shortName: 'أتريب',
    city: 'أتريب',
    gov: 'Qalyubia',
    lat: 30.475,
    lng: 31.185,
    type: 'حي / منطقة',
    distanceKm: 1.0,
    aliases: ['اتريب', 'تل اتريب'],
  },
  {
    name: 'نصف أتريب، بنها',
    shortName: 'نصف أتريب',
    city: 'نصف أتريب',
    gov: 'Qalyubia',
    lat: 30.472,
    lng: 31.184,
    type: 'منطقة',
    distanceKm: 0.8,
  },

  // ── قرى ومناطق مركز بنها ──
  {
    name: 'كفر أبو زكري، بنها',
    shortName: 'كفر ابوزكري',
    city: 'كفر ابوزكري',
    gov: 'Qalyubia',
    lat: 30.481,
    lng: 31.173,
    type: 'قرية / منطقة',
    distanceKm: 2.3,
    aliases: ['كفر الوزكري', 'كفر ابو ذكري', 'كفر ابوزكري', 'ابو ذكري', 'الوزكري'],
  },
  {
    name: 'كفر الجزار، بنها',
    shortName: 'كفر الجزار',
    city: 'كفر الجزار',
    gov: 'Qalyubia',
    lat: 30.474,
    lng: 31.171,
    type: 'قرية / منطقة',
    distanceKm: 2.5,
    aliases: ['كفرالجزار', 'الجزار بنها'],
  },
  {
    name: 'بطا، بنها',
    shortName: 'بطا',
    city: 'بطا',
    gov: 'Qalyubia',
    lat: 30.485,
    lng: 31.16,
    type: 'قرية',
    distanceKm: 1.5,
    aliases: ['قرية بطا'],
  },
  {
    name: 'بقيرة، بنها',
    shortName: 'بقيرة',
    city: 'بقيرة',
    gov: 'Qalyubia',
    lat: 30.495,
    lng: 31.15,
    type: 'قرية',
    distanceKm: 5.0,
    aliases: ['بقيره'],
  },
  {
    name: 'كفر سعد، بنها',
    shortName: 'كفر سعد',
    city: 'كفر سعد',
    gov: 'Qalyubia',
    lat: 30.479,
    lng: 31.168,
    type: 'قرية',
    distanceKm: 3.6,
    aliases: ['كفرسعد'],
  },
  {
    name: 'كفر بطا، بنها',
    shortName: 'كفر بطا',
    city: 'كفر بطا',
    gov: 'Qalyubia',
    lat: 30.49,
    lng: 31.155,
    type: 'قرية',
    distanceKm: 4.0,
  },
  {
    name: 'كفر مناقر، بنها',
    shortName: 'كفر مناقر',
    city: 'كفر مناقر',
    gov: 'Qalyubia',
    lat: 30.454,
    lng: 31.179,
    type: 'منطقة',
    distanceKm: 1.3,
    aliases: ['كفرمناقر', 'مناقر'],
  },
  {
    name: 'كفر الأربعين، بنها',
    shortName: 'كفر الأربعين',
    city: 'كفر الأربعين',
    gov: 'Qalyubia',
    lat: 30.505,
    lng: 31.165,
    type: 'قرية',
    distanceKm: 5.4,
  },
  {
    name: 'كفر فرسيس، بنها',
    shortName: 'كفر فرسيس',
    city: 'كفر فرسيس',
    gov: 'Qalyubia',
    lat: 30.51,
    lng: 31.17,
    type: 'قرية',
    distanceKm: 5.7,
  },
  {
    name: 'ميت العطار، بنها',
    shortName: 'ميت العطار',
    city: 'ميت العطار',
    gov: 'Qalyubia',
    lat: 30.44,
    lng: 31.21,
    type: 'قرية',
    distanceKm: 3.5,
  },
  {
    name: 'طحلة، بنها',
    shortName: 'طحلة',
    city: 'طحلة',
    gov: 'Qalyubia',
    lat: 30.49,
    lng: 31.21,
    type: 'قرية',
    distanceKm: 4.5,
  },
  {
    name: 'دملو، بنها',
    shortName: 'دملو',
    city: 'دملو',
    gov: 'Qalyubia',
    lat: 30.485,
    lng: 31.195,
    type: 'قرية',
    distanceKm: 3.0,
  },
  {
    name: 'ورورة، بنها',
    shortName: 'ورورة',
    city: 'ورورة',
    gov: 'Qalyubia',
    lat: 30.48,
    lng: 31.185,
    type: 'قرية',
    distanceKm: 2.0,
  },
  {
    name: 'شبلنجة، بنها',
    shortName: 'شبلنجة',
    city: 'شبلنجة',
    gov: 'Qalyubia',
    lat: 30.43,
    lng: 31.24,
    type: 'قرية',
    distanceKm: 6.5,
  },
  {
    name: 'سندنهور، بنها',
    shortName: 'سندنهور',
    city: 'سندنهور',
    gov: 'Qalyubia',
    lat: 30.45,
    lng: 31.22,
    type: 'قرية',
    distanceKm: 4.0,
  },
  {
    name: 'الرملة، بنها',
    shortName: 'الرملة',
    city: 'الرملة',
    gov: 'Qalyubia',
    lat: 30.46,
    lng: 31.205,
    type: 'قرية',
    distanceKm: 2.5,
  },
  {
    name: 'ميت راضي، بنها',
    shortName: 'ميت راضي',
    city: 'ميت راضي',
    gov: 'Qalyubia',
    lat: 30.47,
    lng: 31.2,
    type: 'قرية',
    distanceKm: 2.0,
  },
  {
    name: 'مرصفا، بنها',
    shortName: 'مرصفا',
    city: 'مرصفا',
    gov: 'Qalyubia',
    lat: 30.41,
    lng: 31.215,
    type: 'قرية',
    distanceKm: 7.0,
  },
  {
    name: 'كفر الحصة، بنها',
    shortName: 'كفر الحصة',
    city: 'كفر الحصة',
    gov: 'Qalyubia',
    lat: 30.435,
    lng: 31.19,
    type: 'قرية',
    distanceKm: 3.5,
  },
  {
    name: 'الشموت، بنها',
    shortName: 'الشموت',
    city: 'الشموت',
    gov: 'Qalyubia',
    lat: 30.445,
    lng: 31.17,
    type: 'قرية',
    distanceKm: 2.8,
  },
  {
    name: 'جمجرة، بنها',
    shortName: 'جمجرة',
    city: 'جمجرة',
    gov: 'Qalyubia',
    lat: 30.505,
    lng: 31.2,
    type: 'قرية',
    distanceKm: 5.0,
  },
  {
    name: 'كفر مويس، بنها',
    shortName: 'كفر مويس',
    city: 'كفر مويس',
    gov: 'Qalyubia',
    lat: 30.43,
    lng: 31.175,
    type: 'قرية',
    distanceKm: 4.2,
  },
  {
    name: 'كفر الشيخ إبراهيم، بنها',
    shortName: 'كفر الشيخ إبراهيم',
    city: 'كفر الشيخ إبراهيم',
    gov: 'Qalyubia',
    lat: 30.44,
    lng: 31.225,
    type: 'قرية',
    distanceKm: 5.0,
  },
  {
    name: 'ميت كنانة، طوخ',
    shortName: 'ميت كنانة',
    city: 'ميت كنانة',
    gov: 'Qalyubia',
    lat: 30.385,
    lng: 31.22,
    type: 'قرية',
    distanceKm: 8.5,
  },

  // ── مدن ومراكز القليوبية الكبرى (مع مسافاتها الحقيقية من بنها) ──
  {
    name: 'شبرا الخيمة (قسم أول وثان)',
    shortName: 'شبرا الخيمة',
    city: 'شبرا الخيمة',
    gov: 'Qalyubia',
    lat: 30.128,
    lng: 31.242,
    type: 'مدينة كبرى',
    distanceKm: 38.0,
    aliases: ['شبرا', 'شبرا الخيمه', 'قسم اول شبرا', 'قسم ثان شبرا'],
  },
  {
    name: 'شارع 15 مايو، شبرا الخيمة',
    shortName: '15 مايو شبرا',
    city: 'شبرا الخيمة',
    gov: 'Qalyubia',
    lat: 30.131,
    lng: 31.25,
    type: 'شارع رئيسي',
    distanceKm: 38.0,
  },
  {
    name: 'ميدان المؤسسة، شبرا الخيمة',
    shortName: 'ميدان المؤسسة',
    city: 'شبرا الخيمة',
    gov: 'Qalyubia',
    lat: 30.118,
    lng: 31.253,
    type: 'ميدان رئيسي',
    distanceKm: 39.0,
  },
  {
    name: 'بهتيم، شبرا الخيمة',
    shortName: 'بهتيم',
    city: 'شبرا الخيمة',
    gov: 'Qalyubia',
    lat: 30.138,
    lng: 31.272,
    type: 'منطقة',
    distanceKm: 37.0,
  },
  {
    name: 'مسطرد، شبرا الخيمة',
    shortName: 'مسطرد',
    city: 'شبرا الخيمة',
    gov: 'Qalyubia',
    lat: 30.125,
    lng: 31.305,
    type: 'منطقة',
    distanceKm: 39.0,
  },
  {
    name: 'بيجام، شبرا الخيمة',
    shortName: 'بيجام',
    city: 'شبرا الخيمة',
    gov: 'Qalyubia',
    lat: 30.135,
    lng: 31.24,
    type: 'منطقة',
    distanceKm: 37.5,
  },
  {
    name: 'طوخ، القليوبية',
    shortName: 'طوخ',
    city: 'طوخ',
    gov: 'Qalyubia',
    lat: 30.355,
    lng: 31.198,
    type: 'مدينة / مركز',
    distanceKm: 11.0,
    aliases: ['مركز طوخ', 'مدينة طوخ'],
  },
  {
    name: 'مشتهر، طوخ',
    shortName: 'مشتهر',
    city: 'طوخ',
    gov: 'Qalyubia',
    lat: 30.37,
    lng: 31.21,
    type: 'قرية / كليات',
    distanceKm: 9.5,
  },
  {
    name: 'العمار الكبرى، طوخ',
    shortName: 'العمار الكبرى',
    city: 'طوخ',
    gov: 'Qalyubia',
    lat: 30.34,
    lng: 31.18,
    type: 'قرية',
    distanceKm: 13.0,
  },
  {
    name: 'الدير، طوخ',
    shortName: 'الدير',
    city: 'طوخ',
    gov: 'Qalyubia',
    lat: 30.36,
    lng: 31.22,
    type: 'قرية',
    distanceKm: 11.5,
  },
  {
    name: 'بلتان، طوخ',
    shortName: 'بلتان',
    city: 'طوخ',
    gov: 'Qalyubia',
    lat: 30.38,
    lng: 31.2,
    type: 'قرية',
    distanceKm: 9.0,
  },
  {
    name: 'قها، القليوبية',
    shortName: 'قها',
    city: 'قها',
    gov: 'Qalyubia',
    lat: 30.285,
    lng: 31.205,
    type: 'مدينة',
    distanceKm: 16.0,
    aliases: ['مدينة قها'],
  },
  {
    name: 'سنهرة، قها',
    shortName: 'سنهرة',
    city: 'قها',
    gov: 'Qalyubia',
    lat: 30.295,
    lng: 31.195,
    type: 'قرية',
    distanceKm: 15.0,
  },
  {
    name: 'قليوب، القليوبية',
    shortName: 'قليوب',
    city: 'قليوب',
    gov: 'Qalyubia',
    lat: 30.18,
    lng: 31.208,
    type: 'مدينة / مركز',
    distanceKm: 30.0,
    aliases: ['مدينة قليوب', 'مركز قليوب'],
  },
  {
    name: 'سنديون، قليوب',
    shortName: 'سنديون',
    city: 'قليوب',
    gov: 'Qalyubia',
    lat: 30.21,
    lng: 31.215,
    type: 'قرية',
    distanceKm: 26.0,
  },
  {
    name: 'ميت حلفا، قليوب',
    shortName: 'ميت حلفا',
    city: 'قليوب',
    gov: 'Qalyubia',
    lat: 30.155,
    lng: 31.23,
    type: 'قرية',
    distanceKm: 33.0,
  },
  {
    name: 'كفر شكر، القليوبية',
    shortName: 'كفر شكر',
    city: 'كفر شكر',
    gov: 'Qalyubia',
    lat: 30.55,
    lng: 31.27,
    type: 'مدينة / مركز',
    distanceKm: 18.0,
    aliases: ['كفرشكر', 'مركز كفر شكر'],
  },
  {
    name: 'البقاشين، كفر شكر',
    shortName: 'البقاشين',
    city: 'كفر شكر',
    gov: 'Qalyubia',
    lat: 30.53,
    lng: 31.25,
    type: 'قرية',
    distanceKm: 14.0,
  },
  {
    name: 'اسنيت، كفر شكر',
    shortName: 'اسنيت',
    city: 'كفر شكر',
    gov: 'Qalyubia',
    lat: 30.56,
    lng: 31.28,
    type: 'قرية',
    distanceKm: 19.5,
  },
  {
    name: 'القناطر الخيرية، القليوبية',
    shortName: 'القناطر الخيرية',
    city: 'القناطر الخيرية',
    gov: 'Qalyubia',
    lat: 30.19,
    lng: 31.135,
    type: 'مدينة سياحية',
    distanceKm: 34.0,
    aliases: ['القناطر', 'حدائق القناطر'],
  },
  {
    name: 'أبو الغيط، القناطر',
    shortName: 'أبو الغيط',
    city: 'القناطر الخيرية',
    gov: 'Qalyubia',
    lat: 30.165,
    lng: 31.16,
    type: 'قرية',
    distanceKm: 35.0,
  },
  {
    name: 'الخانكة، القليوبية',
    shortName: 'الخانكة',
    city: 'الخانكة',
    gov: 'Qalyubia',
    lat: 30.215,
    lng: 31.368,
    type: 'مدينة / مركز',
    distanceKm: 36.0,
  },
  {
    name: 'أبو زعبل، الخانكة',
    shortName: 'أبو زعبل',
    city: 'الخانكة',
    gov: 'Qalyubia',
    lat: 30.24,
    lng: 31.345,
    type: 'منطقة',
    distanceKm: 32.0,
  },
  {
    name: 'سرياقوس، الخانكة',
    shortName: 'سرياقوس',
    city: 'الخانكة',
    gov: 'Qalyubia',
    lat: 30.18,
    lng: 31.34,
    type: 'قرية',
    distanceKm: 36.0,
  },
  {
    name: 'الخصوص، القليوبية',
    shortName: 'الخصوص',
    city: 'الخصوص',
    gov: 'Qalyubia',
    lat: 30.145,
    lng: 31.318,
    type: 'مدينة',
    distanceKm: 37.0,
    aliases: ['شارع الرشاح الخصوص', 'دائري الخصوص'],
  },
  {
    name: 'مدينة العبور، القليوبية',
    shortName: 'مدينة العبور',
    city: 'العبور',
    gov: 'Qalyubia',
    lat: 30.22,
    lng: 31.46,
    type: 'مدينة جديدة',
    distanceKm: 45.0,
    aliases: ['العبور', 'الحي الاول العبور', 'اسكان الشباب العبور', 'كارفور العبور'],
  },

  // ── القاهرة الكبرى ──
  {
    name: 'شبرا مصر، القاهرة',
    shortName: 'شبرا مصر',
    city: 'شبرا مصر',
    gov: 'Cairo',
    lat: 30.082,
    lng: 31.245,
    type: 'حي شهير',
    distanceKm: 44.0,
    aliases: ['شارع شبرا', 'دوران شبرا', 'روض الفرج', 'مسرة'],
  },
  {
    name: 'ميدان رمسيس، القاهرة',
    shortName: 'رمسيس',
    city: 'القاهرة',
    gov: 'Cairo',
    lat: 30.063,
    lng: 31.248,
    type: 'وسط البلد',
    distanceKm: 46.0,
  },
  {
    name: 'مدينة نصر، القاهرة',
    shortName: 'مدينة نصر',
    city: 'مدينة نصر',
    gov: 'Cairo',
    lat: 30.055,
    lng: 31.335,
    type: 'مدينة',
    distanceKm: 50.0,
  },
  {
    name: 'مصر الجديدة، القاهرة',
    shortName: 'مصر الجديدة',
    city: 'مصر الجديدة',
    gov: 'Cairo',
    lat: 30.09,
    lng: 31.325,
    type: 'حي',
    distanceKm: 46.0,
  },
];

/** Cache of dynamic areas fetched from backend delivery_rates */
let dynamicDbAreas = null;
let dynamicFetchPromise = null;

async function loadDynamicAreas() {
  if (dynamicDbAreas) return dynamicDbAreas;
  if (dynamicFetchPromise) return dynamicFetchPromise;
  dynamicFetchPromise = fetch('/api/marketplace/delivery-areas')
    .then((r) => (r.ok ? r.json() : { areas: [] }))
    .then((data) => {
      dynamicDbAreas = (data.areas || []).map((a) => ({
        name: `${a.city}، ${a.governorate}`,
        shortName: a.city,
        city: a.city,
        gov: a.governorate,
        lat: BANHA_COORDS[0] + (a.distanceKm ? a.distanceKm * 0.007 : 0),
        lng: BANHA_COORDS[1] + (a.distanceKm ? a.distanceKm * 0.007 : 0),
        type: 'منطقة مسجلة',
        distanceKm: a.distanceKm,
        fee: a.fee,
        isDbArea: true,
      }));
      return dynamicDbAreas;
    })
    .catch(() => []);
  return dynamicFetchPromise;
}

/**
 * Smart search combining:
 * 1. Curated local database (instant, high accuracy for Banha streets/colleges).
 * 2. Dynamic areas registered in delivery_rates database.
 * 3. Nominatim OpenStreetMap API (for broader places in Egypt).
 */
export async function searchEgyptianPlaces(query, signal) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  const normQ = normalizeArabic(q)
    .replace(/^(شارع|حي|منطقة|كلية|ميدان|مدينة|مسجد|كفر|عزبة|مستشفى)\s+/g, '') // strip prefix
    .trim();

  // 1. Search local curated places first (checking name, shortName, city, and aliases)
  const localMatches = CURATED_PLACES.filter((p) => {
    const normName = normalizeArabic(p.name);
    const normShort = normalizeArabic(p.shortName);
    const normCity = normalizeArabic(p.city);
    const inAliases = (p.aliases || []).some((al) => {
      const normAl = normalizeArabic(al);
      return normAl.includes(normQ) || normQ.includes(normAl);
    });

    return (
      inAliases ||
      normName.includes(normQ) ||
      normShort.includes(normQ) ||
      normCity.includes(normQ) ||
      (normQ.length >= 3 && normShort.includes(normQ)) ||
      (normQ.length >= 3 && normName.includes(normQ))
    );
  }).map((p) => ({
    name: p.name,
    shortName: p.shortName,
    city: p.city,
    gov: p.gov,
    lat: p.lat,
    lng: p.lng,
    type: p.type,
    distanceKm: p.distanceKm != null ? p.distanceKm : calcDistanceKm(p.lat, p.lng),
    isLocal: true,
  }));

  // 2. Search dynamic database areas
  const dbAreas = await loadDynamicAreas();
  const dbMatches = (dbAreas || []).filter((a) => {
    const normCity = normalizeArabic(a.city);
    return normCity.includes(normQ) || normQ.includes(normCity);
  });

  // 3. Fetch from Nominatim as well (for anywhere else in Egypt)
  let osmRows = [];
  try {
    const common = `format=jsonv2&limit=5&countrycodes=eg&accept-language=ar&q=${encodeURIComponent(q)}`;
    const url = `https://nominatim.openstreetmap.org/search?${common}`;
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      osmRows = data.map((r) => {
        const lat = +r.lat;
        const lng = +r.lon;
        const parts = (r.display_name || '').split(',');
        return {
          name: r.display_name,
          shortName: parts[0]?.trim() || q,
          city: parts[1]?.trim() || parts[0]?.trim() || '',
          gov: '',
          lat,
          lng,
          type: r.type || 'مكان',
          distanceKm: calcDistanceKm(lat, lng),
          isLocal: false,
        };
      });
    }
  } catch {
    // ignore network / abort error
  }

  // Combine and deduplicate
  const combined = [...localMatches];
  for (const db of dbMatches) {
    if (!combined.some((c) => normalizeArabic(c.shortName) === normalizeArabic(db.shortName))) {
      combined.push(db);
    }
  }
  for (const r of osmRows) {
    const isDup = combined.some(
      (c) => Math.abs(c.lat - r.lat) < 0.005 && Math.abs(c.lng - r.lng) < 0.005
    );
    if (!isDup) combined.push(r);
  }

  return combined;
}

/** Find the nearest curated place to given lat/lng */
export function findNearestPlace(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let closest = null;
  let minDistance = Infinity;
  for (const place of CURATED_PLACES) {
    const dist = calcDistanceKm(lat, lng, [place.lat, place.lng]);
    if (dist < minDistance) {
      minDistance = dist;
      closest = place;
    }
  }
  return closest ? { ...closest, distanceToTargetKm: Math.round(minDistance * 10) / 10 } : null;
}

/** Get curated places within a given radius in km */
export function getCuratedPlacesNearby(lat, lng, radiusKm = 5) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  return CURATED_PLACES.map((p) => ({
    ...p,
    distanceToCenterKm: calcDistanceKm(lat, lng, [p.lat, p.lng]),
  }))
    .filter((p) => p.distanceToCenterKm <= radiusKm)
    .sort((a, b) => a.distanceToCenterKm - b.distanceToCenterKm);
}

/**
 * High-accuracy reverse geocode combining:
 * 1. Nearest curated local place (instant, handles Egyptian villages & streets OSM misses).
 * 2. Nominatim reverse geocode (handles streets anywhere else in Egypt).
 */
export async function smartReverseGeocode(lat, lng) {
  const nearest = findNearestPlace(lat, lng);
  let osmData = null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ar`
    );
    if (res.ok) osmData = await res.json();
  } catch {
    // network failure / timeout
  }

  const addr = osmData?.address || {};
  const osmRoad = addr.road || addr.pedestrian || addr.suburb || addr.neighbourhood || '';
  const osmCity = addr.city || addr.town || addr.village || addr.county || '';
  const osmGov = addr.state || 'القليوبية';

  const isCloseLandmark = nearest && nearest.distanceToTargetKm <= 0.5;
  const isNearbyVillage =
    nearest &&
    nearest.distanceToTargetKm <= 1.2 &&
    (nearest.type?.includes('قرية') || nearest.type?.includes('حي') || nearest.type?.includes('منطقة'));

  let primaryName = '';
  let secondaryName = '';
  let detectedCity = '';

  if (isCloseLandmark) {
    primaryName = nearest.shortName;
    secondaryName = osmRoad ? `${osmRoad}، بالقرب من ${nearest.shortName}` : nearest.name;
    detectedCity = nearest.city || osmCity || 'بنها';
  } else if (isNearbyVillage) {
    primaryName = nearest.shortName;
    secondaryName = osmRoad ? `${osmRoad}، ${nearest.shortName}` : nearest.name;
    detectedCity = nearest.city || osmCity || 'بنها';
  } else if (osmRoad) {
    primaryName = osmRoad;
    secondaryName = osmData?.display_name?.split(',').slice(0, 3).join('، ') || osmRoad;
    detectedCity = osmCity || (nearest?.distanceToTargetKm <= 4 ? nearest.city : 'بنها');
  } else if (nearest && nearest.distanceToTargetKm <= 2.5) {
    primaryName = `بالقرب من ${nearest.shortName}`;
    secondaryName = nearest.name;
    detectedCity = nearest.city || osmCity || 'بنها';
  } else {
    primaryName = osmCity || 'موقع محدد على الخريطة';
    secondaryName = osmData?.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    detectedCity = osmCity || 'القليوبية';
  }

  return {
    primaryName,
    secondaryName,
    city: detectedCity,
    gov: osmGov,
    lat,
    lng,
    nearestLandmark: nearest?.name || null,
    nearestDistanceKm: nearest?.distanceToTargetKm || null,
    distanceFromBanhaKm: calcDistanceKm(lat, lng),
    rawOsm: osmData,
  };
}

/** Featured landmarks for quick on-map chips */
export const QUICK_MAP_LANDMARKS = [
  { name: 'كلية التجارة', lat: 30.4688, lng: 31.1824, type: 'جامعة' },
  { name: 'شارع الكوبري', lat: 30.4635, lng: 31.181, type: 'شارع' },
  { name: 'شارع فريد ندا', lat: 30.466, lng: 31.185, type: 'شارع' },
  { name: 'الفلل', lat: 30.472, lng: 31.176, type: 'منطقة' },
  { name: 'عزبة الزراعة', lat: 30.448, lng: 31.198, type: 'ميدان' },
  { name: 'مسجد الخضر', lat: 30.4735, lng: 31.182, type: 'معلم' },
  { name: 'كفر أبو زكري', lat: 30.481, lng: 31.173, type: 'قرية' },
  { name: 'بطا', lat: 30.485, lng: 31.16, type: 'قرية' },
  { name: 'بقيرة', lat: 30.495, lng: 31.15, type: 'قرية' },
  { name: 'كفر الجزار', lat: 30.474, lng: 31.171, type: 'قرية' },
  { name: 'كفر سعد', lat: 30.479, lng: 31.168, type: 'قرية' },
  { name: 'طوخ', lat: 30.355, lng: 31.198, type: 'مدينة' },
  { name: 'شبرا الخيمة', lat: 30.128, lng: 31.242, type: 'مدينة' },
];
