/**
 * يطلّع اقتراحات كلمات جديدة من الأسئلة اللي تويلا مافهمتهاش (من سجل الأسئلة في قاعدة البيانات).
 * مابيعدّلش أي حاجة: بيكتب data/learning_proposals.json بس. للموافقة على كلمة: ضيفها في src/knowledge/learned_aliases.json
 * بالشكل { "key": "<نوع القطعة>", "alias": "<الكلمة>", "status": "approved" } وبتشتغل فورًا من غير تعديل كود.
 *   node src/scripts/mine-lost-queries.js [days=30] [minCount=2]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { q } from '../db/index.js';
import { proposeFromLost } from '../lib/moda/learn.js';

const days = Math.max(1, Math.min(120, Number(process.argv[2]) || 30));
const minCount = Math.max(1, Number(process.argv[3]) || 2);
const rows = q.all("SELECT text, kind, COUNT(*) AS n FROM stylist_log WHERE kind IN ('fallback','none') AND at >= datetime('now', ?) GROUP BY text, kind ORDER BY n DESC LIMIT 5000", [`-${days} days`]);
const proposals = proposeFromLost(rows, { minCount });
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'learning_proposals.json');
fs.writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), days, minCount, lostQuestions: rows.length, proposals }, null, 2));
console.log(`${rows.length} أسئلة ملقتش رد، ${proposals.length} كلمة جديدة مقترحة → ${file}`);
for (const p of proposals.slice(0, 15)) console.log(`- «${p.word}» (${p.count}×) ${p.suggestions.length ? `ممكن تكون: ${p.suggestions.map((s) => `${s.key} (قريبة من «${s.via}»)`).join('، ')}` : 'مفيش اقتراح تلقائي'}  مثال: ${p.examples[0]}`);
