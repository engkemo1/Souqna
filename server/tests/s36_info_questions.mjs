// s36 — بوابة أسئلة المعلومة: أسئلة قماش/عناية/مقاس/مناسبات بصيغ مختلفة لازم تتجاوب بإجابة معلومة صح (مش بحث منتجات ولا «ملقتش»)،
// وطلبات الشراء القريبة منها (بنفس الكلمات) تفضل ترشيح منتجات. الإجابات من قاعدة المعرفة (phrases.advice) أو الرد الصادق؛ مفيش اختراع.
// الصيغ كتبتها أنا بعد قراءة مواضيع الأسئلة في مدونات متاجر وجوميا؛ مش أسئلة عملاء فعلية منقولة.
import path from 'node:path'; import fs from 'node:fs'; import { pathToFileURL, fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(here, '..');
const { runModa } = await import(pathToFileURL(path.join(root, 'src/lib/moda/engine.js')).href);
const rows = JSON.parse(fs.readFileSync(path.join(here, '../test-fixtures/real-catalog-snapshot.json'), 'utf8'));
const now = new Date('2026-11-16T12:00:00Z'); const ask = (q) => runModa([{ role: 'user', content: q }], { products: rows, session: null, now });
const fails = []; let total = 0;
// [سؤال, id متوقّع (أو * = أي إجابة معلومة غير بحث)]
const INFO = [
 ['هل القطن بيتكرمش', 'fabric_wrinkle'], ['الكتان بيتكرمش اوي؟', 'fabric_wrinkle'], ['البوليستر بيسخن في الصيف', 'fabric_polyester_hot'], ['هل الساتان بيشف', 'fabric_sheer'], ['الشيفون بيشف ولا لأ', 'fabric_sheer'],
 ['الكتان ينفع للشتا؟', 'fabric_linen_winter'], ['ايه الفرق بين القطن والبوليستر', 'fabric_cotton_vs_poly'], ['الجينز بيتمدد مع الوقت؟', 'jeans_stretch'], ['الجاكيت الجلد بيتغسل ازاي', 'care_leather'],
 ['ينفع احط الهودي في المجفف؟', 'care_dryer'], ['ازاي اغسل هدوم الاطفال', '*'], ['الجزمة بتوسع مع الوقت؟', 'shoes_stretch'], ['الاسود بيبهت بعد الغسيل ازاي امنع ده', 'color_fade'],
 ['الابيض بيصفر ليه', 'white_yellow'], ['ازاي اشيل ريحة العرق من القميص', 'sweat_odor'], ['الصوف بيحكني ازاي اتصرف', 'wool_itch'], ['يعني ايه فيسكوز', 'what_viscose'], ['البنطلون طويل عليا اقصره ازاي', 'hem_pants'],
 ['ازاي ألبس طبقات في الشتا', 'layering_winter'], ['البس ايه لو نزل مطر', 'rain_wear'], ['ايه لبس التخرج المناسب', 'graduation_wear'], ['البس ايه في السفر', 'travel_wear'],
 ['ايه احسن خامة للجيم', 'gym_wear'], ['ايه خامة البيجامة الانسب للصيف', 'sleepwear_fabric'], ['التيشيرت ضيق على الكتف اعمل ايه', 'tshirt_fit'], ['ازاي اغسل الصوف', 'care_wool'], ['الحرير بيتغسل في الغسالة', 'care_silk'],
 ['ينفع البس كوتشي مع البدلة', 'sneakers_suit'], ['ايه الفرق بين السليم والريجولار', 'slim_fit'], ['ازاي اشيل بقعة الزيت', 'care_stain'],
];
for (const [q, id] of INFO) { total += 1; const r = await ask(q); const got = r.adviceId || r.faq || r.intent; if (r.blocks || (id !== '*' && r.adviceId !== id && !(r.intent === 'advice') && !r.faq)) fails.push(`${q} → ${r.state}/${got} (want ${id})`); else if (id !== '*' && r.adviceId && r.adviceId !== id) fails.push(`${q} → advice ${r.adviceId} (want ${id})`); else if (/ملقتش|مفيش حاجة مطابقة/.test(r.say || '')) fails.push(`${q} → search miss message`); }
// أسئلة معلومة مالهاش إجابة في القاعدة: لازم رد صادق مش بحث ولا اختراع
for (const q of ['هل القماش ده بيتحمل الغسالة الاوتوماتيك على 90', 'ايه اللي بيحصل لو غسلت الجينز مع المناشف', 'ليه الكوتشي ريحته وحشة']) { total += 1; const r = await ask(q); if (r.blocks || /ملقتش منتجات|مفيش حاجة مطابقة/.test(r.say || '')) fails.push(`${q} → should answer honestly, got ${r.state}`); }
// طلبات شراء بنفس الكلمات: لازم تفضل ترشيح
const SHOP = ['عايز جاكيت جلد', 'عايزة فستان ساتان', 'ورّيني جينز', 'عايز تيشيرت قطن', 'عايزة بنطلون كتان للصيف', 'عايز هودي فليس للشتا', 'جاكيت جلد للشتا', 'عايز بدلة للتخرج', 'عايزة فستان للعيد', 'عايز كوتشي للجيم', 'محتاجة بيجامة قطن', 'عايز لبس للسفر', 'عايزة لبس مطر', 'رشحلي جاكيت للشتا', 'عندكم جاكيت جلد؟'];
for (const q of SHOP) { total += 1; const r = await ask(q); if (r.intent === 'advice' || r.intent === 'brain') fails.push(`${q} wrongly answered as info (${r.adviceId})`); }
for (const f of fails) console.log('✗', f);
console.log(JSON.stringify({ total, bad: fails.length, ok: total - fails.length })); process.exitCode = fails.length ? 1 : 0;
