import { useCallback } from 'react';
import { useCart } from '../../lib/cart.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { useToast } from '../ui/Toast.jsx';
import { useIsDesktop } from '../../lib/hooks.js';
import { pickSrc } from '../../lib/image.js';
import { useNavigate } from 'react-router-dom';
import { sp } from '../../lib/store.jsx';

/** Fly a thumbnail from `fromEl` to the cart icon — a subtle, fast confirmation. */
function flyToCart(fromEl, src) {
  if (!fromEl || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const target = [...document.querySelectorAll('[data-cart-target]')].find((el) => el.offsetParent !== null);
  if (!target) return;
  const a = fromEl.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const img = document.createElement('img');
  img.src = src;
  const size = Math.min(a.width, 160);
  Object.assign(img.style, {
    position: 'fixed', zIndex: 120, left: `${a.left + a.width / 2 - size / 2}px`, top: `${a.top + a.height / 2 - size * 0.625}px`,
    width: `${size}px`, height: `${size * 1.25}px`, objectFit: 'cover', borderRadius: '16px', pointerEvents: 'none', boxShadow: '0 12px 30px -10px rgba(0,0,0,.35)',
  });
  document.body.appendChild(img);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  img.animate(
    [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${dx * 0.6}px, ${dy * 0.35 - 40}px) scale(.55)`, opacity: 0.95, offset: 0.55 }, { transform: `translate(${dx}px, ${dy}px) scale(.12)`, opacity: 0.2 }],
    { duration: 700, easing: 'cubic-bezier(.5,0,.2,1)' },
  ).onfinish = () => img.remove();
}

export function useAddToCart(slug) {
  const cart = useCart(slug);
  const { t, tr } = useI18n();
  const toast = useToast();
  const desktop = useIsDesktop();
  const navigate = useNavigate();

  return useCallback(({ product, variant, color, size, qty = 1, fromEl }) => {
    const c = product.colors?.find((x) => x.hex === color);
    const image = product.media?.[0] || product.image;
    cart.add({
      productId: product.id,
      variantId: variant?.id ?? null,
      slug: product.slug,
      name: product.name,
      price: product.price,
      compareAt: product.compareAt,
      image,
      color: color || null,
      colorName: c ? { ar: c.name_ar, en: c.name_en } : null,
      size: size && size !== 'One size' ? size : null,
      qty,
    });
    flyToCart(fromEl, pickSrc(image, 400));
    if (desktop) setTimeout(() => cart.open(), 450);
    else toast({ title: t('product.added'), description: tr(product.name), image: pickSrc(image, 160), action: { label: t('cart.viewCart'), onClick: () => navigate(sp(slug, 'cart')) } });
  }, [cart, desktop, toast, t, tr, navigate, slug]);
}
