// s27 — checks for the evaluation-driven fixes (G1–G8), using NEW phrasings (not dataset text) + negative controls.
// node s27_eval_fixes.mjs [dir]
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
// Portable: works from server/tests/ on the device (Windows/Mac/Linux) and from the sandbox harness.
//   node <this file> [serverDir]   — catalog: $TWILA_CATALOG, else tests/fixtures/cat1.txt, else /tmp/t/cat1.txt
const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(process.argv[2] || (fs.existsSync(path.join(here, 'src')) ? here : path.join(here, '..')));
const { runModa } = await import(pathToFileURL(path.join(dir, 'src/lib/moda/engine.js')).href);
const catPath = process.env.TWILA_CATALOG || [path.join(here, 'fixtures', 'cat1.txt'), '/tmp/t/cat1.txt'].find((p) => fs.existsSync(p));
if (!catPath) { console.error('catalog fixture cat1.txt not found (set TWILA_CATALOG)'); process.exit(2); }
const rows = fs.readFileSync(catPath,'utf8').trim().split('\n').map((l)=>{ const [id,name,price,cols]=l.split('|'); return { id:+id, name_ar:name, name_en:'', price:+price, stock:5, cat_text:'', description_ar:'', sold_count:5, colors_json: cols? cols.split('/').map(n=>({name_ar:n})):[] }; });
const conv = async (turns) => { let s = null; let r; for (const t of turns) { r = await runModa([{ role: 'user', content: t }], { products: rows, now: new Date('2026-11-14T12:00:00Z'), session: s }); s = r.session; } return r; };
const keys = (r) => (r.parsed?.garments || []).map((g) => g.key);
const skeys = (r) => (r.session?.parsed?.garments || []).map((g) => g.key);
const gh = (r) => r.parsed?.genderHint || r.session?.parsed?.genderHint || null;
let pass = 0, fail = 0;
const ok = (name, cond, info) => { if (cond) pass++; else { fail++; console.log('FAIL', name, '|', info); } };
// G1 speaker gender kept across turns
{ const r = await conv(['عايزة بلوزة', 'حمرا']); ok('G1 female kept after colour turn', gh(r) === 'female', gh(r)); }
{ const r = await conv(['محتاج قميص', 'كحلي', 'مقاس L']); ok('G1 male kept over 3 turns', gh(r) === 'male', gh(r)); }
// G3 weak «عايزه» does not flip a known speaker; strong «عايزة» on a fresh chat is female; fresh weak still female
{ const r = await conv(['عايز بنطلون جينز', 'عاوزه مقاس 34']); ok('G3 weak ه keeps male', gh(r) === 'male', gh(r)); }
{ const r = await conv(['عايزه فستان']); ok('G3 fresh weak still female (unchanged)', r.parsed.genderHint === 'female', r.parsed.genderHint); }
{ const r = await conv(['عايز جاكيت', 'عايزة بلوزة كمان']); ok('G3 strong ة may change speaker', gh(r) === 'female', gh(r)); }
// G2 speaker words
{ const r = await conv(['رايحة فرح صاحبتي ألبس ايه']); ok('G2 «رايحة» inside a context phrase', r.parsed.genderHint === 'female', r.parsed.genderHint); }
{ const r = await conv(['محتارة ألبس ايه في الخطوبة']); ok('G2 محتارة', r.parsed.genderHint === 'female', r.parsed.genderHint); }
{ const r = await conv(['مش عارف ألبس ايه للشغل']); ok('G2 مش عارف', r.parsed.genderHint === 'male', r.parsed.genderHint); }
// G5 «بدل» = instead-of only after a colour; bare ambiguous words don't replace a running garment
{ const r = await conv(['عايزة بلوزة سودا', 'لأ خليها بيضا بدل السودا']); ok('G5 بدل after colour ≠ suit', !keys(r).includes('suit') && skeys(r).includes('blouse'), JSON.stringify([keys(r), skeys(r)])); }
{ const r = await conv(['عايز بدل سودا للفرح']); ok('G5 control: «بدل» as suits kept', keys(r).includes('suit'), keys(r)); }
{ const r = await conv(['عايزة جيبة سودا', 'ماكسي']); ok('G5 «ماكسي» on a skirt keeps the skirt', skeys(r).includes('skirt') && !skeys(r).includes('dress_evening'), skeys(r)); }
{ const r = await conv(['عايزة فستان ماكسي']); ok('G5 control: «فستان ماكسي» still a dress', keys(r).some((k) => k.startsWith('dress')), keys(r)); }
{ const r = await conv(['عايزة بنطلون أسود', 'للسهرة']); ok('G5 «للسهرة» keeps trousers', skeys(r).includes('trousers'), skeys(r)); }
// G6 short refinements keep the request
{ const r = await conv(['عايزة بلوزة بيضا', 'نص كم']); ok('G6 «نص كم» stays shop', r.intent === 'shop' && skeys(r).includes('blouse'), [r.intent, skeys(r)].join(' ')); }
{ const r = await conv(['عايز هودي', 'بسوستة']); ok('G6 «بسوستة» stays shop', r.intent === 'shop' && skeys(r).includes('hoodie'), [r.intent, skeys(r)].join(' ')); }
{ const r = await conv(['نص كم']); ok('G6 control: no running request → not forced to shop', r.intent !== 'shop' || !keys(r).length, r.intent); }
{ const r = await conv(['عايزة فستان', 'بكام ده؟']); ok('G6 control: «بكام» is a price question, not a refinement', !/خدت بالي من التفصيلة/.test(r.say || ''), r.say?.slice(0, 60)); }
// size change + bare size after a product list
{ const r = await conv(['عايز جاكيت جلد مقاس M', 'لأ خلي المقاس XL']); ok('size change phrase', String(r.parsed.flags?.size || r.session?.parsed?.flags?.size).toUpperCase() === 'XL', r.parsed.flags?.size); }
{ const r = await conv(['عايز تيشيرت أبيض', 'XXL']); ok('G8 bare XXL after a request is a size, not the sizes FAQ', r.faq !== 'sizes_available', r.faq); }
{ const r = await conv(['عندكم مقاسات XXL؟']); ok('G8 control: sizes FAQ still answers on its own', r.faq === 'sizes_available', r.faq); }
// G4 interview vs partnership
{ const r = await conv(['عندي انترفيو شغل بكرة الصبح ألبس ايه']); ok('G4 interview is not partnership', r.faq !== 'partnership', r.faq); }
{ const r = await conv(['عايز اشتغل معاكم']); ok('G4 control: job request still partnership', r.faq === 'partnership', r.faq); }
{ const r = await conv(['فيه وظايف عندكم']); ok('G4 control: «فيه وظايف عندكم» still partnership', r.faq === 'partnership', r.faq); }
// G7 alias
{ const r = await conv(['عايز شوز كلاسيك بني']); ok('G7 «شوز كلاسيك» → formal_shoes', keys(r).includes('formal_shoes'), keys(r)); }
{ const r = await conv(['عايزة فستان أحمر']); ok('G7 control: فستان has no material', !(r.parsed.garments || []).some((g) => g.material), JSON.stringify(r.parsed.garments)); }
// Round 2 — advice / shipping / tracking / payment (new phrasings + controls)
{ const r = await conv(['بشرتي خمرية ألبس ألوان إيه']); ok('R2 skin-tone advice is advice', r.intent === 'advice', r.intent); }
{ const r = await conv(['رقبتي قصيرة شوية ألبس ياقة إيه']); ok('R2 short-neck advice', r.intent === 'advice' && /للرقبة القصيرة/.test(r.say || '') && !/للطول القصير/.test(r.say || ''), r.intent); }
{ const r = await conv(['عندي ارداف عريضة أعمل إيه في اللبس']); ok('R2 wide hips advice (not unknown-garment)', r.intent === 'advice', r.intent + ' ' + (r.say || '').slice(0, 40)); }
{ const r = await conv(['عايزة جيبة قصيرة سودا']); ok('R2 control: «قصيرة» on a garment stays shopping', r.intent === 'shop', r.intent); }
{ const r = await conv(['معايا كرنب نسقلي عليه']); ok('R2 control: unknown item still asks', /مش فاهمة طلبك/.test(r.say || ''), (r.say || '').slice(0, 40)); }
{ const r = await conv(['طلبي هيوصل امتى؟']); ok('R2 my-order timing → tracking', r.faq === 'order_track', r.faq); }
{ const r = await conv(['el order feen? 3amlah men yomen']); ok('R2 Arabizi order → tracking', r.faq === 'order_track', r.faq); }
{ const r = await conv(['لو طلبت النهاردة يوصل بكرة؟']); ok('R2 hypothetical order timing → shipping time + Banha one day', r.faq === 'shipping_time' && /خلال يوم/.test(r.say || ''), r.faq); }
{ const r = await conv(['fe tawseel l tanta?']); ok('R2 Arabizi delivery → shipping', ['shipping_where', 'shipping_time', 'shipping_cost'].includes(r.faq), r.faq); }
{ const r = await conv(['عندكم تقسيط؟']); ok('R2 instalments → payment_options', r.faq === 'payment_options', r.faq); }
{ const r = await conv(['الدفع ازاي عندكم؟']); ok('R2 control: plain payment stays payment', r.faq === 'payment', r.faq); }
{ const r = await conv(['السعر ده شامل التوصيل؟']); ok('R2 «شامل التوصيل» → price_final', r.faq === 'price_final', r.faq); }
{ const r = await conv(['عندكم عروض النهاردة؟']); ok('R2 control: offers still discounts', r.faq === 'discounts', r.faq); }
{ const r = await conv(['عرض الوسط عندي كبير ألبس ايه']); ok('R2 «عرض الوسط» is not discounts', r.faq !== 'discounts', r.faq); }
// Round 3 — returns with a garment, instalment verb, Arabizi tracking, «بدل اللون», «للسهرة»
{ const r = await conv(['عايز أرجع البنطلون عشان طلع واسع']); ok('R3 return with garment → returns FAQ', r.intent === 'faq' && ['returns', 'size_change_after', 'wrong_item', 'refund_money'].includes(r.faq), `${r.intent}/${r.faq}`); }
{ const r = await conv(['عايز أرجع أشتري نفس الجاكيت']); ok('R3 control: «أرجع أشتري» stays shopping', r.intent === 'shop', r.intent); }
{ const r = await conv(['ممكن نقسط المبلغ؟']); ok('R3 instalment verb → payment_options', r.faq === 'payment_options', r.faq); }
{ const r = await conv(['ممكن سؤال؟']); ok('R3 control: «ممكن سؤال» still call_name', r.faq === 'call_name', r.faq); }
{ const r = await conv(['feen el talab?']); ok('R3 Arabizi «feen el talab» → tracking', r.faq === 'order_track', r.faq); }
{ const r = await conv(['عايزة بلوزة كحلي', 'خليها أبيض بدل الكحلي']); const c = r.parsed?.colors || []; ok('R3 «بدل الكحلي» = avoid navy', !c.includes('navy'), JSON.stringify([c, r.parsed?.avoidColors])); }
{ const r = await conv(['عايز تيشيرت أسود', 'للسهرة']); ok('R3 «للسهرة» keeps the request as shop', r.intent === 'shop' && skeys(r).includes('tshirt'), `${r.intent} ${skeys(r)}`); }
// Round 4 — digressions, size change, discount question with garment, «جينز» as fabric, season in garment name, loose material, travel/day-use, Arabizi
const G = (r) => (r.parsed?.garments || [])[0] || {};
{ const r = await conv(['عايزة شنطة جلد بني', 'بتوصلوا المنصورة؟', 'طيب هات الشنطة']); ok('R4 digression keeps colour+material', G(r).color === 'brown' && G(r).material === 'leather', JSON.stringify(G(r))); }
{ const r = await conv(['عايز جاكيت أسود', 'لا عايز جاكيت تاني خالص']); ok('R4 control: «تاني خالص» does not carry colour', G(r).color !== 'black', JSON.stringify(G(r))); }
{ const r = await conv(['عايزة بنطلون كحلي', 'مقاس 36', 'لأ خليه 38']); ok('R4 «لأ خليه 38» changes size', String(r.parsed?.flags?.size) === '38', r.parsed?.flags?.size); }
{ const r = await conv(['عندكم تخفيضات على الفساتين؟']); ok('R4 discount question with garment → discounts', r.faq === 'discounts', `${r.intent}/${r.faq}`); }
{ const r = await conv(['عايزة فساتين سودا']); ok('R4 control: plain garment request stays shop', r.intent === 'shop', r.intent); }
{ const r = await conv(['عايز شورت جينز']); ok('R4 «شورت جينز» = shorts + denim', keys(r).length === 1 && G(r).material === 'denim', JSON.stringify(r.parsed.garments.map((g) => [g.key, g.material]))); }
{ const r = await conv(['عايز بنطلون جينز']); ok('R4 control: «بنطلون جينز» is still jeans', keys(r).includes('jeans'), keys(r)); }
{ const r = await conv(['عايزة بلوزة صيفي']); ok('R4 season from garment name', r.parsed?.season === 'summer', r.parsed?.season); }
{ const r = await conv(['عايزة بلوزة بيضا', 'خليها قطن']); ok('R4 loose material applied to the running garment', G(r).material === 'cotton' || (r.session?.parsed?.garments || [])[0]?.material === 'cotton', JSON.stringify(G(r))); }
{ const r = await conv(['محتاج لبس للطيارة']); ok('R4 «للطيارة» → travel context', r.parsed?.context === 'travel', r.parsed?.context); }
{ const r = await conv(['عندنا داي يوز الجمعة ألبس ايه']); ok('R4 «داي يوز» → beach context', r.parsed?.context === 'sahel_beach', r.parsed?.context); }
{ const r = await conv(['law atlob el sob7 yewsal el leila?']); ok('R4 Arabizi hypothetical delivery → shipping', ['shipping_time', 'shipping_where', 'shipping_cost'].includes(r.faq), r.faq); }
{ const r = await conv(['طلبي ماوصلش لحد دلوقتي']); ok('R4 «طلبي ماوصلش» → tracking', r.faq === 'order_track', r.faq); }
{ const r = await conv(['نفسي أرجع ألبس جيبات زي زمان، وريني جيبة سودا']); ok('R4 control (found by held-out v3): «أرجع ألبس» is not a return', r.intent === 'shop', `${r.intent}/${r.faq}`); }
{ const r = await conv(['عايز بدل رمادي']); ok('R4 control (found by held-out v3): «بدل رمادي» keeps grey', JSON.stringify(r.parsed).includes('grey') && !(r.parsed.avoidColors || []).includes('grey'), JSON.stringify([r.parsed.garments, r.parsed.avoidColors])); }
// Round 5 — polo, tall/thin advice, speaker gender in advice, «الاتنين», Arabizi words, discovery
{ const r = await conv(['محتاج تيشيرت بولو كحلي']); ok('R5 «تيشيرت بولو» = one polo', keys(r).length === 1 && keys(r)[0] === 'polo' && G(r).color === 'navy', JSON.stringify(r.parsed.garments.map((g) => [g.key, g.color]))); }
{ const r = await conv(['عايز تيشيرت وبولو']); ok('R5 control: «تيشيرت وبولو» = two garments', keys(r).length === 2, keys(r)); }
{ const r = await conv(['أنا طويل جدا، ألبس إيه؟']); ok('R5 tall advice + male speaker', r.intent === 'advice' && r.parsed.genderHint === 'male', `${r.intent} ${r.parsed.genderHint}`); }
{ const r = await conv(['أنا رفيعة وعايزة أبان مليانة']); ok('R5 thin + «أبان مليانة» gets thin advice', /للجسم النحيف/.test(r.say || '') && !/للجسم الممتلئ/.test(r.say || ''), (r.say || '').slice(0, 30)); }
{ const r = await conv(['عايز قميص أبيض', 'عندك منه أزرق؟', 'هاخد الاتنين']); ok('R5 «هاخد الاتنين» keeps both colours', ['white', 'blue'].every((c) => (r.parsed.colors || []).includes(c)), JSON.stringify(r.parsed.colors)); }
{ const r = await conv(['عايز قميص أبيض', 'هاخد الاتنين']); ok('R5 control: «الاتنين» with one colour does not invent colours', !(r.parsed.colors || []).length || (r.parsed.colors || []).length === 1, JSON.stringify(r.parsed.colors)); }
{ const r = await conv(['3ayza geba gald soda']); ok('R5 Arabizi skirt/leather/black', keys(r).includes('skirt') && G(r).material === 'leather' && G(r).color === 'black', JSON.stringify(r.parsed.garments)); }
{ const r = await conv(['rashe7ly 7aga 7elwa']); ok('R5 control: unknown Arabizi does not crash', !!r.say, ''); }
{ const r = await conv(['رشحلي أحسن حاجة عندكم']); ok('R5 discovery request → shop (no «مش فاهمة»)', r.intent === 'shop' && !/مش فاهمة/.test(r.say || ''), `${r.intent} ${(r.say || '').slice(0, 30)}`); }
{ const r = await conv(['نفسي أغير ستايلي']); ok('R5 «أغير ستايلي» → shop', r.intent === 'shop', r.intent); }
{ const r = await conv(['عايز اعرف مواعيد المحلات']); ok('R5 control: store hours not hijacked by discovery', r.intent !== 'shop', `${r.intent}/${r.faq}`); }
// Review round — guards found while reviewing the code
{ const r = await conv(['عايز قميص أبيض', 'ابدله بمقاس أكبر']); ok('Review: in-chat «ابدله بمقاس أكبر» is a swap, not the returns FAQ', r.intent === 'shop', `${r.intent}/${r.faq}`); }
{ const r = await conv(['عايز قميص أبيض', 'القميص اللي وصلني امبارح طلع ضيق عايز أبدله']); ok('Review: post-purchase exchange still returns FAQ', r.intent === 'faq', `${r.intent}/${r.faq}`); }
{ const r = await conv(['عايز قميص أبيض', 'عندك منه أزرق؟', 'عايز بنطلون أسود', 'هاخد الاتنين']); ok('Review: colour history of an old garment not reused', !(r.parsed.colors || []).includes('white') && !(r.parsed.colors || []).includes('blue'), JSON.stringify(r.parsed.colors)); }
{ const r = await conv(['عندي كرش، ألبس إيه يداريه؟']); ok('Review: «عندي كرش» is advice, not unknown garment', r.intent === 'advice', r.intent); }
// Round 6 — body questions naming a garment, rejected garments, «أوفر سايز», plural weddings, context negation scope, Arabic XL, ستان, belly
{ const r = await conv(['جسمي كمثرى، أنسب قصة جيبة ليا إيه؟']); ok('R6 body question naming a garment → advice', r.intent === 'advice' && /الكمثري/.test(r.say || ''), r.intent); }
{ const r = await conv(['عندي أكتاف عريضة، ألبس بلوزة واسعة ولا ضيقة؟']); ok('R6 shoulders + garment → shoulders advice, no height tip', r.intent === 'advice' && /للأكتاف العريضة/.test(r.say || '') && !/للطول/.test(r.say || ''), (r.say || '').slice(0, 30)); }
{ const r = await conv(['جاكيت قصير ينفع للخروج؟']); ok('R6 control: «جاكيت قصير» is not body advice', r.intent !== 'advice', r.intent); }
{ const r = await conv(['عايزة بلوزة بيضا', 'سيبك من البلوزة، وريني جيبة']); ok('R6 «سيبك من البلوزة» drops it', keys(r).length === 1 && keys(r)[0] === 'skirt', keys(r)); }
{ const r = await conv(['مش عايزة جاكيت، عايزة كارديجان']); ok('R6 «مش عايزة جاكيت، عايزة كارديجان»', !keys(r).includes('jacket') && keys(r).includes('cardigan'), keys(r)); }
{ const r = await conv(['عايز سويت شيرت أوفر سايز']); ok('R6 «أوفر سايز» alone stays a garment request', keys(r).length >= 1, keys(r)); }
{ const r = await conv(['عايز جاكيت أوفر سايز']); ok('R6 «جاكيت أوفر سايز» = one jacket', keys(r).length === 1 && keys(r)[0] === 'jacket', keys(r)); }
{ const r = await conv(['عايزة فستان ينفع في الافراح']); ok('R6 «الافراح» → wedding', /wedding/.test(r.parsed?.context || ''), r.parsed?.context); }
{ const r = await conv(['عايز قميص من غير جيوب للشغل']); ok('R6 «من غير جيوب للشغل»: work not negated', /work/.test(r.parsed?.context || ''), JSON.stringify([r.parsed?.context, r.parsed?.avoidContexts])); }
{ const r = await conv(['مش للشغل، عايزة حاجة للخروج']); ok('R6 control: «مش للشغل» still negates work', (r.parsed?.avoidContexts || []).some((c) => /work/.test(c)), JSON.stringify(r.parsed?.avoidContexts)); }
{ const r = await conv(['عايز تيشيرت أسود', 'عايزه مقاس اكس اكس لارج']); ok('R6 «مقاس اكس اكس لارج» → XXL', String(r.parsed?.flags?.size || r.session?.parsed?.flags?.size) === 'XXL', r.parsed?.flags?.size); }
{ const r = await conv(['عايزة طرحة ستان']); ok('R6 «طرحة ستان» → satin', G(r).material === 'satin', JSON.stringify(G(r))); }
{ const r = await conv(['عايزة فستان أبيض']); ok('R6 control: «فستان» is not satin', !G(r).material, JSON.stringify(G(r))); }
{ const r = await conv(['عايزة حاجة تداري بطني']); ok('R6 belly → advice', r.intent === 'advice', r.intent); }
// Round 6b — found by held-out v5
{ const r = await conv(['عايز تيشيرت أوفر سايز أبيض']); ok('R6b «أوفر سايز» keeps the colour', keys(r).length === 1 && G(r).color === 'white', JSON.stringify(r.parsed.garments.map((g) => [g.key, g.color]))); }
{ const r = await conv(['عايزة شنطة كروس بيج']); ok('R6b «شنطة كروس» = one crossbody bag', keys(r).length === 1 && keys(r)[0] === 'crossbody' && G(r).color === 'beige', JSON.stringify(r.parsed.garments.map((g) => [g.key, g.color]))); }
{ const r = await conv(['عايزة شنطة وكلاتش']); ok('R6b control: «شنطة وكلاتش» = two items', keys(r).length === 2, keys(r)); }
{ const r = await conv(['عندي بطن، ألبس إيه؟']); ok('R6b «عندي بطن» → advice', r.intent === 'advice', r.intent); }
// Round 7 — found by the shop-staff conversation set v1 (new phrasings, not copied from it)
{ const r = await conv(['فيه عندكم سويت شيرت اوفر سايز؟']); ok('R7 availability question with «اوفر سايز» stays shopping', r.intent === 'shop', `${r.intent}/${r.faq}`); }
{ const r = await conv(['إيه سياسة الاستبدال عندكم؟']); ok('R7 policy question → returns FAQ', r.intent === 'faq', `${r.intent}/${r.faq}`); }
{ const r = await conv(['ممكن أشوف عندكم إيه الأول؟']); ok('R7 «أشوف عندكم ايه» → discovery or the catalogue overview', (r.intent === 'shop' || r.faq === 'everything') && !/مش فاهمة/.test(r.say || ''), `${r.intent}/${r.faq}`); }
{ const r = await conv(['بتوصلوا لحد البيت في طوخ؟']); ok('R7 «بتوصلوا لحد البيت» → shipping', r.intent === 'faq', `${r.intent}/${r.faq}`); }
{ const r = await conv(['طلبت جاكيت من أسبوع ولسه موصلش']); ok('R7 «طلبت… ولسه موصلش» → tracking, not shopping', r.intent === 'faq', `${r.intent}/${r.faq}`); }
{ const r = await conv(['عايز هودي كحلي L']); ok('R7 bare Latin size beside a garment', String(r.parsed?.flags?.size || r.session?.parsed?.flags?.size) === 'L', r.parsed?.flags?.size); }
{ const r = await conv(['عايز قميص أبيض', 'لا معلش خليه 42']); ok('R7 «لا معلش خليه 42» → size', String(r.parsed?.flags?.size || r.session?.parsed?.flags?.size) === '42', r.parsed?.flags?.size); }
{ const r = await conv(['عايزة بلوزة سودا', 'تكون gald']); ok('R7 Arabizi material as a refinement', G(r).material === 'leather', JSON.stringify(G(r))); }
{ const r = await conv(['عايز فستان لعيد ميلاد أختي']); ok('R7 birthday variant', /birthday/.test(r.parsed?.context || ''), r.parsed?.context); }
{ const r = await conv(['فرحي بعد شهرين ومش عارفة ألبس إيه']); ok('R7 «ومش عارفة» → female speaker', r.parsed?.genderHint === 'female', r.parsed?.genderHint); }
{ const r = await conv(['بشرتي سمرا، البلوزة البيج تليق عليا؟']); ok('R7 skin + garment question with «تليق» → advice', r.intent === 'advice', r.intent); }
{ const r = await conv(['جسمي كمثرى، أنهي جيبة تداري الأرداف']); ok('R7 «أنهي… تداري» without «؟» → advice', r.intent === 'advice', r.intent); }
{ const r = await conv(['momken abadel el geba? tel3et wase3a']); ok('R7 Arabizi exchange → returns FAQ', r.intent === 'faq', `${r.intent}/${r.faq}`); }
{ const r = await conv(['عايز قميص أبيض', 'momken abadlo be size akbar']); ok('R7 control: in-chat Arabizi swap is not the returns FAQ', r.intent !== 'faq', `${r.intent}/${r.faq}`); }
{ const r = await conv(['عندكم مواعيد التوصيل إيه؟']); ok('R7 control: shipping not hijacked by discovery', r.intent === 'faq', `${r.intent}/${r.faq}`); }
// Round 7b — user report: «رشحيلي حاجه حلوه» was echoed back as a product name
{ const r = await conv(['اقترحيلي حاجه حلوه']); ok('R7b «اقترحيلي حاجه حلوه» → shopping, not echoed as a product', r.intent === 'shop' && !/ملقتش «/.test(r.say || ''), (r.say || '').slice(0, 40)); }
{ const r = await conv(['ممكن ترشحيلي حاجه']); ok('R7b «ممكن ترشحيلي حاجه» → shopping', r.intent === 'shop', r.intent); }
{ const r = await conv(['نقيلي حاجة للخروجة']); ok('R7b «نقيلي» + occasion → shopping', r.intent === 'shop', r.intent); }
{ const r = await conv(['اختارلي حاجة شيك']); ok('R7b «اختارلي حاجة شيك» → shopping', r.intent === 'shop' && !/ملقتش «/.test(r.say || ''), r.intent); }
{ const r = await conv(['rashe7ly 7aga 7elwa']); ok('R7b Arabizi «rashe7ly» → shopping', r.intent === 'shop', r.intent); }
{ const r = await conv(['رشحيلي جاكيت جلد']); ok('R7b control: «رشحيلي» + garment keeps the garment', keys(r).includes('jacket'), keys(r)); }
{ const r = await conv(['حاجه حلوه']); ok('R7b control: «حاجه حلوه» alone is never echoed as a product', !/ملقتش «/.test(r.say || ''), (r.say || '').slice(0, 40)); }
// Round 7c — user report: after a dress, «حذاء رسمي» showed a men's oxford; event-role question wording; owned piece + speaker
{ const r = await conv(['عندي فستان سهرة أسود', 'حذاء رسمي']); const names = JSON.stringify(r.blocks || null); ok('R7c women + «حذاء رسمي» never shows the unmarked oxford «قرنيه»', !/قرنيه/.test(names), names.slice(0, 120)); }
{ const r = await conv(['عايز حذاء رسمي أسود']); const names = JSON.stringify(r.blocks || null); ok('R7c control: men still get the oxford', /قرنيه/.test(names), names.slice(0, 120)); }
{ const r = await conv(['عندي فستان أسود']); ok('R7c «فستان» does not trigger the «ستان» detail note', !/«ستان»/.test(r.say || ''), (r.say || '').slice(0, 60)); }
{ const r = await conv(['عايزة فستان سهرة لفرح']); const q = JSON.stringify(r.questions || []); ok('R7c role question names the wedding, not «الخطوبة»', !/الخطوبة/.test(q), q.slice(0, 120)); }
{ const r = await conv(['عايز بدلة لفرح صاحبي']); ok('R7c «فرح صاحبي» = guest, no role question', !JSON.stringify(r.questions || []).includes('engagement_role'), JSON.stringify((r.questions || []).map((q) => q.id))); }
{ const r = await conv(['عايزة فستان لفرحي']); ok('R7c control: «فرحي» is not marked guest', r.parsed?.role !== 'guest' || !r.parsed?.flags?.roleAsked, `${r.parsed?.role}`); }
{ const r = await conv(['جبت جيبة سودا ومش عارفة ألبس عليها إيه']); ok('R7c owned piece + speaker in the same message → outfit, not «مفهمتش»', r.intent === 'shop' && !/مفهمتش/.test(r.say || ''), `${r.intent} ${(r.say || '').slice(0, 30)}`); }
// Round 7d — found by shop set v2 (new phrasings)
{ const r = await conv(['طلبت جاكيت من ٥ أيام ولسه ماوصلش']); ok('R7d Arabic-Indic digits in a tracking question', r.intent === 'faq', `${r.intent}/${r.faq}`); }
{ const r = await conv(['btwaslo el mansoura?']); ok('R7d Arabizi «btwaslo» → shipping', r.intent === 'faq', `${r.intent}/${r.faq}`); }
{ const r = await conv(['عايز تيشيرت', 'ابيض 42']); ok('R7d «colour + size» reply sets both', G(r).color === 'white' && String(r.parsed?.flags?.size || r.session?.parsed?.flags?.size) === '42', JSON.stringify([G(r), r.parsed?.flags?.size])); }
{ const r = await conv(['أنا قصيرة، الفستان الطويل يليق عليا؟']); ok('R7d «الطويل» describes the dress: no tall-height tip', r.intent === 'advice' && !/للطول الفارع/.test(r.say || ''), (r.say || '').slice(0, 50)); }
{ const r = await conv(['عايزة قميص لجوزي']); ok('R7d «لجوزي» → female speaker, recipient men', r.parsed?.genderHint === 'female' && (r.parsed?.persons || []).includes('men'), JSON.stringify([r.parsed?.genderHint, r.parsed?.persons])); }
{ const r = await conv(['عايز هدية لمراتي']); ok('R7d «لمراتي» → male speaker', r.parsed?.genderHint === 'male', r.parsed?.genderHint); }
console.log(`${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
