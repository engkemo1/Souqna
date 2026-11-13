/**
 * إثراء إطلالات تويلا برؤية الستايلست المحترف:
 * 1. شرح تناسق الألوان وسر الشياكة (Color Harmony & Style Reasoning).
 * 2. نصائح ذكية للمقاس والقصة والخامة (Smart Fit, Sizing & Fabric Tips).
 */
import { norm } from './text.js';

/**
 * تحليل وتفسير تناسق الألوان والستايل بأسلوب ستايلست مصري أنيق
 */
export function generateColorHarmonyInsight(palette = [], context = null, couple = false, pickCount = 0) {
  const pSet = new Set(palette.map((c) => String(c).toLowerCase()));

  if (couple) {
    return 'الألوان متناسقة بين الإطلالتين بتناغم هادي وشيك، عشان تظهروا مع بعض متطابقين بذوق عالي وبدون تكرار ممل.';
  }

  // كحلي + بني/هافان/جملي
  if (pSet.has('navy') && (pSet.has('brown') || pSet.has('camel') || pSet.has('tan') || pSet.has('beige'))) {
    return 'الكحلي مع درجات الهافان والجلد الطبيعي ميكس كلاسيكي فخم بيدي كونتراست راقي ومريح جداً للعين.';
  }

  // أسود + أبيض (رسمي حاسم)
  if (pSet.has('black') && pSet.has('white')) {
    if (context === 'wedding_guest' || context === 'engagement_guest' || context === 'formal') {
      return 'الأبيض مع الأسود قمة الشياكة الرسمية الحاسمة؛ بيدي هيبة وأناقة عالية للمناسبات المسائية.';
    }
    return 'الأبيض مع الأسود تباين نقي وشيك جداً، بيدي لوك محدد ومظهر مرتب ونظيف.';
  }

  // درجات ترابية (بيج / زيتي / هافان / أوف وايت)
  const earthCount = ['beige', 'brown', 'camel', 'olive', 'khaki', 'offwhite', 'cream'].filter((c) => pSet.has(c)).length;
  if (earthCount >= 2) {
    return 'تناغم الدرجات الترابية الهادية بيدي لوك مودرن راقي ومريح، ومثالي جداً للخروجات النهارية والستايل الرايق.';
  }

  // مونوكروم (أسود كامل، رمادي كامل، كحلي كامل)
  if (pSet.size === 1 && pickCount >= 2) {
    const single = [...pSet][0];
    if (single === 'black') return 'الستايل المونوكروم بالأسود بالكامل قمة الفخامة والغموض والشياكة، وبيخلي القوام يبان أرشق.';
    if (single === 'navy') return 'اللوك الكحلي بالكامل بيدي طابع ملكي هادي وأنيق يناسب المقابلات والمناسبات.';
    return 'الستايل المونوكروم المتناسق بيدي إحساساً بالفخامة والترتيب ويوحّد اللوك بشكل جذاب.';
  }

  // درجات عميقة (نبيتي / زيتي / أزرق ملكي)
  if (pSet.has('burgundy') || pSet.has('emerald') || pSet.has('maroon')) {
    return 'الدرجات العميقة دي بتكسر الروتين وبتضيف لمسة فخامة دافية ومميزة جداً للإطلالة.';
  }

  // ألوان باستيل أو فاتحة
  const pastelCount = ['baby_blue', 'light_blue', 'pink', 'lavender', 'mint', 'peach', 'white'].filter((c) => pSet.has(c)).length;
  if (pastelCount >= 2 && pastelCount === pSet.size) {
    return 'الألوان الفاتحة بتعكس إشراقة وانتعاش وأناقة هادية، ومثالية للمناسبات واللقاءات الصباحية.';
  }

  return null; // مفيش جملة نقولها غير لو الألوان فعلًا بتثبتها
}

/**
 * استخراج نصيحة ذكية للمقاس والقصة والخامة بناءً على اسم ومواصفات المنتج
 */
export function generateFitAndSizingTip(product) {
  if (!product) return null;
  const name = norm(product.name_ar || product.name_en || '');
  const cat = norm(product.cat_text || '');
  const mat = norm(product.material_ar || '');
  const full = `${name} ${cat} ${mat}`;

  // 1. سليم فيت
  if (/(سليم|مجسم|slim)/.test(full)) {
    return 'قصّة سليم فيت مجسمة؛ لو بتفضل المقاس المرتاح أو محتار بين مقاسين اختار الأكبر نمرة.';
  }

  // 2. أوفرسايز / واسع
  if (/(اوفر سايز|اوفرسايز|واسع|فضفاض|oversize|relaxed)/.test(full)) {
    return 'قصّة أوفرسايز تريندي واسعة؛ اختار مقاسك المعتاد للستايل الواسع، أو أصغر نمرة لمقاس مضبوط.';
  }

  // 3. ليكرا / مطاطي / استريتش
  if (/(ليكرا|استريتش|مطاط|stretch|lycra)/.test(full)) {
    return 'قماش بخامة مرنة ومريحة بتديك سهولة في الحركة ومظهر مضبوط طول اليوم.';
  }

  // 4. ميلتون مبطن / شتوي
  if (/(ميلتون|مبطن|تقيل|فليس|صوف|شتا)/.test(full)) {
    return 'خامة ميلتون شتوية تقيلة ومبطنة تدفيك بامتياز في البرد ومقاومة للوبر.';
  }

  // 5. كتان طبيعي
  if (/(كتان|لينن|linen)/.test(full)) {
    return 'خامة كتان طبيعية خفيفة وبتتنفس؛ مثالية للأيام الحارة وتديك راحة وأناقة صيفية.';
  }

  // 6. حذاء كلاسيك / جلد طبيعي
  if (/(جلد طبيعي|كلاسيك|شوز جلد|حذاء جلد)/.test(full)) {
    return 'قالب كلاسيكي مريح؛ خامات الجلد بتلين مع اللبس وتطبع على مقاس رجلك بالظبط.';
  }

  // 7. افتراضي للقصات العادية
  if (/(بدل|بنطلون|قميص|تيشرت|فستان|دريس)/.test(full)) {
    return 'مقاسات مضبوطة ستاندرد؛ اختار مقاسك الطبيعي المعتاد في اللبس.';
  }

  return null;
}
