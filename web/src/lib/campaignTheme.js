/**
 * Looks for the Twist sale campaigns. A theme is just a starting point: the admin can change both colours, the falling shapes,
 * how many fall and how fast — so the same system serves Black Friday, New Year, Ramadan, Eid, Valentine…
 */
export const THEMES = {
  // «وفّرها مرتين»: the shop's discount + Twist's extra one. Twist's own navy and orange — no Black Friday artwork.
  twice: { name: 'وفّرها مرتين', c1: '#03244D', c2: '#FF8A3D', glyphs: ['٪', '%', '✦', '🏷️'], pct: true, emoji: '✌️', art: '/brand/bf-bg.webp' },
  blackfriday: { name: 'بلاك فرايدي', c1: '#111111', c2: '#F5B301', glyphs: ['%', '٪', '🏷️'], pct: true, emoji: '🔥', art: '/brand/bf-bg.webp' },
  newyear: { name: 'رأس السنة', c1: '#0B1B3F', c2: '#F4C95D', glyphs: ['✨', '🎉', '🎆', '⭐', '🥂'], emoji: '🎆' },
  ramadan: { name: 'رمضان', c1: '#2A1458', c2: '#E9B949', glyphs: ['🌙', '⭐', '✦', '🏮'], emoji: '🌙' },
  eid: { name: 'العيد', c1: '#0B6B4F', c2: '#F2D37A', glyphs: ['🎈', '✨', '🌙', '🎁'], emoji: '🎁' },
  valentine: { name: 'فالنتاين', c1: '#9B1C3F', c2: '#FF8FAB', glyphs: ['❤', '💖', '✨', '💝'], emoji: '💝' },
  summer: { name: 'الصيف', c1: '#0E7490', c2: '#FDBA74', glyphs: ['☀️', '🌴', '✦', '🍉'], emoji: '☀️' },
  sale: { name: 'تخفيضات عامة', c1: '#B91C1C', c2: '#FDE68A', glyphs: ['%', '🏷️', '✦'], pct: true, emoji: '🏷️' },
};
/** A discount campaign in `stack` mode: Twist's % comes off the shop's price AFTER the shop's own discount. */
export const isStack = (c) => !!c && c.kind !== 'shipping' && c.mode === 'stack';
export const DENSITY = { off: 0, low: 22, medium: 38, high: 60 };
export const SPEED = { calm: 0.6, normal: 1, lively: 1.5 };
const ok = (v) => /^#[0-9a-f]{6}$/i.test(v || '');

/** Public campaign (as /campaigns/active returns it) → everything the renderers need. */
export function look(c) {
  const t = THEMES[c?.theme] || THEMES.blackfriday;
  const custom = c?.glyphs ? [...c.glyphs].filter((g) => g.trim()) : [];
  const base = custom.length ? custom : t.glyphs;
  const glyphs = !custom.length && t.pct && c?.kind !== 'shipping' && c?.percent ? [...base, `${c.percent}%`] : base;
  return {
    c1: ok(c?.color1) ? c.color1 : t.c1, c2: ok(c?.color2) ? c.color2 : t.c2, glyphs, emoji: t.emoji, art: c?.kind === 'shipping' ? null : t.art || null, // picture banner (theme artwork), never on free-shipping campaigns
    count: DENSITY[c?.density] ?? DENSITY.low, speed: SPEED[c?.speed] ?? SPEED.calm,
  };
}
/** Is this colour dark enough to need white text? (we always use white on c1, and c1 is checked here for the readable-accent case) */
export const luma = (hex) => { const n = parseInt((hex || '#000').slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

/**
 * Short hype line on the banner (Egyptian Arabic) that gets more excited as the clock runs down.
 * Stages — before the start: s_far (3+ days) · s_days (1–3 days) · s_day (under a day) · s_hour (under an hour) · s_min (under 10 min);
 * while running: l_start (first 2 h) · l_mid · l_last (final 3 h) · l_hour (final hour) · l_min (final 10 min). The admin can override each.
 */
const MIN = 60e3; const HOUR = 3600e3; const DAY = 86400e3;
export const HYPE_STAGES = [
  { key: 's_far', label: 'قبل البداية بأكتر من ٣ أيام', group: 'قبل البداية', soon: true, preview: { startsIn: 5 * DAY } },
  { key: 's_days', label: 'قبل البداية بيوم لـ ٣ أيام', group: 'قبل البداية', soon: true, preview: { startsIn: 2 * DAY } },
  { key: 's_day', label: 'أقل من يوم على البداية', group: 'قبل البداية', soon: true, preview: { startsIn: 8 * HOUR } },
  { key: 's_hour', label: 'أقل من ساعة على البداية', group: 'قبل البداية', soon: true, preview: { startsIn: 30 * MIN } },
  { key: 's_min', label: 'آخر ١٠ دقايق قبل البداية', group: 'قبل البداية', soon: true, preview: { startsIn: 4 * MIN } },
  { key: 'l_start', label: 'أول ساعتين من الحملة', group: 'أثناء الحملة', preview: { elapsed: 30 * MIN, endsIn: 20 * HOUR } },
  { key: 'l_mid', label: 'وسط الحملة', group: 'أثناء الحملة', preview: { elapsed: 6 * HOUR, endsIn: 12 * HOUR } },
  { key: 'l_last', label: 'آخر ٣ ساعات', group: 'أثناء الحملة', preview: { elapsed: 18 * HOUR, endsIn: 2 * HOUR } },
  { key: 'l_hour', label: 'آخر ساعة', group: 'أثناء الحملة', preview: { elapsed: 23 * HOUR, endsIn: 40 * MIN } },
  { key: 'l_min', label: 'آخر ١٠ دقايق', group: 'أثناء الحملة', preview: { elapsed: 23.9 * HOUR, endsIn: 5 * MIN } },
];
export const DEFAULT_HYPE = {
  discount: {
    s_far: [
      'المحفظة مش عارفة ليه قلبها مقبوض! 🤣',
      'في حاجة جاية هتصالحك مع آخر الشهر 😂',
      'متقولش لماما.. بس الدولاب هيزيد 👀',
      'في خبر لو عرفته هتقول يا مسهل 😎',
    ],
    s_days: [
      'الماهية قالتلنا إنها موافقة المرة دي 😂',
      'الشلة هتشتري.. وإنت هتفضل تتفرج؟ 👀',
      'قول للدولاب يستحمل.. شكله داخل على توسعات 🤣',
      'استنى بس.. دي مش تخفيضات عادية يا صاحبي 🔥',
    ],
    s_day: [
      'قريب هنسمع صوت الفيزا وهي بتقول أخيرًا 😂',
      'اللي كان غالي عليك.. قرب يبقى صاحبك 😎',
      'مفيش داعي تستلف من صاحبك.. استنى بس 🤣',
      'جه وقت الانتقام من الأسعار القديمة 🔥',
    ],
    s_hour: [
      'يا ساتر.. المحفظة مش مستوعبة اللي جاي 😂',
      'بطل تقليب في الريلز.. تويست قرب يفتح 👀',
      'اللي هيقول استنى أفكر هنعتبره مش معانا 🤣',
      'خد نفس.. دولابك داخل على مرحلة جديدة! 🛍️',
    ],
    s_min: [
      'يا جدعان الأسعار مش هتفضل مستنيانا! 🔥',
      'شد حيلك.. الماهية محتاجة تتبسط 😂',
      'اقفل الواتساب وتعالى.. الحكاية هتبدأ 👀',
      'آخر تجهيزات.. والمحفظة بتقول يا رب 🤣',
    ],
    l_start: [
      'فتحنا يا ناس.. واللي نايم فاته كتير 😂',
      'تويست ولّعها.. والدولاب دخل في مود الشوبينج 🔥',
      'أمك هتسألك جبت كل ده منين؟ قول تويست 🤣',
      'الأسعار اتغيرت.. وإنت لسه بتشرب الشاي؟ 😎',
    ],
    l_mid: [
      'هتفضل تتفرج لحد ما هدومك تعملك بلوك؟ 😂',
      'القطعة عجبتك؟ متعملش فيها تقيل 😂',
      'صاحبك اشترى.. متخليش المنافسة تبوظ 😂',
      'دي مش حيرة.. دي أعراض حب من أول نظرة ❤️',
    ],
    l_last: [
      'يا تلحق تشتري يا تفضل تحكي إنك كنت ناوي 😂',
      'تويست بيقولك متخلنيش أنده عليك تاني 🔥',
      'الأسعار بتلم شنطها.. وإنت لسه بتختار؟ 👀',
      'اللي في السلة مستني.. متكسفوش بقى 🤣',
    ],
    l_hour: [
      'يا عم اتحرك.. دي مش جلسة تفكير فلسفي 😂',
      'الساعة بتجري.. وإنت بتقارن لسه؟ 🏃',
      'متخليش كلمة يا ريت تبقى ستايلك الجديد 😭',
      'آخر ساعة.. ورينا هتعمل إيه يا بطل 🔥',
    ],
    l_min: [
      'السلة بتعيط.. دوس إتمام الطلب بقى 😭',
      'اللي متردد.. يتردد بعد ما يشتري 😂🔥',
      'آخر نداء.. وبعدها متقولش تويست مخبركش! 📢',
      'خلص كلام.. دي آخر فرصة يا نجم! 🚀',
    ],
  },
  shipping: {
    s_far: [
      'المندوب المرة دي مش جاي يطلب منك فلوس 😂',
      'في حد قرر يشيل عنك مشوار الدليفري 🤫',
      'خبر حلو للناس اللي بتحسب تمن الشحن قبل الطلب 👀',
      'في حاجة جاية هتخلي المحفظة تقول تسلم إيدك ❤️',
    ],
    s_days: [
      'الدليفري المرة دي ضيف علينا مش ضيف عليك 🤣',
      'قول للمحفظة متقلقيش.. المشوار علينا 😎',
      'المندوب هييجي ومش هيقولك الحساب كام 😂',
      'حتى بنزين الموتوسيكل مش في حسابك المرة دي 🏍️',
    ],
    s_day: [
      'قريب هنقول للشحن روح اتفسح على حسابنا 😂',
      'جه وقت الطلب من غير حسابات المندوب 👀',
      'المحفظة هتحتفظ بفلوس المشوار.. يا سلام! 💸',
      'اللي كان مأجّل الطلب عشان الشحن.. عندنا كلام معاه 🤣',
    ],
    s_hour: [
      'المندوب بيلبس الخوذة.. وإحنا بنجهز المفاجأة 🏍️',
      'الشحن داخل إجازة من جيبك 😂',
      'فاضل شوية ونشيل عنك حوار المشوار 🚚',
      'خليك صاحي.. المرة دي الحساب مختلف 👀',
    ],
    s_min: [
      'الموتوسيكل سخّن.. والمحفظة بتزغرد 😂',
      'فاضل شوية ونقول للشحن: روح يا حبيبي! 🏍️',
      'يا جماعة جهزوا الطلبات.. المشوار علينا 🔥',
      'اللي مستني الشحن يبقى ببلاش.. يقرّب! 😍',
    ],
    l_start: [
      'ابتدينا يا حلوين.. الشحن علينا والطلب عليكم ❤️',
      'اطلب براحتك.. المندوب مش هيطلب تمن المشوار 😂',
      'المرة دي المندوب هيقولك اتفضل مش هات الحساب 🤣',
      'الشحن ببلاش.. يعني مفيش حجة يا صاحبي! 🚚',
    ],
    l_mid: [
      'حتى أبوك مش هيقولك بتدفع شحن ليه 😂',
      'لسه مأجل الطلب عشان الشحن؟ طب أومال مستني إيه؟ 😂',
      'وفر تمن المشوار وهاتلك حاجة حلوة 😉',
      'المندوب مش مستني بقشيش الشحن.. اطلب بقى 🤣',
    ],
    l_last: [
      'الشحن المجاني بيبعتلك رسالة: هتوحشني 😂',
      'المندوب بيقول آخر كام مشوار يا رجالة 🏍️',
      'متخليش تمن الشحن يرجع يطارد محفظتك 👀',
      'اللي عايز يوفر المشوار.. الوقت بيجري! 🔥',
    ],
    l_hour: [
      'ساعة ونرجع نحاسب الشحن.. الحق استمتع 😂',
      'المندوب مستني.. وإنت مستني إيه؟ 🤣',
      'دي آخر ساعة تخلي المشوار علينا 🚚',
      'متخليش الشحن المجاني يبقى حكاية بتحكيها 😭',
    ],
    l_min: [
      'الشحن بيقولك كانت أيام حلوة 😂💔',
      'آخر نداء.. اطلب قبل ما المندوب يقفل العداد 🏍️',
      'فاضل شوية والشحن يرجع يطلب حق المشوار! 😭',
      'يلا يا نجم.. دي آخر لفة ببلاش! 🔥',
    ],
  },
};
/** Which stage the clock is in. `leftMs` = time left to the start (soon) or to the end (live); `elapsedMs` = time since the start (live). */
export function hypeStage(soon, leftMs, elapsedMs = 0) {
  if (soon) return leftMs <= 10 * MIN ? 's_min' : leftMs <= HOUR ? 's_hour' : leftMs <= DAY ? 's_day' : leftMs <= 3 * DAY ? 's_days' : 's_far';
  if (leftMs <= 10 * MIN) return 'l_min';
  if (leftMs <= HOUR) return 'l_hour';
  if (leftMs <= 3 * HOUR) return 'l_last';
  return elapsedMs <= 2 * HOUR ? 'l_start' : 'l_mid';
}
/** The line to show: the admin's text for that stage, else one of the defaults (`n` rotates through them). '' = nothing (hype switched off). */
export function hypeFor(c, stage, n = 0) {
  if (!c || c.showHype === false) return '';
  const own = c.hype && typeof c.hype === 'object' ? c.hype[stage] : '';
  if (own) return own;
  const list = (DEFAULT_HYPE[c.kind === 'shipping' ? 'shipping' : 'discount'] || DEFAULT_HYPE.discount)[stage] || [];
  return list.length ? list[Math.abs(n) % list.length] : '';
}
/** Does this campaign have admin-written text for the stage (then no rotation)? */
export const hasOwnHype = (c, stage) => !!(c?.hype && typeof c.hype === 'object' && c.hype[stage]);
