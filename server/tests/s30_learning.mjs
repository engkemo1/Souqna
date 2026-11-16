// s30 — التعلّم بمراجعة: الاقتراحات + الكلمات المعتمدة (learned_aliases.json) من غير شبكة ولا قاعدة بيانات.
// node tests/s30_learning.mjs [engineRoot]
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { pathToFileURL, fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(here, '..');
const L = (f) => import(pathToFileURL(path.join(root, f)).href);
const { proposeFromLost, dice } = await L('src/lib/moda/learn.js');
const { loadKnowledge } = await L('src/lib/moda/knowledge.js');
let pass = 0; let fail = 0; const t = (name, ok, extra = '') => { if (ok) pass += 1; else fail += 1; console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` ${extra}`}`); };

t('dice: نفس الكلمة = 1', dice('بنطلون', 'بنطلون') === 1);
t('dice: كلمتين مختلفتين خالص قيمتها قليلة', dice('فستان', 'كوتشي') < 0.3);
const K = loadKnowledge();
const rows = [
  { kind: 'fallback', text: 'عايزة بنطرون واسع', n: 3 }, { kind: 'none', text: 'عايزة بنطرون واسع', n: 1 },
  { kind: 'fallback', text: 'عايز سويتشيرت رمادي', n: 2 }, { kind: 'faq', text: 'ازاي اطلب', n: 9 }, { kind: 'fallback', text: 'عايزة فستان 123456', n: 1 },
];
const p = proposeFromLost(rows, { K });
const w = p.find((x) => /بنطرون/.test(x.word));
t('كلمة جديدة بتتقترح بعد ما تتكرر', !!w && w.count >= 4, JSON.stringify(p.map((x) => x.word)));
t('الاقتراح قريب من بنطلون', !!w && w.suggestions.some((s) => /trousers|jeans|bottom|pants/i.test(s.key)), JSON.stringify(w?.suggestions));
t('سجل من نوع faq مابيتحسبش', !p.some((x) => x.word === 'اطلب'));
t('الأرقام والكلمات المعروفة مابتتقترحش', !p.some((x) => /^\d+$/.test(x.word) || x.word === 'فستان' || x.word === 'رمادي'));
t('كلمة بتتكرر مرة واحدة بس مابتتقترحش', !proposeFromLost([{ kind: 'fallback', text: 'عايزة شاليموه', n: 1 }], { K }).length);

// الكلمات المعتمدة: بتشتغل فقط لو approved ومفتاح موجود، ومابتغيّرش معنى كلمة موجودة
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'twila-learn-'));
fs.cpSync(path.join(root, 'src'), path.join(dir, 'src'), { recursive: true }); fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
fs.writeFileSync(path.join(dir, 'src/knowledge/learned_aliases.json'), JSON.stringify({ entries: [
  { key: 'dress_party', alias: 'سواريهات', status: 'approved' }, { key: 'dress_party', alias: 'كلمهمعتمدهجديده', status: 'pending' },
  { key: 'nonexistent_key', alias: 'حاجهغريبه', status: 'approved' }, { key: 'sneakers', alias: 'فستان', status: 'approved' } ] }));
const { inferKey } = await import(pathToFileURL(path.join(dir, 'src/lib/moda/products.js')).href);
const K2 = (await import(pathToFileURL(path.join(dir, 'src/lib/moda/knowledge.js')).href)).loadKnowledge({ force: true });
t('كلمة معتمدة بتتفهم', inferKey('سواريهات', K2) === 'dress_party', String(inferKey('سواريهات', K2)));
t('كلمة status مش approved بتتجاهل', inferKey('كلمهمعتمدهجديده', K2) === null);
t('مفتاح مش موجود بيتجاهل', inferKey('حاجهغريبه', K2) === null);
t('كلمة ليها معنى تاني (فستان) مابتتغيرش', inferKey('فستان', K2) !== 'sneakers');
console.log(`${pass} PASS / ${fail} FAIL`); process.exitCode = fail ? 1 : 0;
