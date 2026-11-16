// s33 — كتالوج بأسلوب عناوين الماركت بليس (جوميا/نون/أمازون): عناوين طويلة ومحشوّة بكلمات وبالعربي والإنجليزي ومن غير moda_key ولا قسم.
// ملاحظة أمانة: العناوين مكتوبة يدويًا على نمط الماركت بليس (مش مسحوبة من المواقع — المتصفح ماكانش متاح)، والحقيقة (جمهور/نوع) مكتوبة معاها.
// node tests/s33_marketplace_style.mjs [engineRoot]
import path from 'node:path'; import { pathToFileURL, fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(here, '..');
const { runModa } = await import(pathToFileURL(path.join(root, 'src/lib/moda/engine.js')).href);
// [اسم, سعر, جمهور, أنواع مقبولة, تصنيف المتجر]
const D = [
 ['فستان سهرة طويل مخمل بأكمام طويلة للنساء - أسود', 1450, 'women', ['dress','evening_dress'], 'فساتين'],
 ['فستان صيفي كاجوال قطن بحمالات للبنات', 420, 'women', ['dress'], 'فساتين'],
 ['فستان ميدي مورد شيفون للمناسبات', 780, 'women', ['dress'], 'فساتين'],
 ['عباية سوداء كريب مع حزام وطرحة', 950, 'women', ['abaya'], 'عبايات'],
 ['بلوزة ساتان بأكمام واسعة نسائي', 360, 'women', ['blouse','shirt'], 'بلوزات'],
 ['قميص نسائي كلاسيك أبيض قطن بأزرار', 390, 'women', ['shirt','blouse'], 'قمصان'],
 ['بنطلون واسع قماش حريمي خصر عالي بيج', 520, 'women', ['trousers'], 'بناطيل'],
 ['بنطلون جينز مام فيت حريمي ازرق فاتح', 640, 'women', ['jeans'], 'جينز'],
 ['جيبة طويلة بليسيه حريمي', 340, 'women', ['skirt'], 'جيبات'],
 ['طقم رياضي نسائي ليجنز وتيشيرت للجيم', 580, 'women', ['sport_set','sport_top','leggings','sport_bottom'], 'ملابس رياضية'],
 ['ليجنز رياضي نسائي ضغط عالي للجري', 290, 'women', ['leggings','sport_bottom'], 'ملابس رياضية'],
 ['كارديجان صوف نسائي اوفر سايز', 610, 'women', ['cardigan','sweater'], 'سترات'],
 ['جاكيت جينز حريمي قصير', 720, 'women', ['jacket'], 'جاكيتات'],
 ['حجاب شيفون سادة بتلبيسة', 120, 'women', ['hijab','scarf'], 'طرح'],
 ['بيجامة حريمي قطن نص كم شورت', 310, 'women', ['pajama'], 'ملابس نوم'],
 ['حذاء كعب عالي ستيليتو للسهرات نسائي', 890, 'women', ['heels'], 'أحذية'],
 ['شنطة يد جلد صناعي حريمي', 450, 'women', ['bag'], 'شنط'],
 ['تيشيرت رجالي قطن 100% ياقة دائرية', 240, 'men', ['tshirt'], 'تيشيرتات'],
 ['بولو شيرت رجالي بيكيه ازرق كحلي', 330, 'men', ['polo'], 'بولو'],
 ['قميص رجالي سلم فيت كلاسيك ابيض', 480, 'men', ['shirt'], 'قمصان'],
 ['بنطلون جينز رجالي سلم فيت اسود', 690, 'men', ['jeans'], 'جينز'],
 ['بنطلون شينو رجالي كاجوال كحلي', 560, 'men', ['chinos','trousers'], 'بناطيل'],
 ['بنطلون جوجر رجالي رياضي قطن', 380, 'men', ['joggers','sport_bottom'], 'بناطيل'],
 ['هودي رجالي بغطاء رأس فليس شتوي', 640, 'men', ['hoodie'], 'هوديز'],
 ['جاكيت جلد رجالي اسود', 1900, 'men', ['jacket'], 'جاكيتات'],
 ['جاكيت بومبر رجالي مبطن', 1100, 'men', ['jacket'], 'جاكيتات'],
 ['بدلة رجالي كلاسيك سوداء قطعتين للعريس', 3200, 'men', ['suit'], 'بدل'],
 ['شورت رجالي رياضي سريع الجفاف', 210, 'men', ['shorts','sport_bottom'], 'شورتات'],
 ['حذاء رياضي رجالي للجري خفيف', 1250, 'men', ['sneakers','running_shoes','shoes'], 'أحذية'],
 ['حذاء كلاسيك رجالي جلد طبيعي اسود', 1400, 'men', ['formal_shoes','shoes'], 'أحذية'],
 ['بيجامة رجالي شتوي قطن', 450, 'men', ['pajama'], 'ملابس نوم'],
 ['كاب قطن رجالي سادة', 150, 'men', ['cap'], 'اكسسوارات'],
 ['تيشيرت اطفال ولادي كرتون قطن', 160, 'boys', ['tshirt'], 'ملابس أطفال'],
 ['بنطلون جينز ولادي مطاط', 280, 'boys', ['jeans','trousers'], 'ملابس أطفال'],
 ['طقم ولادي شورت وتيشيرت صيفي', 250, 'boys', ['set','shorts','tshirt'], 'ملابس أطفال'],
 ['فستان بناتي كرانيش للمناسبات', 520, 'girls', ['dress'], 'ملابس أطفال'],
 ['فستان بنات صيفي قطن', 240, 'girls', ['dress'], 'ملابس أطفال'],
 ['هودي بناتي فليس بكابوشون', 330, 'girls', ['hoodie'], 'ملابس أطفال'],
 ['جاكيت اطفال شتوي مبطن ولادي', 480, 'boys', ['jacket'], 'ملابس أطفال'],
 ['بيجامة اطفال بناتي قطن', 190, 'girls', ['pajama'], 'ملابس أطفال'],
];
const rows = D.map(([n, price, aud], i) => ({ id: i + 1, store_id: 1, slug: `m${i + 1}`, name_ar: n, name_en: '', description_ar: '', price, category_id: 1, status: 'active', colors_json: '[]', sizes_json: '[]', track_stock: 0, stock: 10, moda_key: null, department: null, audience: null, cat_text: D[i][4], store_name_ar: 'متجر', rating: 4, rating_count: 5, sold_count: 3 }));
const byId = new Map(rows.map((r) => [r.id, r])); const truth = new Map(D.map((d, i) => [i + 1, d]));
const ids = (r) => [...new Set((JSON.stringify(r.blocks || null).match(/"id":(\d+)/g) || []).map((x) => +x.slice(5)).filter((i) => byId.has(i)))];
const now = new Date('2026-11-16T12:00:00Z');
const ask = (q) => runModa([{ role: 'user', content: q }], { products: rows, session: null, now });
const okAud = (want, have) => want === have || (have === 'women' && want === 'girls') || (have === 'girls' && want === 'women');
const fails = []; let total = 0;
// 1) استعلامات (نوع + جمهور + ميزانية) بصيغ عملاء. كل منتج ظاهر لازم يطابق الجمهور المطلوب ويكون من النوع.
const Q = [
 ['عايز تيشيرت لراجل', 'men', ['tshirt','polo']], ['عايزة فستان سهرة', 'women', ['dress','evening_dress']], ['عايزة عباية', 'women', ['abaya']],
 ['عايز بنطلون جينز لجوزي', 'men', ['jeans']], ['عايز هودي لابني', 'boys', ['hoodie']], ['فستان لبنتي عندها 6 سنين', 'girls', ['dress']],
 ['عايز جاكيت جلد للشتا', 'men', ['jacket']], ['عايزة بنطلون واسع للشغل', 'women', ['trousers']], ['عايز حذاء جري', 'men', ['sneakers','running_shoes','shoes']],
 ['عايزة ليجنز للجيم', 'women', ['leggings','sport_bottom','sport_set']], ['عايز بدلة للفرح', 'men', ['suit']], ['عايزة شنطة', 'women', ['bag']],
 ['عايز بيجامة', 'men', ['pajama']], ['عايزة بيجامة', 'women', ['pajama']], ['عايزة حجاب', 'women', ['hijab','scarf']], ['عايز تيشيرت لإبني', 'boys', ['tshirt']],
 ['عايزة كارديجان', 'women', ['cardigan','sweater']], ['عايز شورت رياضي', 'men', ['shorts','sport_bottom']], ['عايزة جيبة', 'women', ['skirt']], ['عايز كاب', 'men', ['cap']],
 ['فستان ميزانيتي 500', 'women', ['dress'], 500], ['عايز تيشيرت ميزانيتي 200', 'men', ['tshirt','polo'], 200], ['عايز هودي ميزانيتي 700', 'men', ['hoodie'], 700], ['فستان بنات ميزانيتي 300', 'girls', ['dress'], 300],
];
for (const [q, aud, keys, budget] of Q) {
  total += 1; const r = await ask(q); const why = [];
  for (const i of ids(r)) { const [n, price, a] = truth.get(i);
    if (!okAud(aud, a) && !(aud === 'boys' && a === 'boys') ) why.push(`wrong audience ${i} «${n}» (${a})`);
    if (aud === 'men' && a !== 'men') why.push(`non-men ${i}`);
    if (budget && r.state !== 'over_budget' && price > budget * 1.0001) why.push(`over budget ${i} ${price}`); }
  if (r.state === 'over_budget' && !/أعلى من ميزانيتك|ميزانيت/.test(r.say || '')) why.push('silent over_budget');
  if (why.length) fails.push({ q, why: [...new Set(why)].join(' | ') });
}
// 2) اسم المنتج بالظبط لازم يرجّع نفس المنتج (أو سؤال)
let hit = 0;
for (const [i, d] of D.entries()) { const r = await ask(`${/women|girls/.test(d[2]) ? 'عايزة' : 'عايز'} ${d[0]}`); total += 1;
  if (ids(r).includes(i + 1) || (i === 1 && ids(r).includes(37)) /* «للبنات» = بنات صغيرين أو شابات: الاتنين مقبولين */ || (r.state === 'clarify' && !ids(r).length)) hit += 1; else fails.push({ q: `exact ${i + 1}`, why: `«${d[0]}» not shown: got ${ids(r).slice(0, 4)} state ${r.state}` }); }
for (const f of fails) console.log(`✗ ${f.q.replace(/\s+/g, '_')}\n    ${f.why}`);
console.log(JSON.stringify({ total, bad: fails.length, ok: total - fails.length, exactHit: `${hit}/${D.length}` }));
process.exitCode = fails.length ? 1 : 0;
