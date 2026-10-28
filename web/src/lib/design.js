import { resolveDesign } from '@souqna/shared/layout';
import { useStore } from './store.jsx';

/** شكل المتجر الحالي (قالب + تعديلات صاحب المحل). برّه صفحات المتجر (السوق) بيرجّع الشكل الافتراضي. */
export function useDesign() {
  const ctx = useStore();
  return resolveDesign(ctx?.store?.customization);
}

/** كلاسات الشبكة حسب كثافة القالب. */
export const GRID_CLASS = {
  cozy: 'grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-5 sm:gap-y-10 md:grid-cols-3 xl:grid-cols-4',
  dense: 'grid-cols-2 gap-x-2 gap-y-5 sm:gap-x-3 sm:gap-y-7 md:grid-cols-4 xl:grid-cols-5',
  airy: 'grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-8 sm:gap-y-14 md:grid-cols-3 xl:grid-cols-3',
};

/** Pastel card/bubble colours for the kids template ("bg" behind photos, "ink" for stickers and accents). */
export const KID_TINTS = [
  { bg: '#FFE4D6', ink: '#FF6B3D' }, // peach
  { bg: '#DDF0FF', ink: '#2F8EEA' }, // sky
  { bg: '#E2F7DF', ink: '#2FAE5B' }, // mint
  { bg: '#FFF3C4', ink: '#F2A500' }, // sun
  { bg: '#EFE5FF', ink: '#8B5CF6' }, // lilac
  { bg: '#FFE1EC', ink: '#EC4F86' }, // bubblegum
];
export const kidTint = (i = 0) => KID_TINTS[((i % KID_TINTS.length) + KID_TINTS.length) % KID_TINTS.length];
