/**
 * فحص جودة أي نص جاي من موديل (لو استُخدم). لو فشل → نرجع لجمل phrases.json.
 * النصوص اللي بنبنيها بالكود مش محتاجة فحص، لكن بنفحصها برضه كشبكة أمان.
 */
const AR = /[؀-ۿ]/g;
const LAT = /[A-Za-z]/g;
const BAD_SCRIPTS = /[぀-ヿ㐀-鿿가-힯Ѐ-ӿ฀-๿]/; // يابانى/صينى/كورى/سيريلى/تايلاندى
const PLACEHOLDER = /\{[a-z_]+\}|undefined|null|NaN|\[object|```|^\s*[{[]/i;
const BANNED_LABEL_WORDS = ['خطيب', 'خطيبة', 'خطيبي', 'خطيبتي', 'حبيب', 'جوزي', 'مراتي'];

/** يرجع {ok, reasons[]} */
export function checkText(text, { lang = 'ar', maxLen = 600 } = {}) {
  const reasons = [];
  const s = String(text ?? '').trim();
  if (!s) return { ok: false, reasons: ['empty'] };
  if (s.length > maxLen) reasons.push('too_long');
  if (BAD_SCRIPTS.test(s)) reasons.push('foreign_script');
  if (PLACEHOLDER.test(s)) reasons.push('placeholder_or_json');
  const ar = (s.match(AR) || []).length; const lat = (s.match(LAT) || []).length;
  if (lang === 'ar' && ar + lat > 0 && ar / (ar + lat) < 0.7) reasons.push('not_arabic_enough');
  if (lang === 'en' && ar > 0) reasons.push('mixed_language');
  if (/(.)\1{5,}/.test(s)) reasons.push('repetition');
  if (/(\b[\p{L}]{3,}\b)(\s+\1){2,}/u.test(s)) reasons.push('repetition');
  return { ok: reasons.length === 0, reasons };
}

/** أسماء القطع/التابات ماينفعش فيها كلمات علاقة (خطيب…). */
export function checkLabels(labels) {
  const bad = labels.filter((l) => BANNED_LABEL_WORDS.some((w) => String(l).includes(w)));
  return { ok: bad.length === 0, reasons: bad.length ? ['relationship_word_in_label'] : [], bad };
}

/** فحص رد كامل قبل ما يخرج: النص + أسماء التابات. */
export function guardResponse(res, { lang = 'ar' } = {}) {
  const problems = [];
  const t = checkText(res.say, { lang, maxLen: 900 });
  if (!t.ok) problems.push(...t.reasons.map((r) => `say:${r}`));
  for (const tip of res.tips || []) { const c = checkText(tip, { lang, maxLen: 400 }); if (!c.ok) problems.push(...c.reasons.map((r) => `tip:${r}`)); }
  const labels = (res.blocks?.tabs || []).flatMap((tb) => [tb.label, ...(tb.items || []).map((i) => i.label)]).filter(Boolean);
  const l = checkLabels(labels); if (!l.ok) problems.push(...l.reasons);
  return { ok: problems.length === 0, problems };
}

/** يختار نص موديل لو عدّى الفحص، وإلا الاحتياطي. */
export function pickGuarded(llmText, fallback, opts) {
  if (llmText && checkText(llmText, opts).ok) return { text: llmText.trim(), from: 'llm' };
  return { text: fallback, from: 'canned' };
}
