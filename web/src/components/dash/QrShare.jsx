import { useMemo, useState } from 'react';
import { QrCode, Copy, Share2, Download, Printer, Tag, LayoutGrid } from 'lucide-react';
import Sheet from '../ui/Sheet.jsx';
import Button from '../ui/Button.jsx';
import { Segmented } from '../ui/Field.jsx';
import { useToast } from '../ui/Toast.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';
import { qrSvg, qrPng } from '../../lib/qr/index.js';
import { printBlock, storePosterHtml, storeCardsHtml, productTagsHtml } from '../../lib/printSheets.js';

/**
 * QR code for a store page or a product: the owner can copy / share the link, download the QR as an image
 * and print a ready-made sheet (poster + small cards for the store, price tags for a product).
 * Props: url, name, kind ('store' | 'product'), price (product), storeName (product).
 */
export default function QrShare({ open, onClose, kind = 'store', url, name, price, storeName }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [copies, setCopies] = useState(12);
  const svg = useMemo(() => (url ? qrSvg(url, { size: 240, margin: 1 }) : ''), [url]);
  const isStore = kind === 'store';

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast({ title: isStore ? t('dash.storeLinkCopied') : t('qr.linkCopied') }); } catch { /* blocked */ }
  };
  const share = async () => {
    try { if (navigator.share) await navigator.share({ title: name, url }); else await copy(); } catch { /* dismissed */ }
  };
  const download = async () => {
    const png = await qrPng(url, 1024);
    const a = document.createElement('a');
    a.href = png;
    a.download = `qr-${(name || 'twist').toString().replace(/[^\w؀-ۿ-]+/g, '-').slice(0, 40)}.png`;
    a.click();
  };
  const printPoster = () => printBlock(storePosterHtml({ name, url, headline: t('qr.posterHeadline'), sub: t('qr.posterSub') }));
  const printCards = () => printBlock(storeCardsHtml({ name, url, headline: t('qr.cardHeadline') }));
  const printTags = () => printBlock(productTagsHtml({ store: storeName, name, price: formatMoney(price, lang), url, scan: t('qr.tagScan'), copies }));

  return (
    <Sheet open={open} onClose={onClose} title={isStore ? t('qr.storeTitle') : t('qr.productTitle')} description={isStore ? t('qr.storeDesc') : t('qr.productDesc')} size="sm">
      <div className="flex flex-col items-center pb-2">
        <div className="rounded-3xl border border-line bg-white p-4 shadow-sm" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="mt-3 max-w-full truncate text-center text-sm font-semibold">{name}</p>
        <p dir="ltr" className="mt-0.5 max-w-full break-all text-center text-xs text-muted">{url}</p>

        <div className="mt-5 grid w-full grid-cols-3 gap-2">
          <Button variant="secondary" size="sm" icon={Copy} onClick={copy}>{t('qr.copy')}</Button>
          <Button variant="secondary" size="sm" icon={Share2} onClick={share}>{t('qr.share')}</Button>
          <Button variant="secondary" size="sm" icon={Download} onClick={download}>{t('qr.download')}</Button>
        </div>

        {isStore ? (
          <div className="mt-3 grid w-full gap-2">
            <Button full variant="secondary" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`${name}\n${url}`)}`, '_blank', 'noopener')}>ابعت لينك المحل على واتساب</Button>
            <Button full icon={Printer} onClick={printPoster}>{t('qr.printPoster')}</Button>
            <Button full variant="outline" icon={LayoutGrid} onClick={printCards}>{t('qr.printCards')}</Button>
          </div>
        ) : (
          <div className="mt-3 w-full space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{t('qr.copies')}</span>
              <Segmented size="sm" value={copies} onChange={setCopies} options={[6, 12, 24].map((n) => ({ value: n, label: String(n) }))} />
            </div>
            <Button full icon={Tag} onClick={printTags}>{t('qr.printTags')}</Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/** Small button that opens the store QR sheet (used in the dashboard chrome). */
export function StoreQrButton({ store, className, children }) {
  const { tr, t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t('qr.storeTitle')} className={className}>{children || <QrCode className="h-5 w-5" />}</button>
      {open && <QrShare open onClose={() => setOpen(false)} kind="store" url={`${window.location.origin}/s/${store.slug}`} name={tr(store.name)} />}
    </>
  );
}
