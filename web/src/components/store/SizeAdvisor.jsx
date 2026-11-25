import { useMemo, useState } from 'react';
import { Ruler } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { advisorKind, suggestSize } from '../../lib/sizeAdvisor.js';
import ModaAvatar from '../market/ModaAvatar.jsx';
import Sheet from '../ui/Sheet.jsx';
import Button from '../ui/Button.jsx';
import { Field, Input } from '../ui/Field.jsx';
import { cx } from '../ui/cx.js';

const KIDS = [['1-2', '80-92'], ['2-3', '92-98'], ['3-4', '98-104'], ['4-5', '104-110'], ['5-6', '110-116'], ['7-8', '122-128'], ['9-10', '134-140'], ['11-12', '146-152'], ['13-14', '158-164']];
const BODY = [['XS', '80-84', '60-64', '86-90'], ['S', '84-88', '64-68', '90-94'], ['M', '88-94', '68-74', '94-100'], ['L', '94-100', '74-80', '100-106'], ['XL', '100-108', '80-88', '106-114'], ['XXL', '108-116', '88-96', '114-122']];
const NO_CHART = ['bags', 'hijab', 'accessories', 'abaya', 'jalabiya', 'shoes'];

/** What the shop says about how this piece fits (set once in the seller dashboard). */
export function fitNote(product, lang) {
  const ar = lang === 'ar';
  if (product?.sizeFit === 'small') return ar ? 'المحل بيقول: التفصيل ضيق شوية، فكّر تاخد مقاس أكبر.' : 'The shop says it runs small: consider sizing up.';
  if (product?.sizeFit === 'large') return ar ? 'المحل بيقول: التفصيل واسع شوية، ممكن تاخد مقاس أصغر.' : 'The shop says it runs large: you may size down.';
  if (product?.sizeFit === 'true') return ar ? 'المحل بيقول: المقاس مظبوط على الجداول.' : 'The shop says it fits true to size.';
  const ai = product?.sizeFitAi; // automatic reading of the photo: shown only when the shop did not say, and labelled as such
  if (ai?.note) return `${ar ? 'حسب تحليل تلقائي للصور:' : 'Automatic photo reading:'} ${ar ? ai.note : (ai.fit === 'small' ? 'cut looks slim, consider sizing up.' : ai.fit === 'large' ? 'cut looks loose, you may size down.' : 'cut looks regular.')}`;
  return null;
}

/** "7", "٧", "11:12", "11-12", "6Y" -> the kids chart row that covers that age ("7-8", "11-12", "5-6"); null when it is not an age size. */
function kidsRow(size) {
  const t = String(size).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\s|y(rs?|ears?)?$/gi, '').replace(/[:/،]/g, '-');
  const m = t.match(/^(\d{1,2})(?:-(\d{1,2}))?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const row = KIDS.find((r) => { const [a, b] = r[0].split('-').map(Number); return n >= a && n <= b; });
  return row ? row[0] : null;
}

/** One line about what a chosen size roughly means, from the general charts ("M: bust 88-94 · waist 68-74 cm"); null when we have no honest chart for it. */
export function sizeHint(product, size, lang) {
  if (!size || NO_CHART.includes(product?.department) || /perfume|fragrance|beauty|makeup|care/i.test(product?.department || '')) return null;
  const ar = lang === 'ar';
  const kidsAge = kidsRow(size);
  const k = kidsAge && KIDS.find((r) => r[0] === kidsAge);
  if (k && (product.department === 'kids' || /kid|girl|boy|baby|child|اطفال|أطفال|ولادي|بناتي/i.test(`${product.department || ''} ${product.audience || ''}`))) return ar ? `${size} سنة: مناسب لطول ${'\u200E'}${k[1]}${'\u200E'} سم تقريبًا` : `${size} yrs: fits about ${k[1]} cm tall`;
  const key = String(size).toUpperCase().replace(/\s/g, '').replace('XXXL', '3XL').replace('2XL', 'XXL');
  const b = BODY.find((r) => r[0] === key);
  if (!b) return null;
  const r = (x) => `\u200E${x}\u200E`; // keeps "88-94" reading left-to-right inside Arabic text
  return ar ? `${size} تقريبًا: صدر ${r(b[1])} · وسط ${r(b[2])} · أرداف ${r(b[3])} سم. لو بين مقاسين خد الأكبر.` : `${size} roughly: bust ${b[1]} · waist ${b[2]} · hips ${b[3]} cm. Between two sizes? Take the bigger one.`;
}

/** Static size table for products the calculator cannot cover (kids, lingerie, sleepwear...). */
function SizeChart({ kids, lang, open, onClose }) {
  const ar = lang === 'ar';
  const th = 'px-2 py-2 text-start font-semibold';
  return (
    <Sheet open={open} onClose={onClose} title={ar ? 'دليل المقاسات' : 'Size guide'} description={ar ? (kids ? 'المقاس حسب السن والطول' : 'المقاس حسب القياسات بالسنتيمتر') : (kids ? 'Size by age and height' : 'Size by body measurements in cm')} side="auto" desktop="center">
      <div className="space-y-3 pb-2">
        <div className="overflow-hidden rounded-2xl border border-line-strong">
          <table className="w-full text-sm" dir={ar ? 'rtl' : 'ltr'}>
            <thead className="bg-secondary text-on-secondary">
              <tr>{kids
                ? <><th className={th}>{ar ? 'السن (سنة)' : 'Age (yrs)'}</th><th className={th}>{ar ? 'الطول (سم)' : 'Height (cm)'}</th></>
                : <><th className={th}>{ar ? 'المقاس' : 'Size'}</th><th className={th}>{ar ? 'الصدر' : 'Bust'}</th><th className={th}>{ar ? 'الوسط' : 'Waist'}</th><th className={th}>{ar ? 'الأرداف' : 'Hips'}</th></>}</tr>
            </thead>
            <tbody>
              {(kids ? KIDS : BODY).map((r) => <tr key={r[0]} className="border-t border-line-strong">{r.map((c, i) => <td key={i} dir="ltr" className={cx('px-2 py-2 text-start', i === 0 && 'font-semibold')}>{c}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
        <p className="text-[13px] text-muted">{ar ? 'الجدول تقريبي، والمقاسات بتختلف شوية من براند للتاني. لو بين مقاسين خد الأكبر.' : 'Approximate: sizes vary a little between brands. Between two sizes, take the larger.'}</p>
      </div>
    </Sheet>
  );
}

const KEY = 'moda.body';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const save = (b) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(b));
    window.dispatchEvent(new Event('moda-body')); // the product page marks the suggested size right away
    // Twila (the stylist) remembers it too, so she does not ask again
    const p = JSON.parse(localStorage.getItem('moda.profile') || '{}');
    const bits = [b.height && `${b.height}cm`, b.weight && `${b.weight}kg`].filter(Boolean).join(' / ');
    localStorage.setItem('moda.profile', JSON.stringify({ ...p, ...(bits ? { size: bits } : {}), ...(b.sex ? { gender: b.sex === 'f' ? 'woman' : 'man' } : {}) }));
  } catch { /* private mode */ }
};

/** "What's my size?" — a small, transparent calculator on the product page; picks only from the sizes this product really has. */
export default function SizeAdvisor({ product, onPick, compact = false }) {
  const { t, lang } = useI18n();
  const kind = advisorKind(product.department, product.sizes);
  const [open, setOpen] = useState(false);
  const init = useMemo(() => load(), []);
  const [sex, setSex] = useState(init.sex || (product.department === 'women' || product.department === 'wedding_dress' ? 'f' : 'm'));
  const [height, setHeight] = useState(init.height || '');
  const [weight, setWeight] = useState(init.weight || '');
  const [foot, setFoot] = useState(init.foot || '');
  const [res, setRes] = useState(null);
  const chart = !kind && product.sizes?.length && !NO_CHART.includes(product.department) && !/perfume|fragrance|عطر|برفان/i.test(product.department || '') ? (product.department === 'kids' ? 'kids' : 'body') : null;
  if (!kind && chart) {
    return (
      <>
        <button type="button" onClick={() => setOpen(true)} className={compact ? 'inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-elevated px-3 py-1.5 text-[13px] font-semibold text-brand transition hover:border-fg active:scale-95' : 'mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand underline-offset-2 hover:underline'}><Ruler className="h-4 w-4" />{lang === 'ar' ? 'دليل المقاسات' : 'Size guide'}</button>
        <SizeChart kids={chart === 'kids'} lang={lang} open={open} onClose={() => setOpen(false)} />
      </>
    );
  }
  if (!kind) return null;
  const go = (e) => {
    e.preventDefault();
    const b = { sex, height: Number(height) || '', weight: Number(weight) || '', foot: Number(foot) || '' };
    save(b);
    setRes(suggestSize({ kind, sizes: product.sizes, sex, height: b.height, weight: b.weight, foot: b.foot }) || { size: null });
  };
  const num = (v, set, label, ph, id) => <Field label={label}><Input id={id} dir="ltr" inputMode="decimal" value={v} onChange={(e) => set(e.target.value.replace(/[^\d.]/g, ''))} placeholder={ph} className="text-start" required /></Field>;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={compact ? 'inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-elevated px-3 py-1.5 text-[13px] font-semibold text-brand transition hover:border-fg active:scale-95' : 'mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand underline-offset-2 hover:underline'}><Ruler className="h-4 w-4" />{t('size.title')}</button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('size.title')} description={t('size.sub')} side="auto" desktop="center">
        <form onSubmit={go} className="space-y-4 pb-2">
          <div className="flex justify-center"><ModaAvatar size={52} ring talking={false} /></div>
          {kind !== 'shoe' && (
            <div role="radiogroup" aria-label={t('size.sex')} className="grid grid-cols-2 gap-2">
              {['f', 'm'].map((s) => <button key={s} type="button" role="radio" aria-checked={sex === s} onClick={() => setSex(s)} className={cx('h-11 rounded-xl border text-sm font-semibold transition', sex === s ? 'border-fg bg-fg text-canvas' : 'border-line-strong')}>{t(`size.${s}`)}</button>)}
            </div>
          )}
          {kind === 'shoe' ? num(foot, setFoot, t('size.foot'), '25.5', 'sa-foot') : (
            <div className="grid grid-cols-2 gap-3">
              {kind !== 'waist' ? num(height, setHeight, t('size.height'), '170', 'sa-h') : <div />}
              {num(weight, setWeight, t('size.weight'), '70', 'sa-w')}
            </div>
          )}
          <Button type="submit" full>{t('size.suggest')}</Button>
          {res && (
            <div aria-live="polite" className="rounded-2xl bg-secondary p-4 text-on-secondary">
              {res.size ? (
                <>
                  <p className="text-lg font-bold">{t('size.result', { size: res.size })}</p>
                  {res.alt && res.alt !== res.size && <p className="mt-1 text-sm">{t('size.loose', { size: res.alt })}</p>}
                  <Button type="button" size="sm" className="mt-3" onClick={() => { onPick?.(res.size); setOpen(false); }}>{t('size.pick', { size: res.size })}</Button>
                </>
              ) : <p className="text-sm">{t('size.none')}</p>}
            </div>
          )}
          <p className="text-[13px] text-muted">{t('size.note')}</p>
        </form>
      </Sheet>
    </>
  );
}
