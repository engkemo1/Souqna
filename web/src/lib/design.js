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
