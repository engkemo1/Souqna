import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, History, Tag, Gift, TrendingUp, Percent, Banknote, Package, PartyPopper, Layers, FolderOpen, Wand2 } from 'lucide-react';

const TYPE_ICONS = { Gift, Tag, TrendingUp, Percent, Banknote, Package, PartyPopper, Layers, FolderGift: FolderOpen, Wand2 };
import { api } from '../../lib/api.js';
import { useApi, useDebounced, invalidate } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';
import { PageHeader, Panel, ListSkeleton } from '../../components/dash/Kit.jsx';
import Button from '../../components/ui/Button.jsx';
import { Field, Input, Textarea, Select, Switch, Checkbox } from '../../components/ui/Field.jsx';
import { ErrorState } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import PageTransition from '../../components/PageTransition.jsx';
import OfferVisual from '../../components/promo/OfferVisual.jsx';
import { PromoAnalytics, PromoHistorySheet } from '../../components/promo/PromoInsights.jsx';
import ImageChooser from '../../components/promo/ImageChooser.jsx';
import { SelectorField } from '../../components/promo/ProductPicker.jsx';
import { ConditionsBuilder, EffectEditor, ActionsBuilder } from '../../components/promo/RuleBuilder.jsx';
import { TYPE_LIST, blankOffer, offerToForm, formToBody, emptySel, selEmpty, PALETTE } from '../../lib/promo.js';
import { cx } from '../../components/ui/cx.js';

const DAYS = [[6, 'السبت', 'Sat'], [0, 'الأحد', 'Sun'], [1, 'الاثنين', 'Mon'], [2, 'الثلاثاء', 'Tue'], [3, 'الأربعاء', 'Wed'], [4, 'الخميس', 'Thu'], [5, 'الجمعة', 'Fri']];

export default function PromotionEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { lang, tr } = useI18n();
  const p = (ar, en) => (lang === 'ar' ? ar : en);
  const toast = useToast();
  const { data, error, reload } = useApi(id ? `/owner/promotions/${id}` : null);
  const [f, setF] = useState(null);
  const [custom, setCustom] = useState(null);
  const [check, setCheck] = useState({ issues: [], text: null, imageResolved: null });
  const [saving, setSaving] = useState(null);
  const [serverIssues, setServerIssues] = useState([]);
  const [cart, setCart] = useState([]);
  const [test, setTest] = useState(null);
  const [hist, setHist] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (id && data?.offer && !loaded.current) { loaded.current = true; setF(offerToForm(data.offer)); setCustom(data.offer.image); }
  }, [id, data]);
  useEffect(() => { if (!id && !f && params.get('type')) setF(blankOffer(params.get('type'))); }, [id, f, params]);

  const body = useMemo(() => (f ? formToBody(f) : null), [f]);
  const dBody = useDebounced(body, 450);
  useEffect(() => {
    if (!dBody) return undefined;
    let dead = false;
    api('/owner/promotions/validate', { method: 'POST', body: { ...dBody, name_ar: dBody.name_ar || 'عرض' } }).then((r) => !dead && setCheck(r)).catch(() => {});
    return () => { dead = true; };
  }, [dBody]);

  // sample-cart test (server side, same engine as checkout)
  useEffect(() => {
    if (!dBody || !cart.length) { setTest(null); return undefined; }
    let dead = false;
    api('/owner/promotions/preview', { method: 'POST', body: { offer: { ...dBody, name_ar: dBody.name_ar || 'عرض', status: 'draft' }, cart: cart.map((c) => ({ productId: c.id, qty: c.qty })) } }).then((r) => !dead && setTest(r)).catch(() => !dead && setTest(null));
    return () => { dead = true; };
  }, [dBody, cart]);

  if (id && error) return <ErrorState error={error} onRetry={reload} />;
  if (id && !f) return <ListSkeleton rows={4} />;

  /* ---- step 0: choose a type ---- */
  if (!f) {
    return (
      <PageTransition>
        <PageHeader back="/dashboard/promotions" title={p('عرض جديد', 'New offer')} subtitle={p('اختار نوع العرض. كل الأرقام والكميات والشروط هتحددها بنفسك.', 'Pick a type. You set every number, quantity and condition yourself.')} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {TYPE_LIST.map((ty) => {
            const Icon = TYPE_ICONS[ty.icon] || Tag; const [c1, c2] = PALETTE[ty.key];
            return (
              <button key={ty.key} type="button" onClick={() => setF(blankOffer(ty.key))} className="group flex items-start gap-4 rounded-2xl border border-line bg-elevated p-5 text-start transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}><Icon className="h-6 w-6" /></span>
                <span><span className="block text-base font-semibold">{p(ty.ar, ty.en)}</span><span className="mt-1 block text-sm text-muted">{p(ty.dAr, ty.dEn)}</span></span>
              </button>
            );
          })}
        </div>
      </PageTransition>
    );
  }

  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const setDef = (patch) => setF((x) => ({ ...x, def: { ...x.def, ...patch } }));
  const type = f.type;
  const meta = TYPE_LIST.find((t) => t.key === type);
  const isCustom = type === 'custom';
  const showQualify = type !== 'bundle';
  const supportsReward = type === 'buy_x_get_y' || type === 'category_reward' || (isCustom && f.def.effect.kind === 'buy_x_get_y');
  const rewardOn = !!f.def.reward;
  const issues = [...check.issues, ...serverIssues.filter((s) => !check.issues.some((c) => c.code === s.code))];

  const save = async (status) => {
    setSaving(status); setServerIssues([]);
    try {
      const payload = { ...formToBody(f), status };
      const r = await api(id ? `/owner/promotions/${id}` : '/owner/promotions', { method: id ? 'PUT' : 'POST', body: payload });
      invalidate('/owner/promotions');
      toast({ title: status === 'active' ? p('تم حفظ العرض وتفعيله', 'Offer saved and activated') : p('تم حفظ العرض', 'Offer saved') });
      navigate(`/dashboard/promotions/${r.offer.id}`, { replace: true });
      loaded.current = false; reload?.();
    } catch (e) {
      const iss = e.fields?.issues || (e.fields?.code ? [e.fields] : []);
      setServerIssues(iss);
      toast({ tone: 'error', title: iss[0] ? (lang === 'ar' ? iss[0].ar : iss[0].en) : p('تعذر الحفظ، راجع الحقول', 'Could not save. Check the fields.') });
    }
    setSaving(null);
  };

  const previewOffer = { type, templateKey: f.template_key || type, name: { ar: f.name_ar, en: f.name_en || f.name_ar }, def: f.def, image: f.image_mode === 'custom' ? custom : null, imageResolved: check.imageResolved, text: check.text };
  const toggleDay = (bit) => set({ days_mask: (f.days_mask ^ (1 << bit)) || f.days_mask });

  return (
    <PageTransition>
      <PageHeader back="/dashboard/promotions" title={id ? p('تعديل العرض', 'Edit offer') : p('عرض جديد', 'New offer')} subtitle={meta ? p(meta.ar, meta.en) : ''}
        actions={<>
          <Button variant="secondary" loading={saving === 'draft'} onClick={() => save('draft')}>{p('حفظ كمسودة', 'Save draft')}</Button>
          <Button loading={saving === 'active'} onClick={() => save('active')}>{id && f.status === 'active' ? p('حفظ التعديلات', 'Save changes') : p('حفظ وتفعيل', 'Save & activate')}</Button>
        </>} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Panel title={p('البيانات الأساسية', 'Basics')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={p('اسم العرض (عربي)', 'Offer name (Arabic)')}><Input dir="rtl" value={f.name_ar} onChange={(e) => set({ name_ar: e.target.value })} placeholder={p('مثال: اشتري 2 والتالتة مجانًا', 'e.g. Buy 2 get 1 free')} /></Field>
              <Field label={p('اسم العرض (إنجليزي)', 'Offer name (English)')} optional={p('اختياري', 'optional')}><Input dir="ltr" value={f.name_en} onChange={(e) => set({ name_en: e.target.value })} /></Field>
              <Field label={p('وصف (عربي)', 'Description (Arabic)')} optional={p('اختياري', 'optional')} className="sm:col-span-2"><Textarea rows={2} dir="rtl" value={f.description_ar} onChange={(e) => set({ description_ar: e.target.value })} /></Field>
            </div>
          </Panel>

          {showQualify && (
            <Panel title={p('المنتجات', 'Products')} subtitle={p('فصلنا منتجات الشراء عن منتجات المكافأة والمستثنى.', 'Qualifying, reward and excluded products are separate.')}>
              <div className="space-y-4">
                <SelectorField value={f.def.qualify} onChange={(s) => setDef({ qualify: s })} label={type === 'gift' ? p('المنتجات اللي بتفعّل الهدية', 'Products that trigger the gift') : p('منتجات العرض (اللي بيشتريها العميل)', 'Offer products (what the shopper buys)')} />
                {supportsReward && (
                  <>
                    <Switch checked={rewardOn} onChange={(v) => setDef({ reward: v ? emptySel() : null })} label={p('المكافأة من منتجات مختلفة', 'Reward comes from different products')} description={p('مثال: اشتري 2 من قسم الأطفال واحصل على منتج محدد بخصم 50%.', 'E.g. buy 2 from kids and get a specific product at 50% off.')} />
                    {rewardOn && <SelectorField value={f.def.reward} onChange={(s) => setDef({ reward: s })} label={p('منتجات المكافأة', 'Reward products')} />}
                  </>
                )}
                <details className="rounded-2xl border border-line p-4"><summary className="cursor-pointer text-sm font-semibold">{p('منتجات مستثناة من العرض', 'Excluded products')}{!selEmpty(f.def.exclude) && ` (${f.def.exclude.products.length + f.def.exclude.categories.length})`}</summary>
                  <div className="mt-3"><SelectorField value={f.def.exclude} onChange={(s) => setDef({ exclude: s })} allowAll={false} label={p('لا ينطبق العرض عليها', 'The offer never applies to these')} /></div></details>
              </div>
            </Panel>
          )}

          <Panel title={isCustom ? p('ابنِ عرضك', 'Build your offer') : p('تفاصيل العرض', 'Offer details')} subtitle={isCustom ? p('عندما (الشروط) ثم (المكافأة).', 'WHEN (conditions) THEN (rewards).') : undefined}>
            {isCustom ? (
              <div className="space-y-5">
                <div><p className="mb-2 text-sm font-bold text-brand">{p('عندما', 'WHEN')}</p><ConditionsBuilder value={f.def.when} onChange={(w) => setDef({ when: w })} /></div>
                <div><p className="mb-2 text-sm font-bold text-brand">{p('إذن', 'THEN')}</p><ActionsBuilder effect={f.def.effect} onChange={(e) => setDef({ effect: e })} /></div>
              </div>
            ) : (
              <div className="space-y-5">
                <EffectEditor effect={f.def.effect} onChange={(e) => setDef({ effect: e })} rewardSeparate={rewardOn} />
                <details className="rounded-2xl border border-line p-4" open={!!f.def.when}><summary className="cursor-pointer text-sm font-semibold">{p('شروط إضافية (اختياري)', 'Extra conditions (optional)')}</summary>
                  <div className="mt-3"><ConditionsBuilder value={f.def.when} onChange={(w) => setDef({ when: w })} /></div></details>
              </div>
            )}
            <details className="mt-5 rounded-2xl border border-line p-4"><summary className="cursor-pointer text-sm font-semibold">{p('حدود متقدمة', 'Advanced limits')}</summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field label={p('أقصى عدد مرات تطبيق في الطلب الواحد', 'Max applications per order')} hint={p('فاضي = بلا حد', 'empty = unlimited')}><Input inputMode="numeric" value={f.def.max_applications ?? ''} onChange={(e) => setDef({ max_applications: e.target.value ? Number(e.target.value.replace(/\D/g, '')) || null : null })} /></Field>
                <Field label={p('أقصى خصم (ج.م)', 'Maximum discount (EGP)')} hint={p('فاضي = بلا حد', 'empty = unlimited')}><Input inputMode="numeric" value={f.def.max_discount ?? ''} onChange={(e) => setDef({ max_discount: e.target.value ? Number(e.target.value.replace(/\D/g, '')) || null : null })} /></Field>
              </div>
            </details>
          </Panel>

          <Panel title={p('الجدولة والقيود', 'Schedule & restrictions')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={p('يبدأ', 'Starts')} optional={p('اختياري', 'optional')}><Input type="datetime-local" value={f.starts_at} onChange={(e) => set({ starts_at: e.target.value })} /></Field>
              <Field label={p('ينتهي', 'Ends')} optional={p('اختياري', 'optional')}><Input type="datetime-local" value={f.ends_at} onChange={(e) => set({ ends_at: e.target.value })} /></Field>
              <Field label={p('ساعات التفعيل اليومية: من', 'Daily hours: from')} optional={p('اختياري', 'optional')}><Input type="time" value={f.daily_from} onChange={(e) => set({ daily_from: e.target.value })} /></Field>
              <Field label={p('إلى', 'to')}><Input type="time" value={f.daily_to} onChange={(e) => set({ daily_to: e.target.value })} /></Field>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4">{DAYS.map(([bit, ar, en]) => <Checkbox key={bit} checked={!!(f.days_mask & (1 << bit))} onChange={() => toggleDay(bit)} label={p(ar, en)} />)}</div>
            <p className="mt-2 text-xs text-muted">{p('كل المواعيد بتوقيت القاهرة، والعرض بيبدأ وينتهي لوحده.', 'All times are Cairo time; the offer starts and ends automatically.')}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label={p('إجمالي مرات الاستخدام', 'Total uses')} hint={p('فاضي = بلا حد', 'empty = unlimited')}><Input inputMode="numeric" value={f.usage_limit ?? ''} onChange={(e) => set({ usage_limit: e.target.value ? Number(e.target.value.replace(/\D/g, '')) || null : null })} /></Field>
              <Field label={p('لكل عميل', 'Per customer')} hint={p('بحسب رقم الموبايل', 'by phone number')}><Input inputMode="numeric" value={f.per_customer_limit ?? ''} onChange={(e) => set({ per_customer_limit: e.target.value ? Number(e.target.value.replace(/\D/g, '')) || null : null })} /></Field>
              <Field label={p('مين يستفيد؟', 'Who can use it?')}>
                <Select value={f.audience} onChange={(e) => set({ audience: e.target.value })}><option value="all">{p('كل العملاء', 'Everyone')}</option><option value="new">{p('أول طلب فقط', 'First order only')}</option><option value="returning">{p('عملاء سابقون', 'Returning customers')}</option><option value="phones">{p('أرقام محددة', 'Specific phone numbers')}</option></Select>
              </Field>
            </div>
            {f.audience === 'phones' && <Field className="mt-4" label={p('أرقام الموبايل (رقم في كل سطر)', 'Phone numbers (one per line)')}><Textarea rows={3} dir="ltr" value={(f.audience_phones || []).join('\n')} onChange={(e) => set({ audience_phones: e.target.value.split(/\s+/).filter(Boolean) })} /></Field>}
          </Panel>

          <Panel title={p('الأولوية والتعارض', 'Priority & conflicts')} subtitle={p('يتحكم في تعامل هذا العرض مع العروض الأخرى.', 'How this offer behaves next to other offers.')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={p('الأولوية', 'Priority')} hint={p('الأعلى يُطبق أولًا عند اختيار «حسب الأولوية».', 'Higher wins when the store resolves by priority.')}><Input inputMode="numeric" value={f.priority} onChange={(e) => set({ priority: Number(e.target.value.replace(/[^\d-]/g, '')) || 0 })} /></Field>
              <Field label={p('التعامل مع العروض الأخرى', 'With other offers')}>
                <Select value={f.stacking} onChange={(e) => set({ stacking: e.target.value })}>
                  <option value="per_product">{p('خصم واحد لكل منتج (الافتراضي)', 'One discount per product (default)')}</option>
                  <option value="stackable">{p('يمكن دمجه مع عروض أخرى', 'Can combine with other offers')}</option>
                  <option value="exclusive">{p('حصري: لا يُدمج مع أي عرض', 'Exclusive: no other offer')}</option>
                </Select>
              </Field>
            </div>
            <div className="mt-4"><Switch checked={f.stack_with_coupons} onChange={(v) => set({ stack_with_coupons: v })} label={p('يمكن استخدام كود خصم معه', 'Allow discount codes with this offer')} /></div>
          </Panel>

          <Panel title={p('صورة العرض', 'Offer image')}>
            <ImageChooser form={f} setForm={setF} resolved={check.imageResolved} customMedia={custom} onCustomMedia={setCustom} />
          </Panel>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Panel title={p('معاينة', 'Preview')} bodyClassName="space-y-3">
            <OfferVisual offer={previewOffer} />
            {check.text && <div className="space-y-1 text-sm"><p className="font-semibold">{tr(check.text.headline)}</p>{check.text.conditions?.ar && <p className="text-muted">{tr(check.text.conditions)}</p>}</div>}
            {issues.length > 0 ? (
              <ul className="space-y-1.5 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{issues.map((i, k) => <li key={k} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{lang === 'ar' ? i.ar : i.en}</li>)}</ul>
            ) : <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" />{p('العرض جاهز للحفظ والتفعيل.', 'The offer is ready to activate.')}</p>}
          </Panel>
          {id && (
            <>
              <PromoAnalytics promotionId={Number(id)} />
              <button type="button" onClick={() => setHist(true)} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line-strong text-sm font-medium hover:bg-fg/[0.04]"><History className="h-4 w-4" />{p('سجل تغييرات العرض', 'Offer change history')}</button>
              <PromoHistorySheet open={hist} onClose={() => setHist(false)} promotionId={Number(id)} />
            </>
          )}
          <TestCart cart={cart} setCart={setCart} test={test} lang={lang} p={p} />
        </aside>
      </div>
    </PageTransition>
  );
}

/** Try the offer on a sample basket of the owner's own products - same engine as checkout. */
function TestCart({ cart, setCart, test, lang, p }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(emptySel());
  const { data } = useApi(sel.products.length ? `/owner/promotions/products/search?ids=${sel.products.slice(0, 40).join(',')}&limit=40` : null);
  useEffect(() => {
    if (!data) return;
    setCart((old) => data.items.filter((x) => sel.products.includes(x.id)).map((x) => ({ id: x.id, name: x.name, price: x.price, qty: old.find((o) => o.id === x.id)?.qty || 1 })));
  }, [data, sel.products.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Panel title={p('جرّب العرض على سلة', 'Try it on a basket')} bodyClassName="space-y-3">
      <SelectorField productsOnly value={sel} onChange={(s) => { setSel(s); if (!s.products.length) setCart([]); }} label={p('اختار منتجات للتجربة', 'Pick products to test')} />
      {cart.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
          <span className="min-w-0 flex-1 truncate">{lang === 'ar' ? c.name.ar : c.name.en || c.name.ar}</span>
          <span className="tabular text-muted">{formatMoney(c.price, lang)}</span>
          <input aria-label="qty" inputMode="numeric" value={c.qty} onChange={(e) => setCart(cart.map((x) => (x.id === c.id ? { ...x, qty: Math.min(50, Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1)) } : x)))} className="h-9 w-14 rounded-lg border border-line bg-elevated text-center tabular" />
        </div>
      ))}
      {test && cart.length > 0 && (
        <div className="space-y-1 rounded-xl bg-surface p-3 text-sm tabular">
          <div className="flex justify-between"><span>{p('المجموع', 'Subtotal')}</span><span>{formatMoney(test.subtotal, lang)}</span></div>
          <div className="flex justify-between text-emerald-700"><span>{p('الخصم', 'Discount')}</span><span>-{formatMoney(test.discount, lang)}</span></div>
          <div className="flex justify-between border-t border-line pt-1 font-semibold"><span>{p('الإجمالي', 'Total')}</span><span>{formatMoney(test.total, lang)}</span></div>
          {test.gifts?.length > 0 && <p className="text-xs text-brand">{p('+ هدية مجانية', '+ free gift')}</p>}
          {test.hints?.length > 0 && <p className="text-xs text-muted">{p('العميل هيشوف تلميح: أضف قطعة للحصول على العرض', 'Shopper sees a nudge to add more items')}</p>}
        </div>
      )}
      {open && null}
    </Panel>
  );
}
