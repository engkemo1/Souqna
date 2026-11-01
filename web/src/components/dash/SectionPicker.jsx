import { useMemo, useState } from 'react';
import { Search, Check, ChevronLeft, Plus, Clock, Star, Sparkles } from 'lucide-react';
import { useApi, invalidate } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { Field, Input } from '../ui/Field.jsx';
import Button from '../ui/Button.jsx';
import { useToast } from '../ui/Toast.jsx';
import { cx } from '../ui/cx.js';

const nz = (s) => String(s || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ًٌٍَُِّْ]/g, '').trim();

/** Searchable platform section picker: breadcrumb, recent / frequent, suggestions that always need a tap to confirm, and a "request a new section" form. */
export default function SectionPicker({ value, productName, onChange }) {
  const { lang } = useI18n();
  const L = (ar, en) => (lang === 'ar' ? ar : en);
  const toast = useToast();
  const name = (d) => (d.name?.[lang] || d.name?.ar || '');
  const crumb = (d) => (d.breadcrumb || []).map((n) => n?.[lang] || n?.ar).join(' › ');
  const hint = productName && productName.trim().length > 2 ? `?name=${encodeURIComponent(productName.trim())}` : '';
  const { data } = useApi(`/owner/category-picker${hint}`);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [req, setReq] = useState(null);
  const [busy, setBusy] = useState(false);
  const all = data?.departments || [];
  const leaves = useMemo(() => all.filter((d) => d.leaf), [all]);
  const current = all.find((d) => d.slug === value);
  const results = useMemo(() => { const n = nz(q); if (!n) return []; return leaves.filter((d) => nz(`${d.name.ar} ${d.name.en} ${crumb(d)}`).includes(n)).slice(0, 12); }, [q, leaves, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (d) => { onChange(d.slug); setOpen(false); setQ(''); api('/owner/category-usage', { method: 'POST', body: { department: d.slug } }).then(() => invalidate('/owner/category-picker')).catch(() => {}); };
  const Item = ({ d, mark }) => (
    <button type="button" onClick={() => pick(d)} className={cx('flex min-h-[3rem] w-full items-center justify-between gap-2 rounded-xl border px-3.5 py-2 text-start text-sm transition active:scale-[0.99]', value === d.slug ? 'border-fg bg-fg text-canvas' : 'border-line-strong hover:border-fg')}>
      <span className="min-w-0"><span className="block truncate font-semibold">{name(d)}</span><span className={cx('block truncate text-[12px]', value === d.slug ? 'opacity-80' : 'text-muted')}>{crumb(d)}</span></span>
      {mark || (value === d.slug && <Check className="h-4 w-4 shrink-0" />)}
    </button>
  );
  const sendRequest = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      await api('/owner/category-requests', { method: 'POST', body: { name_ar: req.name, name_en: req.name_en || undefined, parent: req.parent || null, note: req.note || undefined } });
      toast({ title: L('اتبعت الطلب. هنبلغك لما يتراجع، وتقدر تحفظ المنتج كمسودة دلوقتي.', 'Request sent. We will notify you; you can save the product as a draft meanwhile.') }); setReq(null);
    } catch (x) {
      if (x.code === 'section_exists') { const ex = all.find((d) => d.slug === x.fields?.existing); toast({ title: L('القسم ده موجود بالفعل. اخترناه ليك.', 'That section already exists — selected it for you.') }); if (ex) pick(ex); setReq(null); }
      else toast({ tone: 'error', title: x.message });
    }
    setBusy(false);
  };
  const sugg = (data?.suggestions || []).filter((s) => s.slug !== value);
  return (
    <div className="space-y-3">
      {current && !open ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-secondary p-3">
          <div className="min-w-0"><p className="text-xs text-muted">{L('القسم', 'Section')}</p><p className="truncate font-semibold">{crumb(current)}</p></div>
          <Button size="xs" variant="outline" onClick={() => setOpen(true)}>{L('تغيير', 'Change')}</Button>
        </div>
      ) : (
        <>
          <div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('ابحث عن القسم: عباية، حذاء رياضي، عطر…', 'Search a section: abaya, sneakers, perfume…')} className="ps-9" aria-label={L('بحث في الأقسام', 'Search sections')} /></div>
          {sugg.length > 0 && !q && <div className="space-y-1.5"><p className="flex items-center gap-1.5 text-xs font-medium text-muted"><Sparkles className="h-3.5 w-3.5" />{L('مقترح من اسم المنتج — اضغط للتأكيد', 'Suggested from the name — tap to confirm')}</p>{sugg.map((d) => <Item key={d.slug} d={d} mark={<ChevronLeft className="h-4 w-4 shrink-0 rtl:rotate-0" />} />)}</div>}
          {q ? <div className="space-y-1.5">{results.map((d) => <Item key={d.slug} d={d} />)}{!results.length && <p className="text-sm text-muted">{L('مفيش نتيجة.', 'No match.')}</p>}</div> : (
            <>
              {(data?.recent || []).length > 0 && <div className="space-y-1.5"><p className="flex items-center gap-1.5 text-xs font-medium text-muted"><Clock className="h-3.5 w-3.5" />{L('استخدمتها مؤخرًا', 'Recent')}</p><div className="grid gap-1.5 sm:grid-cols-2">{data.recent.map((d) => <Item key={d.slug} d={d} />)}</div></div>}
              {(data?.frequent || []).length > 0 && <div className="space-y-1.5"><p className="flex items-center gap-1.5 text-xs font-medium text-muted"><Star className="h-3.5 w-3.5" />{L('الأكثر استخدامًا', 'Frequent')}</p><div className="grid gap-1.5 sm:grid-cols-2">{data.frequent.map((d) => <Item key={d.slug} d={d} />)}</div></div>}
            </>
          )}
        </>
      )}
      {!req ? <button type="button" onClick={() => setReq({ name: q, name_en: '', parent: '', note: '' })} className="text-sm font-medium text-brand underline-offset-2 hover:underline"><Plus className="me-1 inline h-3.5 w-3.5" />{L('مش لاقي القسم المناسب؟ اطلب إضافة قسم جديد', "Can't find the right section? Request a new one")}</button> : (
        <form onSubmit={sendRequest} className="space-y-3 rounded-xl border border-line p-3">
          <Field label={L('اسم القسم المطلوب', 'Section name')}><Input required minLength={2} maxLength={40} value={req.name} onChange={(e) => setReq({ ...req, name: e.target.value })} /></Field>
          <Field label={L('تحت أي قسم؟ (اختياري)', 'Under which section? (optional)')}>
            <select className="h-11 w-full rounded-xl border border-line-strong bg-elevated px-3 text-sm" value={req.parent} onChange={(e) => setReq({ ...req, parent: e.target.value })}>
              <option value="">—</option>
              {all.filter((d) => !d.parent || all.find((p) => p.slug === d.parent && !p.parent)).map((d) => <option key={d.slug} value={d.slug}>{crumb(d)}</option>)}
            </select>
          </Field>
          <Field label={L('ملاحظة للإدارة (اختياري)', 'Note (optional)')}><Input maxLength={300} value={req.note} onChange={(e) => setReq({ ...req, note: e.target.value })} /></Field>
          <div className="flex gap-2"><Button type="submit" loading={busy}>{L('إرسال الطلب', 'Send request')}</Button><Button type="button" variant="outline" onClick={() => setReq(null)}>{L('إلغاء', 'Cancel')}</Button></div>
        </form>
      )}
    </div>
  );
}

/** Attribute inputs for the selected section (definitions come from the public /departments tree). */
export function AttrFields({ defs, values, onChange, errors = {} }) {
  const { lang } = useI18n();
  const L = (ar, en) => (lang === 'ar' ? ar : en);
  if (!defs?.length) return null;
  const lab = (d) => (lang === 'ar' ? d.ar : d.en || d.ar);
  const set = (k, v) => onChange({ ...values, [k]: v });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {defs.map((d) => (
        <Field key={d.key} label={`${lab(d)}${d.required ? ' *' : ''}${d.merchant_only ? L(' (داخلي)', ' (internal)') : ''}`} error={errors[d.key]}>
          {d.type === 'select' ? (
            <select className="h-11 w-full rounded-xl border border-line-strong bg-elevated px-3 text-sm" value={values[d.key] || ''} onChange={(e) => set(d.key, e.target.value)}><option value="">—</option>{d.options.map((o) => <option key={o.v} value={o.v}>{lang === 'ar' ? o.ar : o.en || o.ar}</option>)}</select>
          ) : d.type === 'multi' ? (
            <div className="flex flex-wrap gap-2">{d.options.map((o) => { const cur = Array.isArray(values[d.key]) ? values[d.key] : []; const on = cur.includes(o.v); return <button key={o.v} type="button" aria-pressed={on} onClick={() => set(d.key, on ? cur.filter((x) => x !== o.v) : [...cur, o.v])} className={cx('h-9 rounded-full border px-3 text-sm', on ? 'border-fg bg-fg text-canvas' : 'border-line-strong')}>{lang === 'ar' ? o.ar : o.en || o.ar}</button>; })}</div>
          ) : d.type === 'boolean' ? (
            <div className="flex gap-2">{[[true, L('نعم', 'Yes')], [false, L('لا', 'No')]].map(([v, l]) => <button key={String(v)} type="button" aria-pressed={values[d.key] === v} onClick={() => set(d.key, v)} className={cx('h-9 rounded-full border px-4 text-sm', values[d.key] === v ? 'border-fg bg-fg text-canvas' : 'border-line-strong')}>{l}</button>)}</div>
          ) : (
            <Input type={d.type === 'number' ? 'number' : 'text'} dir={d.type === 'number' ? 'ltr' : undefined} min={d.min} max={d.max} maxLength={60} value={values[d.key] ?? ''} onChange={(e) => set(d.key, e.target.value)} />
          )}
        </Field>
      ))}
    </div>
  );
}
