import { useState } from 'react';
import { MessageSquareText, Plus, Store } from 'lucide-react';
import { Textarea } from './ui/Field.jsx';

export const COMMENT_MAX = 500;

/** Count + label under a comment box (the counter appears once the text is getting long). */
function Counter({ n, ar }) {
  if (n < 400) return null;
  return <span className={`text-xs tabular-nums ${n >= COMMENT_MAX ? 'font-semibold text-danger' : 'text-muted'}`}>{n}/{COMMENT_MAX}{n >= COMMENT_MAX ? (ar ? ' (الحد الأقصى)' : ' (limit)') : ''}</span>;
}

/**
 * Optional instructions at checkout: one general comment + one per store (collapsed until wanted, so the page stays calm).
 * Everything is optional; plain text only; 500 characters each. The server validates and sanitises again.
 */
export default function OrderComments({ ar, general, onGeneral, stores, onStore }) {
  const [open, setOpen] = useState({});
  return (
    <section className="rounded-3xl border border-line bg-elevated p-5 sm:p-6" aria-label={ar ? 'ملاحظات الطلب' : 'Order instructions'}>
      <h2 className="mb-1 flex items-center gap-2 font-semibold"><MessageSquareText className="h-4 w-4 text-brand" />{ar ? 'ملاحظات على الطلب' : 'Order instructions'} <span className="text-xs font-normal text-muted">{ar ? '(اختياري)' : '(optional)'}</span></h2>
      <p className="mb-4 text-sm text-muted">{ar ? 'تقدر تسيبهم فاضيين. المحل بيشوف الملاحظات العامة وملاحظتك الخاصة بيه بس.' : 'You can leave these empty. Each store sees the general note and only its own note.'}</p>
      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold">{ar ? 'ملاحظات عامة على الطلب' : 'General Order Instructions'}</span>
        <Textarea rows={2} maxLength={COMMENT_MAX} value={general} onChange={(e) => onGeneral(e.target.value)} placeholder={ar ? 'اكتب أي تعليمات أو ملاحظات تخص طلبك بالكامل...' : 'Write any instructions or notes for your whole order...'} />
        <span className="mt-1 flex justify-end"><Counter n={general.length} ar={ar} /></span>
      </label>
      <div className="mt-3 space-y-3">
        {stores.map((s) => {
          const shown = open[s.slug] || !!s.value;
          return (
            <div key={s.slug} className="rounded-2xl border border-line bg-surface/60 p-3">
              {!shown ? (
                <button type="button" onClick={() => setOpen((o) => ({ ...o, [s.slug]: true }))} className="flex w-full items-center gap-2 text-start text-sm font-medium text-brand hover:underline">
                  <Plus className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">{ar ? `ملاحظة خاصة بمحل ${s.name}` : `Add a note for ${s.name}`}</span>
                </button>
              ) : (
                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold"><Store className="h-4 w-4 shrink-0 text-muted" /><span className="min-w-0 truncate">{s.name}</span><span className="shrink-0 text-xs font-normal text-muted">· {ar ? 'ملاحظات خاصة بهذا المحل' : 'Instructions for this store'}</span></span>
                  <Textarea rows={2} maxLength={COMMENT_MAX} value={s.value} onChange={(e) => onStore(s.slug, e.target.value)} placeholder={ar ? 'مثال: عايز المقاس كبير شوية، أو تغليف هدية...' : 'e.g. one size up, or gift wrapping...'} />
                  <span className="mt-1 flex justify-end"><Counter n={s.value.length} ar={ar} /></span>
                </label>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
