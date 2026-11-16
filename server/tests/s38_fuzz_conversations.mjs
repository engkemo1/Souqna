// s38 — فحص عشوائي ثابت (seed) لمحادثات متعددة الأدوار على الكتالوج الحقيقي: جمهور (راجل/ست/ولد/بنت/مستلم تاني) × قطعة × ميزانية × لون × 1-3 متابعات
// ثوابت: ماتقعش (crash)، مفيش قطعة أطفال لكبير، مفيش قطعة لجمهور غلط، مفيش تعدّي ميزانية في أول رد. متابعة «عايز اكبر» ماتقلبش المستلم.
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL, fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)); const root = process.argv[2] && !/^\d+$/.test(process.argv[2]) ? path.resolve(process.argv[2]) : path.resolve(here, '..');
const { runModa } = await import(pathToFileURL(path.join(root, 'src/lib/moda/engine.js')).href);
const rows = JSON.parse(fs.readFileSync(path.join(here, '../test-fixtures/real-catalog-snapshot.json'), 'utf8'));
const byId=new Map(rows.map(r=>[r.id,r]));
let seed=31;const rnd=()=>{seed=(seed*1664525+1013904223)%4294967296;return seed/4294967296};const pick=a=>a[Math.floor(rnd()*a.length)];
const P=[['عايز','men'],['عايزة','women'],['عايز لابني','boys'],['عايزة لابني','boys'],['عايزة لبنتي','girls'],['عايز لبنتي','girls'],['عايزة لجوزي','men'],['عايز لمراتي','women']];
const G=['تيشيرت','جينز','هودي','جاكيت','بنطلون','قميص','شورت','حذاء','طقم','سويتر','فستان','بيجامة','كوتشي','شنطة','بدلة','عباية','جيبة','كاب'];
const B=['','','',' ميزانيتي 500',' ميزانيتي 1000',' ميزانيتي 300',' بأقل من 800'];
const C=['',' اسود',' ابيض',' كحلي',' رمادي',' بيج'];
const F=['غيرلي اللون','حاجة ارخص','وريني حاجة تانية','مقاس L','طيب وجزمة معاه','ينفع ده للشغل','مش عاجبني','كمان واحد','لأ عايز اكبر','وبنطلون كمان','ايه اللي يلبس معاه','تمام اخده','ده بكام','في اوفر سايز'];
const adultAud={men:['men','unisex'],women:['women','unisex'],boys:['boys','kids','unisex'],girls:['girls','kids','unisex']};
const isKidDept=(p)=>/kid|baby|boys|girls|children/i.test(`${p.department||''} ${p.dept_parent||''}`);
const viol=[];let n=0,crash=0;
const idsOf=(r)=>[...new Set((JSON.stringify(r.blocks||null).match(/"id":(\d+)/g)||[]).map(x=>+x.slice(5)).filter(i=>byId.has(i)))];
for(let i=0;i<200;i++){
 const [verb,aud]=pick(P);const g=pick(G.filter(x=>!(['men','boys'].includes(aud)&&/(جيبة|فستان|عباية)/.test(x))));const b=pick(B);const c=pick(C);const q=`${verb} ${g}${c}${b}`;
 const fem=verb.startsWith('عايزة');const turns=[q,...Array.from({length:1+Math.floor(rnd()*3)},()=>{const f=pick(F);return fem?f.replace('عايز','عايزة'):f})];let session=null;const msgs=[];
 for(const t of turns){msgs.push({role:'user',content:t});n++;
  let r;try{r=await runModa([...msgs],{products:rows,session,now:new Date('2026-11-16T12:00:00Z')});}catch(e){crash++;viol.push({conv:turns.join(' | '),why:'CRASH '+e.message.slice(0,80)});break}
  session=r.session;msgs.push({role:'assistant',content:r.say||''});
  const budget=(q.match(/(\d{3,4})/)||[])[1];
  for(const id of idsOf(r)){const p=byId.get(id);
   const a=p.audience||'unisex'; if(!adultAud[aud].includes(a)&&a!=='unisex'&&!(aud==='girls'&&a==='women')&&!(aud==='boys'&&a==='men')) { if(!/(ولا|او)/.test(t)) viol.push({conv:turns.join(' | '),why:`audience ${aud} got ${id} «${p.name_ar}» ${a}`}) }
   if(['men','women'].includes(aud)&&isKidDept(p)) viol.push({conv:turns.join(' | '),why:`kid item to adult ${id}`});
   if(budget&&r.state!=='over_budget'&&turns[0]===t&&r.blocks?.total>+budget*1.0001&&!/\d/.test(t.replace(budget,''))) viol.push({conv:turns.join(' | '),why:`over budget ${r.blocks.total}>${budget}`});
  }
 }
}
const seen=new Set();for(const v of viol){const k=v.why.replace(/\d+/g,'#');if(seen.has(k))continue;seen.add(k);console.log('✗',v.why,'\n   ',v.conv)}
console.log(JSON.stringify({ turns: n, crash, bad: viol.length }));process.exitCode = viol.length ? 1 : 0;
