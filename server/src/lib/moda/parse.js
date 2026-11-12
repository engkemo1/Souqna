/**
 * قارئ الرسالة (بدون موديل): يحوّل أي رسالة (عامية، فصحى، إنجليزي، فرانكو، خليط) لحقول مرتبة:
 * مين بيلبس، المناسبة، القطع المطلوبة، الألوان، الميزانية، الوقت، الجو، الذوق.
 */
import { norm, tokenize, tokenVariants, skeleton, isLatinToken, extractNumbers, detectLanguage } from './text.js';
import { loadKnowledge } from './knowledge.js';

/* كلمات بتشبه قطعة لكنها في الحقيقة إشارة مناسبة/وقت: ماتتحسبش كقطعة مطلوبة */
const BARE_NOT_GARMENT = new Set(['سهره', 'party', 'حفله', 'حفلات', 'مناسبات', 'كوكتيل', 'cocktail', 'مناسبه']);

const CONTEXT_PRIORITY = ['condolence', 'engagement_self', 'wedding_self', 'katb_kitab', 'engagement_guest', 'wedding_guest', 'graduation',
  'eid', 'ramadan_iftar', 'sahel_beach', 'travel', 'date_night', 'birthday_party', 'work_formal', 'work_casual', 'university',
  'family_gathering', 'sport', 'casual_outing', 'home'];

const GENDER_BY_KEY = {
  suit: 'men', tuxedo: 'men', tie: 'men', bow_tie: 'men', pocket_square: 'men', waistcoat: 'men', classic_set: 'men',
  dress_any: 'women', dress_casual: 'women', dress_work: 'women', dress_party: 'women', dress_evening: 'women', dress_bridal: 'women', dress_beach: 'women',
  jumpsuit: 'women', skirt: 'women', blouse: 'women', abaya: 'women', heels_low: 'women', heels_high: 'women', clutch: 'women', shawl: 'women',
  two_piece_set: 'women', womens_suit: 'women', hijab_set: 'women_hijab', tarha: 'women_hijab', long_cardigan: 'women', flats: 'women', tunic: 'women',
};

/** مطابقة العبارات على التوكنز: الأطول أولًا، مع تجريد بادئات الجر وتهجئة الفرانكو المتغيرة. */
export function matchTokens(tokens, K = loadKnowledge()) {
  const { exact, skel, maxLen } = K.index;
  const used = new Array(tokens.length).fill(false);
  const out = [];
  for (let len = Math.min(maxLen, tokens.length); len >= 1; len -= 1) {
    for (let i = 0; i + len <= tokens.length; i += 1) {
      if (used.slice(i, i + len).some(Boolean)) continue;
      const rest = tokens.slice(i + 1, i + len);
      let hit = null;
      for (const v of tokenVariants(tokens[i])) {
        const phrase = [v, ...rest].join(' ');
        if (exact.has(phrase)) { hit = exact.get(phrase); break; }
      }
      if (!hit && tokens.slice(i, i + len).every(isLatinToken)) {
        const sk = tokens.slice(i, i + len).map(skeleton).join(' ');
        if (sk.replace(/ /g, '').length >= 3 && tokens.slice(i, i + len).join('').length >= 4 && skel.has(sk)) hit = skel.get(sk);
      }
      if (hit) { out.push({ start: i, end: i + len, len, entries: hit, text: tokens.slice(i, i + len).join(' ') }); for (let j = i; j < i + len; j += 1) used[j] = true; }
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

const entriesOf = (matches, group) => matches.flatMap((m) => m.entries.filter((e) => e.group === group).map((e) => ({ ...e, start: m.start, end: m.end, text: m.text, len: m.len })));

function nearest(list, idx, maxDist = 2) {
  let best = null;
  for (const x of list) {
    const dist = x.start >= idx.end ? x.start - idx.end : idx.start - x.end;
    if (dist < 0 || dist > maxDist - 1) continue; // dist = عدد التوكنز بينهم
    if (!best || dist < best.dist) best = { x, dist };
  }
  return best?.x || null;
}

function weekdayDate(wd, now, nextMarker) {
  const day = now.getUTCDay(); let diff = (wd - day + 7) % 7;
  if (diff === 0 && nextMarker) diff = 7;
  return diff;
}

export function parseMessage(raw, { profile = {}, imageText = '', now = new Date(), cairoDow = null } = {}) {
  const K = loadKnowledge();
  const lang = detectLanguage(raw);
  const n = norm(raw);
  const tokens = tokenize(n);
  const matches = matchTokens(tokens, K);
  const result = {
    raw: String(raw || ''), lang, normalized: n, tokens, intent: 'unknown',
    persons: [], kidsUnspecified: false, context: null, contextEffective: null, role: 'guest',
    garments: [], colors: [], avoidColors: [], budget: null, daypart: null, dateOffsetDays: null, season: null,
    taste: [], fullLook: false, advice: null, followup: null, flags: {}, ownedPieces: [], genderHint: null,
  };

  /* ---------- نوايا بسيطة ---------- */
  const intents = entriesOf(matches, 'intent').map((e) => e.key);
  const hasShopping = entriesOf(matches, 'advice').some((e) => e.key === 'shopping');
  const hasQuestion = entriesOf(matches, 'advice').some((e) => e.key === 'question') || /[?؟]/.test(String(raw)) || /(^| )(ايه|اي|ازاي|يعني|مين|امتي|كام|هل|ينفع|احسن|افضل|الفرق|ولا|هلبس|البس|اغسل|اكوي|انضف|اختار|اعرف|مقاسي|وزني|طولي|لبس|هديه|لون|تمشي|يمشي|يتلبس|تتلبس|يتماشى|تتماشى|اكسسوارات|الاكسسوارات|بيتحط|اشتري|طريقه|تعليمات|غسيل|الغسيل|تنضيف|الكي|بيبهت|بتبهت|بتنكمش|ينكمش|بتتغسل|بيتغسل|يتغسل|تتغسل)( |$)/.test(n) || /(^| )(ال)?(بيتقلص|بتتقلص|الكرش|يخليني|يخسسني|يطولني|اوفر سايز|سليم فيت|سمارت كاجوال|سواريه|ترند|الموضه)( |$)/.test(n);

  /* ---------- مين بيلبس ---------- */
  const personSet = new Set();
  const genderMatches = entriesOf(matches, 'gender').map((e) => e.key);
  let speaker = genderMatches.includes('female') ? 'female' : genderMatches.includes('male') ? 'male' : null;
  result.genderHint = speaker;
  const partners = entriesOf(matches, 'partner');
  let partnerFemale = false; let partnerMale = false;
  for (const p of partners) {
    const loose = p.key.startsWith('loose_');
    if (loose) {
      const prev = tokens[p.start - 1]; const prev2 = tokens[p.start - 2];
      const ok = prev === 'انا' || prev === 'me' || (prev === 'و' && (prev2 === 'انا' || prev2 === 'me'))
        || (tokens[p.start].startsWith('و') && prev === 'انا');
      if (!ok) continue;
    }
    if (p.key.endsWith('female')) partnerFemale = true; else partnerMale = true;
  }
  const aud = entriesOf(matches, 'audience').map((e) => e.key);
  const hijab = aud.includes('women_hijab');
  if (partnerFemale) { personSet.add('men'); personSet.add('women'); }
  else if (partnerMale) { personSet.add('women'); personSet.add('men'); }
  for (const a of aud) { if (a === 'women_hijab') personSet.add('women'); else personSet.add(a); }
  // أطفال
  const numTokens = tokens.map((t) => tokenVariants(t).find((v) => ['الف', 'الفين', 'الاف'].includes(v)) || t);
  const nums = extractNumbers(numTokens, { ageUnits: K.synonyms.kids_words.age_units, multipliers: K.synonyms.budget_words.multipliers, currency: K.synonyms.budget_words.currency });
  const kids = entriesOf(matches, 'kids').map((e) => e.key);
  const hasAge = nums.ages.length > 0;
  const girlStrict = kids.includes('girl_strict'); const boyStrict = kids.includes('boy_strict');
  const girlWeak = kids.includes('girl_weak'); const boyWeak = kids.includes('boy_weak');
  if (girlStrict) personSet.add('girls');
  if (boyStrict) personSet.add('boys');
  if (hasAge || (girlWeak && boyWeak)) { if (girlWeak) personSet.add('girls'); if (boyWeak) personSet.add('boys'); }
  if (kids.includes('kids_plural') && !personSet.has('boys') && !personSet.has('girls')) result.kidsUnspecified = true;
  if (kids.includes('kids_plural') && (girlWeak || boyWeak) ) { if (girlWeak) personSet.add('girls'); if (boyWeak) personSet.add('boys'); result.kidsUnspecified = false; }
  result.ages = nums.ages;
  // «لولد / لبنت / لولاد / لبنات» (ل + كلمة): الطلب لطفل حتى من غير سن، فمايرجعش تيشيرت رجالي كبير.
  for (const t of tokens) {
    if (/^ل(ال)?(ولد|ولاد)$/.test(t)) personSet.add('boys');
    else if (/^ل(ال)?(بنت|بنوته|بنات|طفله)$/.test(t)) personSet.add('girls');
  }

  /* ---------- المناسبة ---------- */
  const ctxEntries = entriesOf(matches, 'context');
  const _negs0 = entriesOf(matches, 'negation');
  const ctxNeg = (c) => _negs0.some((ng) => ng.end <= c.start && c.start - ng.end <= 1);
  result.avoidContexts = ctxEntries.filter(ctxNeg).map((e) => e.key);
  const ctxKeys = new Set(ctxEntries.filter((e) => !ctxNeg(e)).map((e) => e.key));
  for (const c of CONTEXT_PRIORITY) if (ctxKeys.has(c)) { result.context = c; break; }
  if (/كتابي|ketabi|ketbi/.test(n)) { result.role = 'self'; if (!result.context) result.context = 'katb_kitab'; }
  if (result.context?.endsWith('_self')) result.role = 'self';
  if (result.role === 'self') {
    const map = { engagement_guest: 'engagement_self', katb_kitab: 'engagement_self', wedding_guest: 'wedding_self', engagement_self: 'engagement_self', wedding_self: 'wedding_self' };
    result.contextEffective = map[result.context] || result.context;
  } else result.contextEffective = result.context;
  // 'عريس' كلمة في طلب "بدلة عريس": العريس نفسه هو اللي بيلبس
  if (result.context === 'wedding_self' && personSet.size === 0 && /عريس|groom/.test(n)) personSet.add('men');
  if (result.context === 'wedding_self' && personSet.size === 0 && /عروسه|bride/.test(n)) personSet.add('women');

  /* ---------- القطع ---------- */
  const garmentEntries = [];
  for (const m of matches) {
    const g = m.entries.filter((e) => e.group === 'garment');
    if (!g.length) continue;
    const onlyBare = m.len === 1 && BARE_NOT_GARMENT.has(m.text);
    const hasCtx = m.entries.some((e) => e.group === 'context' || e.group === 'time');
    if (onlyBare || (m.len === 1 && hasCtx && BARE_NOT_GARMENT.has(m.text))) continue;
    for (const e of g) garmentEntries.push({ key: e.key, start: m.start, end: m.end, text: m.text });
  }
  const colorEntries = entriesOf(matches, 'color');
  const matEntries = entriesOf(matches, 'material');
  const negs = entriesOf(matches, 'negation');
  const isNegated = (c) => negs.some((ng) => ng.end <= c.start && c.start - ng.end <= 2);
  const SHOE_KEYS = new Set(['sneakers', 'formal_shoes', 'loafers', 'heels_low', 'heels_high', 'flats', 'sandals', 'boots', 'slippers', 'sport_shoes']);
  const DRESS_KEYS = new Set(['dress_casual', 'dress_work', 'dress_party', 'dress_evening', 'dress_bridal', 'dress_beach']);
  const hasKey = (set) => garmentEntries.some((g) => set.has(g.key));
  for (let i = garmentEntries.length - 1; i >= 0; i -= 1) {
    const k = garmentEntries[i].key;
    if ((k === 'shoes_any' && hasKey(SHOE_KEYS)) || (k === 'dress_any' && hasKey(DRESS_KEYS))) garmentEntries.splice(i, 1);
  }
  const MATCH_PREFIXES = new Set(['تليق', 'يليق', 'يمشي', 'يمشوا', 'ينفع', 'يركب', 'يتماشى', 'تناسب', 'يناسب', 'نسقلي', 'نسقيلي', 'طقم']);
  const OWNED_PREFIXES = new Set(['عندي', 'معايا', 'معي', 'لابس', 'لابسه', 'لابسة', 'اشتريت', 'شريت', 'جبت', 'have', 'own', 'bought', 'wearing']);
  const NOT_OWNED_PREFIXES = new Set(['ماعنديش', 'معنديش', 'معيش', 'مش']);
  const seen = new Set();
  for (const g of garmentEntries) {
    if (seen.has(g.key)) continue; seen.add(g.key);
    const col = nearest(colorEntries.filter((c) => !isNegated(c) && !c.used), g, 2);
    let mat = nearest(matEntries, g, 2);
    if (!mat) { // الخامة ممكن تكون جزء من اسم القطعة نفسه (جاكيت جلد)
      for (const t of tokenize(norm(g.text))) { for (const v of tokenVariants(t)) { const hit = (K.index.exact.get(v) || []).find((x) => x.group === 'material'); if (hit) { mat = { key: hit.key }; break; } } if (mat) break; }
    }
    const prevTokens = tokens.slice(Math.max(0, g.start - 2), g.start);
    const prev3 = tokens.slice(Math.max(0, g.start - 3), g.start);
    const hasMatchLead = prev3.some((t) => MATCH_PREFIXES.has(t)) && prev3.some((t) => t === 'مع' || t === 'على' || t === 'معاه' || t === 'معاها');
    const isOwned = (prevTokens.some((t) => OWNED_PREFIXES.has(t)) || hasMatchLead) && !prevTokens.some((t) => NOT_OWNED_PREFIXES.has(t));
    if (isOwned) {
      result.ownedPieces.push({ key: g.key, color: col?.key || null, material: mat?.key || null, text: g.text });
      if (col) col.used = true;
    } else {
      result.garments.push({ key: g.key, color: col?.key || null, material: mat?.key || null, text: g.text, position: g.start });
      if (col) col.used = true;
    }
  }
  // ألوان عامة مش ملتصقة بقطعة
  for (const c of colorEntries) {
    if (c.used) continue;
    if (isNegated(c)) result.avoidColors.push(c.key); else result.colors.push(c.key);
  }
  // لو قطعة واحدة وفي لون عام قريب منها (مثلاً "ابيض" بعد القطعة بمسافة)
  if (result.garments.length === 1 && !result.garments[0].color && result.colors.length === 1) { result.garments[0].color = result.colors[0]; result.colors = []; }

  /* ---------- مين من القطع ---------- */
  const allGarmentPieces = [...result.garments, ...result.ownedPieces];
  const MENSWEAR_ONLY = new Set(['suit', 'blazer', 'waistcoat', 'classic_set']);
  const femaleCtx = speaker === 'female' && !partnerFemale && !(personSet.has('men') && !personSet.has('women'));
  if (femaleCtx && personSet.size === 0 && allGarmentPieces.length && allGarmentPieces.every((x) => MENSWEAR_ONLY.has(x.key))) personSet.add('women');
  if (personSet.size === 0 && allGarmentPieces.length) {
    const g = new Set(allGarmentPieces.map((x) => GENDER_BY_KEY[x.key]).filter(Boolean));
    if (g.size === 1) { const only = [...g][0]; personSet.add(only === 'women_hijab' ? 'women' : only); if (only === 'women_hijab') result.flags.hijabFromGarment = true; }
  }
  if (personSet.size === 0 && speaker && !result.kidsUnspecified) personSet.add(speaker === 'female' ? 'women' : 'men');
  // محجبة
  /* ---------- رفقة: «انا واختي / انا وصحبي / انا وعيلتي / لاخويا» ---------- */
  {
    const COMP = {
      f: 'اختي|اخواتي|خواتي|اختى|صحبتي|صاحبتي|صحباتي|صاحباتي|زميلتي|زميلاتي|جارتي|بنت عمي|بنت عمتي|بنت خالي|بنت خالتي|بنات عمي|بنات عمتي|بنات خالي|بنات خالتي|بنات اخويا|بنت اخويا|بنت اختي|عمتي|خالتي|امي|ماما|والدتي|ام|جدتي|حماتي|مامتي|صحبه|sister|sisters|my sister|girlfriends|my friend girl',
      m: 'اخويا|اخوي|اخواي|اخوتي|اخويه|صحبي|صاحبي|زميلي|جاري|ابن عمي|ابن عمتي|ابن خالي|ابن خالتي|ولاد عمي|اولاد عمي|ولاد خالي|اولاد خالي|ابويا|بابا|والدي|ابوي|جدي|عمي|خالي|حمايا|ابن اخويا|ابن اختي|brother|brothers|my brother',
      mixed: 'عيلتي|عايلتي|عائلتي|اهلي|اسرتي|العيله كلها|العايله كلها|اهل بيتي|family|my family',
      grp: 'اصحابي|صحابي|زمايلي|اصدقائي|زملائي|شلتي|الشله|صحوبي|friends|my friends|colleagues',
    };
    const REL = new Set(['اختي', 'اخواتي', 'خواتي', 'اختى', 'عمتي', 'خالتي', 'امي', 'ماما', 'والدتي', 'ام', 'جدتي', 'حماتي', 'مامتي', 'اخويا', 'اخوي', 'اخواي', 'اخوتي', 'اخويه', 'ابويا', 'بابا', 'والدي', 'ابوي', 'جدي', 'عمي', 'خالي', 'حمايا', 'ابن عمي', 'ابن عمتي', 'ابن خالي', 'ابن خالتي', 'بنت عمي', 'بنت عمتي', 'بنت خالي', 'بنت خالتي', 'بنات عمي', 'بنات عمتي', 'بنات خالي', 'بنات خالتي', 'ولاد عمي', 'اولاد عمي', 'ولاد خالي', 'اولاد خالي', 'بنت اخويا', 'بنت اختي', 'بنات اخويا', 'ابن اخويا', 'ابن اختي', 'sister', 'sisters', 'my sister', 'brother', 'brothers', 'my brother']);
    const PARENT = new Set(['امي', 'ماما', 'والدتي', 'ام', 'مامتي', 'ابويا', 'بابا', 'والدي', 'ابوي', 'جدتي', 'جدي', 'حماتي', 'حمايا', 'عمتي', 'خالتي', 'عمي', 'خالي']);
    const found = []; let withMe = false;
    const nn = ` ${n} `;
    for (const [kind, alts] of Object.entries(COMP)) {
      const re = new RegExp(`(?:^| )(و|مع |ل|لل)?(${alts})(?= |$)`, 'g'); let m;
      while ((m = re.exec(nn))) { const pre = m[1] || ''; const w = m[2]; const before = nn.slice(0, m.index + 1).trim().split(' ').slice(-1)[0] || '';
        const together = pre === 'و' || pre === 'مع ' || /^(انا|احنا|ana|me)$/.test(before) || /(^| )(انا|احنا) $/.test(nn.slice(0, m.index + 1));
        const forThem = pre === 'ل' || pre === 'لل';
        if ((together && (pre === 'و' || pre === 'مع ' || before === 'مع')) || forThem) found.push({ kind, w, forThem, together: !forThem });
      }
    }
    if (found.length) {
      const sp = genderMatches.includes('female') ? 'female' : genderMatches.includes('male') ? 'male' : null;
      const add = (g) => { if (g === 'f') personSet.add('women'); else if (g === 'm') personSet.add('men'); };
      let ambiguous = false;
      if (found.every((f) => f.forThem && f.kind !== 'mixed' && f.kind !== 'grp')) personSet.clear();
      for (const f of found) {
        if (f.kind === 'mixed') { ambiguous = true; result.flags.groupMixed = true; continue; }
        if (f.kind === 'grp') { if (sp) { add(sp === 'female' ? 'f' : 'm'); } else ambiguous = true; result.flags.groupFriends = true; continue; }
        add(f.kind);
        if (f.together) {
          if (sp) add(sp === 'female' ? 'f' : 'm');
          else if (PARENT.has(f.w)) ambiguous = true; // أم/أب/عم/خال: مش عارفين المتكلم → نسأل
          else add(f.kind); // رفقة من نفس الجنس غالبًا: «انا واختي» = ستات، «انا واخويا» = رجالة
        }
      }
      if (ambiguous && !found.some((f) => f.kind === 'f' || f.kind === 'm') ) { /* نسيب persons فاضية فنسأل «لمين؟» */ }
      if (ambiguous && found.some((f) => PARENT.has(f.w) && !sp)) { personSet.clear(); }
      result.flags.companions = found.map((f) => f.w).slice(0, 6);
    }
  }
  /* ---------- لحد تاني بس (من غير «انا»): لمراتي = ستات بس، لجوزي = رجالة بس، لاخويا الصغير/اختي الصغيرة = طفل ---------- */
  {
    const nn2 = ` ${n} `;
    const me = /(^| )(انا|احنا)( |$)/.test(nn2) || /(^| )و?(لانا|ليا|لنفسي)( |$)/.test(nn2);
    if (!me && /(^| )ل(مراتي|زوجتي|خطيبتي|عروستي|حبيبتي|صاحبتي)( |$)/.test(nn2)) { personSet.clear(); personSet.add('women'); }
    if (!me && /(^| )ل(جوزي|زوجي|خطيبي|حبيبي|صاحبي)( |$)/.test(nn2)) { personSet.clear(); personSet.add('men'); }
    const smallB = /(^| )(ل)?(اخويا|اخوي|ابن اخويا|ابن اختي|ابن عمي|ابن خالي|حفيدي)( ال)?(صغير|اصغر|صغنن|الصغير|الاصغر|صغيرتي)( |$)/.test(nn2) || /(^| )(ل)?(حفيدي|اخويا صغير)( |$)/.test(nn2);
    const smallG = /(^| )(ل)?(اختي|بنت اخويا|بنت اختي|بنت عمي|بنت خالي|حفيدتي)( ال)?(صغيره|صغيرة|اصغر|صغنن|الصغيره|الاصغر)( |$)/.test(nn2) || /(^| )(ل)?(حفيدتي)( |$)/.test(nn2);
    if (smallB) { personSet.delete('men'); personSet.add('boys'); }
    if (smallG) { personSet.delete('women'); personSet.add('girls'); }
    if (/(^| )(لولادي|لاولادي|لعيالي|لاطفالي|لعيلي|لولادى)( |$)/.test(nn2)) { personSet.delete('boys'); personSet.delete('men'); result.kidsUnspecified = true; }
    if (/(^| )(ل|ل ال)?(عيالي|اولادي|ولادي|اطفالي|عيلي|ولادى|عيال|اطفالى)( |$)/.test(nn2) && !personSet.has('boys') && !personSet.has('girls') && !/(^| )(ترنج|لبس|فستان|بدله|طقم|تيشيرت|هودي|جاكيت|بنطلون|جزمه|كوتشي) ولادي( |$)/.test(nn2)) { result.kidsUnspecified = true; if (!aud.length) { personSet.delete('men'); personSet.delete('women'); } }
    if (/(^| )(ل)?(رضيع|رضع|بيبي|بيبيه|مواليد|مولود|مولوده|حديث الولاده|طفلي|طفلتي|طفلى|baby|newborn|infant|toddler)( |$)/.test(nn2) && !personSet.has('boys') && !personSet.has('girls')) { result.kidsUnspecified = true; result.flags.baby = true; if (!aud.length) { personSet.delete('men'); personSet.delete('women'); } }
  }
  /* ---------- حبيبتي / البت بتاعتي / الاكس بتاعي ---------- */
  {
    const nn3 = ` ${n} `;
    const sp3 = genderMatches.includes('female') ? 'female' : genderMatches.includes('male') ? 'male' : null;
    const gf = /(^| )(ل|لل)?(البت|البنت) (بتاعتي|بتاعتى|دي|اللي معايا|حقتي)( |$)/.test(nn3) || /(^| )(للبت|لبت|البت)( |$)/.test(nn3) || /(^| )(جيرل فريند|girlfriend|gf)( |$)/.test(nn3);
    const bf = /(^| )(ل|لل)?(الواد|الراجل|الشاب) (بتاعي|بتاعى|حقي)( |$)/.test(nn3) || /(^| )(بوي فريند|boyfriend|bf)( |$)/.test(nn3);
    const ex = /(^| )(ل|لل)?(الاكس|اكسي|اكسى|الايكس|اكس|ex)( بتاعي| بتاعتي| بتاعى| بتاعتى)?( |$)/.test(nn3);
    const forThemOnly = !/(^| )(انا|احنا)( |$)/.test(nn3.replace(/^ *(?:انا )?(?:عايز|عايزه|عاوز|عاوزه)/, ''));
    if (gf && !personSet.has('girls')) { if (forThemOnly) personSet.clear(); personSet.add('women'); }
    else if (bf) { if (forThemOnly) personSet.clear(); personSet.add('men'); }
    else if (ex) {
      if (/(^| )(الاكس|اكسي|اكسى) (از|هي|هو) (البت|البنت)( |$)/.test(nn3)) { personSet.clear(); personSet.add('women'); }
      else if (sp3) { personSet.clear(); personSet.add(sp3 === 'male' ? 'women' : 'men'); }
      else personSet.clear(); // مش عارفين نوع الاكس → نسأل
      result.flags.ex = true;
    }
  }
  const personList = ['men', 'women', 'boys', 'girls'].filter((p) => personSet.has(p));
  result.persons = personList.map((p) => (p === 'women' && (hijab || result.flags.hijabFromGarment) ? 'women_hijab' : p));
  if (personSet.has('women') && !personSet.has('men')) for (const g of result.garments) if (g.key === 'suit') g.key = 'womens_suit';
  if (hijab && !result.persons.includes('women_hijab') && result.persons.length === 0) result.persons = ['women_hijab'];
  result.flags.hijab = hijab;

  /* ---------- الميزانية ---------- */
  // أرقام الطول/الوزن/المقاس/العمر مش ميزانية («طولي 180»، «وزني 85»، «مقاس 42»)
  const BODY_BEFORE = new Set(['طولي', 'طول', 'وزني', 'وزن', 'مقاس', 'مقاسي', 'عمر', 'عمري', 'عمره', 'عمرها', 'رقم', 'مقاسه', 'مقاسها', 'نمرة', 'نمره', 'size']);
  const BODY_AFTER = new Set(['سم', 'سنتي', 'كيلو', 'كجم', 'كج', 'kg', 'cm', 'سنه', 'سنين']);
  nums.amounts = nums.amounts.filter((a) => !a.currencyNear && !([1, 2].some((d) => BODY_BEFORE.has(tokens[a.index - d])) || BODY_AFTER.has(tokens[a.index + 1])) || a.currencyNear);
  if (nums.amounts.length) {
    const marker = new Set(K.synonyms.budget_words.total_markers.map(norm));
    let pick = nums.amounts.find((a) => a.currencyNear) || nums.amounts.find((a) => [1, 2, 3].some((d) => marker.has(tokens[a.index - d]))) || nums.amounts[0];
    const perItem = K.synonyms.budget_words.per_item_markers.map(norm).some((m) => n.includes(m));
    result.budget = { value: pick.value, kind: perItem ? 'per_item' : 'total' };
    // مدى سعري: "من 200 ل 1000" / "بين 500 و 1500" → الحد الأقصى هو الميزانية، والأدنى بيتسجل في min
    for (let k = 0; k + 1 < nums.amounts.length; k += 1) {
      const a = nums.amounts[k]; const b = nums.amounts[k + 1];
      const mid = tokens.slice(a.index + 1, b.index).filter((x) => !['الف', 'الاف', 'k'].includes(x));
      const lead = tokens[a.index - 1];
      const strong = mid.length && mid.every((x) => ['ل', 'الى', 'الي', 'لحد', 'حتي', 'حتى', 'to', 'until', 'till', '-'].includes(x));
      const weak = mid.length && mid.every((x) => ['و', 'and'].includes(x)) && ['بين', 'between'].includes(lead);
      const dash = !mid.length && ['من', 'بين', 'from', 'between'].includes(lead);
      if (strong || weak || dash) {
        const lo = Math.min(a.value, b.value); const hi = Math.max(a.value, b.value);
        result.budget = { value: hi, min: lo, kind: perItem ? 'per_item' : 'total' };
        break;
      }
    }
  }

  /* ---------- الوقت والموسم ---------- */
  const times = entriesOf(matches, 'time').map((e) => e.key);
  if (times.includes('night')) result.daypart = 'night'; else if (times.includes('day')) result.daypart = 'day';
  const nextMarker = times.includes('next_week_markers');
  const wd = entriesOf(matches, 'weekday')[0];
  if (wd) result.dateOffsetDays = weekdayDate(Number(wd.key), cairoDow === null ? now : { getUTCDay: () => cairoDow }, nextMarker);
  else if (times.includes('tomorrow')) result.dateOffsetDays = 1;
  else if (times.includes('today')) result.dateOffsetDays = 0;
  const seasons = entriesOf(matches, 'season').map((e) => e.key);
  if (seasons.length) result.season = seasons[0];
  result.taste = [...new Set(entriesOf(matches, 'taste').map((e) => e.key))];
  if (intents.includes('cheaper') && result.garments.length) result.flags.cheapest = true;
  if (result.garments.length && /(^| )(الاغلي|الاغلى|اغلي|اغلى|اعلي سعر|اعلى سعر|افخم|الافخم|most expensive|priciest|highest price)( |$)/.test(n)) { result.flags.priciest = true; delete result.flags.cheapest; }
  const fl = entriesOf(matches, 'advice').some((e) => e.key === 'full_look');
  result.fullLook = fl;

  /* ---------- نصيحة ---------- */
  if (hasQuestion) {
    let best = null;
    for (const item of K.phrases.advice.items) {
      if (hasShopping && !item.care) continue; // سؤال غسيل/عنايه عن قطعه («ازاي انضف الجاكيت الجلد») مش طلب شراء
      for (const kw of [...(item.keywords_ar || []), ...(item.keywords_en || [])]) {
        const k = norm(kw); if (!k) continue;
        if ((` ${n} `).includes(` ${k} `) && (!best || k.length > best.len)) best = { id: item.id, len: k.length };
      }
    }
    if (!best) { const cid = careFallback(n, K); if (cid) best = { id: cid }; }
    if (best) result.advice = { id: best.id };
  }

  /* ---------- متابعة وتحية ---------- */
  const has = (k) => intents.includes(k);
  const explicitAudience = aud.length > 0 || result.kidsUnspecified || partnerFemale || partnerMale;
  const hasExplicitShopping = /(^| )(لبس|هدوم|ملابس|طقم|بدله|فستان|شوز|كوتشي|اشتري|اتسوق|شراء|تسوق|موديلات|ازياء|فاشون|كولكشن|حاجه|حاجة|قطعه|قطعة|لوك|ستايل|استايل|اتشيك|انقي|اجيب|شياكه|شياكة|سمبل|روشه|روشة)( |$)/.test(n);
  const hasEgyptianShopping = hasShopping && (hasExplicitShopping || result.taste.length > 0 || /(على قد|علي قد|حنين|لقطة|لقطه|في المعقول|سمبل|روق عليا|نقيلي|شوفيلي|ظبطني|اتشيك)/.test(n));
  const hasGarmentsOrOccasion = result.garments.length > 0 || Boolean(result.context) || Boolean(result.budget) || result.fullLook;
  const hasContent = hasGarmentsOrOccasion || explicitAudience || (hasExplicitShopping && (hasShopping || result.persons.length > 0)) || hasEgyptianShopping || (result.avoidContexts || []).length > 0 || (result.colors.length > 0 && result.tokens.length <= 4 && (!hasQuestion || tokens.length <= 2 || /^(?:لبس|ملابس|هدوم|حاجه) /.test(n)) && !/[?؟]/.test(String(raw)));
  if (has('reset')) result.followup = 'reset';
  else if (has('show_more') && !result.garments.length) result.followup = 'show_more';
  if (has('show_more') && result.garments.length && !result.followup) result.flags.showOther = true;
  else if (has('cheaper') && !result.garments.length && !result.context) result.followup = 'cheaper'; // "أقل سعر تيشيرت" is a product request, not "cheaper than before"
  else if (!hasContent && has('yes') && tokens.length <= 3) result.followup = 'yes';
  else if (!hasContent && has('no') && tokens.length <= 3) result.followup = 'no';

  if (result.advice) result.intent = 'advice';
  else if (result.followup) result.intent = 'followup';
  else if (!hasContent && has('thanks') && tokens.length <= 5) result.intent = 'thanks';
  else if (!hasContent && has('greeting') && tokens.length <= 5) result.intent = 'greeting';
  else if (hasContent || (hasShopping && hasExplicitShopping)) result.intent = 'shop';

  // رقم لوحده أو رموز من غير أي كلمة (123 / ؟؟؟ / 😀) مش طلب لبس، إلا لو رقم ميزانية.
  if (result.intent === 'shop' && !/[A-Za-z\u0600-\u06FF]/.test(String(raw || '')) && !result.budget) result.intent = 'unknown';

  /* ---------- صورة (وصف مبسط من الرؤية) ---------- */
  if (imageText) {
    const sub = parseMessage(imageText, { now });
    result.ownedPieces = sub.garments.map((g) => ({ key: g.key, color: g.color }));
    if (!result.persons.length) {
      if (/رجال|men|male/.test(norm(imageText))) result.persons = ['men'];
      else if (/حريمي|نسائي|women|female/.test(norm(imageText))) result.persons = [hijab ? 'women_hijab' : 'women'];
    }
    if (result.intent === 'unknown' || result.intent === 'shop') result.intent = 'shop';
    result.flags.fromImage = true;
  }

  // الجنس لقطعة 'دريس' العامة: ست
  result.persons = [...new Set(result.persons)];
  return result;
}

export { GENDER_BY_KEY, CONTEXT_PRIORITY };

/** سؤال غسيل/كي/تنضيف مفيهوش عباره محفوظه: نختار رد العنايه المناسب للخامه/القطعه المذكوره، أو الرد العام اللي بيرجّع للافتة. */
const CARE_VERB = /(^| )(اغسل|اغسله|اغسلها|اغسلهم|انضف|انضفه|انضفها|نضف|اكوي|اكويه|اكويها|غسيل|الغسيل|تنضيف|تنظيف|اعتني|العنايه|يتغسل|بيتغسل|بتتغسل|تتغسل|بتبهت|بيبهت)( |$)/;
const CARE_FABRIC = [
  [/(^| )(شمواه)( |$)/, 'care_suede'], [/(^| )(جلد|جلدي)( |$)/, 'care_leather'], [/(^| )(قطيفه|مخمل|فيلفت)( |$)/, 'care_velvet'],
  [/(^| )(حرير|ساتان|شيفون|دانتيل|فستان|طرحه|عبايه|اسدال|بلوزه)( |$)/, 'care_silk'], [/(^| )(صوف|كنزه|كوت|اكريليك)( |$)/, 'care_wool'],
  [/(^| )(كتان)( |$)/, 'care_linen'], [/(^| )(جينز)( |$)/, 'care_denim'], [/(^| )(بدله|طقم|بليزر)( |$)/, 'care_suit'],
  [/(^| )(كوتشي|حذاء|جزمه|جزم|صندل)( |$)/, 'care_sneakers'], [/(^| )(مطبوع|مطرز|طباعه|ستيكر)( |$)/, 'care_printed'],
  [/(^| )(هودي|سويتر|سويت|جاكيت|بلوفر|جيليه|تراينج)( |$)/, 'care_hoodie'], [/(^| )(ابيض|بيضا|بيضاء)( |$)/, 'care_white'],
  [/(^| )(بوليستر)( |$)/, 'care_polyester'], [/(^| )(قطن|تيشيرت|بولو|قميص|بنطلون|شورت|بيجامه)( |$)/, 'care_cotton'],
  [/(^| )(اطفال|ولادي|بناتي|بيبي)( |$)/, 'care_kids'],
];
export function careFallback(n, K, { allowGeneral = true } = {}) {
  const s = ` ${String(n).split(' ').map((w) => (w.length > 3 ? w.replace(/^ال/, '') : w)).join(' ')} `;
  if (allowGeneral && !CARE_VERB.test(s)) return null; // لو بنقرا خامه مكتوبه (مش سؤال) مش لازم فعل غسيل
  const ids = new Set(K.phrases.advice.items.filter((i) => i.care).map((i) => i.id));
  if (allowGeneral && /(^| )(اكوي|اكويه|اكويها)( |$)/.test(s)) return ids.has('care_iron') ? 'care_iron' : null;
  for (const [re, id] of CARE_FABRIC) if (re.test(s) && ids.has(id)) return id;
  return allowGeneral && ids.has('care_general') ? 'care_general' : null;
}
