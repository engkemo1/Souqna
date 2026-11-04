import { useMemo, useState } from 'react';
import { ChevronLeft, Check, Pencil, Plus, Search } from 'lucide-react';
import { Input } from '../ui/Field.jsx';
import { cx } from '../ui/cx.js';
import { useI18n } from '../../lib/i18n.jsx';

const nz = (s) => String(s || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ًٌٍَُِّْ]/g, '').replace(/\s+/g, ' ').trim();

/**
 * One simple question for the merchant: "which section is this product in?" — straight from the section tree.
 * Tap a main section, then a sub-section, until you reach a section with nothing below it (that is the one you pick).
 * Or type a word and tap the result. Nothing else (no "tops / bottoms" groups, no audience step).
 * items: [{ slug, parent, leaf, name:{ar,en} }] from /owner/category-picker.
 */
export default function SectionTreePicker({ items = [], value = '', onPick, error, customName = '', onAddSection, productName = '' }) {
  const { lang } = useI18n();
  const L = (ar, en) => (lang === 'ar' ? ar : en);
  const nm = (d) => (lang === 'ar' ? d.name?.ar || d.name?.en : d.name?.en || d.name?.ar) || d.slug;
  const by = useMemo(() => new Map(items.map((d) => [d.slug, d])), [items]);
  const kids = useMemo(() => { const m = new Map(); for (const d of items) { const k = d.parent && by.has(d.parent) ? d.parent : ''; (m.get(k) || m.set(k, []).get(k)).push(d); } return m; }, [items, by]);
  const trailOf = (slug) => { const out = []; for (let c = by.get(slug), i = 0; c && i < 8; c = by.get(c.parent), i++) out.unshift(c); return out; };
  const [node, setNode] = useState('');
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(null);
  const [busy, setBusy] = useState(false);
  const term = nz(q);
  const picked = value ? by.get(value) : null;
  const pick = (d) => { onPick?.(d.slug, trailOf(d.slug)[0]?.slug || d.slug); setOpen(false); setQ(''); setNode(''); };
  const hits = term ? items.filter((d) => d.leaf && nz(`${d.name?.ar} ${d.name?.en} ${trailOf(d.slug).map((x) => x.name?.ar).join(' ')}`).includes(term)).slice(0, 10) : [];
  const list = kids.get(node) || [];
  // Suggestions only (the merchant taps one): sections whose name shares a word-start with the product name. Never applied automatically.
  const suggestions = useMemo(() => {
    const words = nz(productName).split(' ').filter((w) => w.length >= 3);
    if (!words.length) return [];
    return items.filter((d) => d.leaf && nz(d.name?.ar).split(' ').some((n) => n.length >= 3 && words.some((w) => n.startsWith(w) || w.startsWith(n)))).slice(0, 4);
  }, [items, productName]);
  const trail = node ? trailOf(node) : [];
  const submitAdd = async () => { setBusy(true); const ok = await onAddSection?.(adding); setBusy(false); if (ok) { setAdding(null); setQ(''); } };
  const btn = 'flex min-h-[3rem] items-center justify-between gap-2 rounded-xl border border-line-strong px-3.5 py-2 text-start text-sm font-medium transition hover:border-fg active:scale-[0.98]';

  if ((picked || customName) && !open) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-secondary/40 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[13px] text-muted">{picked ? trailOf(picked.slug).slice(0, -1).map(nm).join(' › ') || L('القسم', 'Section') : L('قسم جديد في متجرك', 'New section in your store')}</p>
            <p className="truncate text-base font-semibold">{picked ? nm(picked) : customName}</p>
          </div>
          <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-brand hover:bg-brand/10"><Pencil className="h-3.5 w-3.5" />{L('تغيير', 'Change')}</button>
        </div>
        {error && <p role="alert" className="text-[13px] font-medium text-sale">{error}</p>}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-[13px] font-medium text-fg">{L('أسرع طريقة: اكتب اسم المنتج (فستان، تيشيرت، عطر…) واختار من اللي يظهر.', 'Fastest way: type what it is (dress, T-shirt, perfume…) and pick from the results.')}</p>
      <div className="relative"><Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} className="ps-10" placeholder={L('اكتب القسم: فساتين، مكياج، حذاء…', 'Type a section: dresses, makeup, shoes…')} /></div>
      {!term && suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-muted">{L('مقترح:', 'Suggested:')}</span>
          {suggestions.map((d) => <button key={d.slug} type="button" onClick={() => pick(d)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand/10 px-3.5 text-sm font-semibold text-brand transition hover:bg-brand/20 active:scale-95"><span>{nm(d)}</span><span className="text-[12px] font-normal opacity-70">{trailOf(d.slug).slice(0, -1).map(nm).join(' › ')}</span></button>)}
        </div>
      )}
      {term ? (
        hits.length ? <div className="grid gap-2 sm:grid-cols-2">{hits.map((d) => <button key={d.slug} type="button" onClick={() => pick(d)} className={btn}><span className="min-w-0"><span className="block truncate">{nm(d)}</span><span className="block truncate text-[12px] font-normal text-muted">{trailOf(d.slug).slice(0, -1).map(nm).join(' › ')}</span></span></button>)}</div>
          : <p className="py-4 text-center text-sm text-muted">{L('مفيش قسم بالاسم ده. جرّب كلمة تانية، أو اطلب إضافته تحت.', 'No section by that name. Try another word, or request it below.')}</p>
      ) : (
        <div className="space-y-3">
          {node && (
            <div className="flex flex-wrap items-center gap-1 text-sm">
              <button type="button" onClick={() => setNode('')} className="font-semibold text-brand">{L('كل الأقسام', 'All sections')}</button>
              {trail.map((d, i) => <span key={d.slug} className="inline-flex items-center gap-1"><ChevronLeft className="h-3.5 w-3.5 text-muted ltr:rotate-180" aria-hidden="true" />{i === trail.length - 1 ? <span className="font-bold">{nm(d)}</span> : <button type="button" onClick={() => setNode(d.slug)} className="font-semibold text-brand">{nm(d)}</button>}</span>)}
            </div>
          )}
          {node && list.length === 1 && <p className="rounded-xl bg-secondary px-3 py-2 text-[13px] text-muted">{L('القسم ده مفيهوش غير اختيار واحد. لو مش مناسب لمنتجك، اطلب إضافة قسم تحت.', 'Only one choice here. If it does not fit, request a new section below.')}</p>}
          <p className="text-[13px] text-muted">{node ? L('اختار القسم الأنسب:', 'Pick the closest section:') : L('اختار القسم الرئيسي، وبعدين القسم اللي تحته:', 'Pick a main section, then the one under it:')}</p>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {list.map((d) => (
              <button key={d.slug} type="button" onClick={() => (d.leaf ? pick(d) : setNode(d.slug))} className={cx(btn, value === d.slug && 'border-fg bg-fg text-canvas')}>
                <span className="truncate">{nm(d)}</span>{d.leaf ? (value === d.slug ? <Check className="h-4 w-4 shrink-0" /> : null) : <ChevronLeft className="h-4 w-4 shrink-0 text-muted ltr:rotate-180" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>
      )}
      {onAddSection && (adding ? (
        <div className="space-y-2.5 rounded-xl border border-dashed border-line-strong p-3">
          <p className="text-[13px] text-muted">{L('اكتب اسم القسم وهنضيفه في متجرك ونختاره للمنتج ده.', 'Name the section — we add it to your store and pick it for this product.')}</p>
          <Input value={adding.name} autoFocus onChange={(e) => setAdding({ name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitAdd(); } }} />
          <div className="flex gap-2"><button type="button" disabled={busy} onClick={submitAdd} className="h-10 flex-1 rounded-xl bg-fg text-sm font-semibold text-canvas disabled:opacity-60">{busy ? '…' : L('إضافة', 'Add')}</button><button type="button" onClick={() => setAdding(null)} className="h-10 rounded-xl px-4 text-sm font-semibold text-muted hover:bg-fg/5">{L('إلغاء', 'Cancel')}</button></div>
        </div>
      ) : <button type="button" onClick={() => setAdding({ name: q.trim() })} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-brand hover:bg-brand/10"><Plus className="h-4 w-4" />{L('مش لاقي القسم؟ اطلب إضافته', 'Can’t find it? Request a section')}</button>)}
      {error && <p role="alert" className="text-[13px] font-medium text-sale">{error}</p>}
    </div>
  );
}
