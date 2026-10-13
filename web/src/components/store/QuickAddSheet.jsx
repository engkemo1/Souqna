import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import Sheet from '../ui/Sheet.jsx';
import Button from '../ui/Button.jsx';
import SmartImage from '../ui/SmartImage.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import { Price } from '../ui/Commerce.jsx';
import { ErrorState } from '../ui/States.jsx';
import VariantPicker, { resolveVariant } from './VariantPicker.jsx';
import { useAddToCart } from './useAddToCart.js';
import { useApi } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { sp } from '../../lib/store.jsx';
import { useMarketCart } from '../../lib/cart.jsx';
import { useToast } from '../ui/Toast.jsx';
import { useNavigate } from 'react-router-dom';

export default function QuickAddSheet({ slug, product, onClose, onAdded, step, marketplace = false }) {
  const { t, tr, lang } = useI18n();
  const { data, error, loading, reload } = useApi(product ? `/stores/${slug}/products/${product.slug}` : null);
  const p = data?.product;
  const [color, setColor] = useState(null);
  const [size, setSize] = useState(null);
  const [sizeError, setSizeError] = useState(false);
  const imgRef = useRef(null);
  const add = useAddToCart(slug);
  const marketCart = useMarketCart();
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!p) return;
    const firstInStock = p.colors.find((c) => p.variants.some((v) => v.color === c.hex && v.stock > 0)) || p.colors[0];
    setColor(firstInStock?.hex || null);
    setSize(p.sizes.length === 1 ? p.sizes[0] : null);
    setSizeError(false);
  }, [p]);

  const { variant, available, needsSize } = resolveVariant(p, color, size);
  const onAdd = () => {
    if (needsSize) { setSizeError(true); return; }
    if (marketplace) {
      const selectedColor = p.colors?.find((c) => c.hex === color);
      marketCart.add({ productId: p.id, variantId: variant?.id ?? null, slug: p.slug, name: p.name, price: p.price, compareAt: p.compareAt,
        image: p.media?.[0] || product.image, color: color || null, colorName: selectedColor ? { ar: selectedColor.name_ar, en: selectedColor.name_en } : null,
        size: size && size !== 'One size' ? size : null }, product.store || { slug });
      toast({ title: lang === 'ar' ? 'اتضاف لسلة بنها أوتفيت' : 'Added to Banha Outfit basket', tone: 'info', action: { label: lang === 'ar' ? 'افتح السلة' : 'Open basket', onClick: () => navigate('/market-cart') } });
    } else add({ product: p, variant, color, size, fromEl: imgRef.current });
    if (onAdded) onAdded(); else onClose();
  };

  return (
    <Sheet open={!!product} onClose={onClose} title={product ? `${step ? `${step} · ` : ''}${tr(product.name)}` : ''} side="auto" desktop="center" size="lg"
      footer={p && (
        <Button full size="lg" disabled={available <= 0 && !needsSize} onClick={onAdd}>
          {available <= 0 && !needsSize ? t('product.outOfStock') : marketplace ? (lang === 'ar' ? 'أضف لسلة بنها أوتفيت' : 'Add to Banha Outfit basket') : t('product.addToCart')}
        </Button>
      )}>
      {error ? <ErrorState error={error} onRetry={reload} compact /> : (
        <div className="grid gap-5 pb-5 sm:grid-cols-[200px_1fr] sm:gap-6">
          <div ref={imgRef} className="hidden sm:block">
            {product && <SmartImage media={p?.media?.[0] || product.image} ratio="4 / 5" sizes="200px" className="rounded-2xl" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-start gap-3 sm:block">
              {product && <SmartImage media={product.image} ratio="4 / 5" sizes="80px" className="w-20 shrink-0 rounded-xl sm:hidden" />}
              <div>
                <Price value={product?.price} compareAt={product?.compareAt} size="lg" showSave />
                {p && <Link to={sp(slug, `p/${p.slug}`)} onClick={onClose} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand underline-offset-4 hover:underline">{t('common.viewAll')} <ArrowUpRight className="h-4 w-4 flip-rtl" /></Link>}
              </div>
            </div>
            <div className="mt-5">
              {loading || !p ? (
                <div className="space-y-4"><Skeleton className="h-4 w-24" /><div className="flex gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} circle className="h-10 w-10" />)}</div><Skeleton className="h-4 w-20" /><div className="flex gap-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-11 w-14 rounded-xl" />)}</div></div>
              ) : (
                <VariantPicker product={p} color={color} size={size} onColor={(c) => { setColor(c); setSize(null); }} onSize={(s) => { setSize(s); setSizeError(false); }} sizeError={sizeError} />
              )}
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}
