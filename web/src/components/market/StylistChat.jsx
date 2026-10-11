import { useEffect, useRef, useState } from 'react';
import { X, Send, Mic, MicOff, Loader2, Camera, Volume2, VolumeX } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { useApi } from '../../lib/hooks.js';
import { formatMoney } from '../../lib/format.js';
import ModaAvatar from './ModaAvatar.jsx';
import LookSet from './LookSet.jsx';
import { errorMessage } from '../ui/States.jsx';
import { cx } from '../ui/cx.js';

const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } } };
const TTS = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
const speak = (txt, lang, onState) => {
  if (!TTS || !txt) return;
  TTS.cancel(); const u = new SpeechSynthesisUtterance(txt.replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, ''));
  u.lang = lang === 'ar' ? 'ar-EG' : 'en-US';
  const v = TTS.getVoices().find((x) => x.lang?.toLowerCase().startsWith(lang === 'ar' ? 'ar' : 'en')); if (v) u.voice = v;
  u.rate = 1; u.onstart = () => onState?.(true); u.onend = () => onState?.(false); u.onerror = () => onState?.(false); TTS.speak(u);
};
/** shrink a photo to ~768px JPEG so the upload stays small */
const shrink = (file) => new Promise((resolve, reject) => {
  const img = new Image(); const url = URL.createObjectURL(file);
  img.onload = () => { const k = Math.min(1, 768 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.72)); };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img')); }; img.src = url;
});
const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

/** Floating shopping assistant: chat in text or voice, answers come with real products from Banha stores. */
export default function StylistChat() {
  const { t, tr, lang } = useI18n();
  const { data: feat } = useApi('/marketplace?q=&category=all&sort=featured');
  const avatar = feat?.features?.stylistAvatar || null;
  const name = feat?.features?.stylistName?.[lang] || feat?.features?.stylistName?.ar || t('stylist.defaultName');
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const rec = useRef(null);
  const fileRef = useRef(null);
  const [photo, setPhoto] = useState(null);
  const [photo2, setPhoto2] = useState(null); // a second photo = "compare these two"
  const [talking, setTalking] = useState(false);
  const [similar, setSimilar] = useState(false);
  const [voiceOn, setVoiceOn] = useState(() => store.get('moda.voice', false));
  const [profile, setProfile] = useState(() => store.get('moda.profile', {}));
  const end = useRef(null);
  const sendRef = useRef(null);

  useEffect(() => {
    const on = (e) => { setOpen(true); if (e.detail?.ask) setTimeout(() => sendRef.current?.(e.detail.ask), 700); if (e.detail?.photo) { setSimilar(!!e.detail.similar); setTimeout(() => fileRef.current?.click(), 350); } };
    window.addEventListener('moda:open', on); return () => window.removeEventListener('moda:open', on);
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, busy, open]);
  useEffect(() => { if (!open) { rec.current?.stop?.(); TTS?.cancel(); setTalking(false); } }, [open]);
  if (!feat || feat.features?.stylist === false) return null;

  const send = async (raw) => {
    const content = String(raw ?? text).trim();
    if ((!content && !photo) || busy) return;
    const image = photo; const image2 = photo2; const shown = content || (image2 ? t('stylist.compareMsg') : similar ? t('stylist.similarMsg') : t('stylist.photoMsg')); setSimilar(false);
    const next = [...msgs, { role: 'user', content: shown, photo: image, photo2: image2 }];
    setMsgs(next); setText(''); setPhoto(null); setPhoto2(null); setBusy(true);
    try {
      const body = { messages: next.map((m) => ({ role: m.role, content: m.role === 'assistant' ? (m.say || m.content || '') : m.content })).filter((m) => m.content), profile };
      if (image) body.image = image;
      if (image && image2) body.image2 = image2;
      const res = await fetch('/api/stylist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error('x'), { code: data?.error?.code });
      setMsgs([...next, { role: 'assistant', ...data }]);
      if (data.remember && Object.keys(data.remember).length) { const p = { ...profile, ...data.remember }; setProfile(p); store.set('moda.profile', p); }
      if (voiceOn) speak([data.say, data.tips].filter(Boolean).join('. '), lang, setTalking);
    } catch (e) { setMsgs([...next, { role: 'assistant', error: errorMessage(t, e) }]); }
    setBusy(false);
  };
  sendRef.current = send;

  const mic = () => {
    if (!SR) return;
    if (listening) { rec.current?.stop(); return; }
    const r = new SR(); rec.current = r; r.lang = lang === 'ar' ? 'ar-EG' : 'en-US'; r.interimResults = false; r.maxAlternatives = 1;
    r.onresult = (ev) => { const said = ev.results?.[0]?.[0]?.transcript; if (said) send(said); };
    r.onend = () => setListening(false); r.onerror = () => setListening(false);
    setListening(true); try { r.start(); } catch { setListening(false); }
  };

  const pick = async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { const s = await shrink(f); if (photo && !photo2) setPhoto2(s); else if (photo) setPhoto2(s); else setPhoto(s); } catch { /* ignore */ } };
  const toggleVoice = () => { const v = !voiceOn; setVoiceOn(v); store.set('moda.voice', v); if (!v) { TTS?.cancel(); setTalking(false); } };
  const chips = [t('stylist.chip1'), t('stylist.chip2'), t('stylist.chip3')];
  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} aria-label={t('stylist.open', { n: name })}
          className="fixed bottom-5 end-4 z-40 inline-flex h-14 items-center gap-2 rounded-full bg-btn ps-1.5 pe-5 text-[15px] font-bold text-on-btn shadow-lift transition active:scale-95 sm:bottom-6 sm:end-6">
          <ModaAvatar src={avatar} size={44} ring={false} />{name}
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 sm:inset-auto sm:bottom-6 sm:end-6 sm:h-[640px] sm:max-h-[calc(100dvh-3rem)] sm:w-[400px]" role="dialog" aria-modal="true" aria-label={name}>
          <button type="button" className="absolute inset-0 bg-black/40 sm:hidden" aria-label="close" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 flex h-[92dvh] flex-col overflow-hidden rounded-t-3xl border border-line bg-canvas shadow-lift sm:static sm:h-full sm:rounded-3xl">
            <header className="flex items-center justify-between gap-3 border-b border-line bg-elevated px-4 py-3">
              <div className="flex items-center gap-3"><ModaAvatar src={avatar} size={44} talking={talking} thinking={busy} />
                <div><p className="font-display text-base font-bold leading-tight">{name}</p><p className="text-[12px] text-muted">{t('stylist.sub')}</p></div></div>
              <div className="flex items-center gap-1">
                {TTS && <button type="button" onClick={toggleVoice} aria-pressed={voiceOn} aria-label={t('stylist.voice')} className={cx('grid h-9 w-9 place-items-center rounded-full hover:bg-secondary', voiceOn && 'text-brand')}>{voiceOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}</button>}
                <button type="button" onClick={() => setOpen(false)} aria-label="close" className="grid h-9 w-9 place-items-center rounded-full hover:bg-secondary"><X className="h-5 w-5" /></button>
              </div>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {!msgs.length && (
                <div>
                  <div className="mb-3 grid place-items-center"><ModaAvatar src={avatar} size={230} talking={talking} thinking={busy} tilt living /></div>
                  <div className="flex items-end gap-2"><div className="max-w-[92%] rounded-2xl rounded-ss-sm bg-secondary px-3.5 py-2.5 text-[14.5px] leading-relaxed">{t('stylist.hello', { n: name })}</div></div>
                  <div className="mt-3 flex flex-wrap gap-2">{chips.map((c) => <button key={c} type="button" onClick={() => send(c)} className="rounded-full border border-line-strong bg-elevated px-3.5 py-2 text-[13px] font-medium transition hover:border-fg">{c}</button>)}</div>
                </div>
              )}
              {msgs.map((m, i) => m.role === 'user' ? (
                <div key={i} className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-ee-sm bg-fg px-3.5 py-2.5 text-[14.5px] leading-relaxed text-canvas">{m.photo && <div className="mb-2 flex gap-1.5"><img src={m.photo} alt="" className="h-36 w-auto max-w-full rounded-lg object-cover" />{m.photo2 && <img src={m.photo2} alt="" className="h-36 w-auto max-w-full rounded-lg object-cover" />}</div>}{m.content}</div></div>
              ) : (
                <div key={i} className="max-w-full">
                  {(m.say || m.error) && <div className={cx('max-w-[90%] rounded-2xl rounded-ss-sm px-3.5 py-2.5 text-[14.5px] leading-relaxed', m.error ? 'bg-sale/10 text-sale' : 'bg-secondary')}>{m.error || m.say}</div>}
                  <LookSet data={m} name={name} />
                  {m.intent === 'shop' && m.missing?.length > 0 && <p className="mt-1 text-[12.5px] text-muted">{t('stylist.missing', { x: m.missing.join('، ') })}</p>}
                  {m.intent === 'shop' && !m.looks?.length && !m.error && <p className="mt-2 text-[13px] text-muted">{t('stylist.none')}</p>}
                </div>
              ))}
              {busy && <div className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" />{t('stylist.thinking')}</div>}
              <div ref={end} />
            </div>

            {photo && <div className="flex items-center gap-2 border-t border-line bg-elevated px-3 pt-2"><img src={photo} alt="" className="h-14 w-14 rounded-lg object-cover" />{photo2 && <img src={photo2} alt="" className="h-14 w-14 rounded-lg object-cover" />}<button type="button" onClick={() => { setPhoto(photo2 || null); setPhoto2(null); }} aria-label="remove" className="grid h-7 w-7 place-items-center rounded-full bg-secondary"><X className="h-4 w-4" /></button>{!photo2 && <span className="text-[12px] text-muted">{t('stylist.addSecond')}</span>}</div>}
            <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-center gap-2 border-t border-line bg-elevated p-3">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />
              <button type="button" onClick={() => fileRef.current?.click()} aria-label={t('stylist.photo')} className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-full border transition', photo ? 'border-brand text-brand' : 'border-line-strong hover:border-fg')}><Camera className="h-5 w-5" /></button>
              {SR && <button type="button" onClick={mic} aria-label={t('stylist.mic')} className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-full border transition', listening ? 'border-sale bg-sale/10 text-sale' : 'border-line-strong hover:border-fg')}>{listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}</button>}
              <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder={listening ? t('stylist.listening') : t('stylist.placeholder')} aria-label={t('stylist.placeholder')}
                className="h-11 min-w-0 flex-1 rounded-full border border-line-strong bg-canvas px-4 text-base outline-none focus:border-ring" />
              <button type="submit" disabled={busy || (!text.trim() && !photo)} aria-label={t('stylist.send')} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-btn text-on-btn transition disabled:opacity-40"><Send className="h-5 w-5 rtl:-scale-x-100" /></button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
