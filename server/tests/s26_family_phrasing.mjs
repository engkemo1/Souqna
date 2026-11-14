
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
// Portable: works from server/tests/ on the device (Windows/Mac/Linux) and from the sandbox harness.
//   node <this file> [serverDir]   — catalog: $TWILA_CATALOG, else tests/fixtures/cat1.txt, else /tmp/t/cat1.txt
const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(process.argv[2] || (fs.existsSync(path.join(here, 'src')) ? here : path.join(here, '..')));
const { runModa } = await import(pathToFileURL(path.join(dir, 'src/lib/moda/engine.js')).href);
const catPath = process.env.TWILA_CATALOG || [path.join(here, 'fixtures', 'cat1.txt'), '/tmp/t/cat1.txt'].find((p) => fs.existsSync(p));
if (!catPath) { console.error('catalog fixture cat1.txt not found (set TWILA_CATALOG)'); process.exit(2); }
const rows = fs.readFileSync(catPath,'utf8').trim().split('\n').map((l)=>{ const [id,name,price,cols]=l.split('|'); return { id:+id, name_ar:name, name_en:'', price:+price, stock:5, cat_text:'', description_ar:'', sold_count:5, colors_json: cols? cols.split('/').map(n=>({name_ar:n})):[] }; });
const run = (q)=>runModa([{role:'user',content:q}],{products:rows,now:new Date('2026-11-14T12:00:00Z')});
let pass=0, fail=0;
const ok=(n,c,x='')=>{ c?pass++:fail++; console.log((c?'PASS':'FAIL'),n,c?'':x); };
const P=(r)=>[...r.parsed.persons].sort().join(',');
const cases = [
 ['عايز طقم خروجة لراجل ومراته ميزانيتنا 8000','men,women'],
 ['عايز طقم خروجة لراجل وحرمه ميزانيتنا 8000','men,women'],
 ['عايز طقم خروجة لراجل ومراته وابنه ميزانيتنا 9000','boys,men,women'],
 ['عايز طقم خروجة لراجل ومراته وبنته ميزانيتنا 9000','girls,men,women'],
 ['عايز طقم خروجة لراجل وحرمه وابنه وبنته ميزانيتنا 9000','boys,girls,men,women'],
 ['عايز طقم خروجة لست وجوزها ميزانيتنا 8000','men,women'],
 ['عايز طقم خروجة لراجل ومراتي ميزانيتنا 8000','men,women'],
 ['عايز طقم خروجة لراجل وست ميزانيتنا 8000','men,women'],
 ['عايز طقم خروجة لست ورجل ميزانيتنا 8000','men,women'],
 ['عايز طقم خروجة لراجل وست وولد ميزانيتنا 9000','boys,men,women'],
 ['عايز طقم خروجة لي ولمراتي ميزانيتنا 8000','men,women'],
 ['عايز طقم خروجة لمراتي ولي ميزانيتنا 8000','men,women'],
 ['عايز طقم خروجة لراجل وولد ميزانيتنا 8000','boys,men'],
];
for (const [q,exp] of cases){ const r=await run(q); ok('persons '+q.slice(0,45)+' => '+exp, P(r).startsWith(exp.split(',')[0]) && exp.split(',').every(p=>P(r).includes(p)) , P(r)); }
// الحدود اللي اتصلحت
for (const [q,exp] of [['عايز طقم خروجة لي ولمراتي المحجبة ميزانيتنا 8000','men,women'],['عايز طقم خروجة لمراتي المحجبة ولي ميزانيتنا 8000','men,women'],['عايز طقم خروجة ليها ميزانيتي 3000','women'],['عايز هدية لها','women']]) { const r=await run(q); const ps=r.parsed.persons.map(p=>p==='women_hijab'?'women':p); ok('fixed '+q.slice(0,45), exp.split(',').every(p=>ps.includes(p)) && ps.length===exp.split(',').length, ps.join(',')); }
{ const items=(r)=>(r.blocks?.tabs||[]).flatMap(t=>t.items);
  for (const q of ['عايز كوتشي لراجل ومراته ميزانيتنا 4000','عايز كوتشي لراجل ومراته المحجبة ميزانيتنا 4000','عايز كوتشي لراجل ومراته وابنه ميزانيتنا 5000','عايز تيشيرت لراجل وابنه ميزانيتنا 5000']) {
    const r=await run(q); const tabs=r.blocks?.tabs||[]; const its=items(r); const ids=its.map(i=>i.id);
    ok('sneaker/tee multi: not none '+q.slice(0,40), r.state!=='none' && tabs.length===r.parsed.persons.length, r.state+' tabs '+tabs.length);
    ok('  no duplicate product '+q.slice(0,40), new Set(ids).size===ids.length);
    const sum=its.reduce((s,i)=>s+i.price,0); ok('  total matches shown items '+q.slice(0,40), r.blocks.total===sum, r.blocks.total+' vs '+sum);
    const stock=new Set(rows.map(x=>x.id)); ok('  all in stock', its.every(i=>stock.has(i.id)));
  } }
// kids unspecified
{ const r=await run('عايز طقم خروجة لراجل ومراته وولاده ميزانيتنا 9000'); ok('ولاده -> men,women + kidsUnspecified', P(r).includes('men')&&P(r).includes('women')&&r.parsed.kidsUnspecified===true, P(r)+' '+r.parsed.kidsUnspecified); }
// hijab specified -> per-person tabs, in budget, products from stock
for (const q of ['عايز طقم خروجة لراجل وست محجبة ميزانيتنا 8000','عايز طقم خروجة لراجل ومراته المحجبة ميزانيتنا 8000','عايز طقم خروجة لراجل ومراته مش محجبة ميزانيتنا 8000','عايز طقم خروجة لراجل ومراته المحجبة وابنه ميزانيتنا 9000']) {
  const r=await run(q); const tabs=r.blocks?.tabs||[]; const ids=new Set(rows.map(x=>x.id));
  const items=tabs.flatMap(t=>t.items); const total=items.reduce((s,i)=>s+(i.price||0),0);
  const budget=+(q.match(/(\d{4})/)[1]);
  ok('tabs>=2 '+q.slice(20,60), tabs.length>=2, tabs.length);
  ok('in stock '+q.slice(20,60), items.every(i=>ids.has(i.id||i.productId)), '');
  ok('<=budget '+q.slice(20,60), total<=budget, total);
  const noDup=new Set(items.map(i=>i.id||i.productId)).size===items.length; ok('no dup product', noDup);
}
// controls unchanged
for (const [q,exp] of [['عايز طقم خروجة لراجل ميزانيتي 3000','men'],['عايز طقم خروجة لست ميزانيتي 3000','women'],['عايز طقم خروجة لراجل و ست ميزانيتنا 5000','men'],['عايز طقم خروجة لراجل وبنت','men'],['عايز قميص وست','men'],['عايز طقم خروجة لمراتي ميزانيتي 3000','women'],['عايز طقم خروجة لراجل ولمراتي ميزانيتنا 5000','men,women']]) { const r=await run(q); ok('control '+q.slice(0,40), exp.split(',').every(p=>P(r).includes(p)) && P(r).split(',').length===exp.split(',').length, P(r)); }
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail?1:0);
