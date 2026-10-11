import { useMemo, useState } from 'react';
import { Ruler } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { advisorKind, suggestSize } from '../../lib/sizeAdvisor.js';
import ModaAvatar from '../market/ModaAvatar.jsx';
import Sheet from '../ui/Sheet.jsx';
import Button from '../ui/Button.jsx';
import { Field, Input } from '../ui/Field.jsx';
import { cx } from '../ui/cx.js';

const KEY = 'moda.body';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const save = (b) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(b));
    // Moda (the stylist) remembers it too, so she does not ask again
    const p = JSON.parse(localStorage.getItem('moda.profile') || '{}');
    const bits = [b.height && `${b.height}cm`, b.weight && `${b.weight}kg`].filter(Boolean).join(' / ');
    localStorage.setItem('moda.profile', JSON.stringify({ ...p, ...(bits ? { size: bits } : {}), ...(b.sex ? { gender: b.sex === 'f' ? 'woman' : 'man' } : {}) }));
  } catch { /* private mode */ }
};

/** "What's my size?" — a small, transparent calculator on the product page; picks only from the sizes this product really has. */
export default function SizeAdvisor({ product, onPick }) {
  const { t } = useI18n();
  const kind = advisorKind(product.department, product.sizes);
  const [open, setOpen] = useState(false);
  const init = useMemo(() => load(), []);
  const [sex, setSex] = useState(init.sex || (product.department === 'women' || product.department === 'wedding_dress' ? 'f' : 'm'));
  const [height, setHeight] = useState(init.height || '');
  const [weight, setWeight] = useState(init.weight || '');
  const [foot, setFoot] = useState(init.foot || '');
  const [res, setRes] = useState(null);
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
      <button type="button" onClick={() => setOpen(true)} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand underline-offset-2 hover:underline"><Ruler className="h-4 w-4" />{t('size.title')}</button>
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
