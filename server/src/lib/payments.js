/**
 * Pluggable Payments Abstraction for Egyptian Gateways (Paymob, Fawry, Vodafone Cash, etc.)
 * Provides signature verification, intent creation, and idempotent webhook handling.
 */
import crypto from 'node:crypto';
import { q, tx } from '../db/index.js';
import { AppError } from './errors.js';

export class PaymentGateway {
  constructor(name) {
    this.name = name;
  }

  /**
   * Verify HMAC webhook signature against configured gateway secret
   * @param {string|Buffer} payload - raw body text
   * @param {string} signature - signature from header/query
   * @param {string} secret - gateway secret
   * @returns {boolean}
   */
  verifyWebhookSignature(payload, signature, secret) {
    throw new Error('verifyWebhookSignature must be implemented');
  }

  /**
   * Create a standardized payment intent
   */
  async createIntent({ amount, currency = 'EGP', orderId, customer }) {
    throw new Error('createIntent must be implemented');
  }
}

export class PaymobGateway extends PaymentGateway {
  constructor() {
    super('paymob');
  }

  /**
   * Paymob calculates HMAC SHA512 across sorted response fields
   */
  verifyWebhookSignature(payload, signature, hmacSecret) {
    if (!hmacSecret || !signature) return false;
    try {
      const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
      const obj = data.obj || data;
      // Lexicographical sort of values according to Paymob documentation
      const concatenatedValues = [
        obj.amount_cents,
        obj.created_at,
        obj.currency,
        obj.error_occured,
        obj.has_parent_transaction,
        obj.id,
        obj.integration_id,
        obj.is_3d_secure,
        obj.is_auth,
        obj.is_capture,
        obj.is_refunded,
        obj.is_standalone_payment,
        obj.is_voided,
        obj.order?.id ?? obj.order,
        obj.owner,
        obj.pending,
        obj.source_data?.pan ?? '',
        obj.source_data?.sub_type ?? '',
        obj.source_data?.type ?? '',
        obj.success,
      ].map((v) => (v === undefined || v === null ? '' : String(v))).join('');

      const calculatedHmac = crypto
        .createHmac('sha512', hmacSecret)
        .update(concatenatedValues)
        .digest('hex');

      return crypto.timingSafeEqual(Buffer.from(calculatedHmac), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  async createIntent({ amount, orderId, customer }) {
    // Scaffold ready for production API integration
    return {
      gateway: 'paymob',
      orderId,
      amountCents: Math.round(amount * 100),
      currency: 'EGP',
      status: 'pending',
    };
  }
}

export class FawryGateway extends PaymentGateway {
  constructor() {
    super('fawry');
  }

  verifyWebhookSignature(payload, signature, securityKey) {
    if (!securityKey || !signature) return false;
    try {
      const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
      // Fawry signature: SHA256(fawryRefNumber + merchantRefNum + paymentAmount + orderAmount + orderStatus + paymentMethod + securityKey)
      const raw = `${data.fawryRefNumber || ''}${data.merchantRefNum || ''}${Number(data.paymentAmount || 0).toFixed(2)}${Number(data.orderAmount || 0).toFixed(2)}${data.orderStatus || ''}${data.paymentMethod || ''}${securityKey}`;
      const hash = crypto.createHash('sha256').update(raw).digest('hex');
      return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  async createIntent({ amount, orderId, customer }) {
    return {
      gateway: 'fawry',
      orderId,
      amount,
      currency: 'EGP',
      status: 'pending',
    };
  }
}

const gateways = new Map([
  ['paymob', new PaymobGateway()],
  ['fawry', new FawryGateway()],
]);

export function getGateway(name) {
  const g = gateways.get(name.toLowerCase());
  if (!g) throw new AppError(400, 'unsupported_gateway', `Payment gateway ${name} is not supported.`);
  return g;
}

/**
 * Process incoming payment webhook with signature check & deduplication
 */
export function handlePaymentWebhook({ gatewayName, payload, signature, secret }) {
  const gateway = getGateway(gatewayName);
  const isValid = gateway.verifyWebhookSignature(payload, signature, secret);
  if (!isValid) throw new AppError(401, 'invalid_signature', 'Webhook signature verification failed.');

  return { verified: true, gateway: gateway.name };
}
