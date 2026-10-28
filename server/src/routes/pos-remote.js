import { Router } from 'express';
import { z } from 'zod';
import { h } from '../lib/errors.js';
import { posGate } from '../lib/pos.js';
import { pairingFor, attachScreen, screenOnline, phoneSeen, notePhone, pushToScreens, sendEvent, deliverScan, answerScan, allowScan } from '../lib/pos-remote.js';

/**
 * Phone-as-scanner channel. Mounted at /api/pos-remote. No sign-in: the long random pairing token in the URL is the key,
 * and it only lets a phone send barcodes to that one cashier screen.
 */
const r = Router();

// the phone opens its page
r.get('/:token', h((req, res) => {
  const p = pairingFor(req.params.token);
  posGate(p.storeId);
  notePhone(p.id);
  pushToScreens(p.id, 'phone', { at: new Date().toISOString() });
  res.json({ store: p.storeName || '', screen: screenOnline(p.id) });
}));

// the computer listens here for codes (Server-Sent Events)
r.get('/:token/events', (req, res, next) => {
  let p;
  try { p = pairingFor(req.params.token); posGate(p.storeId); } catch (e) { return next(e); }
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders?.();
  res.write('retry: 3000\n\n');
  sendEvent(res, 'hello', { phoneSeenAt: phoneSeen(p.id) });
  const detach = attachScreen(p.id, res);
  const beat = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* closed */ } }, 20000);
  req.on('close', () => { clearInterval(beat); detach(); });
});

// the phone sends one code and gets the cashier's answer back
r.post('/:token/scan', h(async (req, res) => {
  const p = pairingFor(req.params.token);
  posGate(p.storeId);
  const { code } = z.object({ code: z.string().trim().min(1).max(120) }).parse(req.body);
  if (!allowScan(p.id)) return res.status(429).json({ error: { code: 'too_fast', message: 'Slow down.' } });
  res.json(await deliverScan(p.id, code));
}));

// the computer answers what happened with a code
r.post('/:token/answer', h((req, res) => {
  const p = pairingFor(req.params.token);
  const b = z.object({ id: z.string().regex(/^[a-f0-9]{16}$/), ok: z.boolean(), text: z.string().trim().max(160).default('') }).parse(req.body);
  answerScan(p.id, b.id, { ok: b.ok, text: b.text });
  res.json({ ok: true });
}));

export default r;
