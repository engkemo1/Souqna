import { MessageSquareText, Store, StickyNote } from 'lucide-react';

/**
 * Read-only display of what the customer wrote at checkout.
 *   general:  the general order instructions
 *   stores:   [{ name, text }]  — callers pass only the notes the viewer is allowed to see
 * Plain text (React escapes it); renders nothing when there is nothing to show.
 */
export default function OrderCommentsView({ ar, general, stores = [], title }) {
  const notes = stores.filter((s) => s.text);
  if (!general && !notes.length) return null;
  return (
    <div className="space-y-2.5" data-testid="order-comments">
      {title && <p className="flex items-center gap-2 text-sm font-semibold"><MessageSquareText className="h-4 w-4" />{title}</p>}
      {general && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-amber-950">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-800"><StickyNote className="h-3.5 w-3.5" />{ar ? 'ملاحظات عامة على الطلب' : 'General order instructions'}</p>
          <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{general}</p>
        </div>
      )}
      {notes.map((s, i) => (
        <div key={i} className="rounded-xl border border-sky-200 bg-sky-50 p-3.5 text-sky-950">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-sky-800"><Store className="h-3.5 w-3.5" />{s.name ? `${ar ? 'ملاحظات خاصة بمحل' : 'Instructions for'} ${s.name}` : (ar ? 'ملاحظات خاصة بهذا المحل' : 'Instructions for this store')}</p>
          <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{s.text}</p>
        </div>
      ))}
    </div>
  );
}
