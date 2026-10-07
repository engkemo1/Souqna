import { memo, useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { srcSet } from '../../lib/image.js';
import { cx } from './cx.js';

/**
 * Responsive, layout-stable image:
 *  - reserves space via aspect-ratio (no layout shift)
 *  - blurred LQIP + dominant colour placeholder
 *  - WebP with JPEG fallback, srcset + sizes so the browser picks the right rendition
 *  - native lazy loading (eager + high priority for LCP images)
 *  - fade-in on load, graceful error fallback
 */
function SmartImage({ media, alt, sizes = '100vw', ratio, fit = 'cover', priority = false, className, imgClassName, position = 'center', onLoad, draggable = false }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef(null);

  useEffect(() => { setLoaded(false); setFailed(false); }, [media?.id]);
  useEffect(() => { if (ref.current?.complete && ref.current.naturalWidth) setLoaded(true); }, [media?.id]);

  const aspect = ratio === 'natural' && media ? `${media.w} / ${media.h}` : ratio;
  return (
    <div className={cx('relative overflow-hidden', className)} style={{ aspectRatio: aspect, backgroundColor: media?.color || undefined }}>
      {media?.lqip && !failed && (
        <img src={media.lqip} alt="" aria-hidden="true" className={cx('absolute inset-0 h-full w-full scale-110 blur-xl transition-opacity duration-700', fit === 'cover' ? 'object-cover' : 'object-contain', loaded ? 'opacity-0' : 'opacity-100')} />
      )}
      {media && !failed ? (
        <picture>
          <source type="image/webp" srcSet={srcSet(media, 'webp')} sizes={sizes} />
          <img
            ref={ref}
            src={`${media.base}/${media.sizes.at(-1).name}.jpg`}
            srcSet={srcSet(media, 'jpg')}
            sizes={sizes}
            width={media.w}
            height={media.h}
            alt={alt ?? media.alt ?? ''}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchpriority={priority ? 'high' : undefined}
            draggable={draggable}
            onLoad={(e) => { setLoaded(true); onLoad?.(e); }}
            onError={() => setFailed(true)}
            style={{ objectPosition: position }}
            className={cx('absolute inset-0 h-full w-full transition-[opacity,transform] duration-700 ease-out', fit === 'cover' ? 'object-cover' : 'object-contain', loaded ? 'opacity-100' : 'opacity-0', imgClassName)}
          />
        </picture>
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-fg/[0.05] text-muted">
          <ImageOff className="h-7 w-7 opacity-60" strokeWidth={1.5} aria-hidden="true" />
          <span className="sr-only">{alt}</span>
        </div>
      )}
    </div>
  );
}

export default memo(SmartImage);
