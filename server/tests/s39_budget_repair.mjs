// s39 — حاسبة الميزانية: لو خطة الموديل عدّت الميزانية، الكود يبدّل بأرخص بديل (نفس النوع، نفس الفئة، من قايمة الكود)
// بدل ما يرمي الخطة. بيانات اصطناعية (مش كتالوج حقيقي) لأن الاختبار بيفحص المنطق نفسه.
import path from 'node:path'; import { pathToFileURL, fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(here, '..');
const { repairToBudget, buildCuratedPlan } = await import(pathToFileURL(path.join(root, 'src/lib/moda/curate.js')).href);
const fails = []; let total = 0;
const eq = (name, got, want) => { total += 1; if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
const P = (id, key, price) => ({ id, key, price, name_ar: `${key}${id}` });
const mk = (aud, picks) => ({ aud, picks: picks.map((product) => ({ slotKey: product.key, product, why: 'x' })), subtotal: picks.reduce((t, p) => t + p.price, 0), look: { tip_ar: 'نصيحة' } });
const sum = (people) => people.reduce((t, pe) => t + pe.picks.reduce((x, p) => x + p.product.price, 0), 0);

// 1) شخصين، فوق الميزانية، بدائل موجودة: يدخل في الميزانية بنفس الأنواع
{
  const pools = { women: [P(1, 'dress', 1500), P(2, 'dress', 900), P(3, 'dress', 600), P(4, 'shoes', 1200), P(5, 'shoes', 500)], girls: [P(6, 'dress', 800), P(7, 'dress', 400)] };
  const people = [mk('women', [pools.women[0], pools.women[3]]), mk('girls', [pools.girls[0]])];
  const t = repairToBudget(people, pools, 2500);
  eq('1 fits budget', t <= 2500, true);
  eq('1 same types', people.map((pe) => pe.picks.map((p) => p.product.key)), [['dress', 'shoes'], ['dress']]);
  eq('1 total consistent', t, sum(people));
  eq('1 swapped pieces flagged', people.flatMap((pe) => pe.picks).filter((p) => p.repaired).length > 0, true);
  eq('1 audience stays in own pool', people[1].picks.every((p) => pools.girls.includes(p.product)), true);
}
// 2) مفيش بديل أرخص: null (يرجع لترشيح القواعد)
{
  const pools = { men: [P(1, 'suit', 5000)] };
  eq('2 no alt -> null', repairToBudget([mk('men', [pools.men[0]])], pools, 3000), null);
}
// 3) تحت الميزانية أصلًا: مفيش تغيير
{
  const pools = { men: [P(1, 'shirt', 300), P(2, 'shirt', 200)] };
  const people = [mk('men', [pools.men[0]])]; const t = repairToBudget(people, pools, 500);
  eq('3 untouched', [t, people[0].picks[0].product.id, Boolean(people[0].picks[0].repaired)], [300, 1, false]);
}
// 4) مفيش تكرار نوع في نفس الشخص ولا نفس المنتج لشخصين
{
  const pools = { women: [P(1, 'shoes', 900), P(2, 'shoes', 600), P(3, 'bag', 700), P(4, 'bag', 300)], girls: [P(2, 'shoes', 600), P(5, 'shoes', 200)] };
  const people = [mk('women', [pools.women[0], pools.women[2]]), mk('girls', [pools.girls[0]])];
  const t = repairToBudget(people, pools, 1300);
  const ids = people.flatMap((pe) => pe.picks.map((p) => p.product.id));
  eq('4 unique ids', new Set(ids).size, ids.length);
  eq('4 fits or null', t === null || t <= 1300, true);
}
// 5) تبديل مش بيحتفظ بشرح الموديل القديم (ممكن يوصف منتج تاني)
{
  const pools = { men: [P(1, 'shirt', 900), P(2, 'shirt', 400)] };
  const people = [mk('men', [pools.men[0]])]; repairToBudget(people, pools, 500);
  eq('5 why cleared + tip cleared', [people[0].picks[0].why, people[0].look.tip_ar], [null, null]);
}
// 6) ميزانية مستحيلة حتى بأرخص بدائل: null (مش خطة ناقصة صامتة)
{
  const pools = { men: [P(1, 'shirt', 900), P(2, 'shirt', 800), P(3, 'trousers', 1000), P(4, 'trousers', 950)] };
  eq('6 impossible -> null', repairToBudget([mk('men', [pools.men[0], pools.men[2]])], pools, 1000), null);
}
// 7) من خلال buildCuratedPlan: خطة فوق الميزانية بتتصلّح بدل ما ترجع null، ولو مستحيلة ترجع null
{
  const K = { items: new Map([['shirt', {}], ['trousers', {}]]), contexts: new Set() };
  const pools = { men: [{ ...P(1, 'shirt', 900), colorKeys: [] }, { ...P(2, 'shirt', 300), colorKeys: [] }, { ...P(3, 'trousers', 800), colorKeys: [] }, { ...P(4, 'trousers', 400), colorKeys: [] }] };
  const out = { people: [{ aud: 'men', items: [{ type: 'shirt', productId: 1 }, { type: 'trousers', productId: 3 }] }] };
  let plan = null; try { plan = buildCuratedPlan(out, { plan: {}, pools, persons: ['men'], budget: 800, K }); } catch (e) { fails.push('7 threw ' + e.message); }
  eq('7 repaired through buildCuratedPlan', [Boolean(plan), plan?.total <= 800, plan?.curated], [true, true, true]);
  const none = buildCuratedPlan(out, { plan: {}, pools, persons: ['men'], budget: 500, K });
  eq('7b impossible -> null', none, null);
}
for (const f of fails) console.log('✗', f);
console.log(JSON.stringify({ total, bad: fails.length, ok: total - fails.length })); process.exitCode = fails.length ? 1 : 0;
