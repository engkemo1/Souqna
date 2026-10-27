/** Each store sets its own exchange/return period (default 3 days; 0 = no exchange). */
export const DEFAULT_RETURN_DAYS = 3;

export function returnDaysOf(store) {
  const n = Number(store?.returnDays);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_RETURN_DAYS;
}

/** Short label such as "استبدال خلال 3 أيام" — empty when the store does not accept exchanges. */
export function exchangeLabel(t, store) {
  const n = returnDaysOf(store);
  if (n <= 0) return '';
  if (n === 1) return t('store.exchange1');
  if (n === 2) return t('store.exchange2');
  return t('store.exchange', { n });
}

/** A full sentence for the product page "shipping & returns" block. */
export function exchangeSentence(t, store, product) {
  const n = returnDaysOf(store);
  if (product?.noReturn) return t('product.noReturn') + '.';
  return n > 0 ? t('product.exchangeSentence', { n }) : t('product.noReturn') + '.';
}
