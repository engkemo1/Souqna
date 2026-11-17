import { useEffect, useMemo, useState } from 'react';
import { Ruler } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';

/**
 * Checkout option "not sure about the size?": the courier brings two sizes of one piece,
 * the shopper keeps one and pays only for it. One piece per order, quantity 1.
 * `pick` = { key, altVariantId, size } or null. `version` re-fetches after an error.
 */
export default function TrySizes({ items, phone, pick, onPick, version = 0 }) {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const [data, setData] = useState(null);
  const sig = useMemo(() => JSON.stringify(items.filter((i) => i.qty === 1 && i.variantId).map((i) => [i.storeSlug, i.productId, i.variantId])), [items]);

  useEffect(() => {
    const list = JSON.parse(sig);
    if (!list.length) { setData(null); return undefined; }
    let live = true;
    const timer = setTimeout(() => {
      api('/marketplace/try-options', { method: 'POST', body: { phone: phone || undefined, items: list.map(([slug, productId, variantId]) => ({ slug, productId, variantId, qty: 1 })) } })
        .then((r) => { if (live) setData(r); }).catch(() => { if (live) setData(null); });
    }, 300);
    return () => { live = false; clearTimeout(timer); };
  }, [sig, phone, version]);

  const eligible = (data?.items || []).filter((x) => x.eligible);
  useEffect(() => {
    if (pick && !eligible.some((x) => `${x.slug}:${x.productId}:${x.variantId || 0}` === pick.key && x.alts.some((a) => a.variantId === pick.altVariantId))) onPick(null);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data || (!eligible.length && !data.blockedUntil)) return null;
  const line = (x) => items.find((i) => i.storeSlug === x.slug && i.productId === x.productId && (i.variantId || null) === (x.variantId || null));
  const nameOf = (l) => l?.name?.[lang] || l?.name?.ar || l?.name || '';

  return (
    <section className="rounded-3xl border border-line bg-elevated p-4" aria-label={ar ? 'تجربة مقاسين' : 'Try two sizes'}>
      <div className="flex items-start gap-3">
        <Ruler className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0">
          <strong className="block">{ar ? 'محتار في المقاس؟ ابعتلي مقاسين' : 'Not sure about the size? Send me two'}</strong>
          <p className="mt-1 text-xs text-muted">{ar
            ? 'المندوب هيجيبلك المقاسين، تقيس وتاخد المناسب وتدفع حقه بس. المقاس التاني بيرجع للمحل. لو مفيش مقاس نفع، بتدفع مصاريف التوصيل بس.'
            : 'The courier brings both sizes. Try them, keep the one that fits and pay only for it. The other goes back to the store. If neither fits you pay the delivery fee only.'}</p>
        </div>
      </div>
      {data.blockedUntil ? (
        <p className="mt-3 rounded-xl bg-secondary p-3 text-xs text-muted">{ar ? 'الخدمة دي موقوفة مؤقتًا لرقمك بعد رجوع المقاسين أكتر من مرة.' : 'This option is paused for your number for a while after repeated full returns.'}</p>
      ) : (
        <div className="mt-3 space-y-3">
          {eligible.map((x) => {
            const key = `${x.slug}:${x.productId}:${x.variantId || 0}`;
            const l = line(x);
            return (
              <div key={key} className="rounded-2xl bg-secondary p-3">
                <p className="truncate text-sm font-semibold">{nameOf(l)} {x.mainSize ? <span className="text-muted">· {x.mainSize}</span> : null}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {x.alts.map((a) => {
                    const on = pick?.key === key && pick.altVariantId === a.variantId;
                    return (
                      <button key={a.variantId} type="button" aria-pressed={on}
                        onClick={() => onPick(on ? null : { key, altVariantId: a.variantId, size: a.size })}
                        className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${on ? 'border-fg bg-btn text-on-btn' : 'border-line bg-canvas text-fg'}`}>
                        {ar ? `ابعتلي ${a.size} كمان` : `Also send ${a.size}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <p className="text-xs text-muted">{ar ? 'قطعة واحدة بس في الطلب بتتبعت بمقاسين.' : 'One piece per order can be sent in two sizes.'}</p>
        </div>
      )}
    </section>
  );
}
