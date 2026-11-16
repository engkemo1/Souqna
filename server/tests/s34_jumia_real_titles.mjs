// s34 — عناوين حقيقية مسحوبة من جوميا مصر (womens-clothing / men-clothing / babies-clothing) يوم 16 نوفمبر 2026 بالمتصفح.
// الكتالوج = العنوان + السعر فقط (من غير قسم ولا نوع محفوظ — زي ما تاجر ماركت بليس بيرفع). الحقيقة (جمهور/نوع) متعلّمة يدويًا.
// الاختبار: أسئلة عملاء بالعامية المصرية؛ أي منتج يظهر لازم يطابق الجمهور والنوع (غلط واحد = فشل). مقياس الاسترجاع بيتطبع لوحده.
// node tests/s34_jumia_real_titles.mjs [engineRoot]
import path from 'node:path'; import { pathToFileURL, fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(here, '..');
const { runModa } = await import(pathToFileURL(path.join(root, 'src/lib/moda/engine.js')).href);
// [عنوان, سعر, جمهور, مجموعة النوع]
// مجموعات: dress, bottom (بنطلون/جينز/جوجر), top (تيشيرت/بولو/توب), shirt, knit (بلوفر/سويتر/بولوفر), hoodie, jacket, skirt, short, pajama, under, sock, baby, set, dressup
const D = [
 ['Defacto Woman Bodycon Halter Collar Camisole Midi Dress.', 179, 'women', 'dress'],
 ['Defacto Woven Strapless Midi Dress', 519, 'women', 'dress'],
 ['Defacto Regular Fit Crew Neck Basic Dress Pullover', 647, 'women', 'dress'],
 ['Defacto Cotton Elastic Waist Comfy Sweatpants - Off White', 229, 'women', 'bottom'],
 ['Defacto NBA Chicago Bulls Double Pocket Standard Length Jogger Sweatpants Bottom', 189, 'women', 'bottom'],
 ['Charleston casual pants - Black', 230, 'women', 'bottom'],
 ['Colins Women PANTS BRIAND WASH', 409, 'women', 'bottom'],
 ['Colins Women PANTS RIVER WASH', 419, 'women', 'bottom'],
 ['Defacto Woman Harem Trousers - Mint', 909, 'women', 'bottom'],
 ['Defacto Lina Mom Fit Ripped Detail High Waist Ankle Length Jeans Washed Trousers', 249, 'women', 'bottom'],
 ['American Eagle Stretch High-Waisted Stovepipe Jean', 929, 'women', 'bottom'],
 ['Defacto Flare Trousers', 994, 'women', 'bottom'],
 ['Defacto Wide Leg modal Trousers', 845, 'women', 'bottom'],
 ['Defacto High Waist 90\'s Wide Leg Jeans', 1199, 'women', 'bottom'],
 ['Caesar Women\'s wide-leg trousers in Hashira fabric.', 407, 'women', 'bottom'],
 ['Freska Wide Leg Fleece Sweatpants - Heather Grey', 209, 'women', 'bottom'],
 ['Freska Honeycomb Legging - Black', 79, 'women', 'bottom'],
 ['Defacto 100% Cotton High Waist Jean Shorts Skirt', 239, 'women', 'skirt'],
 ['Defacto Woman Core Tricot Pullover - Black', 249, 'women', 'knit'],
 ['Defacto Woman Crew Neck Relax Fit Pullover - Navy', 299, 'women', 'knit'],
 ['Defacto Long Sleeves V-Neck Pullover - Black', 239, 'women', 'knit'],
 ['Defacto Relax Fit Crew Neck Pullover', 509, 'women', 'knit'],
 ['Defacto Knitted Cotton Sleeveless Tank Top - Green', 129, 'women', 'top'],
 ['OUTDATED Square Neck Long Sleeve - White', 229, 'women', 'top'],
 ['OUTDATED Round Neck Short Sleeve - Black', 129, 'women', 'top'],
 ['OUTDATED Tank Top Wide Neck - White', 129, 'women', 'top'],
 ['Jeweled Crown Women’s Cotton Body Cut Round Neck Top – Black', 210, 'women', 'top'],
 ['Freska Classic Pullover Hoodie - Burgundy', 159, 'women', 'hoodie'],
 ['Freska Classic Pullover Hoodie - Charcoal', 159, 'women', 'hoodie'],
 ['Defacto Long Fit Stand Collar Elastic Waist Half Zippered Sports Sweatshirt', 883, 'women', 'hoodie'],
 ['LC Waikiki Hooded Women\'s Puffer Coat', 2629, 'women', 'jacket'],
 ['Andora Plain Long Buttons Down Black Shirt', 549, 'women', 'shirt'],
 ['Caesar Women’s winter Melton tracksuit featuring a half zipper on the chest', 899, 'women', 'set'],
 ['Dadoush Women\'s Winter Pajama Set', 660, 'women', 'pajama'],
 ['Milk Milk Cotton Underwear for Women - Comfortable and Stylish', 216, 'women', 'under'],
 ['Dice Dice Set Of (5) Soft Plain Berif Panties - For Women.', 399, 'women', 'under'],
 ['Colins Men Short Sleeve Polo T-Shirt Olive Melange', 369, 'men', 'top'],
 ['Coup Men\'s CLASSIC SHIRT-WHITE', 229, 'men', 'shirt'],
 ['Messio Agency Short Sleeves T-shirt Round Neck', 220, 'men', 'top'],
 ['Defacto Regular Fit Polo Neck Linen-Look Long Sleeve Shirt', 300, 'men', 'shirt'],
 ['Freska Boxy Puffer Jacket - Olive', 309, 'men', 'jacket'],
 ['Colins Men PANTS WILS WASH', 409, 'men', 'bottom'],
 ['Colins Men PANTS BREND WASH', 439, 'men', 'bottom'],
 ['Colins Men Pants Sofi Wash', 439, 'men', 'bottom'],
 ['Fabyo Men\'s Winter Fleece Jacket - Black', 939, 'men', 'jacket'],
 ['Freska Classic Fleece Jogger - Heather Grey', 179, 'men', 'bottom'],
 ['Messio Agency Long Sleeve Round T-shirt', 280, 'men', 'top'],
 ['Defacto Man Casual T-Shirt - Black', 189, 'men', 'top'],
 ['Defacto Man Smart Casual Woven Top - Black', 489, 'men', 'shirt'],
 ['Defacto Man Casual Tricot - Lt.Beige Melange', 783, 'men', 'knit'],
 ['LC Waikiki Loose Fit Collared Neck Suede Men\'s Jacket', 2929, 'men', 'jacket'],
 ['Caesar Hoodie With Pants Training Suit', 476, 'men', 'set'],
 ['KEMT Jacket For Men\'s', 695, 'men', 'jacket'],
 ['Caesar Wool Men Pullover With Multi Design', 249, 'men', 'knit'],
 ['Andora Plain Zipped Hooded Jacket - Olive', 599, 'men', 'jacket'],
 ['Diadora Men Polo Shirt - Navy', 405, 'men', 'top'],
 ['Defacto Slim Fit Faux Leather Zip-Up Bomber Jacket', 2399, 'men', 'jacket'],
 ['Caesar Men Sweatshirt with Front Pockets and Zipper', 407, 'men', 'hoodie'],
 ['Shorto Men\'s Classic Kastoor Pajama - 2346 - Light Grey', 680, 'men', 'pajama'],
 ['Defacto Standard Fit Crew Neck Knitwear Pullover', 719, 'men', 'knit'],
 ['Defacto Regular Fit Long Sleeve Sweatshirt', 999, 'men', 'hoodie'],
 ['Defacto Wide Leg Elastic Drawstring Jeans', 1300, 'men', 'bottom'],
 ['Wrangler MEN\'S JEANS PANTS - Sky Blue', 349, 'men', 'bottom'],
 ['Dice Dice Set of 5 Boxers for Men and Boys', 379, 'men', 'under'],
 ['Cottonil (5) Boxer Every Day', 439, 'men', 'under'],
 ['Dice Dice Socks - Set Of (3) Half Soket High Quality 100% Cotton', 159, 'men', 'sock'],
 ['Defacto Baby Boy Bike Neck Regular Fit Long Sleeve T-Shirt - Beige', 149, 'boys', 'top'],
 ['Defacto Baby Boy Regular Fit Trousers - D.Green', 223, 'boys', 'bottom'],
 ['Defacto Baby Boy Shirt Neck Regular Fit Long Sleeve Shirt - Lt.Blue', 882, 'boys', 'shirt'],
 ['Defacto Baby Girl Bike Neck Regular Fit Sweat Shirt - Sand', 509, 'girls', 'hoodie'],
 ['Defacto Baby Girl Regular Fit Trousers - Salmon', 229, 'girls', 'bottom'],
 ['Defacto Floral Short Sleeve Ribbed Camisole Dress Girl Baby', 519, 'girls', 'dress'],
 ['Defacto Floral Jumpsuit Girl Baby', 255, 'girls', 'set'],
 ['Defacto Jeans', 809, 'girls', 'bottom'],
 ['Junior Baby Girls Jacket', 320, 'girls', 'jacket'],
 ['Junior Baby Girl Skirt', 237, 'girls', 'skirt'],
 ['Junior Baby Boy T-Shirt', 157, 'boys', 'top'],
 ['Junior Pajama Set For Baby Boys , Navy', 495, 'boys', 'pajama'],
 ['Defacto 100% Cotton Floral Waist Elastic Pajamas Set Girl Baby', 278, 'girls', 'pajama'],
 ['Cottonil Bundle of Three Half Sleeves Snap Closure Bodysuit', 349, 'boys', 'baby'],
 ['Set Baby T-shirt + Short - Cotton.', 228, 'boys', 'set'],
 ['Diadora Boys Sport Suit (T-Shirt & Short ) - Green', 311, 'boys', 'set'],
];
const pageOf = (a) => (a === 'women' ? 'Women Clothing' : a === 'men' ? 'Men Clothing' : 'Baby Fashion');
const rows = D.map(([n, price, aud], i) => ({ dept_name: pageOf(aud), id: i + 1, store_id: 1, slug: `j${i + 1}`, name_ar: n, name_en: n, description_ar: '', price, category_id: 1, status: 'active', colors_json: '[]', sizes_json: '[]', track_stock: 0, stock: 10, moda_key: null, department: null, audience: null, cat_text: '', store_name_ar: 'جوميا', rating: 4, rating_count: 5, sold_count: 3 }));
const T = new Map(D.map((d, i) => [i + 1, d]));
const ids = (r) => [...new Set((JSON.stringify(r.blocks || null).match(/"id":(\d+)/g) || []).map((x) => +x.slice(5)).filter((i) => T.has(i)))];
const now = new Date('2026-11-16T12:00:00Z');
const ask = (q) => runModa([{ role: 'user', content: q }], { products: rows, session: null, now });
// [سؤال, جمهور مقبول[], مجموعات نوع مقبولة[], ميزانية?]
const A_W = ['women'], A_M = ['men'], A_B = ['boys'], A_G = ['girls'];
const Q = [
 ['عايزة فستان', A_W.concat(A_G), ['dress']], ['عايزة فستان ميزانيتي 600', A_W.concat(A_G), ['dress'], 600],
 ['عايزة بنطلون واسع', A_W, ['bottom']], ['عايزة جينز', A_W, ['bottom']], ['عايزة بنطلون رياضي', A_W, ['bottom']], ['عايزة ليجنز', A_W, ['bottom']],
 ['عايزة هودي', A_W, ['hoodie']], ['عايزة سويتر', A_W, ['knit', 'hoodie']], ['عايزة جاكيت شتوي', A_W, ['jacket']], ['عايزة بلوزة', A_W, ['top', 'shirt', 'knit']],
 ['عايزة جيبة', A_W, ['skirt']], ['عايزة بيجامة', A_W, ['pajama']], ['عايزة قميص', A_W, ['shirt']], ['عايزة تيشيرت', A_W, ['top', 'set']],
 ['عايز تيشيرت', A_M, ['top', 'set']], ['عايز بولو', A_M, ['top', 'shirt']], ['عايز قميص', A_M, ['shirt']], ['عايز جينز', A_M, ['bottom']], ['عايز بنطلون', A_M, ['bottom']],
 ['عايز جاكيت', A_M, ['jacket']], ['عايز جاكيت جلد', A_M, ['jacket']], ['عايز هودي', A_M, ['hoodie']], ['عايز سويتر', A_M, ['knit', 'hoodie']], ['عايز بيجامة', A_M, ['pajama']],
 ['عايز بنطلون جينز ميزانيتي 450', A_M, ['bottom'], 450], ['عايز تيشيرت ميزانيتي 250', A_M, ['top', 'set'], 250], ['عايز جاكيت ميزانيتي 1000', A_M, ['jacket'], 1000],
 ['عايز تيشيرت لابني', A_B, ['top', 'set']], ['عايز بنطلون لابني', A_B, ['bottom']], ['عايز بيجامة لابني', A_B, ['pajama']],
 ['فستان لبنتي', A_G, ['dress']], ['عايزة بنطلون لبنتي', A_G, ['bottom']], ['عايزة جاكيت لبنتي', A_G, ['jacket']], ['جيبة لبنتي', A_G, ['skirt']], ['بيجامة لبنتي', A_G, ['pajama']],
];
const fails = []; let total = 0, found = 0, asked = 0, empty = 0;
for (const [q, auds, groups, budget] of Q) {
  total += 1; const r = await ask(q); const shown = ids(r); const why = [];
  for (const i of shown) { const [n, price, a, g] = T.get(i);
    if (!auds.includes(a)) why.push(`wrong audience ${i} «${n}» (${a})`);
    if (!groups.includes(g)) why.push(`wrong type ${i} «${n}» (${g})`);
    if (budget && r.state !== 'over_budget' && price > budget) why.push(`over budget ${i} ${price}`); }
  if (shown.length) found += 1; else if (r.state === 'clarify') asked += 1; else { empty += 1; console.log('· no result:', q, r.state); }
  if (why.length) fails.push({ q, why: [...new Set(why)].join(' | ') });
}
for (const f of fails) console.log(`✗ ${f.q.replace(/\s+/g, '_')}\n    ${f.why}`);
console.log(JSON.stringify({ total, bad: fails.length, ok: total - fails.length, showedProducts: found, asked, noResult: empty }));
process.exitCode = fails.length ? 1 : 0;
