/**
 * Shared WhatsApp Cloud API helpers: send messages, sign-in codes, webhook signature check, media download.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */
import crypto from 'node:crypto';
import { config } from '../config.js';

export const waReady = () => Boolean(config.wa.enabled && config.wa.token && config.wa.phoneId);
export const waAuthReady = () => waReady() && Boolean(config.wa.authTemplate);

/** 01012345678 / +20 10… / 2010… -> 201012345678 (Egypt). */
export function waNumber(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('20')) return d;
  if (d.startsWith('0')) return `20${d.slice(1)}`;
  return d.length === 10 ? `20${d}` : d;
}

async function post(body) {
  const res = await fetch(`${config.wa.apiBase}/${config.wa.phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.wa.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`whatsapp ${res.status}: ${JSON.stringify(data?.error || data).slice(0, 300)}`);
    err.wa = data?.error;
    throw err;
  }
  return data?.messages?.[0]?.id || null;
}

/** Free-form text. Only delivered inside the 24h window after the person last wrote to us. */
export function sendText(to, text, { replyTo } = {}) {
  return post({ to: waNumber(to), type: 'text', text: { body: String(text).slice(0, 4000), preview_url: true }, ...(replyTo ? { context: { message_id: replyTo } } : {}) });
}

/** One-time sign-in code through the approved AUTHENTICATION template (body {{1}} + copy-code button). */
export function sendAuthCode(to, code) {
  return post({
    to: waNumber(to),
    type: 'template',
    template: {
      name: config.wa.authTemplate,
      language: { code: config.wa.authLang },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: code }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
      ],
    },
  });
}

/** True when the request really comes from Meta (or when no app secret is configured yet). */
export function validSignature(rawBody, header) {
  if (!config.wa.appSecret) return true;
  if (!rawBody || !header || !header.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', config.wa.appSecret).update(rawBody).digest('hex');
  const got = header.slice(7);
  return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

/** Download an inbound photo/document by its media id. */
export async function downloadMedia(mediaId) {
  const auth = { Authorization: `Bearer ${config.wa.token}` };
  const meta = await fetch(`${config.wa.apiBase}/${mediaId}`, { headers: auth }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`media meta ${r.status}`))));
  const res = await fetch(meta.url, { headers: auth });
  if (!res.ok) throw new Error(`media download ${res.status}`);
  return { buffer: Buffer.from(await res.arrayBuffer()), mime: meta.mime_type || '' };
}
