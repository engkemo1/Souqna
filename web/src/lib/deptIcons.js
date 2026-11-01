/** Placeholder glyphs for sections that have no stored picture yet. Presentation only: the section tree itself always comes from the API. */
const ICON_EMOJI = { shirt: '👗', sparkles: '✨', flower: '🌸', baby: '🧒', footprints: '👟', watch: '⌚', brush: '💄', 'spray-can': '🧴', dumbbell: '🏋️', bag: '👜', hat: '🧕' };
export const emojiFor = (d) => {
  const i = d?.icon;
  if (i && /\p{Extended_Pictographic}/u.test(i)) return i;
  return ICON_EMOJI[i] || '🛍️';
};
