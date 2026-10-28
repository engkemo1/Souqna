/**
 * WhatsApp Cloud API webhook.
 *  GET  /api/wa/webhook  Meta's one-time verification (hub.challenge echo).
 *  POST /api/wa/webhook  Incoming messages / delivery statuses. Answers 200 at once, then handles each message.
 */
import { Router } from 'express';
import { config } from '../config.js';
import { q } from '../db/index.js';
import { validSignature } from '../lib/wa.js';

const r = Router();
const handlers = [];
// Everything here is dormant until WA_ENABLED=1.
r.use((_req, res, next) => (config.wa.enabled ? next() : res.sendStatus(404)));
/** Features plug in here: fn(message, contact) — runs once per new inbound message. */
export const onWhatsAppMessage = (fn) => handlers.push(fn);

r.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  if (mode === 'subscribe' && config.wa.verifyToken && token === config.wa.verifyToken) return res.type('text/plain').send(String(req.query['hub.challenge'] || ''));
  return res.sendStatus(403);
});

r.post('/webhook', (req, res) => {
  if (!validSignature(req.rawBody, req.get('x-hub-signature-256'))) return res.sendStatus(401);
  res.sendStatus(200);
  const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];
  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      if (v.metadata?.phone_number_id && config.wa.phoneId && v.metadata.phone_number_id !== config.wa.phoneId) continue;
      for (const m of v.messages || []) {
        const contact = (v.contacts || []).find((c) => c.wa_id === m.from) || null;
        const body = m.text?.body || m.image?.caption || m.button?.text || m.interactive?.button_reply?.title || null;
        // Meta retries deliveries: handle each message id once.
        const fresh = q.run('INSERT OR IGNORE INTO wa_inbound (id, from_wa, type, body) VALUES (?,?,?,?)', [m.id, m.from, m.type, body ? String(body).slice(0, 1000) : null]);
        if (!fresh.changes) continue;
        for (const fn of handlers) Promise.resolve().then(() => fn(m, contact)).catch((e) => console.error(`[wa] handler failed: ${e.message}`));
      }
    }
  }
});

export default r;
