// s35 — أسئلة عملاء شائعة على مواقع الأزياء المصرية (مقاس بين مقاسين، المقاس بيطلع واسع، الطول، الكرمشة…) لازم تتجاوب مش تتحول لبحث منتجات؛ وطلبات الشراء المشابهة تفضل ترشيح.
// الصيغ كتبتها أنا بالعامية بعد قراءة مواضيع الأسئلة في مدونات متاجر (gos.sa, addaxsa, adora-dresses) — مش أسئلة عملاء فعلية منقولة.
import path from 'node:path'; import fs from 'node:fs'; import { pathToFileURL, fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(here, '..');
const { runModa } = await import(pathToFileURL(path.join(root, 'src/lib/moda/engine.js')).href);
const rows = JSON.parse(fs.readFileSync(path.join(here, '../test-fixtures/real-catalog-snapshot.json'), 'utf8'));
const now = new Date('2026-11-16T12:00:00Z'); const ask = (q) => runModa([{ role: 'user', content: q }], { products: rows, session: null, now });
const fails = []; let total = 0;
const FAQ = [['انا بين مقاسين M و L اخد انهي', 'size_between'], ['محتار بين مقاسين', 'size_between'], ['مقاس البيجامة بيطلع واسع ولا ضيق', 'size_runs'], ['المقاس بيطلع صغير ولا مظبوط', 'size_runs'], ['طول الفستان ده لحد فين', 'length_q'], ['طول الجاكيت قد ايه', 'length_q'], ['هل القطن بيتكرمش', 'wrinkle'], ['الكتان بيتكرمش', 'wrinkle']];
for (const [q, id] of FAQ) { total += 1; const r = await ask(q); if (r.faq !== id || r.blocks) fails.push(`${q} → ${r.state}/${r.faq} (want ${id})`); }
const SHOP = ['عايزة فستان طوله ميدي', 'عايز تيشيرت مقاس L', 'عايزة بنطلون مقاس M', 'عايز جاكيت طويل'];
for (const q of SHOP) { total += 1; const r = await ask(q); if (r.intent === 'faq') fails.push(`${q} wrongly answered as FAQ ${r.faq}`); }
for (const f of fails) console.log('✗', f);
console.log(JSON.stringify({ total, bad: fails.length, ok: total - fails.length })); process.exitCode = fails.length ? 1 : 0;
