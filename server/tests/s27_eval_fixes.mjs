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
console.log(`${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
