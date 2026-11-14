/**
 * قاعدة معرفة الموضة (fashion_kb.json) → محرك تويلا.
 * قاعدة المعرفة هي مصدر المعلومة (أسماء القطع بالمصري، تنسيق كل قطعة، الفصول، البدائل، قواعد الألوان والتنسيق)،
 * والجسر (kb_bridge.json) بيقول كل معرّف فيها بيقابل أنهي نوع عندنا + قواعد Twist اللي بتغلبها.
 * تحديث القاعدة (ملف أو رفع من الأدمن) بيغيّر سلوك تويلا من غير كود ولا تعديل في الـ prompt.
 */
import { norm } from './text.js';

const COLD = new Set(['autumn', 'winter']);
const WARM = new Set(['summer', 'spring']);
const GROUP_ORDER = ['tops', 'bottoms', 'clothing', 'shoes', 'outerwear'];
const arr = (v) => (Array.isArray(v) ? v : []);
/** أقصى طول لإرشادات الموضة اللي بتدخل prompt الـ AI (حرف). كل قسم فيها بيترتّب بالأهمية، فاللي يتقص هو الأقل أهمية. */
export const GUIDE_MAX = 9000;

/** بيبني كل اللي المحرك محتاجه من قاعدة المعرفة. existing = { garments: {key:[aliases]}, colors: {key:[aliases]}, itemKeys:Set } */
export function buildKb(kb, bridge, existing) {
  const report = { items: 0, mappedItems: 0, unmapped: [], aliasesAdded: 0, aliasesSkipped: [], colorAliasesAdded: 0, warnings: [] };
  if (!kb || !Array.isArray(kb.items)) return { aliasEntries: [], pairsFor: () => null, seasonOf: () => null, alternativesOf: () => [], guide: '', guideFor: () => '', pairingHint: () => '', whyAr: () => null, occasionsAr: () => [], report: { ...report, warnings: ['قاعدة المعرفة مش موجودة أو شكلها غلط'] }, version: null };
  const B = bridge || {};
  const itemMap = B.items || {};
  const idAliases = kb.id_aliases || {};
  // معرّف القاعدة → نوع عندنا (الجسر الأول، وبعدين id_aliases بتاعة القاعدة نفسها)
  const toKey = (id) => {
    if (!id) return null;
    if (itemMap[id] && existing.itemKeys.has(itemMap[id])) return itemMap[id];
    const via = idAliases[id];
    if (via && via !== id && itemMap[via] && existing.itemKeys.has(itemMap[via])) return itemMap[via];
    return null;
  };
  // أخطاء واضحة في id_aliases (القاعدة بتقول إن الكاب نضارة مثلًا) — بنبلّغ عنها ومنستخدمهاش لما الجسر يقول غير كده
  for (const [a, target] of Object.entries(idAliases)) {
    if (itemMap[a] && itemMap[target] && itemMap[a] !== itemMap[target]) report.warnings.push(`id_aliases: ${a} → ${target} مش منطقي (${itemMap[a]} مش ${itemMap[target]})، الجسر هو اللي اتطبّق`);
  }

  // ---------- الأسماء: كل أسماء القاعدة (عربي، مصري، إنجليزي) بتبقى كلمات تويلا بتفهمها ----------
  const owner = new Map(); // اسم معياري → نوع موجود
  for (const [key, list] of Object.entries(existing.garments || {})) if (Array.isArray(list) && !key.startsWith('_')) for (const a of list) owner.set(norm(a), key);
  const colorWords = new Set(); for (const [key, list] of Object.entries(existing.colors || {})) if (Array.isArray(list) && !key.startsWith('_')) for (const a of list) colorWords.add(norm(a));
  const ignore = new Set(arr(B.ignore_aliases).map(norm));
  // كلمات ليها معنى تاني عند تويلا (مناسبة، فئة، ذوق…): اسم قطعة فيه كلمة منهم بيتساب، عشان «فستان فرح» تفضل فستان + فرح
  const other = new Set(); const generic = new Set();
  const addTo = (set, w) => { const n = norm(w); if (!n) return; set.add(n); const bare = n.replace(/^ال/, ''); if (bare.length > 1) { set.add(bare); set.add(`ل${bare}`); set.add(`لل${bare}`); } };
  for (const list of Object.values(existing.otherWords || {})) for (const a of arr(list)) addTo(other, a);
  // كلمات عامة («لبس»/«طقم»…): اسم من كلمة واحدة منهم بيتساب (بيغيّر فهم الطلب لو اتخطف)،
  // لكن اسم من أكتر من كلمة زي «طقم قطعتين»/«طقم رياضي» آمن (المحلل بياخد أطول تطابق) طالما مفيهوش كلمة مناسبة/فئة.
  for (const w of ['لبس', 'طقم', 'اطقم', 'ملابس', 'هدوم', 'قطعة', 'قطع', 'موديل', 'ستايل', 'حاجة', 'طلب', 'outfit', 'set', 'look', 'clothes']) addTo(generic, w);
  const hasBlocked = (n) => { const w = n.split(' '); const multi = w.length > 1; for (let i = 0; i < w.length; i += 1) for (let j = i + 1; j <= w.length; j += 1) { const part = w.slice(i, j).join(' '); if (generic.has(part)) { if (!multi) return true; continue; } if (other.has(part)) return true; } return false; };
  const add = new Map(); // key → [aliases]
  const byKey = new Map(); // key → [kb items]
  for (const it of kb.items) {
    report.items += 1;
    const key = toKey(it.id);
    if (!key) { report.unmapped.push(it.id); continue; }
    report.mappedItems += 1;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(it);
    const names = [...arr(it.names?.ar), ...arr(it.names?.['ar-EG']), ...arr(it.names?.en)].flatMap((n) => String(n).split(/\s*\/\s*/));
    for (const raw of names) {
      const n = norm(raw);
      if (!n || n.length < 2 || ignore.has(n) || colorWords.has(n)) continue;
      if (owner.get(n) === key) continue; // الاسم معروف أصلًا لنفس النوع (زي «طقم رياضي» = ترينج): مفيش تعارض ومفيش داعي لبلاغ
      if (hasBlocked(n)) { report.aliasesSkipped.push(`${raw} (فيها كلمة مناسبة/فئة)`); continue; }
      const cur = owner.get(n);
      if (cur && cur !== key) { report.aliasesSkipped.push(`${raw} (${it.id}→${key}، موجودة عند ${cur})`); continue; }
      if (cur === key) continue;
      owner.set(n, key);
      if (!add.has(key)) add.set(key, []);
      add.get(key).push(raw);
      report.aliasesAdded += 1;
    }
  }
  const aliasEntries = [...add].map(([key, aliases]) => ({ group: 'garment', key, aliases }));
  // ألوان بالمصري (لبني، رصاصي، نبيتي…)
  const colorAdd = new Map();
  for (const c of arr(kb.colors)) {
    const key = B.colors?.[c.id];
    if (!key) continue;
    for (const raw of [c.ar, c['ar-EG'], c.en].filter(Boolean).flatMap((x) => String(x).split(/\s*\/\s*/))) {
      const n = norm(raw);
      if (!n || colorWords.has(n) || owner.has(n) || hasBlocked(n)) continue;
      colorWords.add(n);
      if (!colorAdd.has(key)) colorAdd.set(key, []);
      colorAdd.get(key).push(raw);
      report.colorAliasesAdded += 1;
    }
  }
  for (const [key, aliases] of colorAdd) aliasEntries.push({ group: 'color', key, aliases });

  // ---------- الفصول ----------
  const seasonOverride = B.season_override || {};
  const seasonOf = (key) => {
    if (typeof seasonOverride[key] === 'string') return seasonOverride[key];
    const its = byKey.get(key);
    if (!its?.length) return null;
    const sets = its.map((it) => arr(it.seasons));
    if (sets.some((s) => !s.length || s.includes('all'))) return 'all';
    if (sets.every((s) => s.every((x) => COLD.has(x)))) return 'winter';
    if (sets.every((s) => s.every((x) => WARM.has(x)))) return 'summer';
    return 'all';
  };

  // ---------- التنسيق حوالين قطعة: قواعد Twist الأول، وبعدين pair_with من القاعدة ----------
  const womenOnly = new Set(arr(B.women_only)); const menOnly = new Set(arr(B.men_only));
  const fits = (side, k) => (side === 'men' ? !womenOnly.has(k) : !menOnly.has(k));
  const pairsFor = (key, side) => {
    const rule = B.pair_rules?.[key];
    if (rule && Array.isArray(rule[side])) return rule[side];
    const its = byKey.get(key);
    if (!its?.length) return null;
    const groups = new Map();
    for (const it of its) for (const [g, ids] of Object.entries(it.pair_with || {})) {
      const list = groups.get(g) || [];
      for (const id of arr(ids)) { const k = toKey(id); if (k && k !== key && fits(side, k) && !list.includes(k)) list.push(k); }
      groups.set(g, list);
    }
    const out = [];
    for (const g of [...GROUP_ORDER, ...[...groups.keys()].filter((x) => !GROUP_ORDER.includes(x))]) {
      const list = groups.get(g);
      if (list?.length) out.push(list.slice(0, 4).join('|'));
    }
    return out.length ? out : null;
  };
  const alternativesOf = (key) => {
    const out = [];
    for (const it of byKey.get(key) || []) for (const id of arr(it.alternatives)) { const k = toKey(id); if (k && k !== key && !out.includes(k)) out.push(k); }
    return out;
  };

  // ---------- إرشادات للـ AI (المنسّق): من القاعدة نفسها، مش مكتوبة في الكود ----------
  const name = (id) => { const it = kb.items.find((x) => x.id === id); return it?.names?.['ar-EG']?.[0] || it?.names?.ar?.[0] || String(id).replace(/_/g, ' '); };
  const head = ['FASHION KNOWLEDGE BASE (Twist\'s source of styling knowledge — follow it, adapt to the customer and the real stock):', ...arr(kb.stylist_system_prompt).map((s) => `- ${s}`), ...arr(kb.usage_notes).map((s) => `- ${s}`)];
  const colourLine = arr(kb.color_harmony_rules).length ? `Colour harmony: ${arr(kb.color_harmony_rules).map((r) => r.rule).join(' ')}` : '';
  const ruleText = (r) => `[${r.when}] ${Array.isArray(r.recommend) ? `prefer ${r.recommend.map(name).join(', ')}` : r.recommend || ''}${r.combinations ? ` e.g. ${r.combinations.map((c) => c.map(name).join(' + ')).join(' / ')}` : ''}${r.avoid_unless_requested ? `; avoid ${r.avoid_unless_requested.map(name).join(', ')} unless asked` : ''}${r.prefer_materials ? `; fabrics ${r.prefer_materials.join(', ')}` : ''}`;
  const rulesSorted = arr(kb.outfit_rules).slice().sort((a, b) => (b.priority || 0) - (a.priority || 0));
  const combosLine = arr(kb.compatibility_examples).length ? `Proven combinations: ${arr(kb.compatibility_examples).map((c) => `${c.items.map(name).join(' + ')} (${c.style})`).join('; ')}` : '';
  const looksLine = arr(kb.outfit_looks).length ? `Ready looks (occasion/season/who): ${arr(kb.outfit_looks).map((l) => `${l.occasion}/${arr(l.season).join('+')}/${l.gender}: ${arr(l.items).map(name).join(' + ')}`).join('; ')}` : '';
  const altLine = arr(kb.alternative_strategy).length ? `Alternatives: ${arr(kb.alternative_strategy).map((a) => a.rule).join(' ')}` : '';
  const guide = [...head, colourLine, rulesSorted.length ? `Outfit rules: ${rulesSorted.map(ruleText).join(' | ')}` : '', combosLine, looksLine, altLine].filter(Boolean).join('\n').slice(0, GUIDE_MAX);
  /** نسخ مضغوطة من الإرشادات لما الـ prompt يقرّب من حد مزوّد الـ AI (Groq المجاني ~8k توكن/دقيقة): بنشيل الأقل أهمية للطلب الحالي الأول، وبنفضل ماسكين القواعد حسب الأولوية.
   *  0 = كامل · 1 = من غير «Proven combinations» و«Ready looks» (pairingHint بيغطيهم للقطع المطلوبة) · 2 = القواعد الأعلى أولوية بس لحد maxRuleChars (قواعد كاملة، مش مقطوعة في النص) */
  const guideFor = (level = 0, { maxRuleChars = 3200, focus = [] } = {}) => {
    if (level <= 0) return guide;
    if (level === 1) return [...head, colourLine, rulesSorted.length ? `Outfit rules: ${rulesSorted.map(ruleText).join(' | ')}` : '', altLine].filter(Boolean).join('\n').slice(0, GUIDE_MAX);
    const kept = []; let used = 0;
    const words = [...new Set(arr(focus).flatMap((f) => String(f || '').toLowerCase().split(/[_\s]+/)).filter((w) => w.length >= 4).map((w) => w.replace(/s$/, '')))];
    const rel = (r) => { const t = ruleText(r).toLowerCase(); return words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0); };
    const ranked = rulesSorted.map((r, i) => ({ r, i, sc: (r.priority || 0) >= 16 ? 99 : rel(r) })).sort((a, b) => b.sc - a.sc || a.i - b.i); // القواعد الأساسية جدًا (أولوية ≥16: المخزون أولًا، قواعد Twist، الشرح، منع التنافر، الرسمية) دايمًا، وبعدها الأقرب للقطع/المناسبة المطلوبة
    for (const { r } of ranked) { const t = ruleText(r); if (used + t.length + 3 > maxRuleChars) continue; kept.push(t); used += t.length + 3; }
    return [...head, colourLine, kept.length ? `Outfit rules (highest priority): ${kept.join(' | ')}` : '', altLine].filter(Boolean).join('\n').slice(0, GUIDE_MAX);
  };

  /** تنسيق مختصر لقطع معيّنة (للـ AI في الطلب الحالي) */
  const pairingHint = (keys = [], { maxPer = 900 } = {}) => [...new Set(keys)].slice(0, 4).map((k) => {
    const its = byKey.get(k); if (!its?.length) return '';
    const p = pairsFor(k, 'women') || []; const m = pairsFor(k, 'men') || [];
    const alt = alternativesOf(k);
    const uniq = (xs, n) => [...new Set(xs.filter(Boolean))].slice(0, n);
    const occ = uniq(its.flatMap((it) => arr(it.occasions)), 6); const sty = uniq(its.flatMap((it) => arr(it.styles)), 4);
    const avoid = []; for (const a of its.flatMap((it) => arr(it.avoid_with))) if (a?.id && a.reason && !avoid.some((x) => x.id === a.id)) avoid.push(a);
    const why = uniq(its.map((it) => it.why), 2); const col = uniq(its.map((it) => it.color_tips), 1);
    // الأقسام مرتبة من الأهم للأقل: لما المساحة تضيق نشيل من الآخر (styles ثم colours ثم occasions…) ونفضل ماسكين pairs/season وأسباب التجنب (AVOID).
    const seg = {
      pairs: `${k}: pairs with ${[...new Set([...m, ...p])].join(', ') || '-'}`, season: `season ${seasonOf(k) || 'all'}`,
      alt: alt.length ? `alternatives ${alt.join(', ')}` : '', occ: occ.length ? `good for ${occ.join(', ')}` : '', sty: sty.length ? `styles ${sty.join(', ')}` : '',
      why: why.length ? `why it works: ${why.join(' ')}` : '', col: col.length ? `colours: ${col[0]}` : '',
    };
    let av = avoid.slice(0, 4).map((a) => `${name(a.id)} (${a.reason})`);
    const build = () => [seg.pairs, seg.season, seg.alt, seg.occ, seg.sty, seg.why, seg.col, av.length ? `AVOID: ${av.join(' | ')}` : ''].filter(Boolean).join('; ');
    let out = build();
    for (const drop of ['sty', 'col', 'occ', 'alt', 'why']) { if (out.length <= maxPer) break; seg[drop] = ''; out = build(); }
    while (out.length > maxPer && av.length > 1) { av = av.slice(0, -1); out = build(); }
    return out.slice(0, maxPer);
  }).filter(Boolean).join('\n');

  /** سبب اختيار نوع القطعة بالعربي (من قاعدة المعرفة) — بيظهر للعميل لو الطقم جه من القواعد من غير شرح الـ AI */
  /** مناسبات القطعة بالعربي (من قاعدة المعرفة) — بديل مفيد وصادق لما سبب القطعة بيذكر قطعة تانية مش في الطقم */
  const OCC_AR = { daily: 'اليومي', university: 'الجامعة', outing: 'الخروجات', travel: 'السفر', office: 'الشغل', work: 'الشغل', meeting: 'الاجتماعات', interview: 'المقابلات', dinner: 'العشا', wedding_guest: 'الأفراح', engagement: 'الخطوبة', gym: 'الجيم', sport: 'الرياضة', beach: 'البحر', party: 'الحفلات', eid: 'العيد', ramadan: 'رمضان', home: 'البيت', date: 'الخروجات الرومانسية', family: 'سهرات العيلة', katb_kitab: 'كتب الكتاب', graduation: 'التخرج' };
  const occasionsAr = (key) => { const out = []; for (const it of byKey.get(key) || []) for (const o of arr(it.occasions)) { const a = OCC_AR[String(o)]; if (a && !out.includes(a)) out.push(a); } return out.slice(0, 3); };

  const whyAr = (key) => { for (const it of byKey.get(key) || []) if (it.why_ar) return String(it.why_ar).slice(0, 140); return null; };
  return { aliasEntries, pairsFor, seasonOf, alternativesOf, guide, guideFor, pairingHint, whyAr, occasionsAr, report, version: kb.schema_version || null, name: kb.dataset_name || null };
}

/** فحص سريع قبل ما نقبل نسخة جديدة مرفوعة من الأدمن */
export function validateKb(kb) {
  const errs = [];
  if (!kb || typeof kb !== 'object' || Array.isArray(kb)) return ['الملف لازم يكون JSON object'];
  if (!Array.isArray(kb.items) || !kb.items.length) errs.push('items لازم تكون قائمة فيها قطع');
  const ids = new Set();
  for (const [i, it] of (kb.items || []).entries()) {
    if (!it?.id) errs.push(`القطعة رقم ${i + 1} مالهاش id`);
    else if (ids.has(it.id)) errs.push(`الـ id مكرر: ${it.id}`);
    else ids.add(it.id);
    if (it && !it.names) errs.push(`${it.id || i + 1}: مالهاش names`);
  }
  return errs.slice(0, 20);
}
