import { useEffect, useRef, useState } from 'react';

/** Stops the camera for sure: the library's controls, and every track on the video element (light goes off). */
function stopVideo(video) {
  const stream = video?.srcObject;
  if (stream && typeof stream.getTracks === 'function') for (const t of stream.getTracks()) t.stop();
  if (video) video.srcObject = null;
}

/**
 * Live barcode scanning with the device camera (@zxing/browser, bundled — no CDN).
 * `onCode(text)` is called for each new code; `continuous` keeps scanning (the phone used as a scanner), otherwise the
 * camera stops after the first code. The same code is not reported twice within `repeatMs`.
 */
export default function CameraScanner({ onCode, continuous = false, repeatMs = 1500, className = '' }) {
  const videoRef = useRef(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode; // a new callback (the product list changed) must not restart the camera
  const [status, setStatus] = useState('starting');
  const [error, setError] = useState('');
  useEffect(() => {
    let stopped = false;
    let controls = null;
    const last = { code: '', at: 0 };
    const stopAll = () => { stopped = true; try { controls?.stop(); } catch { /* already stopped */ } stopVideo(videoRef.current); };
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('المتصفح ده مش بيسمح بتشغيل الكاميرا. استخدم قارئ USB أو البحث بالكود.');
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (stopped) return;
        const reader = new BrowserMultiFormatReader();
        const c = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: 'environment' } } },
          videoRef.current,
          (result) => {
            if (!result || stopped) return;
            const code = result.getText();
            const now = Date.now();
            if (code === last.code && now - last.at < repeatMs) return;
            last.code = code; last.at = now;
            if (!continuous) stopAll();
            onCodeRef.current?.(code);
          },
        );
        controls = c;
        // closed while the camera was still starting (permission prompt, slow phone): stop it now
        if (stopped) { try { c.stop(); } catch { /* ignore */ } stopVideo(videoRef.current); return; }
        setStatus('scanning');
      } catch (e) {
        if (stopped) return;
        setStatus('error');
        setError(e?.name === 'NotAllowedError' ? 'اسمح للمتصفح باستخدام الكاميرا، وبعدها جرّب تاني.'
          : /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(String(e?.message)) ? 'محتاج نت أول مرة عشان الكاميرا تتحمّل. افتح الصفحة تاني والنت شغال.'
            : (e?.message || 'مش قادرين نشغّل الكاميرا.'));
      }
    })();
    const onHide = () => { if (document.visibilityState === 'hidden') stopAll(); };
    document.addEventListener('visibilitychange', onHide);
    return () => { document.removeEventListener('visibilitychange', onHide); stopAll(); };
  }, [continuous, repeatMs]);
  return (
    <div className={className}>
      <div className="overflow-hidden rounded-2xl bg-black"><video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline autoPlay /></div>
      {status === 'starting' && <p className="mt-3 text-center text-sm text-muted">بنجهّز الكاميرا… اسمح بالوصول لو المتصفح سأل.</p>}
      {status === 'scanning' && <p className="mt-3 text-center text-sm text-muted">وجّه الكاميرا للباركود وخليه واضح جوه الصورة.</p>}
      {error && <p role="alert" className="mt-3 rounded-xl bg-sale/10 p-3 text-sm text-sale">{error}</p>}
    </div>
  );
}
